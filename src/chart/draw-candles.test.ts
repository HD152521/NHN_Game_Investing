import { describe, expect, test } from 'vitest';

import { createTheme } from '../design/index.js';
import type { Bar } from '../market/types.js';
import { drawCandles, drawVolumeBars } from './draw-candles.js';
import type { CandleDrawOptions } from './draw-candles.js';
import { computePriceRange } from './scale.js';
import type { HorizontalBand, VerticalBand } from './scale.js';
import { createFakeChartCtx } from './fake-ctx.js';

const { palette } = createTheme();

function bar(overrides: Partial<Bar> = {}): Bar {
  return { t: 0, o: 100, h: 105, l: 95, c: 102, v: 10, ...overrides };
}

const HORIZONTAL: HorizontalBand = { left: 0, right: 100 };
const VERTICAL: VerticalBand = { top: 0, bottom: 100 };

function baseOptions(bars: readonly Bar[]): CandleDrawOptions {
  return {
    bars,
    range: computePriceRange(bars),
    horizontal: HORIZONTAL,
    vertical: VERTICAL,
    totalBars: bars.length,
    palette,
  };
}

function fillRectFillStyles(calls: ReturnType<typeof createFakeChartCtx>['calls']): string[] {
  return calls.filter((c) => c.kind === 'fillRect').map((c) => (c.kind === 'fillRect' ? c.fillStyle : ''));
}

describe('drawCandles', () => {
  test('빈 배열이어도 크래시하지 않는다', () => {
    const ctx = createFakeChartCtx();
    expect(() => drawCandles(ctx, baseOptions([]))).not.toThrow();
    expect(ctx.calls.length).toBe(0);
  });

  test('상승봉(c >= o)은 UP_ALLY, 하락봉(c < o)은 ENEMY_DOWN 색으로 그려진다', () => {
    const ctx = createFakeChartCtx();
    const upBar = bar({ o: 100, c: 105 });
    const downBar = bar({ o: 105, c: 100 });

    drawCandles(ctx, baseOptions([upBar, downBar]));

    const fillStyles = fillRectFillStyles(ctx.calls);
    expect(fillStyles).toContain(palette.UP_ALLY);
    expect(fillStyles).toContain(palette.ENEMY_DOWN);
  });

  test('봉 개수만큼 몸통(fillRect)을 그린다', () => {
    const ctx = createFakeChartCtx();
    const bars = [bar(), bar({ o: 101 }), bar({ o: 99 })];

    drawCandles(ctx, baseOptions(bars));

    expect(ctx.calls.filter((c) => c.kind === 'fillRect').length).toBe(bars.length);
  });

  test('봉 개수만큼 꼬리(stroke)를 그린다', () => {
    const ctx = createFakeChartCtx();
    const bars = [bar(), bar(), bar()];

    drawCandles(ctx, baseOptions(bars));

    expect(ctx.calls.filter((c) => c.kind === 'stroke').length).toBe(bars.length);
  });
});

describe('drawVolumeBars', () => {
  test('거래량이 전부 0이면 아무것도 그리지 않는다(0으로 나누기 방지)', () => {
    const ctx = createFakeChartCtx();
    const bars = [bar({ v: 0 }), bar({ v: 0 })];

    expect(() => drawVolumeBars(ctx, baseOptions(bars))).not.toThrow();
    expect(ctx.calls.length).toBe(0);
  });

  test('거래량이 있는 봉만큼 막대를 그린다', () => {
    const ctx = createFakeChartCtx();
    const bars = [bar({ v: 5 }), bar({ v: 0 }), bar({ v: 20 })];

    drawVolumeBars(ctx, baseOptions(bars));

    expect(ctx.calls.filter((c) => c.kind === 'fillRect').length).toBe(2);
  });

  test('빈 배열이어도 크래시하지 않는다', () => {
    const ctx = createFakeChartCtx();
    expect(() => drawVolumeBars(ctx, baseOptions([]))).not.toThrow();
  });
});
