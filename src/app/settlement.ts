/**
 * 스테이지 정산 (PRD FR-8.1 · FR-8.2) — 순수 계산 + 표시 문자열.
 *
 * ★ 왜 이 파일이 생겼나 ★
 * 셸에는 정산이 **아예 없었다**. 재생이 끝나면 `session = null`로 판이 통째로 버려졌고
 * (CLICK-PATH-001), 그 결과 골드·AUM·청산 연출이 화면에 한 번도 닿지 못했다.
 * 여기서는 계산만 하고 DOM은 만지지 않는다 — 이 프로젝트 vitest 에는 jsdom 이 없어,
 * 검증 가능한 판정을 배선에서 떼어놓아야 테스트가 붙는다(`roster-logic.ts`와 같은 구조).
 *
 * 수식의 단일 출처는 PRD 다. 잔여 AUM 환산만은 이미 `src/position/settle.ts`에
 * 순수 함수로 확정돼 있으므로 **여기서 다시 구현하지 않고 불러 쓴다**.
 */

import type { CombatPhase } from '../combat';
import { aumCapitalCredit } from '../position';

/**
 * 스테이지가 끝난 방식.
 *
 * - `cleared` — 13웨이브 방어 완료 (FR-6.10). 전투가 스스로 `cleared`를 선언했을 때만이다.
 * - `defeated` — 본진 HP 0 (FR-6.9). 정산 없음·자본금 0이 PRD에 명시돼 있다.
 * - `unresolved` — **장은 마감됐는데 전투가 끝나지 않았다.**
 *   PRD 에 이름이 없는 상태다. FR-6.10 이 승리를 "13웨이브 방어 완료"로 못박으므로
 *   `baseHp > 0`만으로 클리어를 선언하지 않는다 — 가장 보수적인 해석이다.
 */
export type StageOutcome = 'cleared' | 'defeated' | 'unresolved';

export type SettlementGrade = 'S' | 'A' | 'B' | 'C';

/** FR-8.1 등급 배수. */
const GRADE_MULTIPLIER: Readonly<Record<SettlementGrade, number>> = {
  S: 1.6,
  A: 1.3,
  B: 1.1,
  C: 1.0,
};

/** FR-8.1 보너스 배수 — 적중률 구간은 **상위만** 적용된다(중복 아님). */
const BONUS_FULL_HP = 0.2;
const BONUS_ACCURACY_HIGH = 0.3;
const BONUS_ACCURACY_MID = 0.15;
const ACCURACY_HIGH = 0.7;
const ACCURACY_MID = 0.6;

/** FR-8.2 점수 임계값. */
const GOLD_RATIO_HIGH = 0.2;
const GOLD_RATIO_MID = 0.1;
const ACCURACY_SCORE_HIGH = 0.65;
const ACCURACY_SCORE_MID = 0.55;
const BASE_HP_SCORE_HIGH = 0.9;
const BASE_HP_SCORE_MID = 0.7;

export interface SettlementInput {
  readonly outcome: StageOutcome;
  /** 모든 포지션을 정리한 뒤의 잔여 골드. */
  readonly remainingGold: number;
  readonly remainingAum: number;
  /** 시작 골드 + 웨이브 기본 수입 + 청산 대금의 합 (FR-6.8-b: 시작 골드 포함). */
  readonly totalGoldEarned: number;
  /** 이번 스테이지의 총 청산 수. */
  readonly closeCount: number;
  /** 그중 `pnl > 0`인 청산 수. */
  readonly profitCloseCount: number;
  readonly baseHp: number;
  readonly maxBaseHp: number;
  /**
   * 적 본진 파괴 여부 (FR-8.2 +1점 / FR-8.3 공격 계열).
   *
   * ⚠️ `CombatState`에 적 본진 HP 필드가 **없다** — 전투 시뮬레이션이 아직 이 개념을
   * 갖고 있지 않으므로 셸은 항상 `false`를 넘긴다. 필드를 남겨 둔 이유는 전투가 이
   * 개념을 갖는 날 정산식을 고칠 필요가 없게 하기 위함이다.
   */
  readonly enemyBaseDestroyed: boolean;
  /**
   * IR팀 부서의 정산 보너스 **가산분** (FR-11.2). 생략하면 0.
   *
   * 배수가 아니라 가산분을 받는 이유는 FR-11.3(곱연산 금지)이다 — `bonusMultiplier`는
   * 이미 `1 + 무피해 + 적중률`이라는 합이고, 여기에 한 항이 더 붙을 뿐이다.
   * 배수를 받으면 이 함수 안에서 곱셈이 생겨 레벨이 오를수록 실효 증가폭이 커진다.
   */
  readonly departmentBonus?: number;
}

export interface Settlement {
  readonly outcome: StageOutcome;
  /** 잔여골드율 = 잔여 골드 / 총 획득 골드. 분모가 0이면 0. */
  readonly goldRatio: number;
  /** 적중률 = 이익 청산 수 / 총 청산 수. 청산이 없으면 0. */
  readonly accuracy: number;
  readonly baseHpRatio: number;
  readonly score: number;
  readonly grade: SettlementGrade;
  readonly aumCredit: number;
  readonly baseCapital: number;
  readonly bonusMultiplier: number;
  readonly gradeMultiplier: number;
  /** 최종 자본금. 클리어가 아니면 0이다. */
  readonly capital: number;
}

function ratio(part: number, whole: number): number {
  if (whole <= 0) {
    return 0;
  }
  return Math.max(0, part) / whole;
}

/** FR-8.2 점수 합. */
function scoreOf(input: {
  goldRatio: number;
  accuracy: number;
  baseHpRatio: number;
  enemyBaseDestroyed: boolean;
}): number {
  let score = 0;
  if (input.goldRatio >= GOLD_RATIO_HIGH) score += 2;
  else if (input.goldRatio >= GOLD_RATIO_MID) score += 1;

  if (input.accuracy >= ACCURACY_SCORE_HIGH) score += 2;
  else if (input.accuracy >= ACCURACY_SCORE_MID) score += 1;

  if (input.baseHpRatio >= BASE_HP_SCORE_HIGH) score += 2;
  else if (input.baseHpRatio >= BASE_HP_SCORE_MID) score += 1;

  if (input.enemyBaseDestroyed) score += 1;
  return score;
}

export function gradeOf(score: number): SettlementGrade {
  if (score >= 6) return 'S';
  if (score >= 4) return 'A';
  if (score >= 2) return 'B';
  return 'C';
}

/**
 * 스테이지 정산 (FR-8.1 · FR-8.2).
 *
 * ★ 자본금이 0이 되는 경우 ★
 * - `defeated` — FR-6.9 가 "패배 시 정산 없음, 자본금 0"이라고 명시한다.
 * - `unresolved` — PRD 가 정의하지 않은 상태다. FR-6.10 의 승리 조건을 만족하지 못했으므로
 *   **보상을 주지 않는 쪽**으로 자른다. 지표(잔여골드율·적중률·등급)는 계산해서 보여준다 —
 *   플레이어가 무엇이 모자랐는지는 알아야 한다.
 */
export function computeSettlement(input: SettlementInput): Settlement {
  const goldRatio = ratio(input.remainingGold, input.totalGoldEarned);
  const accuracy = ratio(input.profitCloseCount, input.closeCount);
  const baseHpRatio = ratio(input.baseHp, input.maxBaseHp);

  const score = scoreOf({
    goldRatio,
    accuracy,
    baseHpRatio,
    enemyBaseDestroyed: input.enemyBaseDestroyed,
  });
  const grade = gradeOf(score);

  const aumCredit = aumCapitalCredit({
    remainingAum: input.remainingAum,
    profitCloseCount: input.profitCloseCount,
  });
  const baseCapital = Math.max(0, input.remainingGold) + aumCredit;

  const accuracyBonus =
    accuracy >= ACCURACY_HIGH
      ? BONUS_ACCURACY_HIGH
      : accuracy >= ACCURACY_MID
        ? BONUS_ACCURACY_MID
        : 0;
  const bonusMultiplier =
    1 +
    (input.baseHp >= input.maxBaseHp ? BONUS_FULL_HP : 0) +
    accuracyBonus +
    // 음수가 새면 정산이 줄어든다 — 부서는 늘리기만 한다.
    Math.max(0, input.departmentBonus ?? 0);
  const gradeMultiplier = GRADE_MULTIPLIER[grade];

  const capital =
    input.outcome === 'cleared'
      ? Math.floor(baseCapital * bonusMultiplier * gradeMultiplier)
      : 0;

  return {
    outcome: input.outcome,
    goldRatio,
    accuracy,
    baseHpRatio,
    score,
    grade,
    aumCredit,
    baseCapital,
    bonusMultiplier,
    gradeMultiplier,
    capital,
  };
}

/**
 * 전투 단계 + 장 마감 상태에서 결과를 판정한다.
 *
 * `null`이면 아직 진행 중이라는 뜻이다. **어떤 입력에도 "조용히 리셋"은 나오지 않는다** —
 * 그게 CLICK-PATH-001 의 본질이었다.
 */
export function resolveStageOutcome(input: {
  readonly phase: CombatPhase;
  readonly marketClosed: boolean;
  readonly overtimeRemainingMs: number;
}): StageOutcome | null {
  if (input.phase === 'cleared') return 'cleared';
  if (input.phase === 'defeated') return 'defeated';
  if (input.marketClosed && input.overtimeRemainingMs <= 0) return 'unresolved';
  return null;
}

export function settlementTitle(outcome: StageOutcome): string {
  if (outcome === 'cleared') return '스테이지 클리어';
  if (outcome === 'defeated') return '본진 함락 — 패배';
  return '장 마감 — 방어 미완료';
}

/** 결과 화면 부제. 왜 이 결과가 나왔는지 한 줄로 말한다. */
export function settlementSubtitle(outcome: StageOutcome): string {
  if (outcome === 'cleared') return '13웨이브 방어 완료 (FR-6.10)';
  if (outcome === 'defeated') return '본진 HP 0 — 정산 없음, 자본금 0 (FR-6.9)';
  return '장 마감 후 연장에서도 잔적을 정리하지 못했습니다 — 자본금 지급 없음';
}

export interface SettlementRow {
  readonly label: string;
  readonly value: string;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/** 결과 화면에 세로로 쌓이는 정산 항목. 숫자는 전부 `Settlement`에서만 온다. */
export function settlementRows(
  settlement: Settlement,
  wallet: { readonly gold: number; readonly aum: number },
  closes: { readonly closeCount: number; readonly profitCloseCount: number },
): readonly SettlementRow[] {
  return [
    { label: '잔여 골드', value: `${wallet.gold} G` },
    { label: '잔여 AUM', value: `${wallet.aum}` },
    { label: '잔여골드율', value: percent(settlement.goldRatio) },
    {
      label: '적중률',
      value: `${percent(settlement.accuracy)} (${closes.profitCloseCount}/${closes.closeCount})`,
    },
    { label: '본진 HP', value: percent(settlement.baseHpRatio) },
    { label: '등급', value: `${settlement.grade} (${settlement.score}점)` },
    { label: 'AUM 환산', value: `${settlement.aumCredit}` },
    { label: '자본금', value: `${settlement.capital}` },
  ];
}
