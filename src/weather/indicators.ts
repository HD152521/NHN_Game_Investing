/**
 * 날씨 판정이 쓰는 차트 지표.
 *
 * `src/market/stats.ts`의 `changePercent`는 **시가 대비 하루 전체** 등락률이라 날씨에
 * 그대로 쓸 수 없다 — 오전에 폭락한 뒤 오후 내내 횡보해도 계속 폭우가 쏟아진다.
 * 날씨는 "지금 무슨 일이 벌어지고 있는가"를 표시해야 하므로 **최근 구간**을 본다.
 */

import type { Bar } from '../market/types.js';

/**
 * 최근 등락률을 재는 구간 길이(봉 = 분).
 *
 * 30봉(σ30 윈도)이면 반응이 굼떠 급락 순간을 놓치고, 3봉이면 잡음에 날씨가 깜빡인다.
 * 10분은 웨이브 1회(≈30초 재생) 안에서 여러 번 갱신되면서도 노이즈에 흔들리지 않는 폭이다.
 */
export const RECENT_WINDOW_BARS = 10;

/** 인덱스를 배열 범위로 자른다. */
function clampIndex(index: number, length: number): number {
  if (index < 0) return 0;
  if (index > length - 1) return length - 1;
  return index;
}

/**
 * `barIndex` 시점 기준 최근 {@link RECENT_WINDOW_BARS}봉 등락률(%).
 * 윈도가 확보되지 않은 장 초반에는 첫 봉을 기준으로 삼는다.
 */
export function recentChangePct(
  bars: readonly Bar[],
  barIndex: number,
  windowBars: number = RECENT_WINDOW_BARS,
): number {
  if (bars.length === 0) return 0;

  const endIndex = clampIndex(barIndex, bars.length);
  const startIndex = clampIndex(endIndex - Math.max(1, windowBars), bars.length);

  const start = bars[startIndex];
  const end = bars[endIndex];
  if (!start || !end || start.c === 0) return 0;

  return ((end.c - start.c) / start.c) * 100;
}
