import { describe, expect, test } from 'vitest';

import {
  AUM_DROP_PER_WAVE,
  BASE_HP,
  BASE_INCOME_PER_WAVE,
  TOWER_SLOTS,
  WAVE_COUNT,
  WAVE_DURATION_MS,
  castSkill,
  createCombat,
  createSkillCooldowns,
  isShieldActive,
} from '../combat';
import type { CombatState, Enemy, Unit } from '../combat';
import { drawSkillFx } from './draw-skill-fx';
import type { FxCtx } from './draw-skill-fx';
import { createSkillFxField, triggerSkillEffect } from './skill-effects';
import { SKILL_FX_SCOPE, isMapWideScope, mapWideRadius } from './skill-scope';
import type { SkillFxViewport } from './skill-scope';
import { SKILL_EFFECT_IDS } from './types';

const VIEWPORT: SkillFxViewport = { width: 1024, height: 360, groundY: 294, baseX: 184 };

/** 스킬을 즉시 쓸 수 있는 전투 상태. 범위 검증에만 쓰므로 밸런스 값은 기본값 그대로다. */
function readyState(overrides: Partial<CombatState>): CombatState {
  const base = createCombat({
    waveCount: WAVE_COUNT,
    waveDurationMs: WAVE_DURATION_MS,
    towerSlots: TOWER_SLOTS,
    maxBaseHp: BASE_HP,
    heat: 1,
    aumDropPerWave: AUM_DROP_PER_WAVE,
    totalBaseIncome: BASE_INCOME_PER_WAVE * WAVE_COUNT,
  });
  return { ...base, skillCooldowns: createSkillCooldowns(), ...overrides };
}

function groundEnemy(id: number, x: number): Enemy {
  return {
    id,
    lane: 'ground',
    x,
    hp: 200,
    maxHp: 200,
    speed: 0.04,
    damage: 9,
    range: 0.05,
    attackCooldownMs: 1000,
    cooldownMs: 0,
  };
}

function hurtIntern(id: number, x: number): Unit {
  return {
    id,
    kind: 'intern',
    x,
    hp: 10,
    maxHp: 60,
    speed: 0.05,
    damage: 7,
    range: 0.05,
    attackCooldownMs: 700,
    cooldownMs: 0,
  };
}

/** 그려진 좌표를 전부 모으는 가짜 ctx — "연출이 어디까지 닿았는가"만 본다. */
interface Trace {
  readonly ctx: FxCtx;
  readonly xs: number[];
  readonly ys: number[];
}

function createTrace(): Trace {
  const xs: number[] = [];
  const ys: number[] = [];
  const mark = (x: number, y: number): void => {
    xs.push(x);
    ys.push(y);
  };

  const ctx = {
    save: () => undefined,
    restore: () => undefined,
    beginPath: () => undefined,
    closePath: () => undefined,
    moveTo: mark,
    lineTo: mark,
    arc: (x: number, y: number, radius: number) => {
      mark(x - radius, y);
      mark(x + radius, y);
    },
    stroke: () => undefined,
    fill: () => undefined,
    fillRect: (x: number, y: number, w: number, h: number) => {
      mark(x, y);
      mark(x + w, y + h);
    },
    globalAlpha: 1,
    globalCompositeOperation: 'source-over' as GlobalCompositeOperation,
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
  };

  return { ctx: ctx as unknown as FxCtx, xs, ys };
}

const PALETTE = {
  BG_0: 'a',
  BG_1: 'b',
  BG_2: 'c',
  LINE: 'd',
  UP_ALLY: 'e',
  UP_DEEP: 'f',
  ENEMY_DOWN: 'g',
  ENEMY_DEEP: 'h',
  GOLD: 'i',
  AUM: 'j',
  TEXT: 'k',
  MUTED: 'l',
} as never;

/** 이펙트 하나를 완전히 펼친(진행도 1) 상태로 그리고 닿은 좌표를 돌려준다. */
function traceAtFullReach(id: (typeof SKILL_EFFECT_IDS)[number]): Trace {
  const field = createSkillFxField();
  // 진원을 화면 오른쪽 끝 가까이 두어 "먼 쪽 끝까지 닿는가"를 가장 불리한 조건에서 본다.
  triggerSkillEffect(field, id, VIEWPORT.width * 0.9, VIEWPORT.groundY, 0);
  const trace = createTrace();
  // reducedMotion=true 는 범위가 다 펼쳐진 상태로 얼린다.
  drawSkillFx(trace.ctx, PALETTE, field, VIEWPORT, 1, true);
  return trace;
}

describe('스킬 이펙트 범위 — 연출이 castSkill 의 실제 효과 범위와 일치한다', () => {
  test('범위표가 스킬 3종을 빠짐없이 덮는다', () => {
    for (const id of SKILL_EFFECT_IDS) {
      expect(SKILL_FX_SCOPE[id]).toBeDefined();
    }
  });

  test('castSkill 은 지상 적 전원을 때린다 — 위치와 무관하므로 S-01 은 맵 전체다', () => {
    const state = readyState({
      enemies: [
        groundEnemy(1, 0.05),
        groundEnemy(2, 0.95),
        { ...groundEnemy(3, 0.5), lane: 'air' },
      ],
    });

    const result = castSkill(state, 'S-01', 9999, 9999);
    expect(result.ok).toBe(true);

    const [near, far, air] = result.state.enemies;
    // 라인 양 끝의 적이 **같은 양**을 맞는다 = 거리 감쇠 없음 = 맵 전체.
    expect(near!.hp).toBe(far!.hp);
    expect(near!.hp).toBeLessThan(200);
    // 공중은 안 맞는다 — 연출이 화면 전체를 덮으면 안 되는 근거다.
    expect(air!.hp).toBe(200);

    expect(SKILL_FX_SCOPE['S-01']).toBe('map-ground');
  });

  test('castSkill 은 아군 유닛 전원을 회복시킨다 — S-02 도 맵 전체다', () => {
    const state = readyState({ units: [hurtIntern(1, 0), hurtIntern(2, 0.9)] });

    const result = castSkill(state, 'S-02', 9999, 9999);
    expect(result.ok).toBe(true);
    expect(result.state.units[0]!.hp).toBe(result.state.units[1]!.hp);
    expect(result.state.units[0]!.hp).toBeGreaterThan(10);

    expect(SKILL_FX_SCOPE['S-02']).toBe('map-allies');
  });

  test('castSkill 의 S-03 은 본진 실드다 — 지점 효과이므로 연출도 지점 고정이다', () => {
    const result = castSkill(readyState({}), 'S-03', 0, 9999);
    expect(result.ok).toBe(true);
    expect(isShieldActive(result.state)).toBe(true);

    expect(SKILL_FX_SCOPE['S-03']).toBe('base-front');
    expect(isMapWideScope('S-03')).toBe(false);
  });

  test('mapWideRadius 는 진원이 치우쳐 있어도 먼 쪽 끝까지 덮는다', () => {
    expect(mapWideRadius(0, 1024)).toBe(1024);
    expect(mapWideRadius(1024, 1024)).toBe(1024);
    expect(mapWideRadius(512, 1024)).toBe(512);
  });

  test('S-01 연출은 화면 좌우 끝까지 닿는다', () => {
    const { xs } = traceAtFullReach('S-01');
    expect(Math.min(...xs)).toBeLessThanOrEqual(0);
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(VIEWPORT.width);
  });

  test('S-01 연출은 공중 레인을 침범하지 않는다 (공중 적은 안 맞는다)', () => {
    const { ys } = traceAtFullReach('S-01');
    // 공중 레인 중심은 groundY 보다 한참 위(약 0.32 비율)다. 지상 띠가 그 위로 올라가면
    // "공중도 맞았다"로 읽힌다.
    const airY = 28 + (VIEWPORT.height - 28) * 0.32;
    expect(Math.min(...ys)).toBeGreaterThan(airY);
  });

  test('S-02 연출도 화면 좌우 끝까지 닿는다 (유닛은 어디에 있어도 회복된다)', () => {
    const { xs } = traceAtFullReach('S-02');
    expect(Math.min(...xs)).toBeLessThanOrEqual(0);
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(VIEWPORT.width);
  });

  test('S-03 연출은 사옥 앞(baseX)에 머문다 — 맵 전체로 번지지 않는다', () => {
    const { xs } = traceAtFullReach('S-03');
    // 진원을 화면 오른쪽 끝에 찍었는데도 돔은 baseX 주변에만 그려진다.
    expect(Math.max(...xs)).toBeLessThan(VIEWPORT.width * 0.5);
    expect(Math.max(...xs)).toBeGreaterThan(VIEWPORT.baseX);
    expect(Math.min(...xs)).toBeLessThan(VIEWPORT.baseX);
  });

  test('빈 필드는 아무 것도 그리지 않는다', () => {
    const trace = createTrace();
    drawSkillFx(trace.ctx, PALETTE, createSkillFxField(), VIEWPORT, 0);
    expect(trace.xs).toHaveLength(0);
  });
});
