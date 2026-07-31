import { describe, expect, test } from 'vitest';

import type { CombatState, Enemy, Tower, Unit } from '../combat/types.js';
import { createTheme } from '../design/index.js';
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

function enemy(overrides: Partial<Enemy> = {}): Enemy {
  return { id: 1, lane: 'ground', x: 0.7, hp: 50, maxHp: 100, speed: 0.02, ...overrides };
}

function unit(overrides: Partial<Unit> = {}): Unit {
  return { id: 1, kind: 'intern', x: 0.3, hp: 30, maxHp: 30, cooldownMs: 0, ...overrides };
}

function tower(overrides: Partial<Tower> = {}): Tower {
  return { slot: 0, kind: 'basic', level: 1, cooldownMs: 0, ...overrides };
}

function fillStyles(ctx: ReturnType<typeof createFakeBattleCtx>): string[] {
  return ctx.calls
    .filter((c) => c.kind === 'fillRect' || c.kind === 'fill' || c.kind === 'fillText')
    .map((c) => (c.kind === 'fillRect' || c.kind === 'fill' || c.kind === 'fillText' ? c.fillStyle : ''));
}

function strokeStyles(ctx: ReturnType<typeof createFakeBattleCtx>): string[] {
  return ctx.calls
    .filter((c) => c.kind === 'stroke' || c.kind === 'strokeRect')
    .map((c) => (c.kind === 'stroke' || c.kind === 'strokeRect' ? c.strokeStyle : ''));
}

function allNumericArgsFinite(ctx: ReturnType<typeof createFakeBattleCtx>): boolean {
  return ctx.calls.every((call) => {
    switch (call.kind) {
      case 'fillRect':
      case 'strokeRect':
        return (
          Number.isFinite(call.x) && Number.isFinite(call.y) && Number.isFinite(call.w) && Number.isFinite(call.h)
        );
      case 'moveTo':
      case 'lineTo':
        return Number.isFinite(call.x) && Number.isFinite(call.y);
      case 'arc':
        return Number.isFinite(call.x) && Number.isFinite(call.y) && Number.isFinite(call.radius);
      case 'fillText':
        return Number.isFinite(call.x) && Number.isFinite(call.y);
      default:
        return true;
    }
  });
}

describe('drawBattle — 엣지 케이스', () => {
  test('적·유닛이 0명이어도 크래시하지 않고 배경을 그린다', () => {
    const ctx = createFakeBattleCtx();

    expect(() =>
      drawBattle(ctx, { state: combatState(), palette, width: WIDTH, height: HEIGHT }),
    ).not.toThrow();

    expect(ctx.calls.some((c) => c.kind === 'fillRect' && c.fillStyle === palette.BG_0)).toBe(true);
  });

  test('캔버스 크기가 극단적으로 작아도 NaN 없이 그린다', () => {
    const ctx = createFakeBattleCtx();
    const state = combatState({
      enemies: [enemy()],
      units: [unit()],
      towers: [tower()],
    });

    expect(() => drawBattle(ctx, { state, palette, width: 1, height: 1 })).not.toThrow();
    expect(allNumericArgsFinite(ctx)).toBe(true);
  });

  test('타워 슬롯이 0이어도(전투 시작 전) 크래시하지 않는다', () => {
    const ctx = createFakeBattleCtx();
    const state = combatState({ towerSlots: 0 });

    expect(() => drawBattle(ctx, { state, palette, width: WIDTH, height: HEIGHT })).not.toThrow();
  });
});

describe('drawBattle — 진영 색', () => {
  test('적군과 아군이 서로 다른 색으로 그려진다', () => {
    const ctx = createFakeBattleCtx();
    const state = combatState({
      enemies: [enemy({ id: 1, lane: 'ground' }), enemy({ id: 2, lane: 'air' })],
      units: [unit({ id: 1, kind: 'trader' })],
    });

    drawBattle(ctx, { state, palette, width: WIDTH, height: HEIGHT });

    const styles = fillStyles(ctx);
    expect(styles).toContain(palette.UP_ALLY);
    expect(styles).toContain(palette.ENEMY_DOWN);
  });

  test('타워는 아군 색으로 그려진다', () => {
    const ctx = createFakeBattleCtx();
    const state = combatState({ towers: [tower({ kind: 'antiair', level: 1 })] });

    drawBattle(ctx, { state, palette, width: WIDTH, height: HEIGHT });

    const styles = [...fillStyles(ctx), ...strokeStyles(ctx)];
    expect(styles).toContain(palette.UP_ALLY);
  });
});

describe('drawBattle — 타워 슬롯', () => {
  test('빈 슬롯은 점선 윤곽으로 그려진다(setLineDash 호출)', () => {
    const ctx = createFakeBattleCtx();
    const state = combatState({ towers: [] });

    drawBattle(ctx, { state, palette, width: WIDTH, height: HEIGHT });

    const dashCalls = ctx.calls.filter((c) => c.kind === 'setLineDash' && c.segments.length > 0);
    expect(dashCalls.length).toBeGreaterThan(0);
  });

  test('선택된 슬롯은 GOLD 강조색을 사용한다', () => {
    const ctx = createFakeBattleCtx();
    const state = combatState({ towers: [] });

    drawBattle(ctx, { state, palette, width: WIDTH, height: HEIGHT, selectedSlot: 0 });

    const styles = [...fillStyles(ctx), ...strokeStyles(ctx)];
    expect(styles).toContain(palette.GOLD);
  });

  test('업그레이드(level 2)된 타워는 GOLD 강조가 추가된다', () => {
    const ctx = createFakeBattleCtx();
    const state = combatState({ towers: [tower({ level: 2 })] });

    drawBattle(ctx, { state, palette, width: WIDTH, height: HEIGHT });

    const styles = [...fillStyles(ctx), ...strokeStyles(ctx)];
    expect(styles).toContain(palette.GOLD);
  });
});

describe('drawBattle — HP 바', () => {
  test('본진 HP가 낮으면 그래도 크래시 없이 그려진다(경계값)', () => {
    const ctx = createFakeBattleCtx();
    const state = combatState({ baseHp: 0, maxBaseHp: 100 });

    expect(() => drawBattle(ctx, { state, palette, width: WIDTH, height: HEIGHT })).not.toThrow();
  });

  test('적 HP 0인 경우에도 크래시하지 않는다', () => {
    const ctx = createFakeBattleCtx();
    const state = combatState({ enemies: [enemy({ hp: 0 })] });

    expect(() => drawBattle(ctx, { state, palette, width: WIDTH, height: HEIGHT })).not.toThrow();
  });
});

describe('drawBattle — HUD', () => {
  test('웨이브 텍스트가 그려진다', () => {
    const ctx = createFakeBattleCtx();
    const state = combatState({ wave: 2, waveCount: 5 });

    drawBattle(ctx, { state, palette, width: WIDTH, height: HEIGHT });

    const texts = ctx.calls.filter((c) => c.kind === 'fillText').map((c) => (c.kind === 'fillText' ? c.text : ''));
    expect(texts.some((t) => t.includes('2') && t.includes('5'))).toBe(true);
  });
});
