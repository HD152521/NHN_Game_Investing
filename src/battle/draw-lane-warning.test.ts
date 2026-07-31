import { describe, expect, test } from 'vitest';

import type { CombatState, Enemy, Tower } from '../combat/types.js';
import { createTheme } from '../design/index.js';
import { drawBattle } from './battle.js';
import { hasAirEnemy, hasAntiairTower, isAirLaneWarningActive } from './draw-lane-warning.js';
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

function airEnemy(overrides: Partial<Enemy> = {}): Enemy {
  return { id: 1, lane: 'air', x: 0.6, hp: 40, maxHp: 40, speed: 0.03, ...overrides };
}

function groundEnemy(overrides: Partial<Enemy> = {}): Enemy {
  return { id: 1, lane: 'ground', x: 0.6, hp: 40, maxHp: 40, speed: 0.02, ...overrides };
}

function antiairTower(overrides: Partial<Tower> = {}): Tower {
  return { slot: 0, kind: 'antiair', level: 1, cooldownMs: 0, ...overrides };
}

function basicTower(overrides: Partial<Tower> = {}): Tower {
  return { slot: 0, kind: 'basic', level: 1, cooldownMs: 0, ...overrides };
}

function warningTexts(ctx: ReturnType<typeof createFakeBattleCtx>): string[] {
  return ctx.calls
    .filter((c) => c.kind === 'fillText')
    .map((c) => (c.kind === 'fillText' ? c.text : ''))
    .filter((text) => text.includes('대공'));
}

describe('isAirLaneWarningActive — 순수 판정 함수', () => {
  test('공중 적이 있고 대공 포대가 없으면 true', () => {
    expect(isAirLaneWarningActive([airEnemy()], [])).toBe(true);
  });

  test('공중 적이 있어도 대공 포대가 있으면 false', () => {
    expect(isAirLaneWarningActive([airEnemy()], [antiairTower()])).toBe(false);
  });

  test('공중 적이 없으면 대공 포대 유무와 무관하게 false', () => {
    expect(isAirLaneWarningActive([], [])).toBe(false);
    expect(isAirLaneWarningActive([groundEnemy()], [])).toBe(false);
  });
});

describe('hasAirEnemy / hasAntiairTower', () => {
  test('지상 적만 있으면 hasAirEnemy는 false', () => {
    expect(hasAirEnemy([groundEnemy()])).toBe(false);
  });

  test('대공이 아닌 타워만 있으면 hasAntiairTower는 false', () => {
    expect(hasAntiairTower([basicTower()])).toBe(false);
  });
});

describe('drawBattle — 공중 레인 경고 표시', () => {
  test('공중 적이 있고 대공 포대가 없으면 경고 문구가 그려진다', () => {
    const ctx = createFakeBattleCtx();
    const state = combatState({ enemies: [airEnemy()], towers: [] });

    drawBattle(ctx, { state, palette, width: WIDTH, height: HEIGHT });

    expect(warningTexts(ctx).length).toBeGreaterThan(0);
  });

  test('대공 포대가 있으면 경고 문구가 그려지지 않는다', () => {
    const ctx = createFakeBattleCtx();
    const state = combatState({ enemies: [airEnemy()], towers: [antiairTower()] });

    drawBattle(ctx, { state, palette, width: WIDTH, height: HEIGHT });

    expect(warningTexts(ctx).length).toBe(0);
  });

  test('공중 적이 없으면 경고 문구가 그려지지 않는다', () => {
    const ctx = createFakeBattleCtx();
    const state = combatState({ enemies: [groundEnemy()], towers: [] });

    drawBattle(ctx, { state, palette, width: WIDTH, height: HEIGHT });

    expect(warningTexts(ctx).length).toBe(0);
  });

  test('극소 캔버스 크기에서도 경고가 크래시하지 않는다', () => {
    const ctx = createFakeBattleCtx();
    const state = combatState({ enemies: [airEnemy()], towers: [] });

    expect(() => drawBattle(ctx, { state, palette, width: 1, height: 1 })).not.toThrow();
  });
});
