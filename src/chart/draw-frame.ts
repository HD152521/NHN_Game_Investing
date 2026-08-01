/**
 * 차트 패널 프레임 — `tf-ui-chart` (80×30) 을 **9슬라이스**로 잘라 차트 캔버스 가장자리에
 * 두른다 (PLAN Step 5 / 아트 시트 09 `U-01`).
 *
 * ★ 왜 CSS 배경이 아니라 캔버스인가 (판단 근거 3가지)
 *   1. **비율.** 스프라이트는 80×30, 캔버스는 1024×200 이다. CSS `background-size` 로
 *      늘리면 픽셀이 12.8×6.7 의 **직사각형**이 된다. 바로 아래 전장 캔버스는 정수 배율
 *      정사각 픽셀(`drawSprite` 의 `snapScale`)이라 두 패널의 픽셀 크기가 어긋나고,
 *      그게 시트 10 게이트 5 가 막으려는 "톤이 안 이어지는" 상태다. 9슬라이스는 테두리를
 *      **정수 배율 정사각 픽셀**로 유지한다.
 *   2. **색약 모드.** CSS 로 넣으려면 그리드를 data URL 로 구워 넣어야 하고, 팔레트가
 *      바뀔 때마다 그 URL 을 다시 만들어 재주입해야 한다. 캔버스는 `SpriteRasterCache` 가
 *      이미 하는 일(모드 바뀌면 다시 굽기)을 그대로 물려받는다.
 *   3. **내부 비움.** 시트가 "내부 완전히 비움"이라 했지만 원본 그리드의 안쪽은 `2`(BG_1)
 *      로 **꽉 차 있다.** 그대로 깔면 차트 배경색이 바뀐다. 9슬라이스는 모서리·모서리띠만
 *      그리고 **가운데를 아예 건드리지 않으므로** 시트 원칙을 픽셀 단위로 지킨다.
 *
 * ★ 그리는 순서 — 차트 내용보다 **먼저**.
 *   하단 진행 바(`progressY = height - 8`)가 프레임 아래띠와 같은 자리를 쓴다. 프레임을
 *   나중에 그리면 진행 바를 덮어 게임 정보가 사라진다. 배경으로 깔면 축 눈금이 진행 바
 *   양옆으로 그대로 읽힌다.
 *
 * ★ 슬라이스 좌표는 원본 `uiChart()` 코드에서 읽었다.
 *   - 테두리 `m`: 상 1행 · 하 1행(y=29) · 좌우 1열
 *   - 머리띠: `rect(0,0,80,4,'3')` + 구분선 `rect(0,4,80,1,'m')`  → 위쪽 두께 **5**
 *   - 모서리 표식 `w`: (0,0) (76,0) (0,26) (76,26) 각 4×4     → 좌우 두께 **4**, 아래 **4**
 *   - 좌측 눈금 `m`: `rect(1, y, 2, 1)` y = 8,12,…,24         → 세로 주기 **4**
 *   - 하단 눈금 `m`: `rect(x, 27, 1, 2)` x = 6,12,…,72        → 가로 주기 **6**
 *   내부 `x∈[4,76) · y∈[5,26)` 는 전부 `2` 한 색이다 — 글자도 표식도 없다(시트 09 원칙).
 */

import { resolvePalette } from '../design/index.js';
import type { Palette } from '../design/index.js';
import { uiChart } from '../sprites/index.js';
import type { SpriteGrid } from '../sprites/index.js';
import { drawSprite, snapScale, spriteRasters } from '../sprites/render/index.js';
import type { RasterContext2D, SpriteRaster, SpriteRasterCache } from '../sprites/render/index.js';
import { rasterCtxOf, sliceSource } from '../ui/sprite-slice.js';
import type { ChartCtx } from './surface.js';

export const CHART_FRAME_WIDTH = 80;
export const CHART_FRAME_HEIGHT = 30;

/** 9슬라이스 두께(그리드 픽셀). 위쪽만 5인 이유는 머리띠(4행)+구분선(1행)이기 때문이다. */
export const FRAME_TOP = 5;
export const FRAME_BOTTOM = 4;
export const FRAME_LEFT = 4;
export const FRAME_RIGHT = 4;

/**
 * 기본 배율 2.
 *
 * 우연이 아니다 — 위쪽 두께 5×2 = 10px 이 `layout.ts` 의 `PADDING_TOP`(10) 과 정확히
 * 같아서 머리띠 바로 아래에서 캔들이 시작한다. 좌우 4×2 = 8px 도 `PADDING_X`(12) 보다
 * 작아 눈금이 캔들과 겹치지 않는다.
 */
export const CHART_FRAME_SCALE = 2;

const FRAME_SHEET: SpriteGrid = uiChart();

/** UI 프레임은 불투명 패널이다 (PLAN 0.1 C-1 분류표). */
const OPAQUE = 'opaque' as const;

const CORNER_TOP_LEFT = sliceSource(
  'tf-ui-chart/corner-tl',
  FRAME_SHEET,
  { x: 0, y: 0, w: FRAME_LEFT, h: FRAME_TOP },
  OPAQUE,
);
const CORNER_TOP_RIGHT = sliceSource(
  'tf-ui-chart/corner-tr',
  FRAME_SHEET,
  { x: CHART_FRAME_WIDTH - FRAME_RIGHT, y: 0, w: FRAME_RIGHT, h: FRAME_TOP },
  OPAQUE,
);
const CORNER_BOTTOM_LEFT = sliceSource(
  'tf-ui-chart/corner-bl',
  FRAME_SHEET,
  { x: 0, y: CHART_FRAME_HEIGHT - FRAME_BOTTOM, w: FRAME_LEFT, h: FRAME_BOTTOM },
  OPAQUE,
);
const CORNER_BOTTOM_RIGHT = sliceSource(
  'tf-ui-chart/corner-br',
  FRAME_SHEET,
  {
    x: CHART_FRAME_WIDTH - FRAME_RIGHT,
    y: CHART_FRAME_HEIGHT - FRAME_BOTTOM,
    w: FRAME_RIGHT,
    h: FRAME_BOTTOM,
  },
  OPAQUE,
);

/** 머리띠는 x 방향으로 균일하다 — 표식이 없는 한가운데(x=40) 를 4열만 떠서 반복한다. */
const EDGE_TOP = sliceSource(
  'tf-ui-chart/edge-top',
  FRAME_SHEET,
  { x: 40, y: 0, w: 4, h: FRAME_TOP },
  OPAQUE,
);
/** 아래띠는 눈금 주기 6 을 그대로 한 장으로 뜬다(눈금 1개 포함). */
const EDGE_BOTTOM = sliceSource(
  'tf-ui-chart/edge-bottom',
  FRAME_SHEET,
  { x: 6, y: CHART_FRAME_HEIGHT - FRAME_BOTTOM, w: 6, h: FRAME_BOTTOM },
  OPAQUE,
);
/** 좌측띠는 눈금 주기 4 를 그대로 뜬다(테두리 1열 + 눈금 2열). */
const EDGE_LEFT = sliceSource(
  'tf-ui-chart/edge-left',
  FRAME_SHEET,
  { x: 0, y: 8, w: FRAME_LEFT, h: 4 },
  OPAQUE,
);
/** 우측띠에는 표식이 없다 — 테두리 1열만 반복하면 되므로 4행만 뜬다. */
const EDGE_RIGHT = sliceSource(
  'tf-ui-chart/edge-right',
  FRAME_SHEET,
  { x: CHART_FRAME_WIDTH - FRAME_RIGHT, y: 8, w: FRAME_RIGHT, h: 4 },
  OPAQUE,
);

/** 색약 팔레트 싱글턴. `resolvePalette` 는 모드별 동결 객체를 준다(참조 비교로 충분). */
const COLORBLIND_PALETTE = resolvePalette('colorblind');

function syncMode(cache: SpriteRasterCache, palette: Palette): void {
  cache.setColorMode(palette === COLORBLIND_PALETTE ? 'colorblind' : 'default');
}

function tileHorizontal(
  ctx: RasterContext2D,
  raster: SpriteRaster,
  x: number,
  y: number,
  width: number,
  step: number,
): void {
  const tileWidth = raster.width * step;
  if (tileWidth <= 0 || width <= 0) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, raster.height * step);
  ctx.clip();
  for (let dx = x; dx < x + width; dx += tileWidth) {
    drawSprite(ctx, raster, dx, y, step);
  }
  ctx.restore();
}

function tileVertical(
  ctx: RasterContext2D,
  raster: SpriteRaster,
  x: number,
  y: number,
  height: number,
  step: number,
): void {
  const tileHeight = raster.height * step;
  if (tileHeight <= 0 || height <= 0) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, raster.width * step, height);
  ctx.clip();
  for (let dy = y; dy < y + height; dy += tileHeight) {
    drawSprite(ctx, raster, x, dy, step);
  }
  ctx.restore();
}

export interface ChartFrameOptions {
  readonly palette: Palette;
  readonly width: number;
  readonly height: number;
  /** 정수 배율. 기본 `CHART_FRAME_SCALE`. */
  readonly scale?: number;
  /** 래스터 캐시 주입구(테스트용). */
  readonly rasters?: SpriteRasterCache;
}

/**
 * 차트 캔버스 테두리에 프레임을 두른다. **가운데는 그리지 않는다.**
 * 그릴 수 없는 컨텍스트(벡터 전용 가짜 ctx 등)면 조용히 `false` 를 돌려준다.
 */
export function drawChartFrame(ctx: ChartCtx, options: ChartFrameOptions): boolean {
  const target = rasterCtxOf(ctx);
  if (target === null) return false;

  const cache = options.rasters ?? spriteRasters;
  syncMode(cache, options.palette);

  const step = snapScale(options.scale ?? CHART_FRAME_SCALE);
  const left = FRAME_LEFT * step;
  const right = FRAME_RIGHT * step;
  const top = FRAME_TOP * step;
  const bottom = FRAME_BOTTOM * step;

  const { width, height } = options;
  // 프레임 두께가 캔버스를 다 먹으면 차트가 사라진다 — 그럴 바엔 안 그린다.
  if (width <= left + right || height <= top + bottom) return false;

  const topLeft = cache.raster(CORNER_TOP_LEFT);
  const topRight = cache.raster(CORNER_TOP_RIGHT);
  const bottomLeft = cache.raster(CORNER_BOTTOM_LEFT);
  const bottomRight = cache.raster(CORNER_BOTTOM_RIGHT);
  const edgeTop = cache.raster(EDGE_TOP);
  const edgeBottom = cache.raster(EDGE_BOTTOM);
  const edgeLeft = cache.raster(EDGE_LEFT);
  const edgeRight = cache.raster(EDGE_RIGHT);
  if (
    topLeft === null ||
    topRight === null ||
    bottomLeft === null ||
    bottomRight === null ||
    edgeTop === null ||
    edgeBottom === null ||
    edgeLeft === null ||
    edgeRight === null
  ) {
    return false;
  }

  const innerWidth = width - left - right;
  const innerHeight = height - top - bottom;

  tileHorizontal(target, edgeTop, left, 0, innerWidth, step);
  tileHorizontal(target, edgeBottom, left, height - bottom, innerWidth, step);
  tileVertical(target, edgeLeft, 0, top, innerHeight, step);
  tileVertical(target, edgeRight, width - right, top, innerHeight, step);

  drawSprite(target, topLeft, 0, 0, step);
  drawSprite(target, topRight, width - right, 0, step);
  drawSprite(target, bottomLeft, 0, height - bottom, step);
  drawSprite(target, bottomRight, width - right, height - bottom, step);

  return true;
}
