import { describe, expect, test } from 'vitest';

import { createTheme } from '../design/index.js';
import type { Bar, ReplayState } from '../market/types.js';
import { drawChart } from './chart.js';
import { createFakeChartCtx } from './fake-ctx.js';

const { palette } = createTheme();

const WIDTH = 400;
const HEIGHT = 100;

function bar(t: number, overrides: Partial<Bar> = {}): Bar {
  // 거래량은 0으로 둬서(v:0) fillRect 호출을 캔들 몸통만으로 좁혀 셀 수 있게 한다.
  return { t, o: 100 + t, h: 105 + t, l: 95 + t, c: 102 + t, v: 0, ...overrides };
}

function state(overrides: Partial<ReplayState> = {}): ReplayState {
  return { elapsedMs: 0, barIndex: 0, price: 100, progress: 0, finished: false, ...overrides };
}

function candleFillRects(ctx: ReturnType<typeof createFakeChartCtx>) {
  return ctx.calls.filter(
    (c) => c.kind === 'fillRect' && (c.fillStyle === palette.UP_ALLY || c.fillStyle === palette.ENEMY_DOWN),
  );
}

describe('drawChart — 블라인드 규칙 (미래 봉 은닉)', () => {
  test('barIndex 이후의 봉은 그려지지 않는다', () => {
    const bars = Array.from({ length: 10 }, (_, i) => bar(i));
    const ctx = createFakeChartCtx();

    drawChart(ctx, { bars, state: state({ barIndex: 3 }), palette, width: WIDTH, height: HEIGHT });

    // barIndex=3 이면 0..3 인덱스, 즉 4개 봉만 보여야 한다.
    expect(candleFillRects(ctx).length).toBe(4);
  });

  test('barIndex가 커지면 더 많은 봉이 그려진다(전체 봉 개수를 넘지 않는 한)', () => {
    const bars = Array.from({ length: 10 }, (_, i) => bar(i));

    const early = createFakeChartCtx();
    drawChart(early, { bars, state: state({ barIndex: 1 }), palette, width: WIDTH, height: HEIGHT });

    const later = createFakeChartCtx();
    drawChart(later, { bars, state: state({ barIndex: 8 }), palette, width: WIDTH, height: HEIGHT });

    expect(candleFillRects(later).length).toBeGreaterThan(candleFillRects(early).length);
  });

  test('barIndex가 전체 봉 개수를 넘어도(리플레이 종료 후) 딱 전체 개수만 그린다', () => {
    const bars = Array.from({ length: 5 }, (_, i) => bar(i));
    const ctx = createFakeChartCtx();

    drawChart(ctx, { bars, state: state({ barIndex: 999 }), palette, width: WIDTH, height: HEIGHT });

    expect(candleFillRects(ctx).length).toBe(bars.length);
  });
});

describe('drawChart — 방향 색', () => {
  test('상승봉과 하락봉이 서로 다른 색으로 그려진다', () => {
    const bars = [bar(0, { o: 100, c: 105 }), bar(1, { o: 105, c: 100 })];
    const ctx = createFakeChartCtx();

    drawChart(ctx, { bars, state: state({ barIndex: 1 }), palette, width: WIDTH, height: HEIGHT });

    const styles = candleFillRects(ctx).map((c) => (c.kind === 'fillRect' ? c.fillStyle : ''));
    expect(styles).toContain(palette.UP_ALLY);
    expect(styles).toContain(palette.ENEMY_DOWN);
  });
});

describe('drawChart — 엣지 케이스', () => {
  test('빈 배열이어도 크래시하지 않고 배경만 그린다', () => {
    const ctx = createFakeChartCtx();

    expect(() =>
      drawChart(ctx, { bars: [], state: state(), palette, width: WIDTH, height: HEIGHT }),
    ).not.toThrow();

    expect(candleFillRects(ctx).length).toBe(0);
    expect(ctx.calls.some((c) => c.kind === 'fillRect' && c.fillStyle === palette.BG_0)).toBe(true);
  });

  test('가격 변동이 0(전부 동일)이어도 크래시하지 않는다', () => {
    const flatBars = Array.from({ length: 5 }, (_, i) => bar(i, { o: 100, h: 100, l: 100, c: 100 }));
    const ctx = createFakeChartCtx();

    expect(() =>
      drawChart(ctx, {
        bars: flatBars,
        state: state({ barIndex: 4, price: 100 }),
        palette,
        width: WIDTH,
        height: HEIGHT,
      }),
    ).not.toThrow();

    expect(candleFillRects(ctx).length).toBe(5);
  });

  test('진입 마커를 넘기면 AUM 색 stroke가 추가된다', () => {
    const bars = Array.from({ length: 5 }, (_, i) => bar(i));
    const ctx = createFakeChartCtx();

    drawChart(ctx, {
      bars,
      state: state({ barIndex: 4 }),
      palette,
      width: WIDTH,
      height: HEIGHT,
      entryMarker: { barIndex: 2, price: 101 },
    });

    const strokeStyles = ctx.calls
      .filter((c) => c.kind === 'stroke')
      .map((c) => (c.kind === 'stroke' ? c.strokeStyle : ''));
    expect(strokeStyles).toContain(palette.AUM);
  });

  test('매우 작은 캔버스 크기에서도 크래시하지 않는다', () => {
    const bars = [bar(0)];
    const ctx = createFakeChartCtx();

    expect(() =>
      drawChart(ctx, { bars, state: state(), palette, width: 1, height: 1 }),
    ).not.toThrow();
  });
});
