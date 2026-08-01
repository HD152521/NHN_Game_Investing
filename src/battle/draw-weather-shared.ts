/**
 * 날씨 렌더러 4종이 함께 쓰는 최소 유틸 + **스프라이트 타일 오버레이**(PLAN Step 6).
 *
 * ★ 전부 스칼라 in / 스칼라 out이다. 여기서 객체를 만들기 시작하면 60 FPS 예산 안에서
 *   프레임당 할당이 생긴다 (PRD §11 — 유닛 60체 + 타워 8기에서 60 FPS).
 */

import { drawSprite, snapScale, spriteRasters } from '../sprites/render/index.js';
import type { RenderableSpriteKey, SpriteRasterCache } from '../sprites/render/index.js';
import { overlapsCenterClear } from '../weather/index.js';
import type { WeatherViewport } from '../weather/index.js';
import { spriteCtxOf } from './draw-background.js';
import type { BattleCtx } from './surface.js';

/** 소수부(0~1). 위상 계산에 쓴다. */
export function frac(value: number): number {
  return value - Math.floor(value);
}

/** 0~1로 자른다. */
export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** `a`→`b`를 `t`(0~1)로 선형 보간. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * 시드를 다른 축으로 흩뿌린다.
 *
 * 같은 시드를 x 위치와 낙하 위상에 그대로 쓰면 광선이 대각선 한 줄로 정렬돼 버린다.
 * 무리수 배수를 곱해 소수부를 취하면 추가 버퍼 없이 두 축을 탈상관시킬 수 있다.
 */
export function decorrelate(seed: number, salt: number): number {
  return frac(seed * salt);
}

/** reduced-motion이면 시간을 0으로 고정해 위상을 멈춘다 (정보는 남고 모션만 사라진다). */
export function motionTime(timeMs: number, reducedMotion: boolean): number {
  return reducedMotion ? 0 : timeMs;
}

/* ------------------------------------------------------------------ *
 * 스프라이트 타일 오버레이 (Step 6)
 * ------------------------------------------------------------------ */

/**
 * 날씨 타일 한 장의 목표 폭(px). 화면이 커지면 **배율만** 올라가고 타일 개수는 비슷하게
 * 유지되므로, 해상도가 달라져도 강도 → 밀도 해상도(칸 수)가 크게 흔들리지 않는다.
 */
const WEATHER_TILE_TARGET_PX = 640;

/**
 * 강도가 아무리 낮아도 이만큼의 칸은 켠다.
 *
 * `activeCount`(weather/field.ts)가 최소 개수를 보장하는 것과 같은 이유다 — 임계를 갓
 * 넘긴 순간에 칸이 0~1개만 켜지면 "날씨"로 읽히지 않는다. 이 값 **위쪽**에서는 밀도가
 * 강도에 그대로 비례한다(연속성 유지).
 */
const MIN_TILE_DENSITY = 0.14;

/** 격자 칸 임계 해시에 쓰는 무리수 — `weather/field.ts`의 `hash01`과 같은 계열이다. */
const TILE_HASH_COL = 12.9898;
const TILE_HASH_ROW = 78.233;
const TILE_HASH_GAIN = 43758.5453;

/** 날씨 타일 배율(정수). 배경 타일(`tileBandScale`)과 같은 사고방식이다. */
export function weatherTileScale(viewport: WeatherViewport): number {
  return snapScale(viewport.width / WEATHER_TILE_TARGET_PX);
}

/**
 * 격자 칸 → 0~1 임계. **강도가 이 값을 넘는 칸만** 그린다.
 *
 * 칸 좌표가 절대 타일 번호이므로 격자가 흘러도 같은 칸은 같은 임계를 유지한다 —
 * 즉 강도를 올리면 켜진 칸이 **늘기만 하고 줄지 않는다**(단조 증가).
 */
export function tileThreshold(col: number, row: number): number {
  return frac(Math.sin(col * TILE_HASH_COL + row * TILE_HASH_ROW) * TILE_HASH_GAIN);
}

/**
 * 시각 → 격자 이동량(타일 단위).
 *
 * ★ `fieldPhase`(0~1로 감김)를 쓰면 안 된다. 감기는 순간 `Math.floor`가 0으로 되돌아가
 * 절대 칸 번호가 한 줄 튀고, 켜진 칸 패턴이 눈에 띄게 팝한다. 여기서는 **감지 않은**
 * 값을 넘겨 `drawWeatherTiles`가 정수부(칸 번호)와 소수부(픽셀 오프셋)를 같이 굴리게 한다.
 */
export function tilePhase(timeMs: number, periodMs: number): number {
  if (periodMs <= 0 || !Number.isFinite(timeMs)) return 0;
  return timeMs / periodMs;
}

/** 강도 → 실제 칸 밀도. 0 이면 0(아무것도 안 그림), 그 위로는 최소치를 보장한다. */
export function tileDensity(intensity: number): number {
  if (intensity <= 0) return 0;
  return Math.max(MIN_TILE_DENSITY, clamp01(intensity));
}

/**
 * 날씨 스프라이트를 격자로 깔아 오버레이 한 겹을 만든다. 그릴 수 없으면 `false` —
 * 호출부가 벡터 폴백으로 넘어간다(배경 `drawSkySprites`와 같은 계약).
 *
 * ★ 가산 합성 포화 회피 ★
 *   `tf-wx-*`는 `lighter`로 얹힌다. Step 2 실측대로 **같은 자리에 3번 겹치면 255로 포화**돼
 *   형태가 뭉개진다. 그래서 이 함수는 격자의 **한 칸에 정확히 한 장**만 그린다 — 칸끼리는
 *   서로 겹치지 않으므로 어떤 픽셀도 두 번 이상 가산되지 않는다. 강도는 겹치기가 아니라
 *   **켜지는 칸의 밀도**로 표현한다.
 *
 * @param bandTop  오버레이가 시작되는 y. 아래끝은 항상 `viewport.height`다.
 * @param phaseX   가로 격자 이동량(타일 단위, 실수). 커지면 오른쪽으로 흐른다.
 * @param phaseY   세로 격자 이동량(타일 단위, 실수). 커지면 아래로 흐른다.
 */
export function drawWeatherTiles(
  ctx: BattleCtx,
  rasters: SpriteRasterCache,
  key: RenderableSpriteKey,
  viewport: WeatherViewport,
  bandTop: number,
  phaseX: number,
  phaseY: number,
  intensity: number,
  respectCenterClear: boolean,
): boolean {
  const bandHeight = viewport.height - bandTop;
  if (viewport.width <= 0 || bandHeight <= 0) return false;

  const target = spriteCtxOf(ctx);
  if (target === null) return false;
  const raster = rasters.ofKey(key);
  if (raster === null) return false;

  const step = weatherTileScale(viewport);
  const tileW = raster.width * step;
  const tileH = raster.height * step;
  if (tileW <= 0 || tileH <= 0) return false;

  const density = tileDensity(intensity);
  // 격자를 한 칸 위·왼쪽에서 시작해, 흐르는 중에도 가장자리에 빈 줄이 생기지 않게 한다.
  const shiftX = Math.floor(phaseX);
  const shiftY = Math.floor(phaseY);
  const originX = (phaseX - shiftX) * tileW - tileW;
  const originY = bandTop + (phaseY - shiftY) * tileH - tileH;

  target.save();
  target.beginPath();
  target.rect(0, bandTop, viewport.width, bandHeight);
  target.clip();

  for (let row = 0, y = originY; y < viewport.height; row += 1, y += tileH) {
    const absRow = row - shiftY;
    for (let col = 0, x = originX; x < viewport.width; col += 1, x += tileW) {
      const absCol = col - shiftX;
      if (tileThreshold(absCol, absRow) >= density) continue;
      if (respectCenterClear && overlapsCenterClear(x, y, x + tileW, y + tileH, viewport)) continue;
      // 홀수 칸을 좌우 반전해 이음새를 맞춘다(`drawSpriteBand`와 같은 교차 미러링).
      drawSprite(target, raster, x, y, step, (absCol & 1) !== 0);
    }
  }

  target.restore();
  return true;
}

/** 게임이 공유하는 래스터 캐시. 테스트는 소프트웨어 캔버스 캐시를 주입한다. */
export const DEFAULT_WEATHER_RASTERS: SpriteRasterCache = spriteRasters;
