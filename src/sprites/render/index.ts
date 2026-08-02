/**
 * 스프라이트 래스터 계층 (PLAN Step 2).
 *
 *     import { spriteRasters, drawSprite } from './sprites/render';
 *
 *     const raster = spriteRasters.ofKey('tf-ally-01');   // 최초 1회만 굽는다
 *     if (raster) drawSprite(ctx, raster, x, y, scale, facingLeft);
 *
 * 배선(실제 전투 화면에 붙이기) 은 Step 3~6 이다. 이 계층은 캐시와 렌더 API 까지만 만든다.
 *
 * ⚠️ `../index` 가 이 모듈을 다시 export 하지 않는다 — `cache.ts` 가 `../index` 를
 *    import 하므로 순환이 된다. 소비자는 `sprites/render` 를 직접 import 해라.
 */

export {
  ADDITIVE_INK_FLOOR,
  COMPOSITE_SPECS,
  NON_RENDERABLE_SPRITE_KEYS,
  RENDERABLE_SPRITE_KEYS,
  SPRITE_COMPOSITE,
  compositeSpec,
} from './composite';
export type {
  CompositeClass,
  CompositeMode,
  CompositeSpec,
  NonRenderableSpriteKey,
  RenderableSpriteKey,
} from './composite';

export {
  UNIT_ANIM_IDS,
  unitAnimComposite,
  unitAnimFrameAt,
  unitAnimFrameCount,
  unitAnimFrameGrid,
  unitAnimFrameRaster,
  unitAnimFrameSource,
  unitAnimSheetKey,
} from './anim';
export type { UnitAnimId } from './anim';

export { createSpriteRasterCache, spriteRasters, spriteSourceOfKey } from './cache';
export type { SpriteRaster, SpriteRasterCache, SpriteRasterCacheOptions, SpriteSource } from './cache';

export { drawSprite, drawSpriteBand, snapScale } from './draw';

export { droppedChars, rasterizeGrid } from './rasterize';

export {
  DEFAULT_TIME_OF_DAY,
  SKY_SCENE_HEIGHT,
  SKY_SCENE_KEYS,
  SKY_SCENE_WIDTH,
  SKY_WEATHER_KEYS,
  sceneGroundRow,
  skyCoverScale,
  skyOriginX,
  skyOriginY,
  skySceneKey,
  skySource,
} from './sky';
export type { TimeOfDay } from './sky';

export { createDomSurface } from './surface';
export type {
  DrawableSurface,
  RasterContext2D,
  RasterImageData,
  RasterSurface,
  SurfaceFactory,
} from './surface';
