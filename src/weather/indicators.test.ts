import { describe, expect, test } from 'vitest';

import type { Bar } from '../market/types.js';
import { RECENT_WINDOW_BARS, recentChangePct } from './indicators.js';

function bars(closes: readonly number[]): readonly Bar[] {
  return closes.map((c, t) => ({ t, o: c, h: c, l: c, c, v: 1 }));
}

describe('recentChangePct — 최근 구간 등락률', () => {
  test('빈 배열은 0이다', () => {
    expect(recentChangePct([], 0)).toBe(0);
  });

  test('윈도 시작 종가 대비 현재 종가의 등락률이다', () => {
    const series = bars(Array.from({ length: 40 }, (_, i) => 100 + i));
    const index = 30;
    const start = 100 + (index - RECENT_WINDOW_BARS);
    const expected = ((100 + index - start) / start) * 100;
    expect(recentChangePct(series, index)).toBeCloseTo(expected, 10);
  });

  test('윈도보다 이른 시점에서는 첫 봉을 기준으로 삼는다', () => {
    const series = bars([100, 110]);
    expect(recentChangePct(series, 1)).toBeCloseTo(10, 10);
  });

  test('인덱스는 배열 범위로 잘린다', () => {
    const series = bars([100, 90]);
    expect(recentChangePct(series, 999)).toBeCloseTo(-10, 10);
    expect(recentChangePct(series, -5)).toBeCloseTo(0, 10);
  });

  test('하락은 음수, 상승은 양수다', () => {
    expect(recentChangePct(bars([100, 50]), 1)).toBeLessThan(0);
    expect(recentChangePct(bars([100, 150]), 1)).toBeGreaterThan(0);
  });
});
