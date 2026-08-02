/**
 * 전략들이 공유하는 지표 계산 — 전부 **확정된 봉만** 읽는 순수 함수다.
 *
 * 여기 있는 함수 중 어느 것도 인자로 받은 배열의 마지막 원소 뒤를 보지 않는다.
 * (`BotContext.bars`는 이미 `barIndex`까지 잘려 들어오지만, 이 파일이 그 계약을
 * 다시 어기지 않는 것이 블라인드 규칙을 코드 수준에서 지키는 방법이다.)
 */

import type { Bar } from '../../../src/market/index.js';

/** `sigma30`의 기준 윈도(분). `src/market/stats.ts`의 `SIGMA_WINDOW_BARS`와 같은 값. */
const SIGMA_WINDOW_BARS = 30;

/**
 * 길이 `window`짜리 구간 이동의 표준편차(%). 랜덤워크의 `√t` 법칙으로
 * `sigma30`을 다른 구간 길이로 환산한다 — 30봉이 아닌 창으로 본 등락률을
 * z로 바꾸려면 분모도 같은 창 길이로 맞춰야 한다.
 */
export function sigmaForWindow(sigma30Pct: number, window: number): number {
  return sigma30Pct * Math.sqrt(window / SIGMA_WINDOW_BARS);
}

/**
 * 최근 `window`봉의 등락률(%). 봉이 모자라면 있는 만큼만 쓴다.
 * 비교 기준 봉의 종가가 0 이하이면(비정상 입력) 0을 반환한다.
 */
export function changeOverPct(bars: readonly Bar[], window: number): number {
  if (bars.length < 2) {
    return 0;
  }
  const last = bars[bars.length - 1];
  const startIndex = Math.max(0, bars.length - 1 - window);
  const start = bars[startIndex];
  if (!last || !start || start.c <= 0) {
    return 0;
  }
  return ((last.c - start.c) / start.c) * 100;
}

/**
 * 최근 `fast`봉 평균 거래량 ÷ 최근 `slow`봉 평균 거래량.
 * 1보다 크면 거래가 붙고 있다는 뜻이다. 표본이 모자라면 1(중립)을 반환한다.
 */
export function volumeSurgeRatio(bars: readonly Bar[], fast: number, slow: number): number {
  if (bars.length < slow) {
    return 1;
  }
  const fastAvg = averageVolume(bars, fast);
  const slowAvg = averageVolume(bars, slow);
  return slowAvg <= 0 ? 1 : fastAvg / slowAvg;
}

/** 마지막 `count`봉의 평균 거래량. */
function averageVolume(bars: readonly Bar[], count: number): number {
  const start = Math.max(0, bars.length - count);
  let sum = 0;
  let n = 0;
  for (let i = start; i < bars.length; i += 1) {
    const bar = bars[i];
    if (bar) {
      sum += bar.v;
      n += 1;
    }
  }
  return n === 0 ? 0 : sum / n;
}
