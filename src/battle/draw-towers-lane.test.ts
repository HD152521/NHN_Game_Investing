import { describe, expect, test } from 'vitest';

import type { CombatState, Tower, TowerKind } from '../combat/types.js';
import { createTheme } from '../design/index.js';
import { drawTowers } from './draw-towers.js';
import { computeBattleLayout } from './layout.js';
import { createFakeBattleCtx } from './fake-ctx.js';

const { palette } = createTheme();
const layout = computeBattleLayout(800, 300);

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

function towerOf(kind: TowerKind): Tower {
  return { slot: 0, kind, level: 1, cooldownMs: 0 };
}

describe('drawTowers — 레인 조준 표시', () => {
  test('대공 타워의 조준선은 공중 레인(airY)까지 뻗는다', () => {
    const ctx = createFakeBattleCtx();
    const state = combatState({ towers: [towerOf('antiair')] });

    drawTowers(ctx, palette, layout, state, null, null);

    const reachesAirY = ctx.calls.some(
      (call) => call.kind === 'lineTo' && Math.abs(call.y - layout.airY) < 1,
    );
    expect(reachesAirY).toBe(true);
  });

  test('기본 타워의 조준선은 지상 레인(groundY)까지 뻗는다', () => {
    const ctx = createFakeBattleCtx();
    const state = combatState({ towers: [towerOf('basic')] });

    drawTowers(ctx, palette, layout, state, null, null);

    const reachesGroundY = ctx.calls.some(
      (call) => call.kind === 'lineTo' && Math.abs(call.y - layout.groundY) < 1,
    );
    expect(reachesGroundY).toBe(true);
  });

  test('광역 타워의 조준선도 지상 레인(groundY)까지 뻗는다', () => {
    const ctx = createFakeBattleCtx();
    const state = combatState({ towers: [towerOf('splash')] });

    drawTowers(ctx, palette, layout, state, null, null);

    const reachesGroundY = ctx.calls.some(
      (call) => call.kind === 'lineTo' && Math.abs(call.y - layout.groundY) < 1,
    );
    expect(reachesGroundY).toBe(true);
  });
});

describe('drawTowers — 빈 슬롯 미리보기', () => {
  test('빈 슬롯을 선택하고 선택된 타워 종류가 있으면 반투명 미리보기가 그려진다', () => {
    const ctx = createFakeBattleCtx();
    const state = combatState({ towers: [] });

    drawTowers(ctx, palette, layout, state, 0, 'splash');

    const hasPreviewFill = ctx.calls.some(
      (call) => (call.kind === 'fill' || call.kind === 'fillRect') && call.fillStyle.startsWith('rgba('),
    );
    expect(hasPreviewFill).toBe(true);
  });

  test('선택된 슬롯이 없으면 미리보기가 그려지지 않는다', () => {
    const ctx = createFakeBattleCtx();
    const state = combatState({ towers: [] });

    drawTowers(ctx, palette, layout, state, null, 'splash');

    const hasPreviewFill = ctx.calls.some(
      (call) => (call.kind === 'fill' || call.kind === 'fillRect') && call.fillStyle.startsWith('rgba('),
    );
    expect(hasPreviewFill).toBe(false);
  });

  test('슬롯을 선택했어도 선택된 타워 종류가 없으면 미리보기가 그려지지 않는다', () => {
    const ctx = createFakeBattleCtx();
    const state = combatState({ towers: [] });

    drawTowers(ctx, palette, layout, state, 0, null);

    const hasPreviewFill = ctx.calls.some(
      (call) => (call.kind === 'fill' || call.kind === 'fillRect') && call.fillStyle.startsWith('rgba('),
    );
    expect(hasPreviewFill).toBe(false);
  });
});
