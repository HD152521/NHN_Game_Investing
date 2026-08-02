/**
 * 타워 렌더 검사 — 슬롯에 실제로 그려진 픽셀이 원본 스프라이트와 같은지 본다.
 *
 * 조준선·슬롯 번호·받침 같은 **상태 표시**는 여전히 벡터라 `draw-tower-slots.test.ts` ·
 * `draw-towers-lane.test.ts` 가 호출 기록으로 검사한다. 여기서는 그림 자체만 다룬다.
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { TOWER_COOLDOWN_MS } from '../combat/index.js';
import type { TowerKind } from '../combat/types.js';
import { createTheme } from '../design/index.js';
import type { AnimFrame } from '../sprites/anim.js';
import { spriteGrid } from '../sprites/index.js';
import { TOWER_FIRE_BODY_ORIGIN, towerFireFrame } from '../sprites/tower-anim.js';
import { entityAnimFrameAt, spriteRasters } from '../sprites/render/index.js';
import type { RenderableSpriteKey } from '../sprites/render/index.js';
import { createSoftwareSurface } from '../sprites/render/testing/software-canvas.js';
import { makeCombatState as combatState, makeTower } from './combat-fixtures.js';
import { drawTowers, towerFireProgress } from './draw-towers.js';
import { TOWER_SPRITES } from './entity-sprites.js';
import { createFakeBattleCtx } from './fake-ctx.js';
import { computeBattleLayout, slotRect } from './layout.js';
import type { Rect } from './layout.js';
import { cellRgb, createSpriteBattleSurface, hashRegion, pixelAt } from './sprite-fake-ctx.js';
import type { SpriteBattleSurface } from './sprite-fake-ctx.js';

const { palette } = createTheme();
const layout = computeBattleLayout(1024, 300);
const SLOTS = 6;

const scope = globalThis as { OffscreenCanvas?: unknown };
const previousOffscreen = scope.OffscreenCanvas;

beforeAll(() => {
  scope.OffscreenCanvas = function OffscreenCanvasStub(width: number, height: number) {
    return createSoftwareSurface(width, height);
  };
  spriteRasters.clear();
});

afterAll(() => {
  scope.OffscreenCanvas = previousOffscreen;
  spriteRasters.clear();
});

/** 슬롯 받침 위에 세운 스프라이트의 좌상단과 배율(= `drawSpriteStanding` 의 규칙). */
function placement(key: RenderableSpriteKey, rect: Rect): { originX: number; originY: number; scale: number } {
  const grid = spriteGrid(key);
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  const scale = Math.max(1, Math.min(Math.floor(rect.w / width), Math.floor(rect.h / height)));
  return {
    originX: Math.round(rect.x + (rect.w - width * scale) / 2),
    originY: Math.round(rect.y + rect.h - height * scale),
    scale,
  };
}

function drawSingleTower(kind: TowerKind): SpriteBattleSurface {
  const target = createSpriteBattleSurface(1024, 300);
  drawTowers(target.ctx, palette, layout, combatState({ towerSlots: SLOTS, towers: [makeTower({ kind })] }), null, null);
  return target;
}

describe('drawTowers — 타워 3종이 원본 스프라이트 그대로 슬롯 위에 선다', () => {
  test.each([['basic'], ['antiair'], ['splash']] as const)('%s 의 픽셀이 원본 그리드와 일치한다', (kind) => {
    const target = drawSingleTower(kind);
    const key = TOWER_SPRITES[kind].key;
    const rect = slotRect(0, layout, SLOTS);
    const { originX, originY, scale } = placement(key, rect);
    const grid = spriteGrid(key);
    const half = Math.floor(scale / 2);
    let painted = 0;

    for (let y = 0; y < grid.length; y += 1) {
      const row = grid[y];
      if (row === undefined) continue;
      for (let x = 0; x < row.length; x += 1) {
        const cell = row[x];
        if (cell === undefined) continue;
        const expected = cellRgb(palette, cell);
        // 투명 셀에는 받침(LINE)이 비쳐 보이므로 불투명 셀만 대조한다.
        if (expected === null) continue;
        const pixel = pixelAt(target.surface, originX + x * scale + half, originY + y * scale + half);
        expect([pixel[0], pixel[1], pixel[2]], `${key} (${x}, ${y})`).toEqual([...expected]);
        painted += 1;
      }
    }

    expect(painted).toBeGreaterThan(0);
  });

  test('세 종류가 서로 다른 그림으로 나온다', () => {
    const rect = slotRect(0, layout, SLOTS);
    const hashes = (['basic', 'antiair', 'splash'] as const).map((kind) =>
      hashRegion(drawSingleTower(kind).surface, Math.round(rect.x) - 4, Math.round(rect.y) - 4, 60, 60),
    );

    expect(new Set(hashes).size).toBe(3);
  });

  test('타워는 슬롯 사각형 안에 들어간다(정수 배율로 축소)', () => {
    const rect = slotRect(0, layout, SLOTS);
    for (const kind of ['basic', 'antiair', 'splash'] as const) {
      const key = TOWER_SPRITES[kind].key;
      const grid = spriteGrid(key);
      const { originX, originY, scale } = placement(key, rect);

      expect(originX, key).toBeGreaterThanOrEqual(Math.floor(rect.x));
      expect(originX + (grid[0]?.length ?? 0) * scale, key).toBeLessThanOrEqual(Math.ceil(rect.x + rect.w));
      expect(originY, key).toBeGreaterThanOrEqual(Math.floor(rect.y));
      expect(originY + grid.length * scale, key).toBeLessThanOrEqual(Math.ceil(rect.y + rect.h));
    }
  });

  /**
   * ★ 미리보기만 벡터 컨텍스트로 검사하는 이유 ★
   * 스프라이트는 굽는 시점에 알파가 정해져 예전처럼 반투명 실루엣을 그릴 수 없다. 그래서
   * "그림을 그린 뒤 어두운 반투명 판으로 덮는" 방식으로 바꿨는데, 소프트웨어 캔버스는
   * `#RRGGBB` 만 해석하므로 `rgba(...)` 덮기를 픽셀로 재현하지 못한다. 실제 캔버스에서는
   * 문제가 없으므로 여기서는 **덮개가 슬롯 전체를 정확히 덮는지**를 호출 기록으로 본다.
   */
  test('빈 슬롯 미리보기는 슬롯 받침 전체를 덮는 반투명 판을 얹는다', () => {
    const ctx = createFakeBattleCtx();
    drawTowers(ctx, palette, layout, combatState({ towerSlots: SLOTS, towers: [] }), 0, 'splash');

    const rect = slotRect(0, layout, SLOTS);
    const dim = ctx.calls.find((call) => call.kind === 'fillRect' && call.fillStyle.startsWith('rgba('));

    expect(dim).toBeDefined();
    if (dim?.kind !== 'fillRect') throw new Error('덮개 fillRect 가 없습니다.');
    expect(dim.x).toBeLessThanOrEqual(rect.x);
    expect(dim.y).toBeLessThanOrEqual(rect.y);
    expect(dim.x + dim.w).toBeGreaterThanOrEqual(rect.x + rect.w);
    expect(dim.y + dim.h).toBeGreaterThanOrEqual(rect.y + rect.h);
  });

  test('선택되지 않은 빈 슬롯에는 덮개를 얹지 않는다', () => {
    const ctx = createFakeBattleCtx();
    drawTowers(ctx, palette, layout, combatState({ towerSlots: SLOTS, towers: [] }), null, 'splash');

    expect(ctx.calls.some((call) => call.kind === 'fillRect' && call.fillStyle.startsWith('rgba('))).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * 발사 모션 · 티어2 (원본 갱신분 `tf-tfire-01~03` / `tf-t2-01~03`)
 * ------------------------------------------------------------------ */

function towerHash(tower: Parameters<typeof makeTower>[0]): string {
  const target = createSpriteBattleSurface(1024, 300);
  drawTowers(
    target.ctx,
    palette,
    layout,
    combatState({ towerSlots: SLOTS, towers: [makeTower(tower)] }),
    null,
    null,
  );
  const rect = slotRect(0, layout, SLOTS);
  return hashRegion(target.surface, Math.round(rect.x) - 20, Math.round(rect.y) - 12, 100, 80);
}

describe('drawTowers — 발사 모션(쿨다운 역산)', () => {
  test('towerFireProgress — 예광선과 같은 창(쿨다운 70~100%)에서만 값이 나온다', () => {
    // basic 은 800ms 주기라 재생 창은 마지막 240ms(= 쿨다운 800 → 560)다.
    const max = TOWER_COOLDOWN_MS.basic;
    expect(max).toBe(800);
    expect(towerFireProgress(makeTower({ kind: 'basic', cooldownMs: max }))).toBeCloseTo(0, 6);
    expect(towerFireProgress(makeTower({ kind: 'basic', cooldownMs: 680 }))).toBeCloseTo(0.5, 6);
    // 창 길이 240ms 는 부동소수(800 × 0.30000000000000004)라 경계 한 칸은 애매하다 —
    // 아군 공격(`attackAnimProgress`)과 **같은 식**을 쓰므로 여기서 고치지 않는다.
    expect(towerFireProgress(makeTower({ kind: 'basic', cooldownMs: 559 }))).toBeNull();
    expect(towerFireProgress(makeTower({ kind: 'basic', cooldownMs: 0 }))).toBeNull();
  });

  test('발사 창 안에서는 쿨다운마다 다른 프레임이 나온다', () => {
    // 진행도 0.1 / 0.3 / 0.6 / 0.9 → 프레임 0 / 1 / 2 / 3 (창 길이 240ms).
    const hashes = [776, 728, 656, 584].map((cooldownMs) =>
      towerHash({ kind: 'basic', level: 1, cooldownMs }),
    );
    expect(new Set(hashes).size).toBe(4);
  });

  test('재장전 중에는 정지 스프라이트로 돌아온다', () => {
    expect(towerHash({ kind: 'basic', level: 1, cooldownMs: 400 })).toBe(
      towerHash({ kind: 'basic', level: 1, cooldownMs: 0 }),
    );
  });

  test('발사 프레임 픽셀이 원본 `towerFire` 그리드와 일치한다 (원점은 정지 스프라이트 기준)', () => {
    const tower = makeTower({ kind: 'basic', level: 1, cooldownMs: 728 });
    const target = createSpriteBattleSurface(1024, 300);
    drawTowers(target.ctx, palette, layout, combatState({ towerSlots: SLOTS, towers: [tower] }), null, null);

    const rect = slotRect(0, layout, SLOTS);
    const { originX, originY, scale } = placement(TOWER_SPRITES.basic.key, rect);
    const progress = towerFireProgress(tower);
    expect(progress).not.toBeNull();
    const frame = towerFireFrame(1, entityAnimFrameAt('tfire-01-l1', progress as number) as AnimFrame);

    // 프레임 안에서 몸통은 (2, 4) 에 들어앉아 있으므로 그만큼 되돌린 자리에 그려져야 한다.
    const half = Math.floor(scale / 2);
    let painted = 0;
    for (let y = 0; y < frame.length; y += 1) {
      const row = frame[y];
      if (row === undefined) continue;
      for (let x = 0; x < row.length; x += 1) {
        const cell = row[x];
        if (cell === undefined) continue;
        const expected = cellRgb(palette, cell);
        if (expected === null) continue;
        const px = originX + (x - TOWER_FIRE_BODY_ORIGIN.x) * scale + half;
        const py = originY + (y - TOWER_FIRE_BODY_ORIGIN.y) * scale + half;
        if (px < 0 || py < 0 || px >= 1024 || py >= 300) continue;
        const pixel = pixelAt(target.surface, px, py);
        expect([pixel[0], pixel[1], pixel[2]], `tfire (${x}, ${y})`).toEqual([...expected]);
        painted += 1;
      }
    }
    expect(painted).toBeGreaterThan(0);
  });

  test('레벨 2 는 쉬는 동안에도 금색 장식이 보인다 (level 로 바로 판별)', () => {
    const idle = towerHash({ kind: 'basic', level: 1, cooldownMs: 0 });
    const tier2 = towerHash({ kind: 'basic', level: 2, cooldownMs: 0 });
    expect(tier2).not.toBe(idle);
  });

  test('세 종류 × 두 레벨이 전부 다른 그림이다', () => {
    const hashes: string[] = [];
    for (const kind of ['basic', 'antiair', 'splash'] as const) {
      for (const level of [1, 2] as const) hashes.push(towerHash({ kind, level, cooldownMs: 0 }));
    }
    expect(new Set(hashes).size).toBe(6);
  });
});
