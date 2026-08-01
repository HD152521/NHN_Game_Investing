import { describe, expect, test } from 'vitest';

import type { Tower } from '../combat/types.js';
import { createTheme, parseHex } from '../design/index.js';
import { drawBattle } from './battle.js';
import { makeCombatState as combatState, makeTower } from './combat-fixtures.js';
import { createFakeBattleCtx } from './fake-ctx.js';

const { palette } = createTheme();

const WIDTH = 800;
const HEIGHT = 300;

function basicTower(overrides: Partial<Tower> = {}): Tower {
  return makeTower({ kind: 'basic', ...overrides });
}

/** 사거리 띠는 GOLD를 반투명(rgba)으로 파생한 색을 쓴다 — MUTED 계열 rgba(HUD 게이지 등)와
 * 헷갈리지 않도록 GOLD의 rgb 성분으로 시작하는 fillRect만 골라낸다. */
function rangeBandFills(ctx: ReturnType<typeof createFakeBattleCtx>) {
  const { r, g, b } = parseHex(palette.GOLD);
  const prefix = `rgba(${r}, ${g}, ${b},`;
  return ctx.calls.filter((c) => c.kind === 'fillRect' && c.fillStyle.startsWith(prefix));
}

function rangeBandFillCount(ctx: ReturnType<typeof createFakeBattleCtx>): number {
  return rangeBandFills(ctx).length;
}

/** 선택한 슬롯의 사거리 띠 폭(px). 띠가 없으면 0. */
function bandWidthForSlot(slot: number): number {
  const ctx = createFakeBattleCtx();
  const state = combatState({ towers: [], towerSlots: 6 });

  drawBattle(ctx, {
    state,
    palette,
    width: WIDTH,
    height: HEIGHT,
    selectedSlot: slot,
    selectedTowerKind: 'basic',
  });

  const fill = rangeBandFills(ctx)[0];
  return fill && fill.kind === 'fillRect' ? fill.w : 0;
}

describe('drawBattle — 사거리 시각화', () => {
  test('selectedSlot이 주어지면 사거리 띠(GOLD 반투명 fillRect)가 그려진다', () => {
    const ctx = createFakeBattleCtx();
    const state = combatState({ towers: [basicTower()] });

    drawBattle(ctx, { state, palette, width: WIDTH, height: HEIGHT, selectedSlot: 0 });

    expect(rangeBandFillCount(ctx)).toBeGreaterThan(0);
  });

  test('selectedSlot이 null이면 사거리 띠가 그려지지 않는다', () => {
    const ctx = createFakeBattleCtx();
    const state = combatState({ towers: [basicTower()] });

    drawBattle(ctx, { state, palette, width: WIDTH, height: HEIGHT, selectedSlot: null });

    expect(rangeBandFillCount(ctx)).toBe(0);
  });

  test('selectedSlot을 아예 넘기지 않아도(기본값) 사거리 띠가 그려지지 않는다', () => {
    const ctx = createFakeBattleCtx();
    const state = combatState({ towers: [basicTower()] });

    drawBattle(ctx, { state, palette, width: WIDTH, height: HEIGHT });

    expect(rangeBandFillCount(ctx)).toBe(0);
  });

  test('빈 슬롯을 선택해도 selectedTowerKind가 있으면 미리보기 사거리 띠가 그려진다', () => {
    const ctx = createFakeBattleCtx();
    const state = combatState({ towers: [] });

    drawBattle(ctx, { state, palette, width: WIDTH, height: HEIGHT, selectedSlot: 0, selectedTowerKind: 'splash' });

    expect(rangeBandFillCount(ctx)).toBeGreaterThan(0);
  });

  /**
   * ★ 배치 이동 회귀 방지 ★ 커버 상한은 `towerX(slot) + range`(타워 자기 위치 기준)다.
   * 예전 미리보기는 슬롯과 무관하게 항상 `[0, range]`를 그려, 어느 슬롯을 골라도 띠가
   * 똑같아 보였다 — 화면만 보고는 배치 차이를 알 수 없었다.
   */
  test('슬롯마다 사거리 띠 길이가 다르다 (앞 슬롯일수록 길다)', () => {
    const widths = [0, 1, 2, 3, 4, 5].map(bandWidthForSlot);

    expect(new Set(widths).size).toBe(6);
    for (let i = 1; i < widths.length; i += 1) {
      expect(widths[i]!).toBeGreaterThan(widths[i - 1]!);
    }
  });

  test('빈 슬롯을 선택했는데 selectedTowerKind도 없으면 사거리 띠가 그려지지 않는다', () => {
    const ctx = createFakeBattleCtx();
    const state = combatState({ towers: [] });

    drawBattle(ctx, { state, palette, width: WIDTH, height: HEIGHT, selectedSlot: 0, selectedTowerKind: null });

    expect(rangeBandFillCount(ctx)).toBe(0);
  });
});
