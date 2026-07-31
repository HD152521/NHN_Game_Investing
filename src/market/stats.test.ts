import { describe, expect, test } from 'vitest';

import { generateChartSet } from './synth';
import { SIGMA_FLOOR_PCT, changePercent, classifyArchetype, sigma30, volumeMultiple } from './stats';
import type { Bar } from './types';
import { BARS_PER_DAY } from './types';

/** 종가만 다른 평평한(무변동) 봉 배열 — sigma30 하한 검증용. */
function flatBars(price: number, count = BARS_PER_DAY): Bar[] {
  return Array.from({ length: count }, (_, t) => ({ t, o: price, h: price, l: price, c: price, v: 1000 }));
}

/** 지정한 종가 배열로 봉을 만든다 (오픈=이전 종가, 고저는 시가·종가와 동일). */
function barsFromCloses(closes: readonly number[]): Bar[] {
  let prevClose = closes[0] ?? 0;
  return closes.map((c, t) => {
    const o = t === 0 ? c : prevClose;
    prevClose = c;
    return { t, o, h: Math.max(o, c), l: Math.min(o, c), c, v: 1000 };
  });
}

describe('changePercent', () => {
  test('시가 대비 등락률을 퍼센트로 반환한다', () => {
    const bars = barsFromCloses([100, 110, 120]);
    expect(changePercent(bars, 2)).toBeCloseTo(20, 5);
  });

  test('범위를 벗어난 인덱스는 배열 끝으로 클램프된다', () => {
    const bars = barsFromCloses([100, 110, 120]);
    expect(changePercent(bars, 99)).toBeCloseTo(20, 5);
    expect(changePercent(bars, -5)).toBeCloseTo(0, 5);
  });

  test('빈 배열이면 0을 반환한다', () => {
    expect(changePercent([], 0)).toBe(0);
  });
});

describe('sigma30', () => {
  test('무변동 봉은 하한값을 반환한다 (0으로 나눗셈 폭발 방지)', () => {
    expect(sigma30(flatBars(50000))).toBe(SIGMA_FLOOR_PCT);
  });

  test('변동이 있으면 하한보다 큰 값을 반환한다', () => {
    const closes = Array.from({ length: BARS_PER_DAY }, (_, t) => 50000 + Math.sin(t) * 500);
    const bars = barsFromCloses(closes);
    expect(sigma30(bars)).toBeGreaterThan(SIGMA_FLOOR_PCT);
  });

  test('짧은 봉 배열(30분 미만)도 하한값으로 안전하게 처리한다', () => {
    expect(sigma30(flatBars(50000, 10))).toBe(SIGMA_FLOOR_PCT);
  });
});

describe('volumeMultiple', () => {
  test('평균 거래량이 기준선과 같으면 1배에 가깝다', () => {
    const bars = flatBars(50000).map((bar) => ({ ...bar, v: 100000 }));
    expect(volumeMultiple(bars)).toBeCloseTo(1, 5);
  });

  test('평균 거래량이 기준선의 2배면 2배를 반환한다', () => {
    const bars = flatBars(50000).map((bar) => ({ ...bar, v: 200000 }));
    expect(volumeMultiple(bars)).toBeCloseTo(2, 5);
  });

  test('빈 배열이면 1을 반환한다 (배수 없음)', () => {
    expect(volumeMultiple([])).toBe(1);
  });
});

describe('classifyArchetype', () => {
  test('generateChartSet이 만든 4종 아키타입을 그대로 되돌려 인식한다', () => {
    const archetypes = ['surge', 'plunge', 'range', 'reversal'] as const;
    for (const archetype of archetypes) {
      const set = generateChartSet(1234, archetype);
      expect(classifyArchetype(set.bars)).toBe(archetype);
    }
  });

  test('상승과 하락이 섞이지 않은 완만한 봉은 range로 분류한다', () => {
    const closes = Array.from({ length: BARS_PER_DAY }, (_, t) => 50000 + Math.sin((t / BARS_PER_DAY) * Math.PI * 4) * 100);
    const bars = barsFromCloses(closes);
    expect(classifyArchetype(bars)).toBe('range');
  });
});
