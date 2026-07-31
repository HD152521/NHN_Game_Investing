/**
 * 시장 데이터 통계 산출 — synth.ts가 만든 봉 배열에서 ChartSet의 파생 수치를 계산합니다.
 *
 * 이 파일은 순수 계산만 담당하고, 봉을 생성하지 않습니다 (synth.ts → stats.ts 단방향 의존).
 */

import type { Archetype, Bar } from './types';

/**
 * sigma30 하한값(%). 무변동(횡보 극단) 구간에서 표준편차가 0이 되면
 * 손익 z-score(FR-5.5, z = Δ% / σ)의 분모가 0이 되어 계산이 폭발한다.
 * 실거래에서도 완전 무변동은 사실상 없으므로, 하한을 두는 편이 실제 리스크에도 더 가깝다.
 */
export const SIGMA_FLOOR_PCT = 0.01;

/** sigma30 계산에 쓰는 롤링 윈도 크기(분). PRD FR-5.5 — 30분 구간 수익률 표준편차. */
const SIGMA_WINDOW_BARS = 30;

/**
 * 20일 평균 거래량의 대역값(placeholder).
 *
 * 실제 파이프라인(PRD §10 ③)에서는 종목별 진짜 20일 평균이 별도로 계산되어 주입되지만,
 * 이 모듈은 하루치 합성 데이터만 다루므로 과거 이력이 없다. synth.ts의 기준 거래량과
 * 같은 값을 공유해 "기준선 대비 배수"라는 의미를 유지한다.
 */
export const BASELINE_DAILY_AVG_VOLUME = 100_000;

/** 반전(reversal) 판정에 필요한 최소 반전 폭(%). 이보다 작은 흔들림은 노이즈로 본다. */
const REVERSAL_MIN_SWING_PCT = 5;

/** 급등/급락(surge/plunge) 판정 기준 등락률(%). */
const TREND_MIN_PCT = 8;

/**
 * 시가(bars[0].o) 대비 `upToIndex` 시점 종가의 등락률(%).
 * 인덱스는 배열 범위로 클램프하고, 빈 배열은 0을 반환한다 (FR-4.1 — Y축은 시가=0% 기준).
 */
export function changePercent(bars: readonly Bar[], upToIndex: number): number {
  if (bars.length === 0) {
    return 0;
  }
  const clampedIndex = Math.min(Math.max(upToIndex, 0), bars.length - 1);
  const first = bars[0];
  const target = bars[clampedIndex];
  if (!first || !target || first.o === 0) {
    return 0;
  }
  return ((target.c - first.o) / first.o) * 100;
}

/**
 * 30분 구간 수익률의 표준편차(%). 손익 z-score(FR-5.5)의 분모가 되는 값이므로
 * {@link SIGMA_FLOOR_PCT} 미만으로는 절대 내려가지 않는다.
 */
export function sigma30(bars: readonly Bar[]): number {
  const windowReturnsPct: number[] = [];

  for (let i = 0; i + SIGMA_WINDOW_BARS < bars.length; i += 1) {
    const start = bars[i];
    const end = bars[i + SIGMA_WINDOW_BARS];
    if (!start || !end || start.c === 0) {
      continue;
    }
    windowReturnsPct.push(((end.c - start.c) / start.c) * 100);
  }

  if (windowReturnsPct.length === 0) {
    return SIGMA_FLOOR_PCT;
  }

  const mean = windowReturnsPct.reduce((sum, value) => sum + value, 0) / windowReturnsPct.length;
  const variance =
    windowReturnsPct.reduce((sum, value) => sum + (value - mean) ** 2, 0) / windowReturnsPct.length;
  const standardDeviation = Math.sqrt(variance);

  return Math.max(standardDeviation, SIGMA_FLOOR_PCT);
}

/** 세션 평균 거래량을 20일 평균 기준선(placeholder)과 비교한 배수. FR-4.1 (`2.4×` 표시). */
export function volumeMultiple(bars: readonly Bar[]): number {
  if (bars.length === 0) {
    return 1;
  }
  const totalVolume = bars.reduce((sum, bar) => sum + bar.v, 0);
  const averageVolume = totalVolume / bars.length;
  return averageVolume / BASELINE_DAILY_AVG_VOLUME;
}

/**
 * 봉 배열을 보고 아키타입(surge/plunge/range/reversal)을 판정한다.
 *
 * 전반부·후반부 등락률의 부호가 서로 반대이고 둘 다 충분히 크면 reversal,
 * 그 외에는 하루 전체 등락률 크기로 surge/plunge/range를 가른다.
 *
 * 전반부·후반부 등락률은 둘 다 같은 기준(시가) 대비 퍼센트이므로,
 * 그 차이(overall - firstHalf)의 부호는 "중반→종가" 구간의 실제 등락 부호와 정확히 같다
 * (분모가 동일한 두 백분율의 차는 분자 차이의 부호를 그대로 보존하기 때문).
 */
export function classifyArchetype(bars: readonly Bar[]): Archetype {
  if (bars.length === 0) {
    return 'range';
  }

  const lastIndex = bars.length - 1;
  const midIndex = Math.floor(lastIndex / 2);

  const overallChange = changePercent(bars, lastIndex);
  const firstHalfChange = changePercent(bars, midIndex);
  const secondHalfChange = overallChange - firstHalfChange;

  const isReversal =
    Math.sign(firstHalfChange) !== 0 &&
    Math.sign(secondHalfChange) !== 0 &&
    Math.sign(firstHalfChange) !== Math.sign(secondHalfChange) &&
    Math.abs(firstHalfChange) >= REVERSAL_MIN_SWING_PCT &&
    Math.abs(secondHalfChange) >= REVERSAL_MIN_SWING_PCT;

  if (isReversal) {
    return 'reversal';
  }
  if (overallChange >= TREND_MIN_PCT) {
    return 'surge';
  }
  if (overallChange <= -TREND_MIN_PCT) {
    return 'plunge';
  }
  return 'range';
}
