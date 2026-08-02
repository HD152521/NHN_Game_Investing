/**
 * 집계 — 세션 결과 묶음을 판정 가능한 수치로 줄인다.
 *
 * ★ ρ를 "세션별 ρ의 평균"이 아니라 **풀링(pooled)** 으로 계산하는 이유 ★
 * 총골드 모델(§9.3)은 `S × (1 + ρ) × 0.50`이고 여기서 ρ는 **투입액 가중** 수익률이다.
 * 세션별 ρ를 단순 평균하면 투입이 적은 세션(운 나쁘게 진입 신호가 없었던 세션)이 같은
 * 비중으로 들어가 실제 골드와 어긋난다. 그래서 pnl 총합 ÷ 투입 총합으로 낸다.
 */

import { GOLD_CONVERSION } from '../../src/position/index.js';
import { noTradeGold, sessionTotalStake, type StageConfig } from '../../src/combat/index.js';
import type { SessionResult } from './types.js';

/** 한 조합(전략 × 스테이지 × 차트 공급원)의 집계 결과. */
export interface Aggregate {
  readonly runs: number;
  /** 세션당 평균 청산 건수. */
  readonly tradesPerRun: number;
  /** 방향 정확도 — 청산 시점 `deltaPct > 0`인 거래의 비율. */
  readonly accuracy: number;
  /** 투입액 가중 평균 z (클램프 전). ρ ≈ `payoutBase × 이 값 − feeRate` 의 관계를 본다. */
  readonly weightedZ: number;
  /** 실현 수익률 ρ = 총 pnl ÷ 총 투입. */
  readonly rho: number;
  /** 세션 총 투입액 S 대비 실제 투입 비율. */
  readonly deployment: number;
  /** 평균 총골드. */
  readonly avgGold: number;
  /** 평균 총골드 ÷ 필요지출. */
  readonly goldRatio: number;
  /** 클리어(총골드 ≥ 필요지출) 세션 비율. */
  readonly clearRate: number;
  /** 강제 청산으로 끝난 거래의 비율. */
  readonly liquidationRate: number;
  /** 실현 z의 10 / 50 / 90 분위. */
  readonly zPercentiles: readonly [number, number, number];
  /**
   * **세션별** ρ의 10 / 50 / 90 분위.
   *
   * 풀링 ρ 하나만 보면 "평균은 목표에 못 미치지만 운 좋은 판은 넘는다"는 구조를 놓친다.
   * 클리어율이 ρ 평균과 어긋나 보일 때 그 이유가 여기 드러난다.
   */
  readonly rhoPercentiles: readonly [number, number, number];
}

/**
 * 이 스테이지를 클리어하기 위해 **실제로 필요한** ρ.
 *
 * `stage.targetReturnRate`(기획 목표)와는 다른 값이다 — §9.3 검산표가 보여주듯 목표 ρ에서
 * 총골드는 필요지출의 99.4~99.8%라 **엄밀히는 미달**이다. 판정은 기획 목표가 아니라
 * 실제 게이트를 기준으로 해야 하므로 총골드 식을 ρ에 대해 푼 값을 쓴다.
 * ```
 * 필요지출 = noTradeGold + S × (1 + ρ) × GOLD_CONVERSION
 * ρ* = (필요지출 − noTradeGold) / (S × GOLD_CONVERSION) − 1
 * ```
 * ⚠️ 이 식은 **S를 전액 투입했을 때**의 값이다. 소진율이 100% 미만이면 실제로 필요한 ρ는
 * 이보다 높아지고, 소진율이 충분히 낮으면 ρ가 아무리 높아도 클리어가 불가능해진다.
 */
export function requiredReturnRate(stage: StageConfig): number {
  const capacity = sessionTotalStake(stage) * GOLD_CONVERSION;
  return (stage.requiredSpend - noTradeGold(stage)) / capacity - 1;
}

/** 목표 ρ를 내려면 평균적으로 몇 σ를 먹어야 하는가 — `ρ = B × z − feeRate` 역산. */
export function requiredZ(rho: number, payoutBase: number, feeRate: number): number {
  return (rho + feeRate) / payoutBase;
}

/**
 * 필요 z를 방향 정확도로 환산한다.
 *
 * "정확도 p로 매 거래 ±|z|를 먹는다"는 단순 모델에서 `E[z] = (2p − 1) × |z|`이므로
 * `p = (E[z] / |z| + 1) / 2`. `|z|`는 보유 구간 길이가 `sigma30`의 기준 창(30봉)과 같을 때
 * 반정규분포의 평균인 `√(2/π) ≈ 0.7979`를 쓴다 — PRD §9.3의 "필요 정확도 61/67/75%"가
 * 나온 것과 같은 계산이다.
 */
export function requiredAccuracy(targetZ: number): number {
  const meanAbsZ = Math.sqrt(2 / Math.PI);
  return (targetZ / meanAbsZ + 1) / 2;
}

/** 세션 결과 배열을 하나의 집계로 줄인다. */
export function aggregate(results: readonly SessionResult[], stage: StageConfig): Aggregate {
  const runs = results.length;
  if (runs === 0) {
    return EMPTY_AGGREGATE;
  }

  let tradeCount = 0;
  let correctCount = 0;
  let liquidatedCount = 0;
  let stakeSum = 0;
  let pnlSum = 0;
  let weightedZSum = 0;
  let goldSum = 0;
  let clearCount = 0;
  const zValues: number[] = [];
  const sessionRhos: number[] = [];

  for (const result of results) {
    if (result.totalStake > 0) {
      sessionRhos.push(result.totalPnl / result.totalStake);
    }
    goldSum += result.totalGold;
    stakeSum += result.totalStake;
    pnlSum += result.totalPnl;
    if (result.cleared) {
      clearCount += 1;
    }
    for (const trade of result.trades) {
      tradeCount += 1;
      if (trade.deltaPct > 0) {
        correctCount += 1;
      }
      if (trade.liquidated) {
        liquidatedCount += 1;
      }
      weightedZSum += trade.z * trade.stake;
      zValues.push(trade.z);
    }
  }

  const capacity = sessionTotalStake(stage) * runs;

  return {
    runs,
    tradesPerRun: tradeCount / runs,
    accuracy: tradeCount === 0 ? 0 : correctCount / tradeCount,
    weightedZ: stakeSum === 0 ? 0 : weightedZSum / stakeSum,
    rho: stakeSum === 0 ? 0 : pnlSum / stakeSum,
    deployment: capacity === 0 ? 0 : stakeSum / capacity,
    avgGold: goldSum / runs,
    goldRatio: goldSum / runs / stage.requiredSpend,
    clearRate: clearCount / runs,
    liquidationRate: tradeCount === 0 ? 0 : liquidatedCount / tradeCount,
    zPercentiles: percentiles(zValues),
    rhoPercentiles: percentiles(sessionRhos),
  };
}

const EMPTY_AGGREGATE: Aggregate = {
  runs: 0,
  tradesPerRun: 0,
  accuracy: 0,
  weightedZ: 0,
  rho: 0,
  deployment: 0,
  avgGold: 0,
  goldRatio: 0,
  clearRate: 0,
  liquidationRate: 0,
  zPercentiles: [0, 0, 0],
  rhoPercentiles: [0, 0, 0],
};

/** 10 / 50 / 90 분위. 표본이 없으면 전부 0. */
function percentiles(values: number[]): readonly [number, number, number] {
  if (values.length === 0) {
    return [0, 0, 0];
  }
  const sorted = [...values].sort((a, b) => a - b);
  return [pick(sorted, 0.1), pick(sorted, 0.5), pick(sorted, 0.9)];
}

function pick(sorted: readonly number[], q: number): number {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[index] ?? 0;
}
