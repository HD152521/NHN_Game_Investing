/**
 * `WX-02` FOMO 랠리 — 적색 상승기류 (아트-프로덕션시트 §03).
 *
 * 바닥에서 솟는 적색·온색 광선, 상승 스파크 입자, 하단 에지의 따뜻한 글로우.
 * 폭우(WX-01)와 정확히 반대 방향으로 읽혀야 하므로 **아래→위**로만 움직인다.
 */

import type { Palette } from '../design/index.js';
import type { SpriteRasterCache } from '../sprites/render/index.js';
import type { WeatherField, WeatherView, WeatherViewport } from '../weather/index.js';
import { activeCount, fieldPhase, overlapsCenterClear, slotLength, slotSeed, slotSpeed } from '../weather/index.js';
import {
  DEFAULT_WEATHER_RASTERS,
  clamp01,
  decorrelate,
  drawWeatherTiles,
  motionTime,
  tilePhase,
} from './draw-weather-shared.js';
import { rgba } from './style.js';
import type { BattleCtx } from './surface.js';

/** 시트 스프라이트 키 — WX-02 FOMO 랠리. */
const SPRITE_KEY = 'tf-wx-02';
/** 격자가 한 타일 높이만큼 **올라가는** 주기(ms). 폭우와 정확히 반대 방향이어야 한다. */
const SPRITE_RISE_MS = 760;

/** 상승 광선 개수. */
const RAY_MAX = 36;
const RAY_MIN = 8;
const RAY_RISE_MS = 1100;
/** 광선 기본 길이 — 전장 높이 대비. */
const RAY_LENGTH_RATIO = 0.24;
const RAY_LENGTH_GAIN = 0.7;
/** 위로 갈수록 안쪽으로 모이는 x 기울기 — 길이 대비. */
const RAY_LEAN = 0.14;
const RAY_ALPHA_BASE = 0.24;
const RAY_ALPHA_GAIN = 0.46;
const RAY_WIDTH_BASE = 1.2;
const RAY_WIDTH_GAIN = 2.6;
const RAY_X_SALT = 5.19;

/** 상승 스파크 입자. */
const SPARK_MAX = 40;
const SPARK_MIN = 6;
const SPARK_RISE_MS = 1700;
/** 스파크 한 변 — 화면 폭 대비 (동그라미가 아니라 각진 사각형). */
const SPARK_SIZE_RATIO = 0.007;
const SPARK_ALPHA = 0.72;
const SPARK_X_SALT = 2.63;

/** 하단 글로우 띠 겹 수 — 아래로 갈수록 진해진다. */
const GLOW_LAYERS = 3;
/** 글로우 전체 높이 — 화면 높이 대비. */
const GLOW_HEIGHT_RATIO = 0.16;
const GLOW_ALPHA_BASE = 0.08;
const GLOW_ALPHA_GAIN = 0.22;

/** reduced-motion에서 줄이는 입자 비율. */
const REDUCED_COUNT_RATIO = 0.45;

function countFor(intensity: number, max: number, min: number, reducedMotion: boolean): number {
  const scaledMax = reducedMotion ? Math.max(min, Math.round(max * REDUCED_COUNT_RATIO)) : max;
  return activeCount(intensity, scaledMax, min);
}

/** 바닥에서 솟는 광선. 위로 갈수록 안쪽으로 살짝 기운다. */
function drawRays(
  ctx: BattleCtx,
  palette: Palette,
  viewport: WeatherViewport,
  view: WeatherView,
  field: WeatherField,
): void {
  const span = Math.max(0, viewport.height - viewport.top);
  const count = countFor(view.intensity, RAY_MAX, RAY_MIN, view.reducedMotion);
  const time = motionTime(view.timeMs, view.reducedMotion);
  const centerX = viewport.width / 2;

  ctx.strokeStyle = rgba(palette.UP_ALLY, RAY_ALPHA_BASE + RAY_ALPHA_GAIN * view.intensity);
  ctx.lineWidth = RAY_WIDTH_BASE + RAY_WIDTH_GAIN * view.intensity;

  for (let i = 0; i < count; i += 1) {
    const seed = slotSeed(field, i);
    const length = span * RAY_LENGTH_RATIO * slotLength(field, i) * (1 + RAY_LENGTH_GAIN * view.intensity);
    const phase = fieldPhase(time, RAY_RISE_MS, seed, slotSpeed(field, i));

    const x0 = decorrelate(seed, RAY_X_SALT) * viewport.width;
    // 아래에서 위로: 위상이 커질수록 y가 작아진다.
    const y0 = viewport.height - phase * (span + length) + length;
    const lean = length * RAY_LEAN * (x0 < centerX ? 1 : -1);
    const x1 = x0 + lean;
    const y1 = y0 - length;

    if (overlapsCenterClear(Math.min(x0, x1), y1, Math.max(x0, x1), y0, viewport)) continue;

    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
}

/** 상승 스파크 — 각진 사각 입자. */
function drawSparks(
  ctx: BattleCtx,
  palette: Palette,
  viewport: WeatherViewport,
  view: WeatherView,
  field: WeatherField,
): void {
  const span = Math.max(0, viewport.height - viewport.top);
  const size = viewport.width * SPARK_SIZE_RATIO;
  const count = countFor(view.intensity, SPARK_MAX, SPARK_MIN, view.reducedMotion);
  const time = motionTime(view.timeMs, view.reducedMotion);

  ctx.fillStyle = rgba(palette.GOLD, SPARK_ALPHA);

  for (let i = 0; i < count; i += 1) {
    const seed = slotSeed(field, i);
    const phase = fieldPhase(time, SPARK_RISE_MS, decorrelate(seed, SPARK_X_SALT), slotSpeed(field, i));
    const x = seed * viewport.width;
    const y = viewport.height - phase * span;

    if (overlapsCenterClear(x, y, x + size, y + size, viewport)) continue;

    ctx.fillRect(x, y, size, size);
  }
}

/** 하단 에지의 따뜻한 글로우 — 그라디언트 금지이므로 납작한 띠를 겹쳐 쌓는다. */
function drawBottomGlow(ctx: BattleCtx, palette: Palette, viewport: WeatherViewport, intensity: number): void {
  const totalHeight = viewport.height * GLOW_HEIGHT_RATIO;
  const layerHeight = totalHeight / GLOW_LAYERS;

  for (let i = 0; i < GLOW_LAYERS; i += 1) {
    const depth = (i + 1) / GLOW_LAYERS;
    ctx.fillStyle = rgba(palette.UP_DEEP, clamp01((GLOW_ALPHA_BASE + GLOW_ALPHA_GAIN * intensity) * depth));
    const y = viewport.height - layerHeight * (i + 1);
    ctx.fillRect(0, y, viewport.width, layerHeight);
  }
}

/**
 * 시트 스프라이트 `tf-wx-02`를 격자로 깔아 상승기류를 만든다.
 * 위상 부호가 폭우와 반대라 격자가 **아래→위**로 흐른다(WX-01과 방향으로 구분된다).
 */
function drawUpdraftSprites(
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
    viewport.top,
    0,
    -tilePhase(time, SPRITE_RISE_MS),
    view.intensity,
    true,
  );
}

export function drawFomoUpdraft(
  ctx: BattleCtx,
  palette: Palette,
  viewport: WeatherViewport,
  view: WeatherView,
  field: WeatherField,
  rasters: SpriteRasterCache = DEFAULT_WEATHER_RASTERS,
): void {
  ctx.save();
  ctx.setLineDash([]);
  if (!drawUpdraftSprites(ctx, rasters, viewport, view)) {
    drawBottomGlow(ctx, palette, viewport, view.intensity);
    drawRays(ctx, palette, viewport, view, field);
    drawSparks(ctx, palette, viewport, view, field);
  }
  ctx.restore();
}
