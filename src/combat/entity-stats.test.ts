/**
 * 개체 스탯 리팩터링 수용 기준 테스트.
 *
 * 기획자 요구사항("캐릭터 객체에 피/이동속도/공격력/사거리가 있어야 한다")과 부서 업그레이드
 * (FR-11, R&D 타워 피해 +8%/+16%, 인사팀 유닛 HP +10%/+20%)를 나중에 얹기 위한 전제 조건을
 * 검증한다 — 스탯이 `kind` 조회가 아니라 개체 필드에 실제로 실려 있고, 개체별로 독립적으로
 * 값을 바꿀 수 있어야 한다.
 */

import { describe, expect, test } from 'vitest';

import { summonUnit } from './actions';
import {
  AUM_DROP_PER_WAVE,
  BASE_HP,
  BASE_INCOME_PER_WAVE,
  ENEMY_ATTACK_COOLDOWN_MS,
  ENEMY_DAMAGE,
  TOWER_SLOTS,
  UNIT_COOLDOWN_MS,
  UNIT_DAMAGE,
  UNIT_HP,
  UNIT_MELEE_RANGE,
  UNIT_RANGE,
  UNIT_SPEED,
  WAVE_COUNT,
  WAVE_DURATION_MS,
} from './constants';
import { applyEngagement } from './mechanics';
import { createCombat, step } from './simulate';
import type { CombatParams, Enemy, Unit, UnitKind } from './types';

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

const ALL_UNIT_KINDS: readonly UnitKind[] = ['intern', 'analyst', 'trader'];

describe('summonUnit — 소환된 유닛에 상수 테이블 값이 스냅샷된다', () => {
  test.each(ALL_UNIT_KINDS)('%s 유닛은 hp/speed/damage/range/attackCooldownMs가 상수 테이블과 일치한다', (kind) => {
    const params = fixtureParams();
    const result = summonUnit(createCombat(params), kind, 1000);

    expect(result.ok).toBe(true);
    const unit = result.state.units[0];
    expect(unit).toBeDefined();
    expect(unit?.hp).toBe(UNIT_HP[kind]);
    expect(unit?.maxHp).toBe(UNIT_HP[kind]);
    expect(unit?.speed).toBe(UNIT_SPEED);
    expect(unit?.damage).toBe(UNIT_DAMAGE[kind]);
    expect(unit?.range).toBe(UNIT_RANGE[kind]);
    expect(unit?.attackCooldownMs).toBe(UNIT_COOLDOWN_MS);
  });
});

describe('스폰된 적 — 스탯 필드가 전부 채워져 있다', () => {
  test('전투를 충분히 진행하면 스폰된 적 전원이 damage/range/attackCooldownMs/speed를 0 이상으로 갖는다', () => {
    const params = fixtureParams();
    let state = createCombat(params);
    for (let i = 0; i < 20 && state.enemies.length === 0; i += 1) {
      state = step(state, 1000, params).state;
    }

    expect(state.enemies.length).toBeGreaterThan(0);
    for (const enemy of state.enemies) {
      expect(enemy.speed).toBeGreaterThan(0);
      expect(enemy.damage).toBeGreaterThan(0);
      expect(enemy.range).toBeGreaterThan(0);
      expect(enemy.attackCooldownMs).toBeGreaterThan(0);
      expect(enemy.cooldownMs).toBeGreaterThanOrEqual(0);
    }
  });
});

/** applyEngagement 테스트용 최소 픽스처. entity-stats 테스트는 개체 스탯 자체가 핵심이라
 * 다른 파일의 kind 기반 기본값 헬퍼 대신, 필요한 필드를 매번 명시적으로 채운다. */
function makeUnit(overrides: Partial<Unit> & Pick<Unit, 'id' | 'kind' | 'damage'>): Unit {
  return {
    x: 0,
    hp: 100,
    maxHp: 100,
    speed: UNIT_SPEED,
    range: UNIT_MELEE_RANGE,
    attackCooldownMs: UNIT_COOLDOWN_MS,
    cooldownMs: 0,
    ...overrides,
  };
}

function makeEnemy(overrides: Partial<Enemy> & Pick<Enemy, 'id' | 'lane'>): Enemy {
  return {
    x: 0.04,
    hp: 1_000_000,
    maxHp: 1_000_000,
    speed: 0,
    damage: ENEMY_DAMAGE,
    range: UNIT_MELEE_RANGE,
    attackCooldownMs: ENEMY_ATTACK_COOLDOWN_MS,
    cooldownMs: 0,
    ...overrides,
  };
}

describe('핵심 수용 기준 — 개체 스탯을 직접 바꾸면 그 개체만 다르게 동작한다', () => {
  test('damage를 2배로 올린 유닛 하나가 같은 종류의 다른 유닛보다 정확히 2배 피해를 준다', () => {
    const baseUnit = makeUnit({ id: 1, kind: 'intern', damage: UNIT_DAMAGE.intern });
    const buffedUnit = makeUnit({ id: 2, kind: 'intern', damage: UNIT_DAMAGE.intern * 2 });

    // 서로 다른 교전을 독립적으로 계산해, 짝짓기 알고리즘이 결과를 섞지 않게 한다.
    const baseResult = applyEngagement([makeEnemy({ id: 10, lane: 'ground' })], [baseUnit], 10);
    const buffedResult = applyEngagement([makeEnemy({ id: 11, lane: 'ground' })], [buffedUnit], 10);

    const baseDamageDealt = 1_000_000 - (baseResult.enemies[0]?.hp ?? 0);
    const buffedDamageDealt = 1_000_000 - (buffedResult.enemies[0]?.hp ?? 0);

    expect(baseDamageDealt).toBe(UNIT_DAMAGE.intern);
    expect(buffedDamageDealt).toBe(UNIT_DAMAGE.intern * 2);
    expect(buffedDamageDealt).toBe(baseDamageDealt * 2);
  });

  test('hp를 낮춘 유닛 하나만 먼저 죽고, 같은 종류의 다른 개체(기본 hp)는 영향받지 않는다', () => {
    // 각자 독립된 적과 1:1로 붙여 짝짓기 알고리즘이 결과를 섞지 않게 한다. 두 적 모두 매 사이클
    // (attackCooldownMs=ENEMY_ATTACK_COOLDOWN_MS) 준비 상태라 유닛 hp가 ENEMY_DAMAGE씩 깎인다.
    let fragileUnit: Unit = makeUnit({ id: 1, kind: 'intern', damage: UNIT_DAMAGE.intern, hp: 10, maxHp: 10 });
    let normalUnit: Unit = makeUnit({ id: 2, kind: 'intern', damage: UNIT_DAMAGE.intern, hp: UNIT_HP.intern, maxHp: UNIT_HP.intern });
    let enemyForFragile = makeEnemy({ id: 20, lane: 'ground' });
    let enemyForNormal = makeEnemy({ id: 21, lane: 'ground' });

    for (let i = 0; i < 2; i += 1) {
      const fragileResult = applyEngagement([enemyForFragile], [fragileUnit], ENEMY_ATTACK_COOLDOWN_MS);
      enemyForFragile = fragileResult.enemies[0] ?? enemyForFragile;
      fragileUnit = fragileResult.units[0] ?? fragileUnit;

      const normalResult = applyEngagement([enemyForNormal], [normalUnit], ENEMY_ATTACK_COOLDOWN_MS);
      enemyForNormal = normalResult.enemies[0] ?? enemyForNormal;
      normalUnit = normalResult.units[0] ?? normalUnit;
    }

    // hp=10인 유닛은 ENEMY_DAMAGE(9)를 두 번 맞아 죽음 판정선(hp<=0) 아래로 떨어진다.
    expect(fragileUnit.hp).toBeLessThanOrEqual(0);
    // hp를 개체별로 건드리지 않은 다른 intern은 기본 UNIT_HP.intern 기준으로 같은 피해를 맞아도
    // 아직 생존한다 — 같은 kind라도 개체 hp 필드가 독립적으로 취급됨을 보여준다.
    expect(normalUnit.hp).toBeGreaterThan(0);
    expect(normalUnit.hp).toBe(UNIT_HP.intern - ENEMY_DAMAGE * 2);
  });
});

describe('적 근접 공격 — 이산 모델이 기존 연속 DPS(9)와 실질적으로 같다', () => {
  test('20초 누적 피해가 damage/(attackCooldownMs/1000) × 20초와 오차 ±1회 공격분 이내로 같다', () => {
    let enemies: Enemy[] = [makeEnemy({ id: 1, lane: 'ground', x: 0.03 })];
    let units: Unit[] = [makeUnit({ id: 1, kind: 'trader', damage: UNIT_DAMAGE.trader, hp: 1_000_000, maxHp: 1_000_000 })];

    const stepMs = 250; // MAX_SUBSTEP_MS와 동일한 서브스텝 크기 — 실제 시뮬레이션과 같은 입자도.
    const totalMs = 20_000;
    const steps = totalMs / stepMs;

    for (let i = 0; i < steps; i += 1) {
      const result = applyEngagement(enemies, units, stepMs);
      enemies = [...result.enemies];
      units = [...result.units];
    }

    const totalUnitDamage = 1_000_000 - (units[0]?.hp ?? 0);
    const dps = ENEMY_DAMAGE / (ENEMY_ATTACK_COOLDOWN_MS / 1000);
    expect(dps).toBe(9); // 기존 ENEMY_MELEE_DPS와 동일한 체감 DPS

    const expectedTotalDamage = dps * (totalMs / 1000);
    // 이산 모델은 마지막 공격이 아직 재장전 중일 수 있어 최대 공격 1회분(±ENEMY_DAMAGE)까지
    // 차이날 수 있다 — 그 이상 벌어지면 damage/attackCooldownMs 선택이 잘못된 것이다.
    expect(totalUnitDamage).toBeGreaterThanOrEqual(expectedTotalDamage - ENEMY_DAMAGE);
    expect(totalUnitDamage).toBeLessThanOrEqual(expectedTotalDamage + ENEMY_DAMAGE);
  });
});
