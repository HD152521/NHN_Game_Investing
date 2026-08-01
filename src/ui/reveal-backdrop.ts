/**
 * 공개 연출 배경 — `tf-ui-reveal` (80×44) 을 화면에 까는 **렌더 함수만** 둔다.
 *
 * ⚠️ 이 프로젝트에는 아직 공개 연출 화면이 없다.
 *    PRD **FR-9(정체 공개)** 가 정의하지만 구현되지 않았고, 없는 화면을 여기서 새로 만들지
 *    않는다(작업 범위 밖). 스프라이트를 배경으로 쓸 수 있는 최소 API 만 만들어 두고,
 *    **FR-9 구현 시 여기에 연결**한다:
 *
 *      const ctx = rasterCtxOf(revealCanvas.getContext('2d'));
 *      if (ctx) drawRevealBackdrop(ctx, { x: 0, y: 0, w: W, h: H, mode: theme.mode });
 *      // 종목명·수익률 텍스트는 revealContentRect(...) 안에 코드에서 얹는다.
 *
 * ★ 시트 09 원칙 — 프레임은 비워서 뽑고 글자는 코드에서 얹는다.
 *   원본 `uiReveal()` 의 중앙부에는 **금색 링(외곽선)과 가로 괘선 하나뿐**이고
 *   덮는 면이 없다. `revealContentRect()` 가 그 자리를 돌려주므로 텍스트는 거기에 앉힌다.
 *   (시트 문구는 "중앙 1/3 비움"이지만 원본은 완전한 공백이 아니라 **금색 받침선**을
 *    그려 둔 상태다 — 글자가 없다는 점에서는 원칙을 지킨다.)
 */

import { uiReveal } from '../sprites';
import type { SpriteGrid } from '../sprites';
import { drawSprite, snapScale, spriteRasters } from '../sprites/render';
import type { ColorMode } from '../design';
import type { RasterContext2D, SpriteRaster, SpriteRasterCache, SpriteSource } from '../sprites/render';

export const REVEAL_WIDTH = 80;
export const REVEAL_HEIGHT = 44;

/** 시트가 "비워 두라"고 지정한 중앙 1/3. 원본 금색 괘선 `rect(26, 21, 28, 1)` 과 같은 폭이다. */
export const REVEAL_CONTENT_X = 26;
export const REVEAL_CONTENT_WIDTH = 28;
/** 세로는 금색 링(중심 y=22, 반경 6)이 도는 범위를 그대로 쓴다. */
export const REVEAL_CONTENT_Y = 15;
export const REVEAL_CONTENT_HEIGHT = 14;

const REVEAL_GRID: SpriteGrid = uiReveal();

/** UI 프레임은 불투명 패널이다 (PLAN 0.1 C-1 분류표 — `tf-ui-reveal`: opaque). */
const REVEAL_SOURCE: SpriteSource = Object.freeze({
  id: 'tf-ui-reveal',
  grid: REVEAL_GRID,
  composite: 'opaque' as const,
});

export interface RevealBackdropOptions {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly rasters?: SpriteRasterCache;
  readonly mode?: ColorMode;
}

/** 사각형을 **덮는** 최대 정수 배율. 배경이므로 남기지 않고 채운다. */
export function revealCoverScale(width: number, height: number): number {
  return snapScale(Math.max(width / REVEAL_WIDTH, height / REVEAL_HEIGHT));
}

/** 지정 배율·원점에서 텍스트가 앉을 중앙 영역(화면 px). */
export function revealContentRect(
  x: number,
  y: number,
  scale: number,
): { readonly x: number; readonly y: number; readonly w: number; readonly h: number } {
  const step = snapScale(scale);
  return {
    x: x + REVEAL_CONTENT_X * step,
    y: y + REVEAL_CONTENT_Y * step,
    w: REVEAL_CONTENT_WIDTH * step,
    h: REVEAL_CONTENT_HEIGHT * step,
  };
}

export function revealRaster(cache: SpriteRasterCache = spriteRasters): SpriteRaster | null {
  return cache.raster(REVEAL_SOURCE);
}

/**
 * 공개 연출 배경을 사각형 안에 정수 배율로 **가운데 정렬해 덮어** 그린다.
 * 그릴 수 없으면 `false` — 호출부가 단색 배경으로 폴백할 수 있다.
 */
export function drawRevealBackdrop(ctx: RasterContext2D, options: RevealBackdropOptions): boolean {
  const cache = options.rasters ?? spriteRasters;
  if (options.mode !== undefined) cache.setColorMode(options.mode);

  const raster = revealRaster(cache);
  if (raster === null || options.w <= 0 || options.h <= 0) return false;

  const step = revealCoverScale(options.w, options.h);
  const drawWidth = raster.width * step;
  const drawHeight = raster.height * step;

  ctx.save();
  ctx.beginPath();
  ctx.rect(options.x, options.y, options.w, options.h);
  ctx.clip();
  drawSprite(
    ctx,
    raster,
    options.x + (options.w - drawWidth) / 2,
    options.y + (options.h - drawHeight) / 2,
    step,
  );
  ctx.restore();

  return true;
}
