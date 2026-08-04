import { describe, expect, test } from 'vitest';

/**
 * 적 본진 (FR-8.2 `enemyBaseDestroyed`).
 *
 * ★ 이 파일이 지키는 두 가지가 서로 반대 방향이다 ★
 * ① **뚫려야 한다** — 못 뚫으면 기능이 존재하지 않는 것과 같다(PRD가 경고하는 "빈 껍데기").
 * ② **싸게 뚫려선 안 된다** — 매매 없이 클리어가 되면 이 게임의 전제가 사라진다
 *    (`economy-floor.test.ts` 검산 4). 실제로 반격을 넣기 전 그 테스트가 즉시 깨졌다.
 *
 * 둘 다 걸어 두지 않으면 밸런스를 만질 때마다 한쪽으로 조용히 넘어간다.
 */
import {
  AUM_DROP_PER_WAVE,
  BASE_HP,
  BASE_INCOME_PER_WAVE,
  ENEMY_BASE_HP,
  TOWER_SLOTS,
  UNIT_HP,
  WAVE_COUNT,
  WAVE_DURATION_MS,
} from './constants';
import { createCombat, step } from './simulate';
import type { CombatParams, CombatState, Unit } from './types';

function params(): CombatParams {
  return {
    waveCount: WAVE_COUNT,
    waveDurationMs: WAVE_DURATION_MS,
    towerSlots: TOWER_SLOTS,
    maxBaseHp: BASE_HP,
    heat: 1,
    aumDropPerWave: AUM_DROP_PER_WAVE,
    totalBaseIncome: BASE_INCOME_PER_WAVE * WAVE_COUNT,
  };
}

/** 적 본진 코앞(x=1)에 유닛 `count`기를 세운 상태. 적은 없다 — 전선을 뚫은 직후를 흉내 낸다. */
function withUnitsAtEnemyBase(count: number, kind: 'intern' | 'trader'): CombatState {
  const base = createCombat(params());
  const units: Unit[] = Array.from({ length: count }, (_, i) => ({
    id: 1000 + i,
    kind,
    x: 1,
    hp: UNIT_HP[kind],
    maxHp: UNIT_HP[kind],
    speed: 0.05,
    damage: kind === 'trader' ? 24 : 10,
    range: 0.05,
    attackCooldownMs: 1000,
    cooldownMs: 0,
  }));
  return { ...base, units, enemies: [] };
}

/** `ms`만큼 100ms 틱으로 굴린다. */
function run(state: CombatState, ms: number): CombatState {
  let current = state;
  for (let elapsed = 0; elapsed < ms; elapsed += 100) {
    current = step(current, 100, params()).state;
    if (current.phase !== 'running') break;
  }
  return current;
}

describe('초기 상태', () => {
  test('적 본진이 만들어진다', () => {
    const state = createCombat(params());
    expect(state.enemyBaseHp).toBe(ENEMY_BASE_HP);
    expect(state.maxEnemyBaseHp).toBe(ENEMY_BASE_HP);
  });

  test('아무도 안 보내면 적 본진은 멀쩡하다', () => {
    expect(run(createCombat(params()), 5_000).enemyBaseHp).toBe(ENEMY_BASE_HP);
  });
});

describe('① 뚫려야 한다 — 자금을 들인 돌격', () => {
  test('★ 탱커 6기를 붙이면 적 본진이 무너지고 즉시 승리한다', () => {
    const after = run(withUnitsAtEnemyBase(6, 'trader'), 40_000);
    expect(after.enemyBaseHp).toBe(0);
    expect(after.phase).toBe('cleared');
  });

  test('13웨이브를 기다리지 않는다 — 웨이브가 남아 있어도 끝난다', () => {
    const after = run(withUnitsAtEnemyBase(6, 'trader'), 40_000);
    expect(after.wave).toBeLessThan(WAVE_COUNT);
  });
});

describe('② 싸게 뚫려선 안 된다 — 본진은 반격한다', () => {
  test('★ 인턴 2기는 본진에 닿기 전에 녹는다', () => {
    const after = run(withUnitsAtEnemyBase(2, 'intern'), 20_000);
    expect(after.units).toHaveLength(0);
    expect(after.phase).toBe('running');
  });

  test('반격은 사거리 안 전원에게 나간다 — 뒤에 선 유닛도 깎인다', () => {
    // 선두 1기만 때리면 나머지가 무저항으로 본진을 깎아 경제 하한이 뚫린다.
    const after = run(withUnitsAtEnemyBase(4, 'intern'), 1_000);
    for (const unit of after.units) {
      expect(unit.hp).toBeLessThan(unit.maxHp);
    }
  });

  test('인턴 2기가 남기는 피해는 본진 체력에 한참 못 미친다', () => {
    const after = run(withUnitsAtEnemyBase(2, 'intern'), 20_000);
    expect(ENEMY_BASE_HP - after.enemyBaseHp).toBeLessThan(ENEMY_BASE_HP / 2);
  });
});

describe('경계', () => {
  test('본진 체력은 0 밑으로 내려가지 않는다', () => {
    expect(run(withUnitsAtEnemyBase(12, 'trader'), 60_000).enemyBaseHp).toBe(0);
  });

  test('사거리 밖(후방)에 있으면 때리지도, 맞지도 않는다', () => {
    const state = withUnitsAtEnemyBase(2, 'intern');
    const rear = { ...state, units: state.units.map((u) => ({ ...u, x: 0.2 })) };
    const after = step(rear, 100, params()).state;
    expect(after.enemyBaseHp).toBe(ENEMY_BASE_HP);
    expect(after.units[0]?.hp).toBe(after.units[0]?.maxHp);
  });
});
