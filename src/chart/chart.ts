/**
 * 차트 렌더러 진입점. `drawChart` 하나가 배경 · 거래량 · 기준선 · 캔들 · 진입 마커 ·
 * 현재가 라인 · 진행 바를 순서대로 그린다.
 *
 * 이 파일은 "무엇을 어떤 순서로 그리는가"만 안다. 좌표 계산(`scale.ts`,`layout.ts`)과
 * 개별 도형 그리기(`draw-candles.ts`,`draw-overlays.ts`)는 전부 위임한다.
 */

import type { Palette } from '../design/index.js';
import type { Bar, ReplayState } from '../market/types.js';
import { drawCandles, drawVolumeBars } from './draw-candles.js';
import type { CandleDrawOptions } from './draw-candles.js';
import { drawChartFrame } from './draw-frame.js';
import { drawBaseline, drawEntryMarker, drawPriceLine, drawProgressBar } from './draw-overlays.js';
import { computeLayout } from './layout.js';
import { computePriceRange } from './scale.js';
import type { ChartCtx } from './surface.js';

/** 진입가 표시용 데이터 — 세로 점선 + 점으로 그려진다. */
export interface EntryMarker {
  readonly barIndex: number;
  readonly price: number;
}

export interface DrawChartOptions {
  /** 스테이지에 배정된 전체 봉. 블라인드 규칙상 `state.barIndex` 이후는 그리지 않는다. */
  readonly bars: readonly Bar[];
  /** 리플레이가 매 프레임 내보내는 현재 상태. */
  readonly state: ReplayState;
  readonly palette: Palette;
  readonly width: number;
  readonly height: number;
  /** 선택: 진입가를 세로 점선으로 표시. */
  readonly entryMarker?: EntryMarker;
}

/** `barIndex`를 `[0, length-1]`로 자른다. 봉이 없으면 -1(그릴 것 없음)을 반환한다. */
function clampBarIndex(barIndex: number, length: number): number {
  if (length <= 0) return -1;
  return Math.min(Math.max(barIndex, 0), length - 1);
}

function drawBackground(ctx: ChartCtx, palette: Palette, width: number, height: number): void {
  ctx.fillStyle = palette.BG_0;
  ctx.fillRect(0, 0, width, height);
}

/**
 * 차트 한 프레임을 그린다.
 *
 * 블라인드 규칙(FR-4)의 핵심 제약: `bars`에 미래 봉이 들어 있어도 `state.barIndex`
 * 이후는 절대 그리지 않는다. 이 슬라이스가 이 함수의 가장 중요한 책임이다.
 */
export function drawChart(ctx: ChartCtx, opts: DrawChartOptions): void {
  const { bars, state, palette, width, height } = opts;
  drawBackground(ctx, palette, width, height);
  /*
   * 패널 프레임은 **내용보다 먼저** 깐다. 하단 진행 바가 프레임 아래띠와 같은 자리를 쓰기
   * 때문이다 (근거는 `draw-frame.ts` 머리주석). 9슬라이스라 가운데는 건드리지 않으므로
   * 캔들 영역의 배경색은 여기서 칠한 BG_0 그대로다.
   */
  drawChartFrame(ctx, { palette, width, height });

  if (bars.length === 0) return;

  const visibleEnd = clampBarIndex(state.barIndex, bars.length);
  if (visibleEnd < 0) return;
  const visibleBars = bars.slice(0, visibleEnd + 1);

  const layout = computeLayout(width, height);
  const range = computePriceRange(visibleBars);
  const totalBars = bars.length;
  const firstBar = bars[0];
  const openPrice = firstBar !== undefined ? firstBar.o : state.price;

  const candleOpts: CandleDrawOptions = {
    bars: visibleBars,
    range,
    horizontal: layout.horizontal,
    vertical: layout.candles,
    totalBars,
    palette,
  };

  drawVolumeBars(ctx, { ...candleOpts, vertical: layout.volume });
  drawBaseline(ctx, {
    openPrice,
    range,
    horizontal: layout.horizontal,
    vertical: layout.candles,
    palette,
  });
  drawCandles(ctx, candleOpts);

  if (opts.entryMarker) {
    drawEntryMarker(ctx, {
      barIndex: opts.entryMarker.barIndex,
      price: opts.entryMarker.price,
      range,
      horizontal: layout.horizontal,
      vertical: layout.candles,
      totalBars,
      palette,
    });
  }

  drawPriceLine(ctx, {
    price: state.price,
    openPrice,
    range,
    horizontal: layout.horizontal,
    vertical: layout.candles,
    palette,
  });

  drawProgressBar(ctx, {
    progress: state.progress,
    horizontal: layout.horizontal,
    y: layout.progressY,
    palette,
  });
}
