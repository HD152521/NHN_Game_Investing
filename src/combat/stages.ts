/**
 * 스테이지(지역)별 밸런스 상수표 — R1/R2/R3 (PRD §9.2, §9.4).
 *
 * ★ 이 파일이 지역 난이도의 단일 출처다 ★
 * 예전에는 웨이브 테이블·기본 수입이 모듈 전역 상수로 하드코딩되어 있어 지역이 하나뿐이라는
 * 전제가 코드 전체에 퍼져 있었다. 지역별 값은 전부 여기 `StageConfig`에 모으고, 소비하는
 * 쪽은 `CombatParams.waveTable` 등으로 주입받는다 — 지역이 늘어도 이 파일만 바뀐다.
 *
 * 경제 모델(FR-5.7 / FR-6.8 / `src/position/trade.ts`):
 * ```
 * 총골드 = STARTING_GOLD + 기본수입 총액 + S × ρ
 *   S = 세션 총 투입액 (원금이 REFUND_RATIO 0.70으로 재순환하므로 초기 AUM의 5~6배)
 *   ρ = 매매 수익률 (청산 pnl 합 / 총 투입액)
 * ```
 * 골드는 청산 이익에서만 나오므로(`goldGained = max(pnl, 0)`), ρ가 곧 클리어 가능 여부다.
 * 각 스테이지의 `targetReturnRate`는 "이 정도는 벌어야 필요지출을 감당한다"는 경계선이며,
 * 목표에서 5%p만 내려가도 필요지출에 크게 못 미치도록 잡혀 있다(`stages.test.ts`가 고정).
 */

import type { StageWaveTable } from './types';

export type StageId = 'R1' | 'R2' | 'R3';

export interface StageConfig {
  readonly id: StageId;
  /** 스테이지 시작 시 지급되는 AUM(매매 원금). */
  readonly startingAum: number;
  /** 스테이지 시작 시 지급되는 골드 (FR-6.8-b). 전 지역 공통 120 — 기본 포탑 정확히 1기. */
  readonly startingGold: number;
  /** 웨이브 1~13의 기본 수입(G). 인덱스 0 = 웨이브 1. */
  readonly baseIncomePerWave: readonly number[];
  readonly waveTable: StageWaveTable;
  /** 이 스테이지를 클리어하는 데 필요한 골드 총액 (PRD §9.3). */
  readonly requiredSpend: number;
  /** 목표 매매 수익률 ρ. 이 값에서 총골드가 필요지출에 닿는다. */
  readonly targetReturnRate: number;
  /**
   * 세션 총 투입액 S. 10회전 · `REFUND_RATIO` 0.70 · 적 드롭 1,900 균등 지급 가정으로
   * 산출한 값이다. 회전 수나 환급률이 바뀌면 이 값도 다시 계산해야 한다.
   */
  readonly sessionTotalStake: number;
}

/** R1 기준 HP 곡선. R2/R3는 여기에 계수를 곱해 만든다. */
export const WAVE_BASE_HP_R1: readonly number[] = [
  70, 85, 100, 115, 125, 135, 150, 165, 185, 205, 230, 260, 300,
];

/** 웨이브 1~13 공통 기본 적 수. 지역이 달라도 수는 같고, HP와 heat로만 난이도를 준다. */
const WAVE_BASE_COUNT_ALL: readonly number[] = [3, 4, 5, 5, 6, 7, 7, 8, 9, 10, 11, 12, 14];

/** 공중 적이 포함되는 웨이브 번호(1-based). 지역 공통. */
const AIR_WAVES_ALL: ReadonlySet<number> = new Set([3, 5, 7, 8, 10, 11, 12, 13]);

/**
 * 기준 HP 곡선에 지역 계수를 곱한다. **반올림은 `Math.round`(사사오입) 한 가지만 쓴다** —
 * 내림/올림을 섞으면 지역 간 실효 난이도 비율이 곡선 구간마다 미묘하게 달라진다.
 * 결과가 13개 전부 단조 증가인지는 `stages.test.ts`가 고정한다.
 */
export function scaleWaveHp(base: readonly number[], factor: number): readonly number[] {
  return base.map((hp) => Math.round(hp * factor));
}

/**
 * 웨이브별 기본 수입 배열을 만든다. 마지막 웨이브만 다른 값을 주는 경우가 있어
 * (R2: 13×12 + 14 = 170, R3: 11×12 + 13 = 145) 마지막 웨이브를 따로 받는다.
 */
function incomeTable(perWave: number, waveCount: number, lastWave = perWave): readonly number[] {
  return Array.from({ length: waveCount }, (_, i) => (i === waveCount - 1 ? lastWave : perWave));
}

const WAVE_COUNT_ALL = 13;

/** 전 지역 공통 시작 골드. 기본 포탑(120 G) 정확히 1기 — 2기째는 첫 청산 이익에서만 나온다. */
const STARTING_GOLD_ALL = 120;

export const STAGES: Readonly<Record<StageId, StageConfig>> = {
  R1: {
    id: 'R1',
    startingAum: 2000,
    startingGold: STARTING_GOLD_ALL,
    baseIncomePerWave: incomeTable(15, WAVE_COUNT_ALL), // 총 195
    waveTable: {
      baseCount: WAVE_BASE_COUNT_ALL,
      baseHp: WAVE_BASE_HP_R1,
      airWaves: AIR_WAVES_ALL,
    },
    requiredSpend: 2700,
    targetReturnRate: 0.2,
    sessionTotalStake: 11_900,
  },
  R2: {
    id: 'R2',
    startingAum: 2400,
    startingGold: STARTING_GOLD_ALL,
    baseIncomePerWave: incomeTable(13, WAVE_COUNT_ALL, 14), // 총 170
    waveTable: {
      baseCount: WAVE_BASE_COUNT_ALL,
      baseHp: scaleWaveHp(WAVE_BASE_HP_R1, 1.55),
      airWaves: AIR_WAVES_ALL,
    },
    requiredSpend: 4200,
    targetReturnRate: 0.3,
    sessionTotalStake: 13_080,
  },
  R3: {
    id: 'R3',
    startingAum: 2800,
    startingGold: STARTING_GOLD_ALL,
    baseIncomePerWave: incomeTable(11, WAVE_COUNT_ALL, 13), // 총 145
    waveTable: {
      baseCount: WAVE_BASE_COUNT_ALL,
      baseHp: scaleWaveHp(WAVE_BASE_HP_R1, 2.4),
      airWaves: AIR_WAVES_ALL,
    },
    requiredSpend: 6700,
    /**
     * ⚠️ 알려진 리스크 — 배경 없이 이 값을 판단하지 마라.
     *
     * R3 목표 +45%는 필요 z ≈ 0.500σ, 방향 정확도 약 75%를 요구한다.
     * 블라인드 차트(FR-4)에서 이 정확도가 실증적으로 도달 가능한지는 검증되지 않았다.
     * PRD RK-2("예측이 순수 도박일 수 있다", 치명)가 현실화되는 지점이며,
     * 기획자가 리스크를 인지한 상태로 이 값을 선택했다 (2026-07-31).
     * 검증 수단: PRD §10 ⑥ 봇 시뮬레이터. 봇이 R3에서 목표 미달이면 이 상수를 재검토할 것.
     *
     * (R1 +20%는 방향 정확도 약 61%, R2 +30%는 약 67%로 도달 가능 범위로 판정됐다.)
     */
    targetReturnRate: 0.45,
    sessionTotalStake: 14_290,
  },
};

/** 스테이지 전체 기본 수입 총액. */
export function totalBaseIncome(stage: StageConfig): number {
  return stage.baseIncomePerWave.reduce((sum, income) => sum + income, 0);
}

/**
 * 총골드 = `STARTING_GOLD + 기본수입 총액 + S × ρ`.
 * 매매를 전혀 하지 않으면 ρ = 0이라 상수항만 남고, 세탁(z≈0 왕복)은 ρ < 0이라 그보다도 적다.
 */
export function totalGoldFor(stage: StageConfig, returnRate: number): number {
  return stage.startingGold + totalBaseIncome(stage) + stage.sessionTotalStake * returnRate;
}
