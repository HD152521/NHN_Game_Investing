import { describe, expect, test } from 'vitest';

import { buildTower, castSkill, skipPrep, summonUnit, upgradeTower } from './actions';
import {
  AUM_DROP_PER_WAVE,
  BASE_DAMAGE_PER_LEAK,
  BASE_HP,
  BASE_INCOME_PER_WAVE,
  SKILL_HEAL,
  SKILL_SHIELD_DURATION_MS,
  SKILL_SPECS,
  TOWER_BUILD_COST,
  TOWER_SLOTS,
  TOWER_UPGRADE_COST,
  UNIT_COST,
  UNIT_HP,
  WAVE_COUNT,
  WAVE_DURATION_MS,
} from './constants';
import { createCombat, step } from './simulate';
import { skillCooldownOf } from './skills';
import type { CombatParams, CombatState, Enemy, SkillId } from './types';

/** 모든 스킬을 즉시 시전할 수 있는 넉넉한 잔액. */
const RICH_GOLD = 10_000;
const RICH_AUM = 10_000;

const SKILL_ID_LIST: readonly SkillId[] = ['S-01', 'S-02', 'S-03'];

/** 본진(x=0)에 이미 닿은 적 1체만 세운 상태. 누출 피해 판정을 한 스텝에 확정시킨다. */
function withEnemyAtBase(state: CombatState): CombatState {
  const leaker: Enemy = {
    id: 9001,
    lane: 'ground',
    x: 0,
    hp: 10,
    maxHp: 10,
    speed: 0,
    damage: 0,
    range: 0.05,
    attackCooldownMs: 1000,
    cooldownMs: 0,
  };
  return { ...state, enemies: [leaker] };
}

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

describe('castSkill — 재화 축', () => {
  test('골드 스킬(S-01·S-02)은 골드만 깎고 AUM은 건드리지 않는다', () => {
    const params = fixtureParams();
    const state = createCombat(params);

    for (const id of ['S-01', 'S-02'] as const) {
      const result = castSkill(state, id, RICH_GOLD, RICH_AUM);

      expect(result.ok).toBe(true);
      expect(result.gold).toBe(RICH_GOLD - SKILL_SPECS[id].cost);
      expect(result.aum).toBe(RICH_AUM);
    }
  });

  test('S-03만 AUM을 깎는다 — 골드는 그대로다', () => {
    const params = fixtureParams();
    const state = createCombat(params);

    const result = castSkill(state, 'S-03', RICH_GOLD, RICH_AUM);

    expect(SKILL_SPECS['S-03'].currency).toBe('aum');
    expect(result.ok).toBe(true);
    expect(result.gold).toBe(RICH_GOLD);
    expect(result.aum).toBe(RICH_AUM - SKILL_SPECS['S-03'].cost);
  });

  test('S-03은 골드가 아무리 많아도 AUM이 모자라면 거부된다', () => {
    const params = fixtureParams();
    const state = createCombat(params);

    const result = castSkill(state, 'S-03', RICH_GOLD, SKILL_SPECS['S-03'].cost - 1);

    expect(result.ok).toBe(false);
    expect(result.state).toEqual(state);
    expect(result.gold).toBe(RICH_GOLD);
  });

  for (const id of SKILL_ID_LIST) {
    test(`${id} — 재화가 1 모자라면 시전이 거부되고 상태·잔액이 그대로다`, () => {
      const params = fixtureParams();
      const state = createCombat(params);
      const spec = SKILL_SPECS[id];
      const gold = spec.currency === 'gold' ? spec.cost - 1 : RICH_GOLD;
      const aum = spec.currency === 'aum' ? spec.cost - 1 : RICH_AUM;

      const result = castSkill(state, id, gold, aum);

      expect(result.ok).toBe(false);
      expect(result.state).toEqual(state);
      expect(result.gold).toBe(gold);
      expect(result.aum).toBe(aum);
    });

    test(`${id} — 쿨다운 중에는 재사용할 수 없다`, () => {
      const params = fixtureParams();
      const first = castSkill(createCombat(params), id, RICH_GOLD, RICH_AUM);
      expect(first.ok).toBe(true);
      expect(skillCooldownOf(first.state, id)).toBe(SKILL_SPECS[id].cooldownMs);

      const second = castSkill(first.state, id, RICH_GOLD, RICH_AUM);

      expect(second.ok).toBe(false);
      expect(second.state).toEqual(first.state);
    });
  }

  test('쿨다운은 스킬마다 따로 돈다 — 하나를 써도 나머지 둘은 잠기지 않는다', () => {
    const params = fixtureParams();
    const first = castSkill(createCombat(params), 'S-01', RICH_GOLD, RICH_AUM);

    expect(skillCooldownOf(first.state, 'S-02')).toBe(0);
    expect(castSkill(first.state, 'S-02', RICH_GOLD, RICH_AUM).ok).toBe(true);
    expect(castSkill(first.state, 'S-03', RICH_GOLD, RICH_AUM).ok).toBe(true);
  });

  test('S-01 쿨다운은 렌더러 별칭 필드(skillCooldownMs)에도 그대로 실린다', () => {
    const params = fixtureParams();
    const bomb = castSkill(createCombat(params), 'S-01', RICH_GOLD, RICH_AUM);
    expect(bomb.state.skillCooldownMs).toBe(SKILL_SPECS['S-01'].cooldownMs);

    // S-03을 써도 별칭은 S-01의 것이므로 움직이지 않는다.
    const shield = castSkill(createCombat(params), 'S-03', RICH_GOLD, RICH_AUM);
    expect(shield.state.skillCooldownMs).toBe(0);
  });
});

describe('castSkill — S-01 공시 폭탄', () => {
  test('화면의 모든 지상 적에게 즉시 피해를 준다', () => {
    const params = fixtureParams();
    // 준비 구간(5초)에는 적이 스폰되지 않으므로 Space로 건너뛴 뒤 첫 웨이브를 살짝 진행시킨다.
    let state = skipPrep(createCombat(params));
    for (let i = 0; i < 5; i += 1) {
      const { state: stepped } = stepOnce(state, params);
      state = stepped;
    }

    const before = state.enemies.filter((e) => e.lane === 'ground');
    expect(before.length).toBeGreaterThan(0);

    const result = castSkill(state, 'S-01', RICH_GOLD, RICH_AUM);

    expect(result.ok).toBe(true);
    const groundAfter = result.state.enemies.filter((e) => e.lane === 'ground');
    for (let i = 0; i < groundAfter.length; i += 1) {
      expect(groundAfter[i]?.hp).toBeLessThan(before[i]?.hp ?? Number.POSITIVE_INFINITY);
    }
  });
});

describe('castSkill — S-02 배당 살포', () => {
  test('다친 유닛을 회복시킨다', () => {
    const params = fixtureParams();
    const summoned = summonUnit(createCombat(params), 'trader', RICH_GOLD);
    // trader(260 HP)를 절반으로 깎아 둔다 — 회복량(80)이 최대치에 닿지 않는 구간이다.
    const hurt: CombatState = {
      ...summoned.state,
      units: summoned.state.units.map((unit) => ({ ...unit, hp: 100 })),
    };

    const result = castSkill(hurt, 'S-02', RICH_GOLD, RICH_AUM);

    expect(result.ok).toBe(true);
    expect(result.state.units[0]?.hp).toBe(100 + SKILL_HEAL);
  });

  test('회복은 최대 HP를 넘지 않는다 (초과분은 버려진다)', () => {
    const params = fixtureParams();
    // intern(60 HP)은 회복량(80)보다 최대 HP가 작아, 넘침을 자르지 않으면 140이 된다.
    const summoned = summonUnit(createCombat(params), 'intern', RICH_GOLD);
    const hurt: CombatState = {
      ...summoned.state,
      units: summoned.state.units.map((unit) => ({ ...unit, hp: 1 })),
    };

    const result = castSkill(hurt, 'S-02', RICH_GOLD, RICH_AUM);

    expect(SKILL_HEAL).toBeGreaterThan(UNIT_HP.intern);
    expect(result.state.units[0]?.hp).toBe(UNIT_HP.intern);
  });

  test('멀쩡한 유닛의 HP는 그대로다 (최대치를 넘겨 올리지 않는다)', () => {
    const params = fixtureParams();
    const summoned = summonUnit(createCombat(params), 'analyst', RICH_GOLD);

    const result = castSkill(summoned.state, 'S-02', RICH_GOLD, RICH_AUM);

    expect(result.state.units[0]?.hp).toBe(UNIT_HP.analyst);
  });
});

describe('castSkill — S-03 서킷브레이커 실드', () => {
  test('시전하면 지속시간이 채워진다', () => {
    const params = fixtureParams();
    const result = castSkill(createCombat(params), 'S-03', RICH_GOLD, RICH_AUM);

    expect(result.state.shieldRemainingMs).toBe(SKILL_SHIELD_DURATION_MS);
  });

  test('실드가 서 있는 동안 본진이 피해를 받지 않는다', () => {
    const params = fixtureParams();
    const cast = castSkill(skipPrep(createCombat(params)), 'S-03', RICH_GOLD, RICH_AUM);
    const { state, events } = step(withEnemyAtBase(cast.state), 250, params);

    expect(state.baseHp).toBe(params.maxBaseHp);
    expect(events.baseDamage).toBe(0);
    // 본진에 닿은 적은 사라진다 — 막은 것은 피해뿐이지 적의 도달 자체가 아니다.
    // (같은 스텝에 웨이브 1의 새 적이 스폰되므로 배열 길이가 아니라 그 개체로 확인한다.)
    expect(state.enemies.some((enemy) => enemy.id === 9001)).toBe(false);
  });

  test('실드 없이 같은 상황이면 본진이 깎인다 (대조군)', () => {
    const params = fixtureParams();
    const base = skipPrep(createCombat(params));
    const { state, events } = step(withEnemyAtBase(base), 250, params);

    expect(events.baseDamage).toBe(BASE_DAMAGE_PER_LEAK);
    expect(state.baseHp).toBe(params.maxBaseHp - BASE_DAMAGE_PER_LEAK);
  });

  test('지속시간이 지나면 만료되어 다시 피해를 받는다', () => {
    const params = fixtureParams();
    const cast = castSkill(createCombat(params), 'S-03', RICH_GOLD, RICH_AUM);

    const expired = step(cast.state, SKILL_SHIELD_DURATION_MS, params).state;
    expect(expired.shieldRemainingMs).toBe(0);

    const { state, events } = step(withEnemyAtBase(expired), 250, params);
    expect(events.baseDamage).toBe(BASE_DAMAGE_PER_LEAK);
    expect(state.baseHp).toBeLessThan(params.maxBaseHp);
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
