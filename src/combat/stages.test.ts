/**
 * 스테이지 밸런스 게이트 회귀 테스트 (PRD §9.2~§9.4).
 *
 * 핵심 단언은 하나다: **목표 수익률에서는 필요지출에 닿고, 거기서 5%p만 내려가면 못 닿는다.**
 * 골드가 청산 이익에서만 나오는 지금 경제에서(`src/position/trade.ts`), 이 게이트가 정확히
 * 무는 것이 "예측을 건너뛴 플레이는 존재할 수 없다"(§9.3)를 강제하는 유일한 장치다.
 */

import { describe, expect, test } from 'vitest';

import { STAGES, WAVE_BASE_HP_R1, scaleWaveHp, totalBaseIncome, totalGoldFor } from './stages';
import type { StageConfig, StageId } from './stages';

const STAGE_IDS: readonly StageId[] = ['R1', 'R2', 'R3'];

/** 목표에 닿았다고 볼 하한 — 필요지출의 99%. R1·R3는 5 G 안팎으로 아슬아슬하게 걸친다. */
const PASS_THRESHOLD = 0.99;
/** 명확한 실패로 볼 상한 — 필요지출의 90%. */
const FAIL_THRESHOLD = 0.9;

describe('스테이지 상수표', () => {
  test('시작 골드는 전 지역 120 G로 동일하다 (기본 포탑 1기)', () => {
    for (const id of STAGE_IDS) {
      expect(STAGES[id].startingGold).toBe(120);
    }
  });

  test('시작 AUM은 R1 2000 / R2 2400 / R3 2800', () => {
    expect(STAGES.R1.startingAum).toBe(2000);
    expect(STAGES.R2.startingAum).toBe(2400);
    expect(STAGES.R3.startingAum).toBe(2800);
  });

  test('기본 수입 총액은 R1 195 / R2 170 / R3 145', () => {
    expect(totalBaseIncome(STAGES.R1)).toBe(195);
    expect(totalBaseIncome(STAGES.R2)).toBe(170);
    expect(totalBaseIncome(STAGES.R3)).toBe(145);
  });

  test('R2·R3는 마지막 웨이브만 수입이 1 G 높다', () => {
    expect(STAGES.R2.baseIncomePerWave).toEqual([13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 14]);
    expect(STAGES.R3.baseIncomePerWave).toEqual([11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 13]);
  });

  test('목표 수익률은 R1 +20% / R2 +30% / R3 +45%', () => {
    expect(STAGES.R1.targetReturnRate).toBe(0.2);
    expect(STAGES.R2.targetReturnRate).toBe(0.3);
    expect(STAGES.R3.targetReturnRate).toBe(0.45);
  });

  test('세션 총 투입 S는 R1 11,900 / R2 13,080 / R3 14,290', () => {
    expect(STAGES.R1.sessionTotalStake).toBe(11_900);
    expect(STAGES.R2.sessionTotalStake).toBe(13_080);
    expect(STAGES.R3.sessionTotalStake).toBe(14_290);
  });
});

describe('웨이브 HP 곡선', () => {
  test('R1 기준 배열은 13개이며 확정값 그대로다', () => {
    expect(WAVE_BASE_HP_R1).toEqual([70, 85, 100, 115, 125, 135, 150, 165, 185, 205, 230, 260, 300]);
    expect(STAGES.R1.waveTable.baseHp).toBe(WAVE_BASE_HP_R1);
  });

  test('R2는 기준 × 1.55, R3는 기준 × 2.40을 반올림한 값이다', () => {
    expect(STAGES.R2.waveTable.baseHp).toEqual(scaleWaveHp(WAVE_BASE_HP_R1, 1.55));
    expect(STAGES.R3.waveTable.baseHp).toEqual(scaleWaveHp(WAVE_BASE_HP_R1, 2.4));

    // 반올림 규칙(Math.round) 고정 — 내림/올림으로 바꾸면 지역 간 실효 난이도 비율이 흔들린다.
    expect(STAGES.R2.waveTable.baseHp).toEqual([
      109, 132, 155, 178, 194, 209, 233, 256, 287, 318, 357, 403, 465,
    ]);
    expect(STAGES.R3.waveTable.baseHp).toEqual([
      168, 204, 240, 276, 300, 324, 360, 396, 444, 492, 552, 624, 720,
    ]);
  });

  for (const id of STAGE_IDS) {
    test(`${id} HP 곡선은 13개 전부 단조 증가한다`, () => {
      const hp = STAGES[id].waveTable.baseHp;
      expect(hp).toHaveLength(13);
      for (let i = 1; i < hp.length; i += 1) {
        expect(hp[i]).toBeGreaterThan(hp[i - 1] as number);
      }
    });
  }

  test('예전 곡선의 무입력 관전 구간이 제거됐다 — 웨이브 1 HP가 50에서 70으로 올랐다', () => {
    expect(STAGES.R1.waveTable.baseHp[0]).toBe(70);
  });
});

describe('R1/R2/R3 게이트 — 목표에서 통과, 목표−5%p에서 실패', () => {
  /** 코디네이터 검산표 그대로. [목표−5%p, 목표, 목표+5%p] 총골드. */
  const expected: Readonly<Record<StageId, readonly [number, number, number]>> = {
    R1: [2100, 2695, 3290],
    R2: [3560, 4214, 4868],
    R3: [5981, 6696, 7410],
  };

  function goldAt(stage: StageConfig, delta: number): number {
    return Math.round(totalGoldFor(stage, stage.targetReturnRate + delta));
  }

  for (const id of STAGE_IDS) {
    const stage = STAGES[id];

    test(`${id} — 총골드 검산표가 일치한다 (${expected[id].join(' / ')})`, () => {
      expect(goldAt(stage, -0.05)).toBe(expected[id][0]);
      expect(goldAt(stage, 0)).toBe(expected[id][1]);
      expect(goldAt(stage, +0.05)).toBe(expected[id][2]);
    });

    test(`${id} — 목표 수익률이면 필요지출(${stage.requiredSpend} G)에 닿는다`, () => {
      expect(goldAt(stage, 0) / stage.requiredSpend).toBeGreaterThanOrEqual(PASS_THRESHOLD);
    });

    test(`${id} — 목표에서 5%p만 내려가면 필요지출에 명확히 미달한다`, () => {
      const short = goldAt(stage, -0.05);
      expect(short).toBeLessThan(stage.requiredSpend);
      expect(short / stage.requiredSpend).toBeLessThan(FAIL_THRESHOLD);
    });

    test(`${id} — 매매를 전혀 안 하면(ρ=0) 필요지출의 12% 이하다`, () => {
      const noTrade = totalGoldFor(stage, 0);
      expect(noTrade).toBe(stage.startingGold + totalBaseIncome(stage));
      expect(noTrade / stage.requiredSpend).toBeLessThan(0.12);
    });

    test(`${id} — 세탁(ρ<0)은 매매 미실행보다도 못하다`, () => {
      expect(totalGoldFor(stage, -0.01)).toBeLessThan(totalGoldFor(stage, 0));
    });
  }

  test('난이도가 올라갈수록 요구 수익률도 올라간다', () => {
    expect(STAGES.R1.targetReturnRate).toBeLessThan(STAGES.R2.targetReturnRate);
    expect(STAGES.R2.targetReturnRate).toBeLessThan(STAGES.R3.targetReturnRate);
    expect(STAGES.R1.requiredSpend).toBeLessThan(STAGES.R2.requiredSpend);
    expect(STAGES.R2.requiredSpend).toBeLessThan(STAGES.R3.requiredSpend);
  });
});
