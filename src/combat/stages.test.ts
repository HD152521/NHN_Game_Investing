/**
 * 스테이지 밸런스 게이트 회귀 테스트 (PRD §9.2~§9.4).
 *
 * ★ v1.4에서 이 파일이 지키는 명제가 바뀌었다 ★
 * v1.3까지의 명제는 "목표 수익률(+20/+30/+45%)에 닿아야 클리어"였다. 봇 시뮬레이터
 * (`tools/bot-sim`)가 실제 장중 1분봉에서 그 목표들이 **전부 도달 불가**임을 판정했고
 * (최선 전략 실측 ρ +4.4~6.3%), 마팅게일 경로에서는 `E[ρ] ≤ −feeRate`가 정리로 성립하므로
 * 목표를 올리는 것으로는 절대 해결되지 않는다.
 *
 * 그래서 지금의 명제는 이것이다:
 *   **① ρ = 0(본전치기)이면 통과한다.  ② ρ가 유의미하게 음수면(원금을 태우면) 실패한다.**
 * 실력 축은 "얼마나 잘 맞히나"가 아니라 **"얼마나 안 태우나"**이며, 게임의 난이도는
 * 전투가 진다(`combatLoadPerGold`가 R1 → R3로 단조 증가하는지를 아래에서 고정한다).
 */

import { describe, expect, test } from 'vitest';

import {
  AUM_DROP_PER_WAVE,
  DEPLOYMENT_ALLOWANCE,
  STAGES,
  WAVE_BASE_HP_R1,
  combatLoadPerGold,
  gateReturnRate,
  noTradeGold,
  scaleWaveHp,
  sessionTotalStake,
  totalBaseIncome,
  totalEnemyHp,
  totalGoldFor,
} from './stages';
import { GOLD_CONVERSION } from '../position/constants';
import type { StageConfig, StageId } from './stages';

const STAGE_IDS: readonly StageId[] = ['R1', 'R2', 'R3'];

/**
 * 통과로 볼 하한 — 필요지출의 100%. **v1.3의 0.99에서 올렸다.**
 *
 * 예전에는 목표 ρ에서 총골드가 필요지출의 99.4~99.8%라 "엄밀히는 미달"이었고, 그 1%를
 * 임계값으로 눈감아 주고 있었다. v1.4는 필요지출 자체를 ρ=0 통과선에서 역산하므로
 * (`DEPLOYMENT_ALLOWANCE`) 눈감아 줄 필요가 없다 — ρ=0이면 **실제로 넘는다.**
 */
const PASS_THRESHOLD = 1.0;
/**
 * 통과가 과하지 않다고 볼 상한 — 필요지출의 110%.
 *
 * `DEPLOYMENT_ALLOWANCE`(0.92) 때문에 전액 투입·ρ=0 플레이는 필요지출을 약 7.5~8.1%
 * 넘긴다. 이 여유가 곧 "실전에서 굴리지 못하고 남는 AUM"의 몫이며, 여기서 더 벌어지면
 * 게이트가 헐거워진 것이다.
 */
const PASS_CEILING = 1.1;
/**
 * 실패로 볼 상한 — 필요지출의 90%.
 *
 * ⚠️ 임계값보다 **어느 ρ에서 재는가**가 중요하다. v1.3은 목표−5%p에서 쟀지만,
 * v1.4는 필요지출에 소진율 여유 8%가 이미 들어 있어 −5%p는 그 여유에 흡수된다
 * (산술적 실패선은 `gateReturnRate` ≈ −8%다).
 *
 * 실패 측정점 **ρ = −20%**의 근거는 실측이다 — 봇 시뮬레이터에서 원금을 태우는 전형
 * (추세추종·종료보유, 강제청산률 62.5%)의 ρ가 **−15.9%**였고 나머지 전략은 전부 −2.5%
 * 이상이었다. −20%는 그 전형보다도 한 단계 아래로, "여기서도 통과하면 게이트가 없는 것"에
 * 해당하는 확실한 실패 지점이다.
 */
const FAIL_RETURN_RATE = -0.2;
const FAIL_THRESHOLD = 0.9;
/**
 * 세탁(z≈0 왕복)의 실효 수익률. 수수료 1%를 물고 나오므로 ρ = −FEE_RATE다.
 * 세탁 상한의 정확한 시뮬레이션은 `src/position/economy-exploit.test.ts`가 담당한다.
 */
const WASH_RETURN_RATE = -0.01;

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

  test('목표 수익률은 전 지역 0이다 — 통과 조건은 "벌어라"가 아니라 "태우지 마라"다', () => {
    // ★ 이 값이 다시 양수가 되면 v1.4 이전으로 되돌아간 것이다 ★
    // 봇 시뮬레이터가 마팅게일에서 최선 전략 ρ +4.4~6.3%(필요 ρ* +20.8~45.4%)를 실측했고,
    // `E[r] = 0`인 경로에서는 정지 규칙과 무관하게 `E[ρ] ≤ −feeRate`이므로 목표를 올려서
    // 해결되는 문제가 아니다. 목표를 올리려면 먼저 차트 공급원의 성질을 바꿔야 한다.
    for (const id of STAGE_IDS) {
      expect(STAGES[id].targetReturnRate).toBe(0);
    }
  });

  test('필요지출은 ρ=0 통과선에서 역산된다 — noTradeGold + S × 0.92 × 0.50', () => {
    expect(DEPLOYMENT_ALLOWANCE).toBe(0.92);
    for (const id of STAGE_IDS) {
      const stage = STAGES[id];
      const derived =
        noTradeGold(stage) + sessionTotalStake(stage) * DEPLOYMENT_ALLOWANCE * GOLD_CONVERSION;
      // 10 G 단위로 정리한 값이라 소수점 자투리만큼만 어긋난다.
      expect(Math.abs(stage.requiredSpend - derived)).toBeLessThan(10);
    }
    expect(STAGES.R1.requiredSpend).toBe(2130);
    expect(STAGES.R2.requiredSpend).toBe(3050);
    expect(STAGES.R3.requiredSpend).toBe(4340);
  });

  test('산술적 실패선(gateReturnRate)은 세 지역 모두 −8% 언저리다', () => {
    // 설계 의도(targetReturnRate = 0)와 산술적 실패선은 정확히 소진율 여유만큼 벌어져 있다.
    // 이 간격이 사라지면 "본전이면 통과"가 깨지고, 너무 벌어지면 게이트가 헐거워진다.
    for (const id of STAGE_IDS) {
      const gate = gateReturnRate(STAGES[id]);
      expect(gate).toBeGreaterThan(-0.09);
      expect(gate).toBeLessThan(-0.07);
      expect(gate).toBeLessThan(STAGES[id].targetReturnRate);
    }
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

  test('R2는 기준 × 1.62, R3는 기준 × 2.68을 반올림한 값이다 (v1.4: ×1.55 / ×2.40에서 상향)', () => {
    expect(STAGES.R2.waveTable.baseHp).toEqual(scaleWaveHp(WAVE_BASE_HP_R1, 1.62));
    expect(STAGES.R3.waveTable.baseHp).toEqual(scaleWaveHp(WAVE_BASE_HP_R1, 2.68));

    // 반올림 규칙(Math.round) 고정 — 내림/올림으로 바꾸면 지역 간 실효 난이도 비율이 흔들린다.
    expect(STAGES.R2.waveTable.baseHp).toEqual([
      113, 138, 162, 186, 203, 219, 243, 267, 300, 332, 373, 421, 486,
    ]);
    expect(STAGES.R3.waveTable.baseHp).toEqual([
      188, 228, 268, 308, 335, 362, 402, 442, 496, 549, 616, 697, 804,
    ]);
  });

  test('R1 기준 곡선은 앵커라 v1.4에서도 손대지 않았다', () => {
    // R1의 난이도 상승분은 웨이브 상수가 아니라 **경제 개편**에서 나온다 — 총골드가
    // 2,685(ρ=+20%)에서 2,290(ρ=0)으로 내려가 골드당 적 HP가 7.17 → 8.41이 됐다.
    expect(totalEnemyHp(STAGES.R1)).toBe(19_255);
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

describe('R1/R2/R3 게이트 — ρ=0에서 통과, ρ=−20%에서 실패', () => {
  /** 검산표 `[v1.4 재산출]`. [ρ=−20%, ρ=0, ρ=+10%] 총골드. */
  const expected: Readonly<Record<StageId, readonly [number, number, number]>> = {
    R1: [1895, 2290, 2488],
    R2: [2690, 3290, 3590],
    R3: [3805, 4690, 5133],
  };

  /** 세탁(ρ = −1%) 총골드. */
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
      expect(goldAt(stage, FAIL_RETURN_RATE)).toBe(expected[id][0]);
      expect(goldAt(stage, 0)).toBe(expected[id][1]);
      expect(goldAt(stage, +0.1)).toBe(expected[id][2]);
    });

    test(`${id} — 본전(ρ=0)이면 필요지출(${stage.requiredSpend} G)을 넘는다`, () => {
      const ratio = goldAt(stage, 0) / stage.requiredSpend;
      expect(ratio).toBeGreaterThanOrEqual(PASS_THRESHOLD);
      // 넘되 과하게 넘지는 않는다 — 초과분은 소진율 여유(DEPLOYMENT_ALLOWANCE)의 몫이다.
      expect(ratio).toBeLessThan(PASS_CEILING);
    });

    test(`${id} — ρ가 −20%까지 밀리면 필요지출에 명확히 미달한다`, () => {
      const short = goldAt(stage, FAIL_RETURN_RATE);
      expect(short).toBeLessThan(stage.requiredSpend);
      expect(short / stage.requiredSpend).toBeLessThan(FAIL_THRESHOLD);
    });

    test(`${id} — 매매를 아예 안 하면(AUM 미투입) 필요지출의 15% 이하다`, () => {
      // ⚠️ `totalGoldFor(stage, 0)`이 아니다. ρ=0은 "본전치기로 전액 전환"이라는 전혀 다른
      // 플레이이며, 원금까지 골드가 되는 지금 경제에서는 상당한 골드를 만든다.
      // "매매 미실행"은 S 자체가 0인 경우이고, 그 값이 `noTradeGold`다.
      // (v1.3의 12% → 15%. 절대값 315 G는 그대로이고 필요지출이 내려간 만큼 비율만 올랐다.)
      const noTrade = noTradeGold(stage);
      expect(noTrade).toBe(stage.startingGold + totalBaseIncome(stage));
      expect(noTrade / stage.requiredSpend).toBeLessThan(0.15);
      // 타워 2기(240 G) 언저리 — 13웨이브를 막을 수 있는 예산이 아니다(economy-floor.test.ts).
      expect(noTrade).toBeLessThan(400);
    });

    test(`${id} — ★ v1.4 명시적 귀결: 세탁(ρ=−1%)은 이제 게이트를 넘는다 (${washExpected[id]} G)`, () => {
      // ★ 이건 회귀가 아니라 B안의 정의 그 자체다. 지우거나 "고치지" 마라. ★
      // 통과선을 ρ=0으로 내린 이상, `deployment × (1 + ρ)`를 최대화하는 무판단 전환(세탁)은
      // 반드시 통과한다 — 세탁이야말로 "원금을 한 푼도 안 태우는" 극단이기 때문이다.
      // ρ 기반 세탁 게이트는 v1.4에서 **구조적으로 죽었다**. 남은 방어선은 두 개다:
      //   ① 세탁은 수수료만큼 항상 손해다(아래 단언) — 잘하면 더 번다는 순서는 유지된다.
      //   ② FR-8.1 `aumCapitalCredit`의 이익 청산 4회 게이트(`position/economy-exploit.test.ts`).
      const wash = Math.round(totalGoldFor(stage, WASH_RETURN_RATE));
      expect(wash).toBe(washExpected[id]);
      expect(wash).toBeGreaterThan(stage.requiredSpend);
      // 세탁은 본전치기보다 항상 적다 — 전환율은 상수이므로 격차는 순수하게 수수료에서 온다.
      expect(wash).toBeLessThan(goldAt(stage, 0));
      expect(goldAt(stage, 0) - wash).toBe(
        Math.round(sessionTotalStake(stage) * 0.01 * GOLD_CONVERSION),
      );
    });

    test(`${id} — 세탁이 매매 미실행보다 낫다는 사실 자체는 정상이다 (AUM→골드는 정상 파이프)`, () => {
      // v1.2에서는 세탁 골드가 0이라 "매매 미실행보다도 못하다"가 성립했다. v1.3에서는
      // AUM을 골드로 바꾸는 것이 게임의 정상 경로이므로 세탁이 미실행보다 나은 것이 옳다.
      // 게이트를 지키는 것은 "세탁이 손해다"가 아니라 **"세탁으로는 필요지출에 못 닿는다"**다.
      expect(Math.round(totalGoldFor(stage, WASH_RETURN_RATE))).toBeGreaterThan(noTradeGold(stage));
    });
  }

  test('필요지출은 R1 < R2 < R3로 올라간다', () => {
    expect(STAGES.R1.requiredSpend).toBeLessThan(STAGES.R2.requiredSpend);
    expect(STAGES.R2.requiredSpend).toBeLessThan(STAGES.R3.requiredSpend);
  });
});

/**
 * ★ v1.4 난이도 이전의 회귀 방어선 ★
 *
 * 예전에는 "지역이 올라갈수록 요구 수익률이 올라간다"가 난이도 램프의 정의였다.
 * 요구 수익률이 상수 0이 된 지금, 램프는 **전투**에만 남아 있다 — 그 램프가 사라지면
 * R1/R2/R3가 이름만 다른 같은 스테이지가 된다.
 */
describe('지역 난이도 램프 — 이제 전투가 진다', () => {
  test('요구 수익률로는 더 이상 지역을 구분하지 않는다 (셋 다 0)', () => {
    expect(STAGES.R1.targetReturnRate).toBe(STAGES.R2.targetReturnRate);
    expect(STAGES.R2.targetReturnRate).toBe(STAGES.R3.targetReturnRate);
  });

  test('총 적 HP는 R1 19,255 / R2 31,198 / R3 51,600이다', () => {
    expect(totalEnemyHp(STAGES.R1)).toBe(19_255);
    expect(totalEnemyHp(STAGES.R2)).toBe(31_198);
    expect(totalEnemyHp(STAGES.R3)).toBe(51_600);
  });

  test('골드당 처리해야 할 적 HP가 R1 → R3로 단조 증가한다 (8.4 / 9.5 / 11.0)', () => {
    const load = STAGE_IDS.map((id) => combatLoadPerGold(STAGES[id]));
    expect(load[0]).toBeCloseTo(8.41, 2);
    expect(load[1]).toBeCloseTo(9.48, 2);
    expect(load[2]).toBeCloseTo(11.0, 2);

    for (let i = 1; i < load.length; i += 1) {
      expect(load[i]).toBeGreaterThan(load[i - 1] as number);
    }
  });

  test('v1.3에서는 이 램프가 평평했다 — 그래서 전투가 지역 난이도를 표현하지 못했다', () => {
    // v1.3 실적: R1 19,255/2,685 = 7.17 · R2 29,845/4,190 = 7.12 · R3 46,212/6,681 = 6.92.
    // R3가 R1보다 **낮았다**(전투는 오히려 헐거웠고 난이도를 전부 ρ가 졌다).
    // 이 테스트는 그 시절 비율을 다시 계산해 두어, 램프가 왜 필요했는지를 남긴다.
    const legacy = [19_255 / 2685, 29_845 / 4190, 46_212 / 6681];
    expect(legacy[2]).toBeLessThan(legacy[0] as number);
    // 지금은 정확히 반대다.
    expect(combatLoadPerGold(STAGES.R3)).toBeGreaterThan(combatLoadPerGold(STAGES.R1));
  });
});
