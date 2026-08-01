import { describe, expect, test } from 'vitest';

import { TOWER_BUILD_COST } from '../combat/index.js';
import { createTheme, parseHex } from '../design/index.js';
import type { SlotDecalState } from '../ground/index.js';
import { groundSlot } from '../sprites/index.js';
import { groundSurfaceY } from './draw-background.js';
import { makeCombatState as combatState, makeTower } from './combat-fixtures.js';
import { createFakeBattleCtx } from './fake-ctx.js';
import {
  CELL_HEIGHT,
  CELL_RIM_ROW,
  CELL_TOP,
  CELL_WIDTH,
  CELL_X,
  drawSlotDecal,
  drawSlotDecals,
  slotDecalRect,
} from './draw-slot-decal.js';
import { computeBattleLayout } from './layout.js';
import { cellRgb, createSoftwareRasterCache, createSpriteBattleSurface, hashRegion, pixelAt } from './sprite-fake-ctx.js';

const { palette } = createTheme();
const WIDTH = 1024;
const HEIGHT = 300;
const layout = computeBattleLayout(WIDTH, HEIGHT);
const BASIC_COST = TOWER_BUILD_COST.basic;
const SLOTS = 6;
const STATES: readonly SlotDecalState[] = ['inactive', 'placeable', 'blocked'];

type Ctx = ReturnType<typeof createFakeBattleCtx>;

// ---------------------------------------------------------------------------
// 스프라이트 경로 — `tf-gnd-slot` 시트를 3칸으로 잘라 쓴다.
// ---------------------------------------------------------------------------

const sheet = groundSlot();
const rect = slotDecalRect(0, layout, SLOTS);
const scale = rect.w / CELL_WIDTH;

function renderSprite(state: SlotDecalState) {
  const { ctx, surface } = createSpriteBattleSurface(WIDTH, HEIGHT);
  drawSlotDecal(ctx, palette, rect, state, { rasters: createSoftwareRasterCache() });
  return surface;
}

function decalHash(state: SlotDecalState): string {
  return hashRegion(renderSprite(state), Math.round(rect.x), Math.round(rect.y), rect.w, rect.h);
}

/** 그려진 데칼이 원본 시트의 해당 칸과 문자 단위로 같은지 센다. */
function mismatchesAgainstSheet(state: SlotDecalState): number {
  const surface = renderSprite(state);
  const originX = Math.round(rect.x);
  const originY = Math.round(rect.y);
  let mismatches = 0;

  for (let gy = 0; gy < CELL_HEIGHT; gy += 1) {
    const row = sheet[CELL_TOP + gy];
    if (row === undefined) continue;
    for (let gx = 0; gx < CELL_WIDTH; gx += 1) {
      const cell = row[CELL_X[state] + gx];
      if (cell === undefined) continue;
      const expected = cellRgb(palette, cell);
      if (expected === null) continue;
      const actual = pixelAt(surface, originX + gx * scale, originY + gy * scale);
      if (actual[0] !== expected[0] || actual[1] !== expected[1] || actual[2] !== expected[2]) mismatches += 1;
    }
  }
  return mismatches;
}

/** 데칼 안에 특정 색 픽셀이 있는지. 상태별 색 구분(적색 = 배치 가능)을 확인한다. */
function hasColor(state: SlotDecalState, hex: string): boolean {
  const surface = renderSprite(state);
  const { r, g, b } = parseHex(hex);
  for (let y = Math.round(rect.y); y < Math.round(rect.y) + rect.h; y += 1) {
    for (let x = Math.round(rect.x); x < Math.round(rect.x) + rect.w; x += 1) {
      const px = pixelAt(surface, x, y);
      if (px[0] === r && px[1] === g && px[2] === b) return true;
    }
  }
  return false;
}

describe('drawSlotDecal — 원본 `tf-gnd-slot` 시트의 3칸을 상태별로 쓴다', () => {
  test('시트는 60×20 한 장에 3상태를 가로로 담고 있다', () => {
    expect(sheet.length).toBe(20);
    expect(sheet[0]?.length).toBe(60);
    expect(CELL_X.inactive).toBe(0);
    expect(CELL_X.placeable).toBe(20);
    expect(CELL_X.blocked).toBe(40);
  });

  test('세 상태가 원본 시트의 각 칸과 픽셀 단위로 일치한다', () => {
    for (const state of STATES) {
      expect(mismatchesAgainstSheet(state)).toBe(0);
    }
  });

  test('세 상태가 화면에서 서로 다르다', () => {
    const hashes = STATES.map(decalHash);
    expect(new Set(hashes).size).toBe(3);
  });

  test('배치 가능만 적색(원본 `box(24, r, bracket)`)을 쓴다', () => {
    expect(hasColor('placeable', palette.UP_ALLY)).toBe(true);
    expect(hasColor('inactive', palette.UP_ALLY)).toBe(false);
    expect(hasColor('blocked', palette.UP_ALLY)).toBe(false);
  });

  test('비활성·배치 불가는 회색(원본 `m`)으로 그려진다', () => {
    expect(hasColor('inactive', palette.MUTED)).toBe(true);
    expect(hasColor('blocked', palette.MUTED)).toBe(true);
  });
});

describe('slotDecalRect — 시트의 지면 모서리를 전장 지면선에 맞춘다', () => {
  test('데칼은 슬롯 열 중심에 정렬된다', () => {
    const decal = slotDecalRect(2, layout, SLOTS);
    const other = slotDecalRect(3, layout, SLOTS);
    expect(other.x).toBeGreaterThan(decal.x);
  });

  test('데칼은 납작하다 — 높이가 폭보다 작다 (측면 뷰의 바닥 평면)', () => {
    const decal = slotDecalRect(0, layout, SLOTS);
    expect(decal.h).toBeLessThan(decal.w);
    expect(decal.h).toBeGreaterThan(0);
  });

  test('시트 행 12(`m` 지면 모서리)가 지면선에 놓인다', () => {
    expect(rect.y + CELL_RIM_ROW * scale).toBe(groundSurfaceY(layout));
  });

  test('배율은 정수다 — 픽셀 아트가 흐려지지 않는다', () => {
    expect(Number.isInteger(scale)).toBe(true);
    expect(scale).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// 폴백 경로 — 캔버스를 못 굽는 환경(`createFakeBattleCtx` 는 `drawImage` 가 없다).
// ---------------------------------------------------------------------------

function drawOne(state: SlotDecalState): Ctx {
  const ctx = createFakeBattleCtx();
  drawSlotDecal(ctx, palette, slotDecalRect(0, layout, SLOTS), state);
  return ctx;
}

function hasStrokeStyle(ctx: Ctx, style: string): boolean {
  return ctx.calls.some(
    (c) => (c.kind === 'stroke' && c.strokeStyle === style) || (c.kind === 'strokeRect' && c.strokeStyle === style),
  );
}

function dashedStrokes(ctx: Ctx): number {
  return ctx.calls.filter((c) => c.kind === 'stroke' && c.dash.length > 0).length;
}

describe('drawSlotDecal 폴백 — 3상태 데칼 형태 (시트 §02)', () => {
  test('비활성은 점선 사각이다', () => {
    const ctx = drawOne('inactive');
    expect(dashedStrokes(ctx)).toBeGreaterThan(0);
    expect(hasStrokeStyle(ctx, palette.MUTED)).toBe(true);
  });

  test('배치 가능은 적색 실선 + 코너 브래킷이다', () => {
    const ctx = drawOne('placeable');
    expect(hasStrokeStyle(ctx, palette.UP_ALLY)).toBe(true);
    // 실선 — 점선 획이 하나도 없어야 한다.
    expect(dashedStrokes(ctx)).toBe(0);
    // 코너 브래킷 4개 = 꺾인 선 8획(모서리마다 2획).
    const lineToCalls = ctx.calls.filter((c) => c.kind === 'lineTo').length;
    expect(lineToCalls).toBeGreaterThanOrEqual(8);
  });

  test('배치 불가는 회색 사선 해칭이다 — 적색을 쓰지 않는다', () => {
    const ctx = drawOne('blocked');
    expect(hasStrokeStyle(ctx, palette.MUTED)).toBe(true);
    expect(hasStrokeStyle(ctx, palette.UP_ALLY)).toBe(false);
    expect(ctx.calls.filter((c) => c.kind === 'lineTo').length).toBeGreaterThanOrEqual(3);
  });

  test('세 상태 어디에도 글자가 없다 (시트: 글자 없음)', () => {
    for (const state of STATES) {
      expect(drawOne(state).calls.some((c) => c.kind === 'fillText')).toBe(false);
    }
  });

  test('해칭선은 데칼 사각형 밖으로 삐져나가지 않는다', () => {
    const ctx = createFakeBattleCtx();
    drawSlotDecal(ctx, palette, rect, 'blocked');

    for (const call of ctx.calls) {
      if (call.kind !== 'moveTo' && call.kind !== 'lineTo') continue;
      expect(call.x).toBeGreaterThanOrEqual(rect.x - 0.001);
      expect(call.x).toBeLessThanOrEqual(rect.x + rect.w + 0.001);
      expect(call.y).toBeGreaterThanOrEqual(rect.y - 0.001);
      expect(call.y).toBeLessThanOrEqual(rect.y + rect.h + 0.001);
    }
  });
});

describe('drawSlotDecals — 골드·점유가 화면을 가른다', () => {
  test('골드가 충분하면 배치 가능(적색 실선)으로 보인다', () => {
    const ctx = createFakeBattleCtx();
    drawSlotDecals(ctx, palette, layout, combatState({ towers: [] }), BASIC_COST, 'basic');
    expect(hasStrokeStyle(ctx, palette.UP_ALLY)).toBe(true);
  });

  test('골드가 모자라면 배치 가능이 사라진다 — 매매를 해야 방어가 선다', () => {
    const ctx = createFakeBattleCtx();
    drawSlotDecals(ctx, palette, layout, combatState({ towers: [] }), BASIC_COST - 1, 'basic');
    expect(hasStrokeStyle(ctx, palette.UP_ALLY)).toBe(false);
    expect(hasStrokeStyle(ctx, palette.MUTED)).toBe(true);
  });

  test('점유된 슬롯은 골드가 남아돌아도 배치 가능으로 보이지 않는다', () => {
    const ctx = createFakeBattleCtx();
    const state = combatState({ towerSlots: 1, towers: [makeTower({ slot: 0 })] });
    drawSlotDecals(ctx, palette, layout, state, 99_999, 'basic');
    expect(hasStrokeStyle(ctx, palette.UP_ALLY)).toBe(false);
  });

  test('타워를 고르지 않았으면 전부 비활성(점선)이다', () => {
    const ctx = createFakeBattleCtx();
    drawSlotDecals(ctx, palette, layout, combatState({ towers: [] }), 99_999, null);
    expect(hasStrokeStyle(ctx, palette.UP_ALLY)).toBe(false);
    expect(dashedStrokes(ctx)).toBeGreaterThan(0);
  });

  test('슬롯이 0이면 아무것도 그리지 않는다', () => {
    const ctx = createFakeBattleCtx();
    drawSlotDecals(ctx, palette, layout, combatState({ towerSlots: 0 }), 500, 'basic');
    expect(ctx.calls.length).toBe(0);
  });
});
