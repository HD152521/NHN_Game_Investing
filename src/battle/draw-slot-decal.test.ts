import { describe, expect, test } from 'vitest';

import { TOWER_BUILD_COST } from '../combat/index.js';
import { createTheme } from '../design/index.js';
import { makeCombatState as combatState, makeTower } from './combat-fixtures.js';
import { createFakeBattleCtx } from './fake-ctx.js';
import { drawSlotDecal, drawSlotDecals, slotDecalRect } from './draw-slot-decal.js';
import { computeBattleLayout } from './layout.js';

const { palette } = createTheme();
const layout = computeBattleLayout(1024, 300);
const BASIC_COST = TOWER_BUILD_COST.basic;

type Ctx = ReturnType<typeof createFakeBattleCtx>;

function drawOne(state: 'inactive' | 'placeable' | 'blocked'): Ctx {
  const ctx = createFakeBattleCtx();
  drawSlotDecal(ctx, palette, slotDecalRect(0, layout, 6), state);
  return ctx;
}

function hasStrokeStyle(ctx: Ctx, style: string): boolean {
  return ctx.calls.some(
    (c) => (c.kind === 'stroke' && c.strokeStyle === style) || (c.kind === 'strokeRect' && c.strokeStyle === style),
  );
}

function dashedStrokes(ctx: Ctx): number {
  return ctx.calls.filter(
    (c) => c.kind === 'stroke' && c.dash.length > 0,
  ).length;
}

describe('drawSlotDecal — 3상태 데칼 형태 (시트 §02)', () => {
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
    // 해칭선이 여러 줄 그어진다.
    expect(ctx.calls.filter((c) => c.kind === 'lineTo').length).toBeGreaterThanOrEqual(3);
  });

  test('세 상태 어디에도 글자가 없다 (시트: 글자 없음)', () => {
    for (const state of ['inactive', 'placeable', 'blocked'] as const) {
      expect(drawOne(state).calls.some((c) => c.kind === 'fillText')).toBe(false);
    }
  });

  test('해칭선은 데칼 사각형 밖으로 삐져나가지 않는다', () => {
    const rect = slotDecalRect(0, layout, 6);
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

describe('slotDecalRect — 발판 위, 발판과 같은 원근', () => {
  test('데칼은 슬롯 열 중심에 정렬된다', () => {
    const decal = slotDecalRect(2, layout, 6);
    const other = slotDecalRect(3, layout, 6);
    expect(other.x).toBeGreaterThan(decal.x);
  });

  test('데칼은 납작하다 — 높이가 폭보다 작다 (측면 뷰의 바닥 평면)', () => {
    const decal = slotDecalRect(0, layout, 6);
    expect(decal.h).toBeLessThan(decal.w);
    expect(decal.h).toBeGreaterThan(0);
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
