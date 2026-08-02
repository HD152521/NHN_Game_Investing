/**
 * 전장 ↔ 스프라이트 래스터 계층(`src/sprites/render`) 사이의 얇은 어댑터.
 *
 * ★ 왜 어댑터가 필요한가 ★
 * `BattleCtx`(`surface.ts`)는 전장이 쓰는 **벡터** 연산만 선언한 구조적 인터페이스다.
 * 스프라이트를 얹으려면 `drawImage`/`globalCompositeOperation` 이 필요한데, 그것은
 * `RasterContext2D`(`sprites/render/surface.ts`)의 목록이다. 실제
 * `CanvasRenderingContext2D` 는 두 인터페이스를 동시에 만족하므로, 런타임에 능력을 확인해
 * 좁혀서 쓴다(판정은 `draw-background.ts` 의 `spriteCtxOf` 하나만 쓴다 — 같은 판정이 두 군데
 * 있으면 한쪽만 바뀐다). 좁히기에 실패하면(= 스프라이트를 못 그리는 컨텍스트) 조용히
 * 넘어간다 — 크래시보다 낫고, 이 계층의 계약은 "그릴 수 있으면 그린다"이다.
 *
 * ★ 프레임당 할당 0 ★
 * 래스터는 `spriteRasters` 가 키당 1회만 굽고 그 뒤로는 같은 객체를 돌려준다. 이 파일의
 * 함수들은 객체·배열·클로저를 만들지 않는다.
 */

import { resolvePalette } from '../design/index.js';
import type { Palette } from '../design/index.js';
import { drawSprite, snapScale, spriteRasters } from '../sprites/render/index.js';
import type { RenderableSpriteKey, SpriteRaster } from '../sprites/render/index.js';
import { spriteCtxOf } from './draw-background.js';
import type { Rect } from './layout.js';
import type { BattleCtx } from './surface.js';

/** 원본 `paint()` 와 같은 최소 배율. */
const MIN_SPRITE_SCALE = 1;

/** 색약 팔레트 싱글턴. `resolvePalette` 는 모드별 동결 객체를 돌려주므로 참조 비교로 충분하다. */
const COLORBLIND_PALETTE = resolvePalette('colorblind');

/**
 * 화면 팔레트와 래스터가 구워진 팔레트를 맞춘다.
 *
 * 래스터는 굽는 시점의 팔레트를 픽셀에 박아버리므로, 색약 토글 뒤에도 옛 픽셀이 남으면
 * 전장만 기본 색으로 남는다. `setColorMode` 는 모드가 그대로면 아무 것도 하지 않고,
 * 판정은 참조 비교 한 번이라 프레임당 비용이 없다.
 */
export function syncSpriteColorMode(palette: Palette): void {
  spriteRasters.setColorMode(palette === COLORBLIND_PALETTE ? 'colorblind' : 'default');
}

/** 사각형 안에 들어가는 최대 **정수** 배율(픽셀 아트는 정수 배율만 쓴다). */
function fitScale(rect: Rect, width: number, height: number): number {
  if (width <= 0 || height <= 0) return MIN_SPRITE_SCALE;
  const fit = Math.min(Math.floor(rect.w / width), Math.floor(rect.h / height));
  return fit < MIN_SPRITE_SCALE ? MIN_SPRITE_SCALE : fit;
}

/**
 * 스프라이트를 `(cx, cy)` **중심**에 그린다 — 유닛용.
 *
 * 예전 도형(`shapes/primitives.ts`)도 레인 y를 중심으로 그렸다. 같은 규약을 유지해야
 * HP 바 오프셋(`HP_BAR_OFFSET_Y`)과 예광선 시작점이 그대로 맞는다.
 */
export function drawSpriteCentered(
  ctx: BattleCtx,
  key: RenderableSpriteKey,
  cx: number,
  cy: number,
  scale: number,
): void {
  const raster = spriteRasters.ofKey(key);
  if (raster === null) return;
  const target = spriteCtxOf(ctx);
  if (target === null) return;

  const step = snapScale(scale);
  drawSprite(target, raster, cx - (raster.width * step) / 2, cy - (raster.height * step) / 2, step);
}

/**
 * 유닛 한 체를 그린다. `frame` 이 있으면 그 공격 모션 프레임을, 없으면 정지 스프라이트를.
 *
 * ★ 원점은 **언제나 정지 스프라이트 기준**이다 ★
 *   모션 프레임(`meleeFrame` 등)은 무기가 삐져나오는 만큼 캔버스가 4~6px 넓지만, 몸통
 *   좌표는 정지 스프라이트와 동일하다(원본이 그렇게 짜여 있다 — `sprites/anim.ts`).
 *   프레임 폭에 맞춰 가운데를 다시 잡으면 때릴 때마다 몸이 2~3px 좌우로 튄다. 그래서
 *   프레임을 얹을 때도 정지 스프라이트의 좌상단을 그대로 쓴다 — 무기만 움직인다.
 *
 * 그릴 수 없는 컨텍스트에서는 조용히 넘어간다(`drawSpriteCentered` 와 같은 계약).
 */
export function drawUnitSprite(
  ctx: BattleCtx,
  key: RenderableSpriteKey,
  frame: SpriteRaster | null,
  cx: number,
  cy: number,
  scale: number,
): void {
  const idle = spriteRasters.ofKey(key);
  if (idle === null) return;
  const target = spriteCtxOf(ctx);
  if (target === null) return;

  const step = snapScale(scale);
  drawSprite(target, frame ?? idle, cx - (idle.width * step) / 2, cy - (idle.height * step) / 2, step);
}

/**
 * 이미 구워진 래스터를 `(cx, cy)` 중심에 그린다 — 파라메트릭 프레임(캔 회전 등)용.
 * 키가 아니라 래스터를 받는다는 점만 `drawSpriteCentered` 와 다르다.
 */
export function drawRasterCentered(
  ctx: BattleCtx,
  raster: SpriteRaster,
  cx: number,
  cy: number,
  scale: number,
  flipX = false,
): boolean {
  const target = spriteCtxOf(ctx);
  if (target === null) return false;

  const step = snapScale(scale);
  drawSprite(target, raster, cx - (raster.width * step) / 2, cy - (raster.height * step) / 2, step, flipX);
  return true;
}

/**
 * 스프라이트를 사각형 안에 정수 배율로 맞춰, **가로 중앙 · 바닥선 기준**으로 그린다.
 *
 * 타워는 슬롯 받침 위에, 기지는 지면선 위에 서야 한다 — 둘 다 "바닥에 선다"는 같은 규약이라
 * 한 함수로 묶는다. 배치·크기의 근거는 전부 인자로 받은 사각형이다(좌표를 새로 만들지 않는다).
 */
export function drawSpriteStanding(
  ctx: BattleCtx,
  key: RenderableSpriteKey,
  rect: Rect,
  baselineY: number,
): void {
  drawSpriteStandingFrame(ctx, key, null, rect, baselineY);
}

/**
 * 이미 구워진 래스터를 사각형 안에 정수 배율로 맞춰 **바닥선 기준**으로 세운다.
 *
 * `drawSpriteStanding` 과 달리 **래스터 자신의 크기로** 배율을 잡는다. 정지 스프라이트와
 * 크기가 다른 그림(예: 기지 피해 시트 30×44 vs 사옥 76×40)을 같은 자리에 세울 때 쓴다.
 * 그릴 수 없는 컨텍스트면 `false` 를 돌려준다 — 호출부가 정지 스프라이트로 폴백한다.
 */
export function drawRasterStanding(
  ctx: BattleCtx,
  raster: SpriteRaster,
  rect: Rect,
  baselineY: number,
): boolean {
  const target = spriteCtxOf(ctx);
  if (target === null) return false;

  const step = fitScale(rect, raster.width, raster.height);
  const width = raster.width * step;
  drawSprite(target, raster, rect.x + (rect.w - width) / 2, baselineY - raster.height * step, step);
  return true;
}

/**
 * `drawSpriteStanding` 의 모션 프레임 버전.
 *
 * ★ 배율과 원점은 **언제나 정지 스프라이트 기준**이다 ★
 *   모션 프레임(타워 발사 등)은 총구 섬광이 삐져나오는 만큼 캔버스가 더 크고, 그 안에서
 *   몸통이 `(originX, originY)` 만큼 안쪽에 들어앉아 있다. 프레임 크기로 배율·중앙을 다시
 *   잡으면 발사할 때마다 타워가 통째로 움직인다. 그래서 정지 스프라이트로 자리를 잡고,
 *   프레임은 그 자리에서 몸통 오프셋만큼 되돌려 그린다 — 포신만 움직인다.
 */
export function drawSpriteStandingFrame(
  ctx: BattleCtx,
  key: RenderableSpriteKey,
  frame: SpriteRaster | null,
  rect: Rect,
  baselineY: number,
  originX = 0,
  originY = 0,
): void {
  const idle = spriteRasters.ofKey(key);
  if (idle === null) return;
  const target = spriteCtxOf(ctx);
  if (target === null) return;

  const step = fitScale(rect, idle.width, idle.height);
  const x = rect.x + (rect.w - idle.width * step) / 2;
  const y = baselineY - idle.height * step;
  if (frame === null) {
    drawSprite(target, idle, x, y, step);
    return;
  }
  drawSprite(target, frame, x - originX * step, y - originY * step, step);
}
