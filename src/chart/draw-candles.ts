/**
 * 캔들스틱 · 거래량 바 그리기.
 *
 * 여기서는 "받은 봉을 전부 그린다." 미래 봉을 숨기는 블라인드 규칙은 호출부
 * (`chart.ts`)가 봉 배열을 현재 인덱스까지 잘라 넘기는 책임으로 처리한다.
 */

import type { Palette } from '../design/index.js';
import type { Bar } from '../market/types.js';
import { barSlotWidth, indexToCenterX, priceToY } from './scale.js';
import type { HorizontalBand, PriceRange, VerticalBand } from './scale.js';
import type { ChartCtx } from './surface.js';
import { candleColor, rgba } from './style.js';

/** 슬롯 폭 대비 캔들/거래량 바 몸통 폭 비율. */
const BODY_WIDTH_RATIO = 0.6;
/** 몸통 최소 폭·높이(px) — 슬롯이 아주 좁아져도(초반 봉) 완전히 안 보이지 않도록. */
const MIN_BODY_SIZE = 1;
const WICK_LINE_WIDTH = 1;
/** 거래량 바 알파(투명도) — 캔들보다 은은하게. */
const VOLUME_ALPHA = 0.5;

export interface CandleDrawOptions {
  readonly bars: readonly Bar[];
  readonly range: PriceRange;
  readonly horizontal: HorizontalBand;
  readonly vertical: VerticalBand;
  /** 하루 전체 봉 개수 — x축 슬롯 폭 계산 기준(항상 고정이어야 진행 중 리스케일이 없다). */
  readonly totalBars: number;
  readonly palette: Palette;
}

/** 캔들스틱 몸통 + 위아래 꼬리를 그린다. */
export function drawCandles(ctx: ChartCtx, opts: CandleDrawOptions): void {
  const { bars, range, horizontal, vertical, totalBars, palette } = opts;
  const slotWidth = barSlotWidth(totalBars, horizontal);
  const bodyWidth = Math.max(MIN_BODY_SIZE, slotWidth * BODY_WIDTH_RATIO);

  bars.forEach((bar, index) => {
    const xCenter = indexToCenterX(index, totalBars, horizontal);
    const color = candleColor(bar, palette);

    const yHigh = priceToY(bar.h, range, vertical);
    const yLow = priceToY(bar.l, range, vertical);
    ctx.strokeStyle = color;
    ctx.lineWidth = WICK_LINE_WIDTH;
    ctx.beginPath();
    ctx.moveTo(xCenter, yHigh);
    ctx.lineTo(xCenter, yLow);
    ctx.stroke();

    const yOpen = priceToY(bar.o, range, vertical);
    const yClose = priceToY(bar.c, range, vertical);
    const bodyTop = Math.min(yOpen, yClose);
    const bodyHeight = Math.max(MIN_BODY_SIZE, Math.abs(yClose - yOpen));
    ctx.fillStyle = color;
    ctx.fillRect(xCenter - bodyWidth / 2, bodyTop, bodyWidth, bodyHeight);
  });
}

/**
 * 거래량 바를 그린다. 표시 구간의 최대 거래량이 0 이하이면(픽스처가 전부 0인 경우 등)
 * 나눗셈을 피해 아무것도 그리지 않는다 — 거래량 0은 곧 "표시할 막대 없음"과 같다.
 */
export function drawVolumeBars(ctx: ChartCtx, opts: CandleDrawOptions): void {
  const { bars, horizontal, vertical, totalBars, palette } = opts;
  const maxVolume = bars.reduce((max, bar) => Math.max(max, bar.v), 0);
  if (maxVolume <= 0) return;

  const slotWidth = barSlotWidth(totalBars, horizontal);
  const barWidth = Math.max(MIN_BODY_SIZE, slotWidth * BODY_WIDTH_RATIO);
  const bandHeight = vertical.bottom - vertical.top;

  bars.forEach((bar, index) => {
    if (bar.v <= 0) return;
    const xCenter = indexToCenterX(index, totalBars, horizontal);
    const barHeight = Math.max(MIN_BODY_SIZE, (bar.v / maxVolume) * bandHeight);
    ctx.fillStyle = rgba(candleColor(bar, palette), VOLUME_ALPHA);
    ctx.fillRect(xCenter - barWidth / 2, vertical.bottom - barHeight, barWidth, barHeight);
  });
}
