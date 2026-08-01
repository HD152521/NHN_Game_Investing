/**
 * 스테이지 밸런스 게이트 회귀 테스트 (PRD §9.2~§9.4).
 *
 * 핵심 단언은 하나다: **목표 수익률에서는 필요지출에 닿고, 거기서 5%p만 내려가면 못 닿는다.**
 * 골드가 청산 이익에서만 나오는 지금 경제에서(`src/position/trade.ts`), 이 게이트가 정확히
 * 무는 것이 "예측을 건너뛴 플레이는 존재할 수 없다"(§9.3)를 강제하는 유일한 장치다.
 */

import { describe, expect, test } from 'vitest';

import {
  AUM_DROP_PER_WAVE,
  STAGES,
  WAVE_BASE_HP_R1,
  noTradeGold,
  scaleWaveHp,
  sessionTotalStake,
  totalBaseIncome,
  totalGoldFor,
} from './stages';
import type { StageConfig, StageId } from './stages';

const STAGE_IDS: readonly StageId[] = ['R1', 'R2', 'R3'];

/** 목표에 닿았다고 볼 하한 — 필요지출의 99%. 세 지역 모두 20 G 안팎으로 아슬아슬하게 걸친다. */
const PASS_THRESHOLD = 0.99;
/**
 * 실패로 볼 상한 — 필요지출의 97%.
 *
 * ⚠️ `[v1.3]` 예전 값은 0.90이었다. 낮춘 것이 아니라 **경제 구조가 바뀌어 대역이 좁아졌다.**
 * 원금-이익 분리 시절 총골드는 `C + S × ρ`라 ρ가 유일한 항이었고, ρ 5%p는 총골드를 20% 넘게
 * 흔들었다. 지금은 원금까지 골드가 되므로 총골드가 `C + S × (1 + ρ) × GC`이고, ρ는 **1 위에
 * 얹히는 항**이라 5%p 변화가 총골드를 3~4%만 움직인다:
 * ```
 * 격차 / 필요지출 = 0.05 × (1 − C/필요지출) / (1 + ρ)
 *   R1 0.05 × 0.883 / 1.20 = 3.7%   R2 0.05 × 0.931 / 1.30 = 3.6%
 *   R3 0.05 × 0.960 / 1.45 = 3.3%
 * ```
 * 이 값은 `GOLD_CONVERSION`이나 S를 어떻게 잡아도 변하지 않는 **구조적 상수**다(둘 다 분자와
 * 분모에서 약분된다). 게이트의 실질은 "목표에서 반드시 미달"이며, 0.97은 그 미달이 반올림
 * 오차가 아님을 확인하는 보조 단언이다.
 */
const FAIL_THRESHOLD = 0.97;
/**
 * 세탁(z≈0 왕복)의 실효 수익률. 수수료 1%를 물고 나오므로 ρ = −FEE_RATE다.
 * 세탁 상한의 정확한 시뮬레이션은 `src/position/economy-exploit.test.ts`가 담당한다.
 */
const WASH_RETURN_RATE = -0.01;
/** 세탁이 명확히 미달임을 보는 상한 — 필요지출의 85%. */
const WASH_THRESHOLD = 0.85;

describe('스테이지 상수표', () => {
  test('시작 골드는 전 지역 120 G로 동일하다 (기본 포탑 1기)', () => {
    for (const id of STAGE_IDS) {
      expect(STAGES[id].startingGold).toBe(120);
    }
  });

  test('시작 AUM은 R1 2000 / R2 4050 / R3 6900 (v1.3 재산출)', () => {
    // R1은 앵커(PRD §9.2 AUM_BY_DESK_LV Lv1)라 고정하고, GOLD_CONVERSION을 여기 맞춰 역산했다.
    // R2·R3는 그 전환율 아래에서 게이트가 물도록 역산한 값이다.
    expect(STAGES.R1.startingAum).toBe(2000);
    expect(STAGES.R2.startingAum).toBe(4050);
    expect(STAGES.R3.startingAum).toBe(6900);
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

  test('세션 총 투입 S는 R1 3,950 / R2 6,000 / R3 8,850 (v1.3 재산출)', () => {
    expect(sessionTotalStake(STAGES.R1)).toBe(3950);
    expect(sessionTotalStake(STAGES.R2)).toBe(6000);
    expect(sessionTotalStake(STAGES.R3)).toBe(8850);
  });

  /**
   * ★ 이번 개정의 핵심 항등식 ★
   * 청산이 AUM을 되돌리지 않으므로(FR-5.7) 세션 동안 굴릴 수 있는 총액은 **세션 동안 받은
   * AUM 총액과 정확히 같다.** 예전의 S(11,900 등)는 "원금을 5~6회 재순환시킨다"는 손으로
   * 관리하던 가정값이었고, 그 배수가 밸런스의 숨은 변수였다. 이제 S는 파생값이다.
   */
  test('S는 가정값이 아니라 파생값이다 — S = 시작 AUM + 드롭 총액', () => {
    expect(AUM_DROP_PER_WAVE).toBe(150);
    for (const id of STAGE_IDS) {
      expect(sessionTotalStake(STAGES[id])).toBe(STAGES[id].startingAum + AUM_DROP_PER_WAVE * 13);
    }
  });

  test('매매 미실행 골드는 R1 315 / R2 290 / R3 265다 (시작 골드 + 기본수입)', () => {
    expect(noTradeGold(STAGES.R1)).toBe(315);
    expect(noTradeGold(STAGES.R2)).toBe(290);
    expect(noTradeGold(STAGES.R3)).toBe(265);
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
  /** 검산표 `[v1.3 재산출]`. [목표−5%p, 목표, 목표+5%p] 총골드. */
  const expected: Readonly<Record<StageId, readonly [number, number, number]>> = {
    R1: [2586, 2685, 2784],
    R2: [4040, 4190, 4340],
    R3: [6460, 6681, 6903],
  };

  /** 세탁(ρ = −1%) 총골드. 셋 다 필요지출에 닿지 못한다. */
  const washExpected: Readonly<Record<StageId, number>> = {
    R1: 2270,
    R2: 3260,
    R3: 4646,
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

    test(`${id} — 매매를 아예 안 하면(AUM 미투입) 필요지출의 12% 이하다`, () => {
      // ⚠️ `totalGoldFor(stage, 0)`이 아니다. ρ=0은 "본전치기로 전액 전환"이라는 전혀 다른
      // 플레이이며, 원금까지 골드가 되는 지금 경제에서는 상당한 골드를 만든다.
      // "매매 미실행"은 S 자체가 0인 경우이고, 그 값이 `noTradeGold`다.
      const noTrade = noTradeGold(stage);
      expect(noTrade).toBe(stage.startingGold + totalBaseIncome(stage));
      expect(noTrade / stage.requiredSpend).toBeLessThan(0.12);
      // 타워 2기(240 G) 언저리 — 13웨이브를 막을 수 있는 예산이 아니다(economy-floor.test.ts).
      expect(noTrade).toBeLessThan(400);
    });

    test(`${id} — 세탁(z≈0 왕복)만으로는 필요지출에 닿지 못한다 (${washExpected[id]} G)`, () => {
      const wash = Math.round(totalGoldFor(stage, WASH_RETURN_RATE));
      expect(wash).toBe(washExpected[id]);
      expect(wash).toBeLessThan(stage.requiredSpend);
      expect(wash / stage.requiredSpend).toBeLessThan(WASH_THRESHOLD);
      // 세탁은 목표 플레이보다 항상 적다 — 전환율은 상수이므로 격차는 순수하게 ρ에서 온다.
      expect(wash).toBeLessThan(goldAt(stage, 0));
    });

    test(`${id} — 세탁이 매매 미실행보다 낫다는 사실 자체는 정상이다 (AUM→골드는 정상 파이프)`, () => {
      // v1.2에서는 세탁 골드가 0이라 "매매 미실행보다도 못하다"가 성립했다. v1.3에서는
      // AUM을 골드로 바꾸는 것이 게임의 정상 경로이므로 세탁이 미실행보다 나은 것이 옳다.
      // 게이트를 지키는 것은 "세탁이 손해다"가 아니라 **"세탁으로는 필요지출에 못 닿는다"**다.
      expect(Math.round(totalGoldFor(stage, WASH_RETURN_RATE))).toBeGreaterThan(noTradeGold(stage));
    });
  }

  test('난이도가 올라갈수록 요구 수익률도 올라간다', () => {
    expect(STAGES.R1.targetReturnRate).toBeLessThan(STAGES.R2.targetReturnRate);
    expect(STAGES.R2.targetReturnRate).toBeLessThan(STAGES.R3.targetReturnRate);
    expect(STAGES.R1.requiredSpend).toBeLessThan(STAGES.R2.requiredSpend);
    expect(STAGES.R2.requiredSpend).toBeLessThan(STAGES.R3.requiredSpend);
  });
});
