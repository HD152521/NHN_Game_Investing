import { describe, expect, test } from 'vitest';

import { buildTower, castSkill, skipPrep, summonUnit, upgradeTower } from './actions';
import {
  AUM_DROP_PER_WAVE,
  BASE_HP,
  BASE_INCOME_PER_WAVE,
  SKILL_COST,
  TOWER_BUILD_COST,
  TOWER_SLOTS,
  TOWER_UPGRADE_COST,
  UNIT_COST,
  WAVE_COUNT,
  WAVE_DURATION_MS,
} from './constants';
import { createCombat, step } from './simulate';
import type { CombatParams } from './types';

function fixtureParams(overrides?: Partial<CombatParams>): CombatParams {
  return {
    waveCount: WAVE_COUNT,
    waveDurationMs: WAVE_DURATION_MS,
    towerSlots: TOWER_SLOTS,
    maxBaseHp: BASE_HP,
    heat: 1,
    aumDropPerWave: AUM_DROP_PER_WAVE,
    totalBaseIncome: BASE_INCOME_PER_WAVE * WAVE_COUNT,
    ...overrides,
  };
}

describe('buildTower', () => {
  test('골드가 충분하면 지정 슬롯에 레벨1 타워를 짓고 골드를 차감한다', () => {
    const params = fixtureParams();
    const state = createCombat(params);

    const result = buildTower(state, 0, 'basic', 500, params);

    expect(result.ok).toBe(true);
    expect(result.gold).toBe(500 - TOWER_BUILD_COST.basic);
    expect(result.state.towers).toHaveLength(1);
    expect(result.state.towers[0]).toEqual({ slot: 0, kind: 'basic', level: 1, cooldownMs: 0 });
  });

  test('골드가 부족하면 실패하고 상태·골드가 변하지 않는다', () => {
    const params = fixtureParams();
    const state = createCombat(params);

    const result = buildTower(state, 0, 'basic', TOWER_BUILD_COST.basic - 1, params);

    expect(result.ok).toBe(false);
    expect(result.gold).toBe(TOWER_BUILD_COST.basic - 1);
    expect(result.state).toEqual(state);
  });

  test('이미 타워가 있는 슬롯에는 건설할 수 없다', () => {
    const params = fixtureParams();
    const state = createCombat(params);

    const first = buildTower(state, 0, 'basic', 1000, params);
    expect(first.ok).toBe(true);

    const second = buildTower(first.state, 0, 'splash', 1000, params);

    expect(second.ok).toBe(false);
    expect(second.state).toEqual(first.state);
    expect(second.gold).toBe(1000);
  });

  test('타워 슬롯 범위를 벗어나면 실패한다', () => {
    const params = fixtureParams({ towerSlots: 6 });
    const state = createCombat(params);

    const result = buildTower(state, 6, 'basic', 1000, params);

    expect(result.ok).toBe(false);
    expect(result.state).toEqual(state);
  });
});

describe('upgradeTower', () => {
  test('레벨1 타워를 레벨2로 업그레이드하고 골드를 차감한다', () => {
    const params = fixtureParams();
    const built = buildTower(createCombat(params), 0, 'antiair', 1000, params);

    const result = upgradeTower(built.state, 0, built.gold);

    expect(result.ok).toBe(true);
    expect(result.gold).toBe(built.gold - TOWER_UPGRADE_COST.antiair);
    expect(result.state.towers[0]?.level).toBe(2);
  });

  test('타워가 없는 슬롯은 업그레이드할 수 없다', () => {
    const params = fixtureParams();
    const state = createCombat(params);

    const result = upgradeTower(state, 0, 1000);

    expect(result.ok).toBe(false);
    expect(result.state).toEqual(state);
  });

  test('이미 레벨2인 타워는 다시 업그레이드할 수 없다', () => {
    const params = fixtureParams();
    const built = buildTower(createCombat(params), 0, 'basic', 1000, params);
    const upgraded = upgradeTower(built.state, 0, built.gold);
    expect(upgraded.ok).toBe(true);

    const second = upgradeTower(upgraded.state, 0, upgraded.gold);

    expect(second.ok).toBe(false);
    expect(second.state).toEqual(upgraded.state);
  });

  test('골드가 부족하면 실패한다', () => {
    const params = fixtureParams();
    const built = buildTower(createCombat(params), 0, 'basic', 1000, params);

    const result = upgradeTower(built.state, 0, TOWER_UPGRADE_COST.basic - 1);

    expect(result.ok).toBe(false);
    expect(result.state).toEqual(built.state);
  });
});

describe('summonUnit', () => {
  test('골드가 충분하면 유닛을 소환하고 골드를 차감한다', () => {
    const params = fixtureParams();
    const state = createCombat(params);

    const result = summonUnit(state, 'trader', 200);

    expect(result.ok).toBe(true);
    expect(result.gold).toBe(200 - UNIT_COST.trader);
    expect(result.state.units).toHaveLength(1);
    expect(result.state.units[0]?.x).toBe(0);
  });

  test('골드가 부족하면 실패하고 상태·골드가 변하지 않는다', () => {
    const params = fixtureParams();
    const state = createCombat(params);

    const result = summonUnit(state, 'trader', UNIT_COST.trader - 1);

    expect(result.ok).toBe(false);
    expect(result.state).toEqual(state);
    expect(result.gold).toBe(UNIT_COST.trader - 1);
  });

  test('연속 소환 시 유닛 id가 겹치지 않는다', () => {
    const params = fixtureParams();
    const first = summonUnit(createCombat(params), 'intern', 1000);
    const second = summonUnit(first.state, 'intern', first.gold);

    const ids = second.state.units.map((u) => u.id);
    expect(new Set(ids).size).toBe(2);
  });
});

describe('castSkill', () => {
  test('골드가 충분하고 쿨다운이 없으면 모든 지상 적에게 즉시 피해를 주고 쿨다운을 건다', () => {
    const params = fixtureParams();
    // 준비 구간(5초)에는 적이 스폰되지 않으므로 Space로 건너뛴 뒤 첫 웨이브를 살짝 진행시킨다.
    let state = skipPrep(createCombat(params));
    // 지상 적 1체를 준비하기 위해 첫 웨이브를 살짝 진행시킨다.
    for (let i = 0; i < 5; i += 1) {
      const { state: stepped } = stepOnce(state, params);
      state = stepped;
    }

    const before = state.enemies.filter((e) => e.lane === 'ground');
    expect(before.length).toBeGreaterThan(0);

    const result = castSkill(state, SKILL_COST);

    expect(result.ok).toBe(true);
    expect(result.gold).toBe(0);
    expect(result.state.skillCooldownMs).toBeGreaterThan(0);
    const groundAfter = result.state.enemies.filter((e) => e.lane === 'ground');
    for (let i = 0; i < groundAfter.length; i += 1) {
      expect(groundAfter[i]?.hp).toBeLessThan(before[i]?.hp ?? Number.POSITIVE_INFINITY);
    }
  });

  test('골드가 부족하면 실패한다', () => {
    const params = fixtureParams();
    const state = createCombat(params);

    const result = castSkill(state, SKILL_COST - 1);

    expect(result.ok).toBe(false);
    expect(result.state).toEqual(state);
  });

  test('쿨다운 중에는 재사용할 수 없다', () => {
    const params = fixtureParams();
    const state = createCombat(params);

    const first = castSkill(state, 1000);
    expect(first.ok).toBe(true);

    const second = castSkill(first.state, 1000);

    expect(second.ok).toBe(false);
    expect(second.state).toEqual(first.state);
    expect(second.gold).toBe(1000);
  });
});

describe('skipPrep — Space로 준비 시간 즉시 종료', () => {
  test('준비 중이면 남은 준비 시간이 0이 된다', () => {
    const params = fixtureParams();
    const state = createCombat(params);
    expect(state.prepRemainingMs).toBeGreaterThan(0);

    expect(skipPrep(state).prepRemainingMs).toBe(0);
  });

  test('건너뛰면 다음 프레임에 바로 웨이브 1이 시작된다 (5초를 기다리지 않는다)', () => {
    const params = fixtureParams();
    const { state, events } = step(skipPrep(createCombat(params)), 16, params);

    expect(events.waveStarted).toBe(1);
    expect(state.wave).toBe(1);
  });

  test('교전 중에 눌러도 상태가 바뀌지 않는다', () => {
    const params = fixtureParams();
    const battling = step(createCombat(params), 6_000, params).state;
    expect(battling.prepRemainingMs).toBe(0);

    expect(skipPrep(battling)).toEqual(battling);
  });

  test('골드를 소모하지 않는다 (상태만 반환한다)', () => {
    const params = fixtureParams();
    const skipped = skipPrep(createCombat(params));
    expect(skipped.baseHp).toBe(params.maxBaseHp);
  });
});

/** castSkill 테스트에서 지상 적을 준비하기 위한 헬퍼. simulate.ts의 step을 그대로 쓴다. */
function stepOnce(state: ReturnType<typeof createCombat>, params: CombatParams) {
  return step(state, 300, params);
}
