import { describe, expect, test } from 'vitest';

import type { CombatState, Tower } from '../combat/types.js';
import { createTheme, parseHex } from '../design/index.js';
import { drawBattle } from './battle.js';
import { createFakeBattleCtx } from './fake-ctx.js';

const { palette } = createTheme();

const WIDTH = 800;
const HEIGHT = 300;

function combatState(overrides: Partial<CombatState> = {}): CombatState {
  return {
    phase: 'running',
    wave: 1,
    waveCount: 5,
    waveElapsedMs: 0,
    enemies: [],
    units: [],
    towers: [],
    baseHp: 100,
    maxBaseHp: 100,
    towerSlots: 6,
    skillCooldownMs: 0,
    ...overrides,
  };
}

function basicTower(overrides: Partial<Tower> = {}): Tower {
  return { slot: 0, kind: 'basic', level: 1, cooldownMs: 0, ...overrides };
}

/** 사거리 띠는 GOLD를 반투명(rgba)으로 파생한 색을 쓴다 — MUTED 계열 rgba(HUD 게이지 등)와
 * 헷갈리지 않도록 GOLD의 rgb 성분으로 시작하는 fillRect만 골라낸다. */
function rangeBandFillCount(ctx: ReturnType<typeof createFakeBattleCtx>): number {
  const { r, g, b } = parseHex(palette.GOLD);
  const prefix = `rgba(${r}, ${g}, ${b},`;
  return ctx.calls.filter((c) => c.kind === 'fillRect' && c.fillStyle.startsWith(prefix)).length;
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

  test('빈 슬롯을 선택했는데 selectedTowerKind도 없으면 사거리 띠가 그려지지 않는다', () => {
    const ctx = createFakeBattleCtx();
    const state = combatState({ towers: [] });

    drawBattle(ctx, { state, palette, width: WIDTH, height: HEIGHT, selectedSlot: 0, selectedTowerKind: null });

    expect(rangeBandFillCount(ctx)).toBe(0);
  });
});
