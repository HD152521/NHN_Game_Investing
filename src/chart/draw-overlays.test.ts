import { describe, expect, test } from 'vitest';

import { createTheme } from '../design/index.js';
import {
  drawBaseline,
  drawEntryMarker,
  drawPriceLine,
  drawProgressBar,
} from './draw-overlays.js';
import type { HorizontalBand, PriceRange, VerticalBand } from './scale.js';
import { createFakeChartCtx } from './fake-ctx.js';

const { palette } = createTheme();

const RANGE: PriceRange = { min: 100, max: 200 };
const HORIZONTAL: HorizontalBand = { left: 0, right: 100 };
const VERTICAL: VerticalBand = { top: 0, bottom: 100 };

describe('drawBaseline', () => {
  test('MUTED 색 점선 하나를 가로 전체에 그린다', () => {
    const ctx = createFakeChartCtx();
    drawBaseline(ctx, { openPrice: 150, range: RANGE, horizontal: HORIZONTAL, vertical: VERTICAL, palette });

    const strokeCall = ctx.calls.find((c) => c.kind === 'stroke');
    expect(strokeCall?.kind === 'stroke' ? strokeCall.strokeStyle : undefined).toBe(palette.MUTED);
    expect(strokeCall?.kind === 'stroke' ? strokeCall.dash.length : 0).toBeGreaterThan(0);

    const moveTo = ctx.calls.find((c) => c.kind === 'moveTo');
    const lineTo = ctx.calls.find((c) => c.kind === 'lineTo');
    expect(moveTo?.kind === 'moveTo' ? moveTo.x : undefined).toBe(HORIZONTAL.left);
    expect(lineTo?.kind === 'lineTo' ? lineTo.x : undefined).toBe(HORIZONTAL.right);
  });
});

describe('drawPriceLine', () => {
  test('시가보다 현재가가 높으면 UP_ALLY로 그린다', () => {
    const ctx = createFakeChartCtx();
    drawPriceLine(ctx, {
      price: 180,
      openPrice: 150,
      range: RANGE,
      horizontal: HORIZONTAL,
      vertical: VERTICAL,
      palette,
    });

    const strokeCall = ctx.calls.find((c) => c.kind === 'stroke');
    expect(strokeCall?.kind === 'stroke' ? strokeCall.strokeStyle : undefined).toBe(palette.UP_ALLY);
  });

  test('시가보다 현재가가 낮으면 ENEMY_DOWN으로 그린다', () => {
    const ctx = createFakeChartCtx();
    drawPriceLine(ctx, {
      price: 120,
      openPrice: 150,
      range: RANGE,
      horizontal: HORIZONTAL,
      vertical: VERTICAL,
      palette,
    });

    const strokeCall = ctx.calls.find((c) => c.kind === 'stroke');
    expect(strokeCall?.kind === 'stroke' ? strokeCall.strokeStyle : undefined).toBe(palette.ENEMY_DOWN);
  });

  test('등락률 라벨 텍스트가 부호와 % 기호를 포함한다', () => {
    const ctx = createFakeChartCtx();
    drawPriceLine(ctx, {
      price: 165,
      openPrice: 150,
      range: RANGE,
      horizontal: HORIZONTAL,
      vertical: VERTICAL,
      palette,
    });

    const label = ctx.calls.find((c) => c.kind === 'fillText');
    expect(label?.kind === 'fillText' ? label.text : undefined).toBe('+10.00%');
  });
});

describe('drawProgressBar', () => {
  test('진행률이 0~1 범위를 벗어나도 점(dot)이 구간 안에 고정된다', () => {
    const ctx = createFakeChartCtx();
    drawProgressBar(ctx, { progress: 1.5, horizontal: HORIZONTAL, y: 50, palette });

    const dot = ctx.calls.find((c) => c.kind === 'arc');
    expect(dot?.kind === 'arc' ? dot.x : undefined).toBe(HORIZONTAL.right);
  });

  test('진행률 0은 왼쪽 끝에, 1은 오른쪽 끝에 점을 그린다', () => {
    const start = createFakeChartCtx();
    drawProgressBar(start, { progress: 0, horizontal: HORIZONTAL, y: 50, palette });
    const startDot = start.calls.find((c) => c.kind === 'arc');
    expect(startDot?.kind === 'arc' ? startDot.x : undefined).toBe(HORIZONTAL.left);

    const end = createFakeChartCtx();
    drawProgressBar(end, { progress: 1, horizontal: HORIZONTAL, y: 50, palette });
    const endDot = end.calls.find((c) => c.kind === 'arc');
    expect(endDot?.kind === 'arc' ? endDot.x : undefined).toBe(HORIZONTAL.right);
  });

  test('세션 시작·종료 라벨 텍스트를 그린다', () => {
    const ctx = createFakeChartCtx();
    drawProgressBar(ctx, { progress: 0.5, horizontal: HORIZONTAL, y: 50, palette });

    const texts = ctx.calls.filter((c) => c.kind === 'fillText').map((c) => (c.kind === 'fillText' ? c.text : ''));
    expect(texts).toContain('09:00');
    expect(texts).toContain('15:30');
  });
});

describe('drawEntryMarker', () => {
  test('AUM 색으로 세로 점선과 점을 그린다', () => {
    const ctx = createFakeChartCtx();
    drawEntryMarker(ctx, {
      barIndex: 5,
      price: 150,
      range: RANGE,
      horizontal: HORIZONTAL,
      vertical: VERTICAL,
      totalBars: 10,
      palette,
    });

    const strokeCall = ctx.calls.find((c) => c.kind === 'stroke');
    expect(strokeCall?.kind === 'stroke' ? strokeCall.strokeStyle : undefined).toBe(palette.AUM);

    const dot = ctx.calls.find((c) => c.kind === 'arc');
    expect(dot).toBeDefined();
    const fillCall = ctx.calls.find((c) => c.kind === 'fill');
    expect(fillCall?.kind === 'fill' ? fillCall.fillStyle : undefined).toBe(palette.AUM);
  });
});
