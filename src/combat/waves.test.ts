import { describe, expect, test } from 'vitest';

import { AUM_DROP_PER_WAVE, BASE_INCOME_PER_WAVE, BASE_HP, TOWER_SLOTS, WAVE_COUNT, WAVE_DURATION_MS } from './constants';
import type { CombatParams } from './types';
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
    expect(plan.every((spec) => spec.hp === 70)).toBe(true);
  });

  test('heat가 적용되면 적 수는 올림, HP는 그대로 곱해진다(FR-6.7)', () => {
    // 점령 1개 → heat=1.02, 웨이브 4 baseCount=5 → ceil(5×1.02)=6, HP=115×1.02=117.3
    const params = fixtureParams({ heat: 1.02 });
    const plan = spawnPlanFor(4, params);
    expect(plan).toHaveLength(6);
    expect(plan[0]?.hp).toBeCloseTo(117.3);
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

  test('웨이브 13(적 14체, heat=1): 개체당 floor(150/14)=10, 전멸해도 합계 140', () => {
    const params = fixtureParams();
    const plan = spawnPlanFor(13, params);
    expect(plan).toHaveLength(14);

    const perKill = aumDropPerKill(13, params);
    expect(perKill).toBe(10);
    expect(perKill * plan.length).toBe(140);
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
