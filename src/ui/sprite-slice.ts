/**
 * 스프라이트 **시트에서 칸 하나를 잘라 쓰는** 공용 유틸 (PLAN Step 5).
 *
 * UI 스프라이트 4종은 유닛과 달리 "한 장 = 여러 칸"이다. `tf-ui-icons` 는 3×2 아이콘 6개,
 * `tf-ui-btn` 은 상승/하락 버튼 2개, `tf-ui-chart` 는 9슬라이스로 잘라 써야 하는 프레임이다.
 *
 * ★ 왜 그리드를 자르는가 (부분 `drawImage` 를 쓰지 않는 이유)
 *   `RasterContext2D`(`sprites/render/surface.ts`) 는 5인자 `drawImage` 만 선언한다.
 *   9인자(원본 사각형 지정) 형태를 쓰려면 그 인터페이스를 넓혀야 하는데 `src/sprites/**` 는
 *   이 작업의 쓰기 범위 밖이다. 대신 **문자 그리드 단계에서 잘라** 별도 래스터로 굽는다.
 *   부수 효과가 오히려 좋다: 칸마다 딱 맞는 크기의 캔버스가 나와 DOM 에 그대로 얹힌다.
 *
 * ★ 프레임당 할당 0
 *   자른 그리드와 `SpriteSource` 는 **팔레트와 무관**하므로 모듈 상수로 한 번만 만들어 둔다.
 *   색약 토글은 캐시(`SpriteRasterCache`)가 알아서 다시 굽는다. 매 프레임 호출되는 경로
 *   (차트 프레임) 는 미리 만든 `SpriteSource` 를 그대로 넘기므로 객체를 새로 만들지 않는다.
 */

import type { SpriteGrid } from '../sprites';
import { drawSprite, snapScale, spriteRasters } from '../sprites/render';
import type {
  CompositeClass,
  RasterContext2D,
  SpriteRaster,
  SpriteRasterCache,
  SpriteSource,
} from '../sprites/render';

/** 시트 안의 칸 하나(그리드 좌표). */
export interface GridRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * 그리드에서 사각형 하나를 잘라 낸 **새 그리드**. 원본은 건드리지 않는다.
 * 범위를 벗어난 행·열은 조용히 빠진다(잘린 칸이 나오는 것이 크래시보다 낫다).
 */
export function sliceGrid(grid: SpriteGrid, rect: GridRect): SpriteGrid {
  const out: SpriteGrid = [];
  for (let y = rect.y; y < rect.y + rect.h; y += 1) {
    const row = grid[y];
    if (row === undefined) continue;
    out.push(row.slice(rect.x, rect.x + rect.w));
  }
  return out;
}

/** 자른 칸을 캐시에 넣을 수 있는 굽기 요청으로 바꾼다. `id` 가 캐시 키다. */
export function sliceSource(
  id: string,
  grid: SpriteGrid,
  rect: GridRect,
  composite: CompositeClass,
): SpriteSource {
  return Object.freeze({ id, grid: sliceGrid(grid, rect), composite });
}

/** 굽기 요청 하나를 래스터로. 캐시가 이미 갖고 있으면 같은 객체가 나온다. */
export function sliceRaster(
  source: SpriteSource,
  cache: SpriteRasterCache = spriteRasters,
): SpriteRaster | null {
  return cache.raster(source);
}

/**
 * 컨텍스트가 스프라이트를 그릴 능력이 있는지 **런타임에** 확인한다
 * (`battle/draw-background.ts` 의 `spriteCtxOf` 와 같은 판정 — 시그니처를 못 바꾸는
 * 호출부에 스프라이트를 얹기 위한 유일한 방법이다).
 */
export function rasterCtxOf(ctx: unknown): RasterContext2D | null {
  const candidate = ctx as Partial<RasterContext2D> | null;
  if (candidate === null || candidate === undefined) return null;
  const usable = typeof candidate.drawImage === 'function' && typeof candidate.clip === 'function';
  return usable ? (candidate as RasterContext2D) : null;
}

/**
 * DOM `<canvas>` 한 장에 래스터를 **정수 배율**로 꽉 채워 그린다.
 * 캔버스 크기를 래스터 크기에 맞추므로 CSS 로 늘려도 픽셀 비율이 유지된다.
 */
export function paintRasterToCanvas(
  canvas: HTMLCanvasElement,
  raster: SpriteRaster,
  scale: number,
): boolean {
  const step = snapScale(scale);
  canvas.width = raster.width * step;
  canvas.height = raster.height * step;

  const ctx = canvas.getContext('2d');
  if (ctx === null) return false;

  drawSprite(ctx as unknown as RasterContext2D, raster, 0, 0, step);
  return true;
}
