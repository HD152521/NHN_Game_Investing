/**
 * 렌더 API — 얇게. 계산은 전부 캐시 구축 시점(`cache.ts`) 에 끝났다.
 *
 * ★ R4 픽셀 아트 선명도
 *   원본 `paint()` 는 **정수 배율**만 쓴다(`Math.floor`). 현재 `battle/layout.ts` 는 진행도
 *   기반 실수 좌표이므로, 스냅 없이 그리면 픽셀이 흐려지고 유닛 크기가 프레임마다 흔들린다.
 *   그래서 여기서 배율은 `Math.floor`(최소 1), 좌표는 `Math.round` 로 정수에 못 박는다.
 *
 * ★ 좌우 반전
 *   그리드를 두 벌 만들지 않고 `scale(-1, 1)` 로 뒤집는다. 목적지 사각형은 반전 여부와
 *   무관하게 정확히 `[dx, dx + dw)` 이므로 반픽셀 밀림이 생기지 않는다.
 *
 * ★ 프레임당 할당 0
 *   이 파일의 함수들은 객체·배열·클로저를 만들지 않는다. 행렬도 만들지 않는다
 *   (`translate`/`scale` 은 컨텍스트 내부 상태만 건드린다).
 */

import type { SpriteRaster } from './cache';
import type { RasterContext2D } from './surface';

/** 원본 `paint()` 와 같은 최소 배율. 0 배율은 그림이 사라지므로 1 로 올린다. */
const MIN_SCALE = 1;

/** 실수 배율 → 원본과 같은 정수 배율. */
export function snapScale(scale: number): number {
  const snapped = Math.floor(scale);
  return snapped < MIN_SCALE ? MIN_SCALE : snapped;
}

/**
 * 스프라이트 한 장을 `(x, y)` 좌상단에 그린다.
 * `flipX` 는 목적지 사각형을 바꾸지 않고 내용만 좌우로 뒤집는다(적은 좌향).
 */
export function drawSprite(
  ctx: RasterContext2D,
  raster: SpriteRaster,
  x: number,
  y: number,
  scale: number,
  flipX = false,
): void {
  const step = snapScale(scale);
  const dw = raster.width * step;
  const dh = raster.height * step;
  const dx = Math.round(x);
  const dy = Math.round(y);

  ctx.imageSmoothingEnabled = false;
  const previous = ctx.globalCompositeOperation;
  const changed = previous !== raster.mode;
  if (changed) ctx.globalCompositeOperation = raster.mode;

  if (flipX) {
    ctx.save();
    ctx.translate(dx + dw, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(raster.surface, 0, 0, dw, dh);
    ctx.restore();
  } else {
    ctx.drawImage(raster.surface, dx, dy, dw, dh);
  }

  // `restore()` 는 save 시점 값(= raster.mode)으로 되돌리므로 어느 분기든 여기서 복구한다.
  if (changed) ctx.globalCompositeOperation = previous;
}

/**
 * ★ C-4 타일 이음새 — 교차 미러링
 *
 * 배경·발판은 가로 타일링하는데 원본 루프 주기(16·22·34…)가 폭 104 의 약수가 아니라
 * 타일을 단순 반복하면 이음새가 생긴다. 원본 픽셀은 건드리지 않고 **홀수 번째 타일을
 * 좌우 반전**해서 경계를 맞춘다: 짝수 타일의 마지막 열과 홀수 타일의 첫 열이 둘 다
 * 그리드의 마지막 열이 되므로 경계에서 같은 픽셀이 만난다.
 *
 * 반전 여부는 스크롤 오프셋이 아니라 **절대 타일 번호**로 정하므로 스크롤 중에도 뒤집힘이
 * 흔들리지 않는다. 밴드 밖으로 넘치는 부분은 사각 클립으로 자른다.
 */
export function drawSpriteBand(
  ctx: RasterContext2D,
  raster: SpriteRaster,
  x: number,
  y: number,
  width: number,
  scale: number,
  offset = 0,
): void {
  const step = snapScale(scale);
  const tileWidth = raster.width * step;
  const bandWidth = Math.round(width);
  if (tileWidth <= 0 || bandWidth <= 0) return;

  const dx = Math.round(x);
  const dy = Math.round(y);
  const scroll = Math.round(offset);
  const firstTile = Math.floor(scroll / tileWidth);

  ctx.save();
  ctx.beginPath();
  ctx.rect(dx, dy, bandWidth, raster.height * step);
  ctx.clip();

  let tileX = dx - (scroll - firstTile * tileWidth);
  for (let tile = firstTile; tileX < dx + bandWidth; tile += 1, tileX += tileWidth) {
    drawSprite(ctx, raster, tileX, dy, step, (tile & 1) !== 0);
  }

  ctx.restore();
}
