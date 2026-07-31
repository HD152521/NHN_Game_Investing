/**
 * 기준선(시가 0%) · 현재가 라인 · 진행 바 · 진입 마커 그리기.
 *
 * 캔들과 달리 전부 "한 번만" 그리는 오버레이라서 각자 독립 함수로 뒀다.
 */

import type { Palette } from '../design/index.js';
import { indexToCenterX, priceToY } from './scale.js';
import type { HorizontalBand, PriceRange, VerticalBand } from './scale.js';
import type { ChartCtx } from './surface.js';
import { formatPercent, percentChange } from './style.js';

const NO_DASH: readonly number[] = [];
const SOLID_LINE_WIDTH = 1.5;
const BASELINE_DASH: readonly number[] = [4, 4];
const BASELINE_LINE_WIDTH = 1;
const LABEL_FONT = '12px monospace';
const LABEL_OFFSET_Y = 4;

export interface BaselineDrawOptions {
  /** 시가(오늘 0% 기준가). */
  readonly openPrice: number;
  readonly range: PriceRange;
  readonly horizontal: HorizontalBand;
  readonly vertical: VerticalBand;
  readonly palette: Palette;
}

/** 시가 기준 0% 라인을 MUTED 톤 점선으로 그린다. */
export function drawBaseline(ctx: ChartCtx, opts: BaselineDrawOptions): void {
  const y = priceToY(opts.openPrice, opts.range, opts.vertical);

  ctx.save();
  ctx.strokeStyle = opts.palette.MUTED;
  ctx.lineWidth = BASELINE_LINE_WIDTH;
  ctx.setLineDash([...BASELINE_DASH]);
  ctx.beginPath();
  ctx.moveTo(opts.horizontal.left, y);
  ctx.lineTo(opts.horizontal.right, y);
  ctx.stroke();
  ctx.restore();
}

export interface PriceLineDrawOptions {
  /** 봉 사이를 보간한 현재가. */
  readonly price: number;
  readonly openPrice: number;
  readonly range: PriceRange;
  readonly horizontal: HorizontalBand;
  readonly vertical: VerticalBand;
  readonly palette: Palette;
}

/**
 * 현재가 수평선 + 시가 대비 등락률 라벨.
 * 상승이면 UP_ALLY, 하락(또는 보합)이면 ENEMY_DOWN — 캔들과 같은 방향 색 규칙.
 */
export function drawPriceLine(ctx: ChartCtx, opts: PriceLineDrawOptions): void {
  const y = priceToY(opts.price, opts.range, opts.vertical);
  const pct = percentChange(opts.price, opts.openPrice);
  const color = pct >= 0 ? opts.palette.UP_ALLY : opts.palette.ENEMY_DOWN;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = SOLID_LINE_WIDTH;
  ctx.setLineDash([...NO_DASH]);
  ctx.beginPath();
  ctx.moveTo(opts.horizontal.left, y);
  ctx.lineTo(opts.horizontal.right, y);
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.font = LABEL_FONT;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(formatPercent(pct), opts.horizontal.right, y - LABEL_OFFSET_Y);
  ctx.restore();
}

export interface ProgressBarDrawOptions {
  /** 0~1 진행률. */
  readonly progress: number;
  readonly horizontal: HorizontalBand;
  /** 진행 바 중심선 y 픽셀(`layout.ts`의 `progressY`). */
  readonly y: number;
  readonly palette: Palette;
}

const PROGRESS_DOT_RADIUS = 3;
const PROGRESS_LABEL_FONT = '10px monospace';
const SESSION_START_LABEL = '09:00';
const SESSION_END_LABEL = '15:30';
const FULL_CIRCLE_START = 0;
const FULL_CIRCLE_END = Math.PI * 2;

/** `09:00 ─●──── 15:30` 형태의 장중 진행 표시. */
export function drawProgressBar(ctx: ChartCtx, opts: ProgressBarDrawOptions): void {
  const clamped = Math.min(1, Math.max(0, opts.progress));
  const { left, right } = opts.horizontal;
  const dotX = left + (right - left) * clamped;

  ctx.save();
  ctx.strokeStyle = opts.palette.MUTED;
  ctx.lineWidth = SOLID_LINE_WIDTH;
  ctx.setLineDash([...NO_DASH]);
  ctx.beginPath();
  ctx.moveTo(left, opts.y);
  ctx.lineTo(right, opts.y);
  ctx.stroke();

  ctx.fillStyle = opts.palette.GOLD;
  ctx.beginPath();
  ctx.arc(dotX, opts.y, PROGRESS_DOT_RADIUS, FULL_CIRCLE_START, FULL_CIRCLE_END);
  ctx.fill();

  ctx.fillStyle = opts.palette.MUTED;
  ctx.font = PROGRESS_LABEL_FONT;
  ctx.textBaseline = 'alphabetic';
  const labelY = opts.y - PROGRESS_DOT_RADIUS - LABEL_OFFSET_Y;
  ctx.textAlign = 'left';
  ctx.fillText(SESSION_START_LABEL, left, labelY);
  ctx.textAlign = 'right';
  ctx.fillText(SESSION_END_LABEL, right, labelY);
  ctx.restore();
}

export interface EntryMarkerDrawOptions {
  readonly barIndex: number;
  readonly price: number;
  readonly range: PriceRange;
  readonly horizontal: HorizontalBand;
  readonly vertical: VerticalBand;
  readonly totalBars: number;
  readonly palette: Palette;
}

const ENTRY_MARKER_RADIUS = 3;
const ENTRY_MARKER_DASH: readonly number[] = [2, 3];
const ENTRY_MARKER_LINE_WIDTH = 1;

/** 진입가 지점을 세로 점선 + 점(dot)으로 표시한다. AUM 토큰으로 방향 색과 구분. */
export function drawEntryMarker(ctx: ChartCtx, opts: EntryMarkerDrawOptions): void {
  const x = indexToCenterX(opts.barIndex, opts.totalBars, opts.horizontal);
  const y = priceToY(opts.price, opts.range, opts.vertical);

  ctx.save();
  ctx.strokeStyle = opts.palette.AUM;
  ctx.lineWidth = ENTRY_MARKER_LINE_WIDTH;
  ctx.setLineDash([...ENTRY_MARKER_DASH]);
  ctx.beginPath();
  ctx.moveTo(x, opts.vertical.bottom);
  ctx.lineTo(x, y);
  ctx.stroke();

  ctx.setLineDash([...NO_DASH]);
  ctx.fillStyle = opts.palette.AUM;
  ctx.beginPath();
  ctx.arc(x, y, ENTRY_MARKER_RADIUS, FULL_CIRCLE_START, FULL_CIRCLE_END);
  ctx.fill();
  ctx.restore();
}
