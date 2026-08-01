/**
 * 예측 버튼 2종 — `tf-ui-btn` (40×34) 을 위/아래로 갈라 매매 패널 버튼 배경에 얹는다.
 *
 * ★ 칸 좌표는 원본 `uiButtons()` 코드에서 읽었다.
 *   - 상승판: `poly[(2,2),(37,2),(39,14),(4,14)]` = `r`(UP_ALLY) 사다리꼴
 *     + 흰 삼각 `poly[(16,5),(24,11),(8,11)]` (위 방향)
 *   - 하락판: `poly[(2,19),(37,19),(39,31),(4,31)]` = `b`(ENEMY_DOWN) 사다리꼴
 *     + 흰 삼각 `poly[(16,28),(8,22),(24,22)]` (아래 방향)
 *   두 판 사이 빈 줄이 y=15~18 이므로 **정확히 절반(17)** 에서 자르면 서로를 침범하지 않는다.
 *
 * ★ 색약 대응 (FR-13.1 / `design/encoding.ts`)
 *   버튼의 방향 정보는 **세 겹**으로 실린다: 색(빨강/파랑) · 스프라이트의 흰 삼각형 ·
 *   라벨 텍스트의 `▲`/`▼`. 스프라이트는 **배경 레이어**로만 깔리고 라벨은 그 위에 남으므로
 *   기호가 가려지지 않는다 (`trade-panel.css` 의 `.trade-panel__btn-label` 이 위 레이어).
 *   색을 전혀 못 봐도 삼각형 두 개(스프라이트·텍스트)가 방향을 말한다.
 */

import { uiButtons } from '../sprites';
import type { SpriteGrid } from '../sprites';
import { spriteRasters } from '../sprites/render';
import type { ColorMode } from '../design';
import type { SpriteRaster, SpriteRasterCache, SpriteSource } from '../sprites/render';
import { paintRasterToCanvas, sliceSource } from './sprite-slice';
import type { GridRect } from './sprite-slice';
import type { Direction } from './trade-panel-logic';

/** 시트 전체 크기 — 원본 `mk(40, 34)`. */
export const PREDICTION_SHEET_WIDTH = 40;
export const PREDICTION_SHEET_HEIGHT = 34;

/** 버튼 한 칸. 높이를 정확히 반으로 가른다. */
export const PREDICTION_BUTTON_WIDTH = PREDICTION_SHEET_WIDTH;
export const PREDICTION_BUTTON_HEIGHT = PREDICTION_SHEET_HEIGHT / 2;

/** 매매 패널 버튼 크기(≈120×32)에 맞는 기본 배율. */
export const PREDICTION_BUTTON_SCALE = 2;

const BUTTON_SHEET: SpriteGrid = uiButtons();

/** `long` = 상승 = 위쪽 빨강 판, `short` = 하락 = 아래쪽 파랑 판. */
const BUTTON_RECTS: Readonly<Record<Direction, GridRect>> = Object.freeze({
  long: { x: 0, y: 0, w: PREDICTION_BUTTON_WIDTH, h: PREDICTION_BUTTON_HEIGHT },
  short: {
    x: 0,
    y: PREDICTION_BUTTON_HEIGHT,
    w: PREDICTION_BUTTON_WIDTH,
    h: PREDICTION_BUTTON_HEIGHT,
  },
});

const BUTTON_SOURCES: Readonly<Record<Direction, SpriteSource>> = Object.freeze({
  long: sliceSource('tf-ui-btn/long', BUTTON_SHEET, BUTTON_RECTS.long, 'opaque'),
  short: sliceSource('tf-ui-btn/short', BUTTON_SHEET, BUTTON_RECTS.short, 'opaque'),
});

/** 버튼 한 칸의 시트 내 좌표. */
export function predictionButtonRect(direction: Direction): GridRect {
  return BUTTON_RECTS[direction];
}

/** 버튼 한 칸의 문자 그리드(40×17). */
export function predictionButtonGrid(direction: Direction): SpriteGrid {
  return BUTTON_SOURCES[direction].grid;
}

export function predictionButtonRaster(
  direction: Direction,
  cache: SpriteRasterCache = spriteRasters,
): SpriteRaster | null {
  return cache.raster(BUTTON_SOURCES[direction]);
}

export interface PredictionArtOptions {
  readonly rasters?: SpriteRasterCache;
  readonly scale?: number;
  readonly mode?: ColorMode;
}

export function renderPredictionButton(
  canvas: HTMLCanvasElement,
  direction: Direction,
  options: PredictionArtOptions = {},
): boolean {
  const cache = options.rasters ?? spriteRasters;
  if (options.mode !== undefined) cache.setColorMode(options.mode);

  const raster = predictionButtonRaster(direction, cache);
  if (raster === null) return false;
  return paintRasterToCanvas(canvas, raster, options.scale ?? PREDICTION_BUTTON_SCALE);
}

/** 마크업에서 버튼 배경 자리를 표시하는 속성. */
export const PREDICTION_ART_ATTR = 'data-btn-art';

function isDirection(value: string): value is Direction {
  return value === 'long' || value === 'short';
}

/**
 * `[data-btn-art="long"]` 자리 표시자에 버튼 배경 캔버스를 채운다.
 * 마운트 시 1회. 굽지 못하는 환경에서는 자리 표시자가 빈 채로 남고 CSS 배경만 보인다.
 *
 * @returns 실제로 그린 버튼 수
 */
export function mountPredictionButtonArt(
  root: ParentNode,
  options: PredictionArtOptions = {},
): number {
  const hosts = Array.from(root.querySelectorAll<HTMLElement>(`[${PREDICTION_ART_ATTR}]`));
  let painted = 0;

  for (const host of hosts) {
    const direction = host.getAttribute(PREDICTION_ART_ATTR);
    if (direction === null || !isDirection(direction)) continue;

    const canvas = host.ownerDocument.createElement('canvas');
    canvas.className = 'trade-panel__btn-art-canvas';
    if (!renderPredictionButton(canvas, direction, options)) continue;

    host.replaceChildren(canvas);
    painted += 1;
  }

  return painted;
}
