import { describe, expect, test } from 'vitest';

import {
  AUM_DROP_PER_WAVE,
  BASE_INCOME_PER_WAVE,
  BASE_HP,
  ENEMY_KIND_STATS,
  TOWER_SLOTS,
  WAVE_COUNT,
  WAVE_DURATION_MS,
} from './constants';
import { ENEMY_IDENTITY } from './identity';
import { STAGES } from './stages';
import type { CombatParams, EnemyKind } from './types';
import { aumDropPerKill, spawnPlanFor, waveIncomeFor } from './waves';

/** 점령 지역 수에 따른 경계도 계수. FR-6.7: heat = 1 + 점령수 × 0.02. */
function heatFor(capturedTerritories: number): number {
  return 1 + capturedTerritories * 0.02;
}

/** FR-6.8: 총 기본 수입 = 25×13 − (점령 지역 수 × 25). */
function totalBaseIncomeFor(capturedTerritories: number): number {
  return BASE_INCOME_PER_WAVE * WAVE_COUNT - capturedTerritories * BASE_INCOME_PER_WAVE;
}

function fixtureParams(overrides?: Partial<CombatParams>): CombatParams {
  const capturedTerritories = 0;
  return {
    waveCount: WAVE_COUNT,
    waveDurationMs: WAVE_DURATION_MS,
    towerSlots: TOWER_SLOTS,
    maxBaseHp: BASE_HP,
    heat: heatFor(capturedTerritories),
    aumDropPerWave: AUM_DROP_PER_WAVE,
    totalBaseIncome: totalBaseIncomeFor(capturedTerritories),
    ...overrides,
  };
}

describe('spawnPlanFor', () => {
  test('웨이브 1은 heat=1일 때 적 3체를 스폰한다(§9.4 웨이브 테이블)', () => {
    const params = fixtureParams();
    const plan = spawnPlanFor(1, params);
    expect(plan).toHaveLength(3);
    // 웨이브 1 기본 HP는 50 → 70으로 올랐다(무입력 관전 구간 제거). stages.ts 참고.
    // ★ HP는 이제 **종류 배수**를 탄다 — 웨이브 테이블 값은 그 웨이브의 HP "예산"이고
    //   개체 HP는 `예산 × ENEMY_KIND_STATS[kind].hpMultiplier`다.
    for (const spec of plan) {
      const kind = spec.kind;
      expect(kind).toBeDefined();
      expect(spec.hp).toBeCloseTo(70 * ENEMY_KIND_STATS[kind as EnemyKind].hpMultiplier);
    }
  });

  test('heat가 적용되면 적 수는 올림, HP 예산은 그대로 곱해진다(FR-6.7)', () => {
    // 점령 1개 → heat=1.02, 웨이브 4 baseCount=5 → ceil(5×1.02)=6, HP 예산=115×1.02=117.3
    const params = fixtureParams({ heat: 1.02 });
    const plan = spawnPlanFor(4, params);
    expect(plan).toHaveLength(6);
    const first = plan[0];
    expect(first).toBeDefined();
    expect(first?.hp).toBeCloseTo(117.3 * ENEMY_KIND_STATS[first?.kind as EnemyKind].hpMultiplier);
  });

  test('정의되지 않은 웨이브 번호는 빈 배열을 반환한다', () => {
    const params = fixtureParams();
    expect(spawnPlanFor(0, params)).toEqual([]);
    expect(spawnPlanFor(999, params)).toEqual([]);
  });

  test('공중 웨이브(3)에는 공중 레인 적이 최소 1체 포함된다', () => {
    const params = fixtureParams();
    const plan = spawnPlanFor(3, params);
    expect(plan.some((spec) => spec.lane === 'air')).toBe(true);
  });

  test('공중 웨이브가 아니면(1) 전부 지상 레인이다', () => {
    const params = fixtureParams();
    const plan = spawnPlanFor(1, params);
    expect(plan.every((spec) => spec.lane === 'ground')).toBe(true);
  });
});

describe('aumDropPerKill — FR-6.8-a AUM 드롭', () => {
  test('웨이브 1(적 3체, 나눠떨어짐): 개체당 50, 전멸 시 합계 150', () => {
    const params = fixtureParams();
    const perKill = aumDropPerKill(1, params);
    expect(perKill).toBe(50);
    expect(perKill * spawnPlanFor(1, params).length).toBe(150);
  });

  test('웨이브 7(적 7체, 나눠떨어지지 않음): 개체당 floor(150/7)=21, 전멸해도 합계 147(나머지 버림)', () => {
    const params = fixtureParams();
    const plan = spawnPlanFor(7, params);
    expect(plan).toHaveLength(7);

    const perKill = aumDropPerKill(7, params);
    expect(perKill).toBe(21);
    expect(perKill * plan.length).toBe(147);
    expect(perKill * plan.length).toBeLessThan(params.aumDropPerWave);
  });

  /**
   * ★ 마지막 웨이브는 **잡졸 14체 + 보스 1체 = 15체**다 (B-03 마진콜 심판관, 시트 §07).
   *
   * 개체당 드롭이 `floor(150/14) = 10`에서 `floor(150/15) = 10`으로 **바뀌지 않은 것이
   * 중요하다** — 보스를 실제 적으로 만들면서 AUM 경제(세션 총 투입액 S)가 흔들리지 않았다는
   * 뜻이다. 전멸 시 합계만 140 → 150으로 올라 나눗셈 나머지 버림이 사라진다.
   */
  test('웨이브 13(잡졸 14체 + 보스 1체 = 15체): 개체당 floor(150/15)=10, 전멸 시 합계 150', () => {
    const params = fixtureParams();
    const plan = spawnPlanFor(13, params);
    expect(plan).toHaveLength(15);

    const perKill = aumDropPerKill(13, params);
    expect(perKill).toBe(10);
    expect(perKill * plan.length).toBe(150);
  });

  test('보스는 마지막 웨이브 스폰 계획의 맨 앞이다 — 선두여야 타워 우선순위 1위가 된다', () => {
    const params = fixtureParams();
    const plan = spawnPlanFor(13, params);
    expect(plan[0]?.isBoss).toBe(true);
    // 나머지 14체에는 보스가 없다.
    expect(plan.slice(1).some((spec) => spec.isBoss === true)).toBe(false);
  });

  test('보스가 아닌 웨이브에는 보스가 없다', () => {
    const params = fixtureParams();
    for (const wave of [1, 5, 12]) {
      expect(spawnPlanFor(wave, params).some((spec) => spec.isBoss === true)).toBe(false);
    }
  });
});

describe('waveIncomeFor — FR-6.8 기본 수입', () => {
  test.each([0, 1, 2])('점령 지역 수 %i개: 13웨이브 합계가 총 기본 수입과 정확히 일치한다', (captured) => {
    const params = fixtureParams({ totalBaseIncome: totalBaseIncomeFor(captured) });

    let sum = 0;
    for (let wave = 1; wave <= params.waveCount; wave += 1) {
      sum += waveIncomeFor(wave, params);
    }

    expect(sum).toBe(totalBaseIncomeFor(captured));
  });

  test('점령 2개 예시: 총액 165, 웨이브 1~12 각 12, 웨이브 13은 21', () => {
    // ⚠️ PRD §9.2 수용 기준에 적힌 275/21/23은 BASE_INCOME_PER_WAVE=25 시절 값이다.
    // 15로 내린 지금은 25×13 − 2×15 → 15×13 − 2×15 = 165이 맞다. PRD 문서 갱신 필요.
    const params = fixtureParams({ totalBaseIncome: totalBaseIncomeFor(2) });
    expect(params.totalBaseIncome).toBe(165);

    for (let wave = 1; wave <= 12; wave += 1) {
      expect(waveIncomeFor(wave, params)).toBe(12);
    }
    expect(waveIncomeFor(13, params)).toBe(21);
  });
});

/**
 * ★ 적 5종이 **실제로 다른 적**인지 고정하는 회귀 방어선 ★
 *
 * 예전에는 종류가 표현 계층에만 있어서 같은 레인의 적은 스탯이 전부 같았고, 그 결과
 * "속공/방패/탱커/정찰/광역"이라는 역할이 플레이에 한 번도 반영되지 않았다(GAME.md §13-2).
 * 아래 테스트들이 그 상태로 되돌아가는 것을 막는다.
 */
describe('spawnPlanFor — 적 5종 스탯 차등 (identity.ts 역할 표기의 구현)', () => {
  /** 웨이브 1~13 전체 스폰 계획(보스 제외)을 한 번에 훑는다. */
  function allSpecs(params: CombatParams) {
    return Array.from({ length: WAVE_COUNT }, (_, index) => spawnPlanFor(index + 1, params))
      .flat()
      .filter((spec) => spec.isBoss !== true);
  }

  test('보스가 아닌 모든 적은 종류를 싣고 나온다 — 렌더러가 id 폴백으로 떨어지지 않는다', () => {
    for (const spec of allSpecs(fixtureParams())) {
      expect(spec.kind).toBeDefined();
    }
  });

  test('종류의 레인은 정체성 표(ENEMY_IDENTITY)와 어긋나지 않는다', () => {
    for (const spec of allSpecs(fixtureParams())) {
      expect(ENEMY_IDENTITY[spec.kind as EnemyKind].lane).toBe(spec.lane);
    }
  });

  test('개체 스탯은 종류 테이블에서 그대로 나온다 — 런타임 조회가 필요 없어야 한다', () => {
    for (const spec of allSpecs(fixtureParams())) {
      const stats = ENEMY_KIND_STATS[spec.kind as EnemyKind];
      expect(spec.speed).toBe(stats.speed);
      expect(spec.damage).toBe(stats.damage);
      expect(spec.leakDamage).toBe(stats.leakDamage);
    }
  });

  test('보스는 종류를 싣지 않는다 — 정체는 isBoss가 진다', () => {
    const boss = spawnPlanFor(WAVE_COUNT, fixtureParams())[0];
    expect(boss?.isBoss).toBe(true);
    expect(boss?.kind).toBeUndefined();
  });

  /**
   * ★ 이것이 "5종이 같은 적이 아니다"의 핵심 주장이다 ★
   * 속도와 HP 배수는 5종이 전부 서로 다른 값을 가져야 한다. 하나라도 같아지면 그 축에서는
   * 종류가 다시 죽은 구분이 된다.
   */
  test('5종의 속도 · HP 배수는 모두 서로 다르다', () => {
    const kinds = Object.keys(ENEMY_KIND_STATS) as EnemyKind[];
    expect(new Set(kinds.map((kind) => ENEMY_KIND_STATS[kind].speed)).size).toBe(kinds.length);
    expect(new Set(kinds.map((kind) => ENEMY_KIND_STATS[kind].hpMultiplier)).size).toBe(kinds.length);
  });

  test('역할 순서가 스탯에 그대로 나타난다 — 속공 < 방패 < 탱커 (HP는 증가, 속도는 감소)', () => {
    const rush = ENEMY_KIND_STATS.gapScout;
    const shield = ENEMY_KIND_STATS.marginEnforcer;
    const tank = ENEMY_KIND_STATS.liquidationDigger;

    expect(rush.hpMultiplier).toBeLessThan(shield.hpMultiplier);
    expect(shield.hpMultiplier).toBeLessThan(tank.hpMultiplier);
    // 속도는 반대 방향이다 — 얇은 것이 빠르고 두꺼운 것이 느리다.
    expect(rush.speed).toBeGreaterThan(shield.speed);
    expect(shield.speed).toBeGreaterThan(tank.speed);
  });

  test('공중은 정찰이 빠르고 얇다 · 광역이 느리고 누출 피해가 크다', () => {
    const scout = ENEMY_KIND_STATS.rumorKite;
    const siren = ENEMY_KIND_STATS.panicSiren;

    expect(scout.speed).toBeGreaterThan(siren.speed);
    expect(scout.hpMultiplier).toBeLessThan(siren.hpMultiplier);
    // 공중은 유닛과 교전하지 않으므로(FR-6.2) `damage`가 죽은 값이다 — "피해가 크다"는
    // 누출 피해로만 표현할 수 있다.
    expect(siren.leakDamage).toBeGreaterThan(scout.leakDamage);
  });

  /**
   * ★ 지상 3종의 HP 배수 합이 정확히 3.0이라는 사실이 밸런스의 기준선이다 ★
   * 이 항등식 덕에 "속공과 탱커를 같은 수로 넣으면 웨이브 HP 예산이 보존된다"가 성립하고,
   * 웨이브 구성(`WAVE_GROUND_MIX`)이 그 기준선에서 **의도적으로만** 벗어날 수 있다.
   * 공중 2종도 같은 이유로 합이 2.0이다.
   */
  test('종류 배수는 레인 평균 1.0을 유지한다 (지상 합 3.0 · 공중 합 2.0)', () => {
    const ground =
      ENEMY_KIND_STATS.gapScout.hpMultiplier +
      ENEMY_KIND_STATS.marginEnforcer.hpMultiplier +
      ENEMY_KIND_STATS.liquidationDigger.hpMultiplier;
    const air = ENEMY_KIND_STATS.rumorKite.hpMultiplier + ENEMY_KIND_STATS.panicSiren.hpMultiplier;

    expect(ground).toBeCloseTo(3);
    expect(air).toBeCloseTo(2);
  });

  /**
   * ★ 마지막 웨이브의 산술 — 보스가 들어오면서 생긴 긴장이 그대로인가 ★
   * "잡졸을 전부 흘려보내도 죽지 않지만, 보스까지 놓치면 죽는다"는 불변식은 누출 피해가
   * 종류별로 갈린 뒤에도 유지되어야 한다(`constants.ts BOSS_BASE_DAMAGE` 주석).
   */
  test('웨이브 13: 잡졸 전부 누출 < 본진 HP < 잡졸 + 보스', () => {
    const plan = spawnPlanFor(WAVE_COUNT, fixtureParams());
    const boss = plan.find((spec) => spec.isBoss === true);
    expect(boss).toBeDefined();

    const trashLeak = plan
      .filter((spec) => spec.isBoss !== true)
      .reduce((sum, spec) => sum + (spec.leakDamage ?? 0), 0);

    expect(trashLeak).toBeLessThan(BASE_HP);
    expect(trashLeak + (boss?.leakDamage ?? 0)).toBeGreaterThan(BASE_HP);
  });

  /**
   * 구성이 HP 예산에서 얼마나 벗어났는지를 **명시적으로 고정**한다. 웨이브 구성은 난이도
   * 곡선을 만드는 축이라 기준선(명목 총 HP)에서 벗어나도 되지만, 벗어난 폭이 조용히 커지면
   * `totalEnemyHp`(경제 게이트가 읽는 명목값)와 실제 전투 부하가 갈라진다.
   */
  test('실현 총 적 HP는 명목 웨이브 테이블 대비 ±8% 안에 있고, 지역 램프는 유지된다', () => {
    const realized = (stageId: 'R1' | 'R2' | 'R3'): number => {
      const params = fixtureParams({ waveTable: STAGES[stageId].waveTable });
      return Array.from({ length: WAVE_COUNT }, (_, index) => spawnPlanFor(index + 1, params))
        .flat()
        .reduce((sum, spec) => sum + spec.hp, 0);
    };

    const nominal = (stageId: 'R1' | 'R2' | 'R3'): number => {
      const table = STAGES[stageId].waveTable;
      const waves = table.baseHp.reduce(
        (sum, hp, index) => sum + hp * (table.baseCount[index] ?? 0),
        0,
      );
      // 보스는 마지막 웨이브 기본 HP × 3.
      return waves + (table.baseHp[WAVE_COUNT - 1] ?? 0) * 3;
    };

    for (const stageId of ['R1', 'R2', 'R3'] as const) {
      const ratio = realized(stageId) / nominal(stageId);
      expect(ratio).toBeGreaterThan(0.92);
      expect(ratio).toBeLessThan(1.08);
    }

    expect(realized('R1')).toBeLessThan(realized('R2'));
    expect(realized('R2')).toBeLessThan(realized('R3'));
  });
});
