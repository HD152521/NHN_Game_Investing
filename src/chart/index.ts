/**
 * `src/chart` 공개 API.
 *
 * 사용 예:
 * ```ts
 * import { drawChart } from './chart';
 *
 * drawChart(ctx, { bars: set.bars, state: replay.tick(now), palette, width, height });
 * ```
 */

export { drawChart } from './chart.js';
export type { DrawChartOptions, EntryMarker } from './chart.js';

export type { ChartCtx } from './surface.js';

export {
  DEFAULT_PRICE_PADDING_RATIO,
  barSlotWidth,
  computePriceRange,
  indexToCenterX,
  indexToX,
  priceToY,
} from './scale.js';
export type { HorizontalBand, PriceRange, VerticalBand } from './scale.js';

export {
  CHART_FRAME_HEIGHT,
  CHART_FRAME_SCALE,
  CHART_FRAME_WIDTH,
  FRAME_BOTTOM,
  FRAME_LEFT,
  FRAME_RIGHT,
  FRAME_TOP,
  drawChartFrame,
} from './draw-frame.js';
export type { ChartFrameOptions } from './draw-frame.js';

export { computeLayout } from './layout.js';
export type { ChartLayout } from './layout.js';

export { candleColor, formatPercent, percentChange, rgba } from './style.js';

export { drawCandles, drawVolumeBars } from './draw-candles.js';
export type { CandleDrawOptions } from './draw-candles.js';

export { drawBaseline, drawEntryMarker, drawPriceLine, drawProgressBar } from './draw-overlays.js';
export type {
  BaselineDrawOptions,
  EntryMarkerDrawOptions,
  PriceLineDrawOptions,
  ProgressBarDrawOptions,
} from './draw-overlays.js';
