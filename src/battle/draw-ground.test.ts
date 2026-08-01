import { describe, expect, test } from 'vitest';

import { createTheme, parseHex } from '../design/index.js';
import type { HexColor } from '../design/index.js';
import { classifyGroundState } from '../ground/index.js';
import type { GroundState } from '../ground/index.js';
import { ground } from '../sprites/index.js';
import type { Region, SpriteGrid, GroundState as SpriteGroundState } from '../sprites/index.js';
import { tileBandScale } from './draw-background.js';
import { createFakeBattleCtx } from './fake-ctx.js';
import { drawGroundState, groundBandY, groundRaster, groundSurfaceY, spriteGroundState } from './draw-ground.js';
import { computeBattleLayout } from './layout.js';
import { cellRgb, createSoftwareRasterCache, createSpriteBattleSurface, hashRegion, pixelAt } from './sprite-fake-ctx.js';

const { palette } = createTheme();
const WIDTH = 1024;
const HEIGHT = 300;
const layout = computeBattleLayout(WIDTH, HEIGHT);

/** 원본 발판 스프라이트의 크기(원본 `mk(104, 16)`). */
const SPRITE_W = 104;
const SPRITE_H = 16;

const REGIONS: readonly Region[] = [1, 2, 3];
const STATES: readonly GroundState[] = ['intact', 'cracked', 'collapsed'];

const scale = tileBandScale(layout);
const bandY = groundBandY(layout);
const bandHeight = SPRITE_H * scale;

// ---------------------------------------------------------------------------
// 스프라이트 경로 — 실제 픽셀을 그려서 확인한다.
// ---------------------------------------------------------------------------

function renderSprite(state: GroundState, region: Region = 1, scrollX = 0) {
  const { ctx, surface } = createSpriteBattleSurface(WIDTH, HEIGHT);
  drawGroundState(ctx, palette, layout, state, false, 0, {
    region,
    scrollX,
    rasters: createSoftwareRasterCache(),
  });
  return surface;
}

/** 밴드 첫 타일(반전 없음)이 원본 그리드와 문자 단위로 일치하는지 센다. */
function mismatchesAgainstGrid(surface: ReturnType<typeof renderSprite>, grid: SpriteGrid): number {
  let mismatches = 0;
  for (let gy = 0; gy < SPRITE_H; gy += 1) {
    const row = grid[gy];
    if (row === undefined) continue;
    for (let gx = 0; gx < SPRITE_W; gx += 1) {
      const cell = row[gx];
      if (cell === undefined) continue;
      const expected = cellRgb(palette, cell);
      if (expected === null) continue;
      const actual = pixelAt(surface, gx * scale, bandY + gy * scale);
      if (actual[0] !== expected[0] || actual[1] !== expected[1] || actual[2] !== expected[2]) mismatches += 1;
    }
  }
  return mismatches;
}

describe('drawGroundState — ★ 지역 × 상태 9조합 (PLAN 0.1 C-2)', () => {
  test('9조합 전부 래스터가 만들어진다 — 원본 43키에 없는 R2·R3 균열/함몰 포함', () => {
    const cache = createSoftwareRasterCache();
    for (const region of REGIONS) {
      for (const state of [1, 2, 3] as const satisfies readonly SpriteGroundState[]) {
        expect(groundRaster(cache, region, state)).not.toBeNull();
      }
    }
  });

  test('9조합이 화면에서 서로 다르다', () => {
    const hashes: string[] = [];
    for (const region of REGIONS) {
      for (const state of STATES) {
        hashes.push(hashRegion(renderSprite(state, region), 0, bandY, WIDTH, bandHeight));
      }
    }
    expect(hashes.length).toBe(9);
    expect(new Set(hashes).size).toBe(9);
  });

  test('9조합이 전부 원본 `ground(region, state)` 그리드와 픽셀 단위로 일치한다', () => {
    for (const region of REGIONS) {
      for (const state of STATES) {
        const grid = ground(region, spriteGroundState(state));
        expect(mismatchesAgainstGrid(renderSprite(state, region), grid)).toBe(0);
      }
    }
  });
});

describe('drawGroundState — 상태 배선이 `src/ground` 판정과 이어진다', () => {
  test('판정값 → 원본 `state` 인자 매핑이 고정돼 있다 (정상 1 / 균열 2 / 함몰 3)', () => {
    expect(spriteGroundState('intact')).toBe(1);
    expect(spriteGroundState('cracked')).toBe(2);
    expect(spriteGroundState('collapsed')).toBe(3);
  });

  test('`classifyGroundState` 가 내는 3단계가 화면에서 서로 다르게 나온다', () => {
    const intact = classifyGroundState({ maxAdvance: 0, wave: 1, waveCount: 10 });
    const cracked = classifyGroundState({ maxAdvance: 0.9, wave: 1, waveCount: 10 });
    const collapsed = classifyGroundState({ maxAdvance: 0.9, wave: 9, waveCount: 10 });
    expect([intact, cracked, collapsed]).toEqual(['intact', 'cracked', 'collapsed']);

    const hashes = [intact, cracked, collapsed].map((state) =>
      hashRegion(renderSprite(state), 0, bandY, WIDTH, bandHeight),
    );
    expect(new Set(hashes).size).toBe(3);
  });
});

describe('drawGroundState — 타일 이음새 (PLAN 0.1 C-4 교차 미러링)', () => {
  test('인접 타일 경계 2열의 ΔRGB 가 0이다', () => {
    const surface = renderSprite('cracked');
    const tileWidth = SPRITE_W * scale;

    let boundaries = 0;
    for (let boundary = tileWidth; boundary < WIDTH; boundary += tileWidth) {
      boundaries += 1;
      for (let y = bandY; y < bandY + bandHeight; y += 1) {
        const left = pixelAt(surface, boundary - 1, y);
        const right = pixelAt(surface, boundary, y);
        const delta = Math.max(
          Math.abs(left[0] - right[0]),
          Math.abs(left[1] - right[1]),
          Math.abs(left[2] - right[2]),
        );
        expect(delta).toBe(0);
      }
    }
    expect(boundaries).toBeGreaterThan(0);
  });

  test('스크롤해도 이음새가 생기지 않는다', () => {
    const surface = renderSprite('intact', 1, 137);
    for (let x = 1; x < WIDTH; x += 1) {
      const left = pixelAt(surface, x - 1, bandY + SPRITE_H * scale - 1);
      const right = pixelAt(surface, x, bandY + SPRITE_H * scale - 1);
      // 마지막 행은 원본에서 통짜 색이라, 어디를 잘라 이어도 색이 튀면 안 된다.
      expect(Math.abs(left[0] - right[0])).toBe(0);
    }
  });
});

describe('drawGroundState — 지면선 정렬', () => {
  test('스프라이트의 모서리 행(원본 `rect(0, 4, 104, 1, m)`)이 지면선에 놓인다', () => {
    expect(bandY + 4 * scale).toBe(Math.round(groundSurfaceY(layout)));
  });

  test('지면선 위쪽은 발판이 덮지 않는다 (원본 상단 4행이 투명)', () => {
    const surface = renderSprite('intact');
    const above = pixelAt(surface, 10, bandY);
    expect(above[3]).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 폴백 경로 — 캔버스를 못 굽는 환경(`createFakeBattleCtx` 는 `drawImage` 가 없다).
// ---------------------------------------------------------------------------

/** `style.ts`의 `rgba()` 출력 접두사 — 어떤 토큰으로 그렸는지 알파와 무관하게 판별한다. */
function rgbPrefix(hex: HexColor): string {
  const { r, g, b } = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}`;
}

function strokeStyles(ctx: ReturnType<typeof createFakeBattleCtx>): string[] {
  return ctx.calls.filter((c) => c.kind === 'stroke').map((c) => (c.kind === 'stroke' ? c.strokeStyle : ''));
}

function countStrokesWith(ctx: ReturnType<typeof createFakeBattleCtx>, prefix: string): number {
  return strokeStyles(ctx).filter((style) => style.startsWith(prefix)).length;
}

function draw(state: GroundState, reducedMotion = false) {
  const ctx = createFakeBattleCtx();
  drawGroundState(ctx, palette, layout, state, reducedMotion, 0);
  return ctx;
}

describe('drawGroundState 폴백 — 지면선(1px 림 라이트)', () => {
  test('발판 상단 모서리에 1px 림 라이트를 그린다', () => {
    const ctx = draw('intact');
    const rim = ctx.calls.find((c) => c.kind === 'stroke' && c.strokeStyle.startsWith(rgbPrefix(palette.TEXT)));
    expect(rim).toBeDefined();
    expect(rim?.kind === 'stroke' ? rim.lineWidth : 0).toBe(1);
  });

  test('림 라이트는 발판 상단 y(groundSurfaceY)에 놓인다 — 모든 발이 이 선 위에 정렬된다', () => {
    const ctx = draw('intact');
    const surfaceY = groundSurfaceY(layout);
    const onSurface = ctx.calls.some((c) => c.kind === 'moveTo' && Math.abs(c.y - surfaceY) < 0.001);
    expect(onSurface).toBe(true);
  });

  test('세 상태 모두 림 라이트를 유지한다', () => {
    for (const state of STATES) {
      expect(countStrokesWith(draw(state), rgbPrefix(palette.TEXT))).toBeGreaterThan(0);
    }
  });
});

describe('drawGroundState 폴백 — 3단계가 화면에서 구분된다', () => {
  test('정상에서는 균열을 그리지 않는다', () => {
    expect(countStrokesWith(draw('intact'), rgbPrefix(palette.LINE))).toBe(0);
  });

  test('균열에서는 균열선이 덧깔린다', () => {
    expect(countStrokesWith(draw('cracked'), rgbPrefix(palette.LINE))).toBeGreaterThan(0);
  });

  test('정상·균열 어디에도 청색 잔광은 없다 (함몰 전용)', () => {
    expect(countStrokesWith(draw('intact'), rgbPrefix(palette.ENEMY_DOWN))).toBe(0);
    expect(countStrokesWith(draw('cracked'), rgbPrefix(palette.ENEMY_DOWN))).toBe(0);
  });

  test('함몰은 균열 위에 청색 잔광만 더한다', () => {
    const ctx = draw('collapsed');
    expect(countStrokesWith(ctx, rgbPrefix(palette.LINE))).toBeGreaterThan(0);
    expect(countStrokesWith(ctx, rgbPrefix(palette.ENEMY_DOWN))).toBeGreaterThan(0);
  });

  test('함몰에 적색(아군색)이 섞이지 않는다 — 잔광은 청색만', () => {
    expect(countStrokesWith(draw('collapsed'), rgbPrefix(palette.UP_ALLY))).toBe(0);
  });
});

describe('drawGroundState 폴백 — reduced-motion에서도 상태가 식별된다', () => {
  test('reduced-motion에서도 균열이 그대로 그려진다 (장식이 아니라 전황 표시)', () => {
    expect(countStrokesWith(draw('cracked', true), rgbPrefix(palette.LINE))).toBeGreaterThan(0);
  });

  test('reduced-motion에서도 함몰의 청색 잔광이 남는다', () => {
    expect(countStrokesWith(draw('collapsed', true), rgbPrefix(palette.ENEMY_DOWN))).toBeGreaterThan(0);
  });

  test('reduced-motion은 시각이 달라도 같은 그림을 낸다 (모션만 멈춘다)', () => {
    const ctxA = createFakeBattleCtx();
    const ctxB = createFakeBattleCtx();
    drawGroundState(ctxA, palette, layout, 'collapsed', true, 0);
    drawGroundState(ctxB, palette, layout, 'collapsed', true, 12_345);
    expect(ctxB.calls).toEqual(ctxA.calls);
  });

  test('모션이 켜져 있으면 시각에 따라 잔광 세기가 달라진다', () => {
    const ctxA = createFakeBattleCtx();
    const ctxB = createFakeBattleCtx();
    drawGroundState(ctxA, palette, layout, 'collapsed', false, 0);
    drawGroundState(ctxB, palette, layout, 'collapsed', false, 900);
    expect(ctxB.calls).not.toEqual(ctxA.calls);
  });
});

describe('drawGroundState — 방어', () => {
  test('캔버스 크기 0에서도 크래시하지 않고 아무것도 그리지 않는다', () => {
    const ctx = createFakeBattleCtx();
    const empty = computeBattleLayout(0, 0);
    expect(() => drawGroundState(ctx, palette, empty, 'collapsed', false, 0)).not.toThrow();
    expect(ctx.calls.length).toBe(0);
  });

  test('그림 안에 읽히는 글자·숫자를 넣지 않는다 (시트 공통 금지)', () => {
    for (const state of STATES) {
      expect(draw(state).calls.some((c) => c.kind === 'fillText')).toBe(false);
    }
  });
});
