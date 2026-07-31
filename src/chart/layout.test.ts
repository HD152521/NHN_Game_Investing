import { describe, expect, test } from 'vitest';

import { computeLayout } from './layout.js';

describe('computeLayout', () => {
  test('일반적인 캔버스 크기에서 구간 순서가 위→아래로 유효하다', () => {
    const layout = computeLayout(800, 200);

    expect(layout.candles.top).toBeLessThan(layout.candles.bottom);
    expect(layout.candles.bottom).toBeLessThanOrEqual(layout.volume.top);
    expect(layout.volume.top).toBeLessThan(layout.volume.bottom);
    expect(layout.volume.bottom).toBeLessThanOrEqual(layout.progressY);
    expect(layout.horizontal.left).toBeLessThan(layout.horizontal.right);
  });

  test('아주 작은 높이가 들어와도 음수 구간이 생기지 않는다', () => {
    const layout = computeLayout(100, 10);

    expect(layout.candles.bottom - layout.candles.top).toBeGreaterThanOrEqual(0);
    expect(layout.volume.bottom - layout.volume.top).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(layout.progressY)).toBe(true);
  });

  test('아주 작은 너비가 들어와도 가로 구간이 뒤집히지 않는다', () => {
    const layout = computeLayout(5, 200);
    expect(layout.horizontal.right).toBeGreaterThanOrEqual(layout.horizontal.left);
  });
});
