import { describe, expect, test } from 'vitest';

import type { Bar } from '../market/types.js';
import {
  barSlotWidth,
  computePriceRange,
  indexToCenterX,
  indexToX,
  priceToY,
} from './scale.js';
import type { HorizontalBand, PriceRange, VerticalBand } from './scale.js';

function bar(overrides: Partial<Bar> = {}): Bar {
  return { t: 0, o: 100, h: 105, l: 95, c: 102, v: 10, ...overrides };
}

const BAND: VerticalBand = { top: 0, bottom: 100 };
const HBAND: HorizontalBand = { left: 0, right: 100 };

describe('computePriceRange', () => {
  test('빈 배열이면 0으로 나누지 않는 비퇴화 범위를 반환한다', () => {
    const range = computePriceRange([]);
    expect(Number.isFinite(range.min)).toBe(true);
    expect(Number.isFinite(range.max)).toBe(true);
    expect(range.max).toBeGreaterThan(range.min);
  });

  test('여러 봉의 고가 최댓값 · 저가 최솟값을 뽑는다', () => {
    const bars = [bar({ h: 110, l: 90 }), bar({ h: 120, l: 80 }), bar({ h: 95, l: 85 })];
    expect(computePriceRange(bars)).toEqual({ min: 80, max: 120 });
  });

  test('봉이 하나뿐이어도 정상 동작한다', () => {
    const bars = [bar({ h: 108, l: 92 })];
    expect(computePriceRange(bars)).toEqual({ min: 92, max: 108 });
  });
});

describe('priceToY — 경계값', () => {
  const range: PriceRange = { min: 100, max: 200 };

  test('최저가는 세로 구간의 아래쪽(큰 y)에 매핑된다', () => {
    const y = priceToY(range.min, range, BAND);
    expect(y).toBeCloseTo(BAND.bottom - (BAND.bottom - BAND.top) * 0.1, 5);
  });

  test('최고가는 세로 구간의 위쪽(작은 y)에 매핑된다', () => {
    const y = priceToY(range.max, range, BAND);
    expect(y).toBeCloseTo(BAND.top + (BAND.bottom - BAND.top) * 0.1, 5);
  });

  test('최저가가 최고가보다 항상 큰 y값을 갖는다', () => {
    const yMin = priceToY(range.min, range, BAND);
    const yMax = priceToY(range.max, range, BAND);
    expect(yMin).toBeGreaterThan(yMax);
  });

  test('paddingRatio를 0으로 주면 정확히 구간 끝에 붙는다', () => {
    expect(priceToY(range.min, range, BAND, 0)).toBeCloseTo(BAND.bottom, 10);
    expect(priceToY(range.max, range, BAND, 0)).toBeCloseTo(BAND.top, 10);
  });

  test('중간 가격은 세로 구간 중앙 부근에 매핑된다', () => {
    const mid = (range.min + range.max) / 2;
    const y = priceToY(mid, range, BAND);
    const expectedMid = (BAND.top + BAND.bottom) / 2;
    expect(y).toBeCloseTo(expectedMid, 5);
  });
});

describe('priceToY — 변동 0(퇴화) 케이스', () => {
  test('min === max 여도 NaN/Infinity가 나오지 않는다', () => {
    const flat: PriceRange = { min: 150, max: 150 };
    const y = priceToY(150, flat, BAND);
    expect(Number.isFinite(y)).toBe(true);
  });

  test('가격이 0인 극단적 케이스도 안전하다', () => {
    const flat: PriceRange = { min: 0, max: 0 };
    const y = priceToY(0, flat, BAND);
    expect(Number.isFinite(y)).toBe(true);
  });

  test('퇴화 구간에서는 세로 중앙 부근에 배치된다', () => {
    const flat: PriceRange = { min: 150, max: 150 };
    const y = priceToY(150, flat, BAND);
    const expectedMid = (BAND.top + BAND.bottom) / 2;
    expect(y).toBeCloseTo(expectedMid, 1);
  });
});

describe('indexToX / indexToCenterX', () => {
  test('첫 봉은 왼쪽 끝에서 시작한다', () => {
    expect(indexToX(0, 10, HBAND)).toBeCloseTo(HBAND.left, 10);
  });

  test('마지막 봉의 오른쪽 끝은 가로 구간의 오른쪽 끝과 같다', () => {
    const totalBars = 10;
    const lastSlotRight = indexToX(totalBars - 1, totalBars, HBAND) + barSlotWidth(totalBars, HBAND);
    expect(lastSlotRight).toBeCloseTo(HBAND.right, 10);
  });

  test('중앙 x는 왼쪽 끝보다 슬롯 폭의 절반만큼 오른쪽에 있다', () => {
    const totalBars = 4;
    const width = barSlotWidth(totalBars, HBAND);
    expect(indexToCenterX(1, totalBars, HBAND)).toBeCloseTo(indexToX(1, totalBars, HBAND) + width / 2, 10);
  });

  test('totalBars가 0이면 슬롯 폭이 0이라 나눗셈이 폭발하지 않는다', () => {
    expect(barSlotWidth(0, HBAND)).toBe(0);
    expect(Number.isFinite(indexToX(0, 0, HBAND))).toBe(true);
  });

  test('totalBars가 음수여도 크래시하지 않는다', () => {
    expect(barSlotWidth(-3, HBAND)).toBe(0);
  });
});
