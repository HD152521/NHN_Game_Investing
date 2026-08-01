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
 * 총골드 = STARTING_GOLD + 기본수입 총액 + S × (1 + ρ) × GOLD_CONVERSION
 *   S = 세션 총 투입액 = 시작 AUM + AUM_DROP_PER_WAVE × 13   ← 재순환 없음
 *   ρ = 매매 수익률 (청산 pnl 합 / 총 투입액)
 * ```
 *
 * ★ S가 이제 **파생값**이라는 점이 v1.3에서 달라진 핵심이다 ★
 * 청산이 원금을 AUM으로 되돌리던 시절에는 같은 돈을 몇 번이고 다시 투입할 수 있어
 * S가 "몇 회전 굴렸는가"라는 손으로 관리하는 가정값(R1 11,900 등)이었다. 지금은 청산이
 * AUM을 한 푼도 늘리지 않으므로, **세션 동안 굴릴 수 있는 총액 = 세션 동안 받은 AUM 총액**
 * 이라는 항등식이 성립한다. `sessionTotalStake()`가 그 항등식 자체다 — 손으로 적는 상수가
 * 아니라 `startingAum`과 드롭에서 계산된다.
 *
 * 각 스테이지의 `targetReturnRate`는 "이 정도는 벌어야 필요지출을 감당한다"는 경계선이며,
 * `startingAum`은 그 경계선이 정확히 물도록 역산된 값이다(아래 각 스테이지 주석 참고).
 */

import { GOLD_CONVERSION } from '../position/constants';
import type { StageWaveTable } from './types';

export type StageId = 'R1' | 'R2' | 'R3';

export interface StageConfig {
  readonly id: StageId;
  /**
   * 스테이지 시작 시 지급되는 AUM(매매 원금).
   *
   * 드롭과 함께 **세션 총 투입액 S를 완전히 결정한다**(`sessionTotalStake`) —
   * 청산이 AUM을 되돌리지 않으므로 이 값이 곧 밸런스 게이트의 주 노브다.
   */
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

/** 전 지역 공통 시작 골드. 기본 포탑(120 G) 정확히 1기 — 2기째는 첫 청산 대금에서만 나온다. */
const STARTING_GOLD_ALL = 120;

/**
 * 웨이브당 AUM 드롭 총량 (FR-6.8-a). 개체당 드롭 = `floor(150 / 그 웨이브 적 수)`.
 *
 * ★ 이 상수가 여기(밸런스 표) 있는 이유 ★
 * 청산이 AUM을 되돌리지 않게 되면서 드롭은 **시작 지급분 외에 AUM이 들어오는 유일한 경로**가
 * 됐다. 따라서 `startingAum`과 한 세트로만 의미가 있고, 둘을 떼어 놓으면 세션 총 투입액 S가
 * 두 파일에 흩어진다. `combat/constants.ts`는 이 값을 재수출만 한다.
 *
 * ★ 150을 유지한 근거 ★
 * ① 스킬 `S-03`(서킷브레이커) 비용이 150 AUM이라 "실드 1회 = 웨이브 하나가 떨어뜨린 AUM
 *    전부"라는 읽기 쉬운 환율이 성립한다 — 이 환율은 `constants.ts` SKILL_SPECS의 설계 근거다.
 * ② R1 기준 드롭 총액 1,950은 세션 총 투입 3,950의 **49%**다. 즉 "전투로 버는 실탄이 매매
 *    자본의 절반"이라, 방어가 무너지면 매매도 같이 마른다는 되먹임이 R1에서 가장 강하게 걸린다.
 * ③ 올리면 `startingAum`을 그만큼 내려야 S가 유지되는데(게이트가 S를 고정한다), R1은
 *    시작 AUM이 2,000 밑으로 내려가면 10% 프리셋 투입액이 200 미만이 되어 초반 매매가
 *    유의미한 골드를 못 만든다. 내리면 반대로 전투→매매 되먹임이 약해진다.
 */
export const AUM_DROP_PER_WAVE = 150;

export const STAGES: Readonly<Record<StageId, StageConfig>> = {
  R1: {
    id: 'R1',
    /**
     * **앵커.** 2,000은 PRD §9.2 `AUM_BY_DESK_LV` Lv1로 v1.0부터 한 번도 바뀐 적이 없고,
     * 스킬 `S-03` 비용(150 AUM)과 10%/25%/50% 투입 프리셋이 전부 이 값 위에서 설계됐다.
     * 그래서 R1만은 시작 AUM을 고정하고, 대신 `GOLD_CONVERSION`을 여기 맞춰 역산했다
     * (0.5032 → 0.50). S = 2,000 + 1,950 = 3,950.
     */
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
  },
  R2: {
    id: 'R2',
    /**
     * 2,400 → 4,050 `[v1.3 재산출]`. 게이트에서 역산한 값이다.
     * ```
     * 필요 S = (requiredSpend − 시작골드 − 기본수입) / ((1 + ρ) × GOLD_CONVERSION)
     *        = (4200 − 120 − 170) / (1.30 × 0.50) = 6,015
     * startingAum = 6,015 − 드롭 1,950 = 4,065 → 4,050 (S = 6,000, 50 단위로 정리)
     * ```
     * 총골드 4,190 G로 필요지출 4,200 G의 99.8%에 걸친다.
     *
     * ⚠️ R1(2,000)의 두 배가 된 것은 인플레가 아니라 **원금 재순환이 사라진 결과**다.
     * 예전에는 같은 2,400을 5~6회 굴려 S ≈ 13,080을 만들었지만, 이제 S는 받은 AUM 총액이
     * 전부이므로 같은 골드를 뽑으려면 실제로 그만큼을 쥐고 시작해야 한다.
     */
    startingAum: 4050,
    startingGold: STARTING_GOLD_ALL,
    baseIncomePerWave: incomeTable(13, WAVE_COUNT_ALL, 14), // 총 170
    waveTable: {
      baseCount: WAVE_BASE_COUNT_ALL,
      baseHp: scaleWaveHp(WAVE_BASE_HP_R1, 1.55),
      airWaves: AIR_WAVES_ALL,
    },
    requiredSpend: 4200,
    targetReturnRate: 0.3,
  },
  R3: {
    id: 'R3',
    /**
     * 2,800 → 6,900 `[v1.3 재산출]`. R2와 같은 역산이다.
     * ```
     * 필요 S = (6700 − 120 − 145) / (1.45 × 0.50) = 8,876
     * startingAum = 8,876 − 1,950 = 6,926 → 6,900 (S = 8,850)
     * ```
     * 총골드 6,681 G로 필요지출 6,700 G의 99.7%에 걸친다.
     *
     * 드롭 비중이 R1의 49%에서 22%로 내려간다 — 후반 지역일수록 "전투로 실탄을 번다"보다
     * "쥐고 시작한 자본을 얼마나 잘 굴리느냐"가 지배적이 된다는 뜻이고, 이는 R3가
     * 매매 실력 게이트라는 설계 의도(§9.3)와 같은 방향이다.
     */
    startingAum: 6900,
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
  },
};

/** 스테이지 전체 기본 수입 총액. */
export function totalBaseIncome(stage: StageConfig): number {
  return stage.baseIncomePerWave.reduce((sum, income) => sum + income, 0);
}

/**
 * 세션 총 투입액 S = 시작 AUM + 드롭 총액.
 *
 * 청산이 AUM을 되돌리지 않으므로(FR-5.7) **세션 동안 굴릴 수 있는 총액은 세션 동안 받은
 * AUM 총액과 정확히 같다.** 부분 투입으로 나눠 굴려도 합계는 이 값을 넘지 못한다.
 *
 * ⚠️ 이건 **상한**이다. 스킬 `S-03`은 AUM을 태워 없애므로(시전 1회 −150) 실제 S는
 * 시전 횟수만큼 줄고, 웨이브를 놓쳐 적을 못 잡으면 드롭분도 그만큼 덜 들어온다.
 * 즉 아래 게이트 계산은 "완벽하게 전멸시키고 실드를 한 번도 안 쓴" 플레이 기준이다.
 */
export function sessionTotalStake(stage: StageConfig): number {
  return stage.startingAum + AUM_DROP_PER_WAVE * WAVE_COUNT_ALL;
}

/**
 * 매매를 **한 번도 하지 않았을 때**의 총골드 = 시작 골드 + 기본수입 총액.
 *
 * 예전에는 `totalGoldFor(stage, 0)`이 이 값이었다(골드가 pnl에서만 나왔으므로 ρ=0이면 0 유입).
 * 지금은 원금도 골드가 되므로 ρ=0은 "본전치기로 전액 전환"이라는 **전혀 다른 플레이**다 —
 * 두 개념을 반드시 분리해서 써라.
 */
export function noTradeGold(stage: StageConfig): number {
  return stage.startingGold + totalBaseIncome(stage);
}

/**
 * 총골드 = `noTradeGold + S × (1 + ρ) × GOLD_CONVERSION`.
 *
 * ρ는 세션 전체 가중 수익률(청산 pnl 합 / 총 투입액)이다. 원금까지 골드가 되므로 ρ는
 * **1 위에 얹히는 항**이고, 그래서 ρ 5%p 변화가 총골드를 약 3~4%만 움직인다 —
 * 원금-이익 분리 시절보다 게이트 대역이 구조적으로 좁아졌다(`stages.test.ts` 주석 참고).
 */
export function totalGoldFor(stage: StageConfig, returnRate: number): number {
  return noTradeGold(stage) + sessionTotalStake(stage) * (1 + returnRate) * GOLD_CONVERSION;
}
