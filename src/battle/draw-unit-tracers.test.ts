import { describe, expect, test } from 'vitest';

import { UNIT_COOLDOWN_MS, UNIT_MELEE_RANGE, UNIT_RANGED_RANGE } from '../combat/index.js';
import { createTheme, parseHex } from '../design/index.js';
import { makeEnemy, makeUnit } from './combat-fixtures.js';
import { drawUnitTracers } from './draw-unit-tracers.js';
import { computeBattleLayout } from './layout.js';
import { createFakeBattleCtx } from './fake-ctx.js';
import type { CombatState } from '../combat/types.js';

const { palette } = createTheme();
const layout = computeBattleLayout(1024, 300);

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

const JUST_ATTACKED_COOLDOWN = UNIT_COOLDOWN_MS * 0.9;
const RELOADING_COOLDOWN = UNIT_COOLDOWN_MS * 0.1;

interface TracerSegment {
  readonly from: { readonly x: number; readonly y: number };
  readonly to: { readonly x: number; readonly y: number };
  readonly strokeStyle: string;
  readonly dash: readonly number[];
}

/**
 * `ctx.calls`를 순서대로 훑어 `moveTo → lineTo → stroke` 한 묶음씩 선분으로 복원한다.
 * 예광선(공격선, dash 없음)과 사거리 안내선(dash 있음)이 같은 함수 안에서 함께 그려질 수
 * 있으므로, 단순 lineTo 개수 세기 대신 dash 유무로 구분할 수 있는 이 방식을 쓴다.
 */
function tracerSegments(ctx: ReturnType<typeof createFakeBattleCtx>): readonly TracerSegment[] {
  const segments: TracerSegment[] = [];
  let lastMove: { x: number; y: number } | null = null;
  let lastLine: { x: number; y: number } | null = null;
  let lastDash: readonly number[] = [];

  for (const call of ctx.calls) {
    if (call.kind === 'setLineDash') {
      lastDash = call.segments;
    } else if (call.kind === 'moveTo') {
      lastMove = { x: call.x, y: call.y };
      lastLine = null;
    } else if (call.kind === 'lineTo') {
      lastLine = { x: call.x, y: call.y };
    } else if (call.kind === 'stroke') {
      if (lastMove !== null && lastLine !== null) {
        segments.push({ from: lastMove, to: lastLine, strokeStyle: call.strokeStyle, dash: lastDash });
      }
      lastMove = null;
      lastLine = null;
    }
  }

  return segments;
}

/** 실선(dash 없음) 공격선만 — 사거리 안내선(점선)은 제외한다. */
function attackTracers(ctx: ReturnType<typeof createFakeBattleCtx>): readonly TracerSegment[] {
  return tracerSegments(ctx).filter((s) => s.dash.length === 0);
}

/** 점선 사거리 안내선만. */
function rangeHints(ctx: ReturnType<typeof createFakeBattleCtx>): readonly TracerSegment[] {
  return tracerSegments(ctx).filter((s) => s.dash.length > 0);
}

function segmentLength(segment: TracerSegment): number {
  return Math.hypot(segment.to.x - segment.from.x, segment.to.y - segment.from.y);
}

function longestAttackTracerLength(ctx: ReturnType<typeof createFakeBattleCtx>): number {
  return attackTracers(ctx).reduce((max, s) => Math.max(max, segmentLength(s)), 0);
}

describe('drawUnitTracers — 유닛 공격 예광선', () => {
  test('방금 공격한(cooldownMs가 높은) 원거리 유닛은 사거리 내 적에게 공격선을 그린다', () => {
    const ctx = createFakeBattleCtx();
    const state = combatState({
      units: [
        makeUnit({
          kind: 'analyst',
          x: 0.3,
          range: UNIT_RANGED_RANGE,
          attackCooldownMs: UNIT_COOLDOWN_MS,
          cooldownMs: JUST_ATTACKED_COOLDOWN,
        }),
      ],
      enemies: [makeEnemy({ lane: 'ground', x: 0.3 + UNIT_RANGED_RANGE - 0.02 })],
    });

    drawUnitTracers(ctx, palette, layout, state);

    expect(attackTracers(ctx).length).toBeGreaterThan(0);
  });

  test('재장전 중(쿨다운이 낮은) 유닛은 공격선을 그리지 않는다', () => {
    const ctx = createFakeBattleCtx();
    const state = combatState({
      units: [
        makeUnit({
          kind: 'analyst',
          x: 0.3,
          range: UNIT_RANGED_RANGE,
          attackCooldownMs: UNIT_COOLDOWN_MS,
          cooldownMs: RELOADING_COOLDOWN,
        }),
      ],
      enemies: [makeEnemy({ lane: 'ground', x: 0.3 + UNIT_RANGED_RANGE - 0.02 })],
    });

    drawUnitTracers(ctx, palette, layout, state);

    expect(attackTracers(ctx).length).toBe(0);
  });

  test('사거리 밖의 적만 있으면 방금 공격했어도 공격선을 그리지 않는다', () => {
    const ctx = createFakeBattleCtx();
    const state = combatState({
      units: [
        makeUnit({
          kind: 'intern',
          x: 0.3,
          range: UNIT_MELEE_RANGE,
          attackCooldownMs: UNIT_COOLDOWN_MS,
          cooldownMs: JUST_ATTACKED_COOLDOWN,
        }),
      ],
      enemies: [makeEnemy({ lane: 'ground', x: 0.9 })],
    });

    drawUnitTracers(ctx, palette, layout, state);

    expect(attackTracers(ctx).length).toBe(0);
  });

  test('원거리 유닛(analyst)의 공격선이 근접 유닛(intern)보다 길다', () => {
    const meleeCtx = createFakeBattleCtx();
    const meleeState = combatState({
      units: [
        makeUnit({
          kind: 'intern',
          x: 0.3,
          range: UNIT_MELEE_RANGE,
          attackCooldownMs: UNIT_COOLDOWN_MS,
          cooldownMs: JUST_ATTACKED_COOLDOWN,
        }),
      ],
      enemies: [makeEnemy({ lane: 'ground', x: 0.3 + UNIT_MELEE_RANGE - 0.005 })],
    });
    drawUnitTracers(meleeCtx, palette, layout, meleeState);

    const rangedCtx = createFakeBattleCtx();
    const rangedState = combatState({
      units: [
        makeUnit({
          kind: 'analyst',
          x: 0.3,
          range: UNIT_RANGED_RANGE,
          attackCooldownMs: UNIT_COOLDOWN_MS,
          cooldownMs: JUST_ATTACKED_COOLDOWN,
        }),
      ],
      enemies: [makeEnemy({ lane: 'ground', x: 0.3 + UNIT_RANGED_RANGE - 0.005 })],
    });
    drawUnitTracers(rangedCtx, palette, layout, rangedState);

    expect(longestAttackTracerLength(rangedCtx)).toBeGreaterThan(longestAttackTracerLength(meleeCtx));
  });

  test('아군 공격선은 타워(GOLD)와 다른 색(UP_DEEP 계열 rgba)을 쓴다', () => {
    const ctx = createFakeBattleCtx();
    const state = combatState({
      units: [
        makeUnit({
          kind: 'analyst',
          x: 0.3,
          range: UNIT_RANGED_RANGE,
          attackCooldownMs: UNIT_COOLDOWN_MS,
          cooldownMs: JUST_ATTACKED_COOLDOWN,
        }),
      ],
      enemies: [makeEnemy({ lane: 'ground', x: 0.3 + UNIT_RANGED_RANGE - 0.02 })],
    });

    drawUnitTracers(ctx, palette, layout, state);

    const { r, g, b } = parseHex(palette.UP_DEEP);
    const prefix = `rgba(${r}, ${g}, ${b},`;
    const usesAllyColor = attackTracers(ctx).some((s) => s.strokeStyle.startsWith(prefix));
    expect(usesAllyColor).toBe(true);
  });
});

describe('drawUnitTracers — 적 공격 예광선(유닛과 같은 규칙)', () => {
  test('방금 공격한 적은 사거리 내 유닛에게 공격선을 그린다', () => {
    const ctx = createFakeBattleCtx();
    const state = combatState({
      enemies: [
        makeEnemy({
          lane: 'ground',
          x: 0.5,
          range: UNIT_MELEE_RANGE,
          attackCooldownMs: UNIT_COOLDOWN_MS,
          cooldownMs: JUST_ATTACKED_COOLDOWN,
        }),
      ],
      units: [makeUnit({ kind: 'intern', x: 0.5 - UNIT_MELEE_RANGE + 0.005 })],
    });

    drawUnitTracers(ctx, palette, layout, state);

    expect(attackTracers(ctx).length).toBeGreaterThan(0);
  });

  test('재장전 중인 적은 유닛이 사거리 내에 있어도 공격선을 그리지 않는다', () => {
    const ctx = createFakeBattleCtx();
    const state = combatState({
      enemies: [
        makeEnemy({
          lane: 'ground',
          x: 0.5,
          range: UNIT_MELEE_RANGE,
          attackCooldownMs: UNIT_COOLDOWN_MS,
          cooldownMs: RELOADING_COOLDOWN,
        }),
      ],
      units: [makeUnit({ kind: 'intern', x: 0.5 - UNIT_MELEE_RANGE + 0.005 })],
    });

    drawUnitTracers(ctx, palette, layout, state);

    expect(attackTracers(ctx).length).toBe(0);
  });

  test('사거리 안에 유닛이 없으면 방금 공격한 적이라도 공격선을 그리지 않는다', () => {
    const ctx = createFakeBattleCtx();
    const state = combatState({
      enemies: [
        makeEnemy({
          lane: 'ground',
          x: 0.5,
          range: UNIT_MELEE_RANGE,
          attackCooldownMs: UNIT_COOLDOWN_MS,
          cooldownMs: JUST_ATTACKED_COOLDOWN,
        }),
      ],
      units: [makeUnit({ kind: 'intern', x: 0.1 })],
    });

    drawUnitTracers(ctx, palette, layout, state);

    expect(attackTracers(ctx).length).toBe(0);
  });

  test('공중 적은 유닛과 절대 교전하지 않으므로 공격선을 그리지 않는다', () => {
    const ctx = createFakeBattleCtx();
    const state = combatState({
      enemies: [
        makeEnemy({
          lane: 'air',
          x: 0.5,
          range: UNIT_RANGED_RANGE,
          attackCooldownMs: UNIT_COOLDOWN_MS,
          cooldownMs: JUST_ATTACKED_COOLDOWN,
        }),
      ],
      units: [makeUnit({ kind: 'intern', x: 0.5 })],
    });

    drawUnitTracers(ctx, palette, layout, state);

    expect(attackTracers(ctx).length).toBe(0);
  });

  test('적 공격선은 아군 공격선과 다른 색(ENEMY_DEEP 계열 rgba)을 쓴다', () => {
    const ctx = createFakeBattleCtx();
    const state = combatState({
      enemies: [
        makeEnemy({
          lane: 'ground',
          x: 0.5,
          range: UNIT_MELEE_RANGE,
          attackCooldownMs: UNIT_COOLDOWN_MS,
          cooldownMs: JUST_ATTACKED_COOLDOWN,
        }),
      ],
      units: [makeUnit({ kind: 'intern', x: 0.5 - UNIT_MELEE_RANGE + 0.005 })],
    });

    drawUnitTracers(ctx, palette, layout, state);

    const { r, g, b } = parseHex(palette.ENEMY_DEEP);
    const prefix = `rgba(${r}, ${g}, ${b},`;
    const usesEnemyColor = attackTracers(ctx).some((s) => s.strokeStyle.startsWith(prefix));
    expect(usesEnemyColor).toBe(true);
  });
});

describe('drawUnitTracers — 원거리 유닛 사거리 안내선(절제된 표시)', () => {
  test('analyst(원거리) 유닛은 공격 중이 아니어도 옅은 사거리 안내선을 갖는다', () => {
    const ctx = createFakeBattleCtx();
    const state = combatState({
      units: [makeUnit({ kind: 'analyst', x: 0.3, range: UNIT_RANGED_RANGE, cooldownMs: 0 })],
    });

    drawUnitTracers(ctx, palette, layout, state);

    const { r, g, b } = parseHex(palette.UP_DEEP);
    const prefix = `rgba(${r}, ${g}, ${b},`;
    const hasFaintHint = rangeHints(ctx).some((s) => s.strokeStyle.startsWith(prefix));
    expect(hasFaintHint).toBe(true);
  });

  test('intern(근접) 유닛에는 사거리 안내선이 그려지지 않는다', () => {
    const ctx = createFakeBattleCtx();
    const state = combatState({
      units: [makeUnit({ kind: 'intern', x: 0.3, range: UNIT_MELEE_RANGE, cooldownMs: 0 })],
    });

    drawUnitTracers(ctx, palette, layout, state);

    expect(rangeHints(ctx).length).toBe(0);
  });
});

describe('drawUnitTracers — 엣지 케이스', () => {
  test('유닛·적이 0명이어도 크래시하지 않는다', () => {
    const ctx = createFakeBattleCtx();
    expect(() => drawUnitTracers(ctx, palette, layout, combatState())).not.toThrow();
  });

  test('hp가 0인 개체는 공격선의 대상이 되지 않는다', () => {
    const ctx = createFakeBattleCtx();
    const state = combatState({
      units: [
        makeUnit({
          kind: 'intern',
          x: 0.3,
          range: UNIT_RANGED_RANGE,
          attackCooldownMs: UNIT_COOLDOWN_MS,
          cooldownMs: JUST_ATTACKED_COOLDOWN,
        }),
      ],
      enemies: [makeEnemy({ lane: 'ground', x: 0.3 + UNIT_RANGED_RANGE - 0.02, hp: 0 })],
    });

    drawUnitTracers(ctx, palette, layout, state);

    expect(attackTracers(ctx).length).toBe(0);
  });
});
