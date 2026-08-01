/**
 * `WX-03` 횡보 안개 (아트-프로덕션시트 §03).
 *
 * 낮게 깔린 무채색 안개 띠 **두 겹**. 변동성이 죽었을 때.
 * ★ **발판 아래쪽만** 덮고 유닛 실루엣은 절대 가리지 않는다 — 유닛은 `layout.groundY`를
 *   중심으로 서 있으므로 안개 상단이 `groundY` 위로 올라가면 발이 잘려 보인다.
 */

import type { Palette } from '../design/index.js';
import type { SpriteRasterCache } from '../sprites/render/index.js';
import type { WeatherView, WeatherViewport } from '../weather/index.js';
import { FOG_BAND_COUNT, centerClearBottom, fieldPhase } from '../weather/index.js';
import {
  DEFAULT_WEATHER_RASTERS,
  clamp01,
  drawWeatherTiles,
  motionTime,
  tilePhase,
} from './draw-weather-shared.js';
import { rgba } from './style.js';
import type { BattleCtx } from './surface.js';

/** 시트 스프라이트 키 — WX-03 횡보 안개. */
const SPRITE_KEY = 'tf-wx-03';
/** 격자가 한 타일 폭만큼 옆으로 흐르는 주기(ms). 안개는 느려야 안개다. */
const SPRITE_DRIFT_MS = 4200;

/** 띠 하나의 높이 — 발판 아래 남은 높이 대비. */
const BAND_HEIGHT_RATIO = 0.55;
/** 두 겹 사이 세로 간격 — 발판 아래 남은 높이 대비. */
const BAND_GAP_RATIO = 0.22;
/** 띠가 화면 밖까지 넘치는 폭 — 화면 폭 대비. 좌우로 흘러도 끝이 보이지 않게 한다. */
const BAND_OVERHANG_RATIO = 0.3;
/** 좌우 표류 1주기(ms). 안개는 느려야 안개다. */
const DRIFT_MS = 9000;
const ALPHA_BASE = 0.14;
const ALPHA_GAIN = 0.3;
/** 두 번째 겹의 투명도 배수 — 겹이 구분되어야 '두 겹'으로 읽힌다. */
const SECOND_LAYER_ALPHA_RATIO = 0.6;

/**
 * 안개가 시작되는 y.
 *
 * `groundY`와 중앙 공백 하단 중 **더 아래**를 고른다 — 어느 캔버스 비율에서도
 * "유닛을 가리지 않는다"와 "중앙을 비운다" 두 규칙이 동시에 지켜진다.
 */
function fogTop(viewport: WeatherViewport): number {
  return Math.max(viewport.groundY, centerClearBottom(viewport));
}

/**
 * 시트 스프라이트 `tf-wx-03`을 **발판 아래에만** 깐다.
 * 띠 상단이 `fogTop` 아래이므로 유닛 실루엣을 가리지 않는다는 규칙이 그대로 유지된다.
 */
function drawFogSprites(
  ctx: BattleCtx,
  rasters: SpriteRasterCache,
  viewport: WeatherViewport,
  view: WeatherView,
): boolean {
  const time = motionTime(view.timeMs, view.reducedMotion);
  return drawWeatherTiles(
    ctx,
    rasters,
    SPRITE_KEY,
    viewport,
    fogTop(viewport),
    tilePhase(time, SPRITE_DRIFT_MS),
    0,
    view.intensity,
    true,
  );
}

export function drawRangeFog(
  ctx: BattleCtx,
  palette: Palette,
  viewport: WeatherViewport,
  view: WeatherView,
  rasters: SpriteRasterCache = DEFAULT_WEATHER_RASTERS,
): void {
  if (drawFogSprites(ctx, rasters, viewport, view)) return;

  const top = fogTop(viewport);
  const available = Math.max(0, viewport.height - top);
  const bandHeight = available * BAND_HEIGHT_RATIO;
  const gap = available * BAND_GAP_RATIO;
  const overhang = viewport.width * BAND_OVERHANG_RATIO;
  const width = viewport.width + overhang * 2;
  const time = motionTime(view.timeMs, view.reducedMotion);

  ctx.save();
  ctx.setLineDash([]);

  for (let layer = 0; layer < FOG_BAND_COUNT; layer += 1) {
    // 겹마다 반대 방향으로 흘러 정지 화면에서도 두 겹임이 읽힌다.
    const direction = layer % 2 === 0 ? 1 : -1;
    const phase = fieldPhase(time, DRIFT_MS, layer * 0.5, 1);
    const x = -overhang + direction * phase * overhang;
    const y = top + gap * layer;
    const alpha = (ALPHA_BASE + ALPHA_GAIN * view.intensity) * (layer === 0 ? 1 : SECOND_LAYER_ALPHA_RATIO);

    ctx.fillStyle = rgba(palette.MUTED, clamp01(alpha));
    ctx.fillRect(x, y, width, Math.max(0, bandHeight - gap * layer));
  }

  ctx.restore();
}
