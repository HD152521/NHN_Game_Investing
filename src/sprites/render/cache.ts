/**
 * 래스터 캐시 — 그리드는 **키당 1회만** 캔버스로 굽고, 그 다음부터는 `drawImage` 만 한다.
 *
 * 프레임당 픽셀 루프가 돌면 유닛 60체 + 타워 8기에서 60FPS 가 안 나온다. 계산은 전부
 * 여기(캐시 구축 시점) 로 몰고, `draw.ts` 는 얇게 유지한다.
 *
 * 색약 모드가 바뀌면 캐시를 통째로 버리고 다시 굽는다 — 문자→색 해석이 달라지기 때문이다.
 */

import { resolvePalette, type ColorMode } from '../../design/theme';
import type { SpriteGrid } from '../grid';
import { spriteGrid } from '../index';
import {
  COMPOSITE_SPECS,
  SPRITE_COMPOSITE,
  type CompositeClass,
  type CompositeMode,
  type RenderableSpriteKey,
} from './composite';
import { rasterizeGrid } from './rasterize';
import { createDomSurface, type RasterContext2D, type RasterSurface, type SurfaceFactory } from './surface';

/**
 * 굽기 요청 한 건. 43키뿐 아니라 파라메트릭 그리드(`ground(2, 2)` 등) 도 담을 수 있게
 * **키가 아니라 id + 그리드 + 분류** 로 받는다. `id` 가 캐시 키다.
 */
export interface SpriteSource {
  readonly id: string;
  readonly grid: SpriteGrid;
  readonly composite: CompositeClass;
}

/** 구워진 스프라이트 한 장. `width`/`height` 는 배율 적용 전(1×) 픽셀 크기다. */
export interface SpriteRaster {
  readonly surface: RasterSurface;
  readonly width: number;
  readonly height: number;
  readonly mode: CompositeMode;
}

export interface SpriteRasterCacheOptions {
  readonly mode?: ColorMode;
  readonly createSurface?: SurfaceFactory;
}

export interface SpriteRasterCache {
  /** 현재 색 모드. */
  readonly mode: ColorMode;
  /** 캐시에 들어 있는 항목 수(굽기에 실패한 `null` 도 포함). */
  readonly size: number;
  /** 43키 중 렌더 가능한 것. 두 번째 호출부터는 **같은 객체**가 나온다. */
  ofKey(key: RenderableSpriteKey): SpriteRaster | null;
  /** 파라메트릭 그리드용. `source.id` 가 이미 캐시에 있으면 그리드는 무시된다. */
  raster(source: SpriteSource): SpriteRaster | null;
  /** 색약 토글. 모드가 실제로 바뀌면 캐시를 비운다. */
  setColorMode(mode: ColorMode): void;
  clear(): void;
}

/**
 * `getContext('2d')` 는 환경에 따라 `null` 을 주기도, 던지기도 한다(jsdom 등).
 * 어느 쪽이든 "이 환경에서는 못 굽는다" 라는 같은 결론이므로 `null` 로 통일한다.
 */
function context2dOf(surface: RasterSurface): RasterContext2D | null {
  try {
    return surface.getContext('2d');
  } catch {
    return null;
  }
}

/** 키 하나를 굽기 요청으로 바꾼다. 그리드는 이때 처음 만들어진다. */
export function spriteSourceOfKey(key: RenderableSpriteKey): SpriteSource {
  return { id: key, grid: spriteGrid(key), composite: SPRITE_COMPOSITE[key] };
}

export function createSpriteRasterCache(options: SpriteRasterCacheOptions = {}): SpriteRasterCache {
  const createSurface = options.createSurface ?? createDomSurface;
  const entries = new Map<string, SpriteRaster | null>();
  let mode: ColorMode = options.mode ?? 'default';

  function build(source: SpriteSource): SpriteRaster | null {
    const height = source.grid.length;
    const width = source.grid[0]?.length ?? 0;
    if (width === 0 || height === 0) return null;

    const surface = createSurface(width, height);
    if (surface === null) return null;
    const ctx = context2dOf(surface);
    if (ctx === null) return null;

    const spec = COMPOSITE_SPECS[source.composite];
    ctx.imageSmoothingEnabled = false;
    rasterizeGrid(ctx, source.grid, resolvePalette(mode), spec);
    return { surface, width, height, mode: spec.mode };
  }

  const cache: SpriteRasterCache = {
    get mode() {
      return mode;
    },
    get size() {
      return entries.size;
    },

    raster(source) {
      const hit = entries.get(source.id);
      if (hit !== undefined) return hit;
      const built = build(source);
      entries.set(source.id, built);
      return built;
    },

    ofKey(key) {
      // 캐시 적중이면 그리드조차 만들지 않는다.
      const hit = entries.get(key);
      if (hit !== undefined) return hit;
      return cache.raster(spriteSourceOfKey(key));
    },

    setColorMode(next) {
      if (next === mode) return;
      mode = next;
      entries.clear();
    },

    clear() {
      entries.clear();
    },
  };

  return cache;
}

/** 게임이 공유하는 기본 캐시. Step 3~6 의 배선은 이걸 쓴다. */
export const spriteRasters: SpriteRasterCache = createSpriteRasterCache();
