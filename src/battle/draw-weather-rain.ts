/**
 * `WX-01` 패닉 셀 — 청색 폭우 (아트-프로덕션시트 §03).
 *
 * 위→아래로 **꺾여** 떨어지는 청색 광선 + 각진 빛 조각, 가장자리에서 조여드는 비네트,
 * 중경에 유령처럼 겹친 하강 차트선.
 *
 * 시트 공통 금지: 읽히는 글자·숫자 / 그라디언트 메시 / 사실적 연기. 납작하고 각지게.
 * → 곡선·그라디언트를 일절 쓰지 않고 직선 폴리라인과 삼각형만 쓴다.
 */

import type { Palette } from '../design/index.js';
import type { WeatherField, WeatherView, WeatherViewport } from '../weather/index.js';
import { activeCount, fieldPhase, overlapsCenterClear, slotLength, slotSeed, slotSpeed } from '../weather/index.js';
import { clamp01, decorrelate, lerp, motionTime } from './draw-weather-shared.js';
import { rgba } from './style.js';
import type { BattleCtx } from './surface.js';

/** 광선 최대/최소 개수. 최소치가 있어야 임계를 갓 넘긴 순간에도 '비'로 읽힌다. */
const RAY_MAX = 48;
const RAY_MIN = 10;
/** 광선 1회 낙하 주기(ms). */
const RAY_FALL_MS = 900;
/** 광선 기본 길이 — 전장 높이 대비 비율. */
const RAY_LENGTH_RATIO = 0.18;
/** 강도에 따라 길이가 늘어나는 비율 (급락이 심할수록 빗줄기가 길고 굵다). */
const RAY_LENGTH_GAIN = 0.6;
/** 꺾이기 전 구간의 x 기울기 — 길이 대비. */
const RAY_SLANT = 0.22;
/** 꺾이는 지점 — 길이 대비. */
const RAY_KINK_AT = 0.55;
/** 꺾인 뒤 되돌아가는 x 비율 — 길이 대비. */
const RAY_KINK_BACK = 0.34;
const RAY_ALPHA_BASE = 0.26;
const RAY_ALPHA_GAIN = 0.44;
const RAY_WIDTH_BASE = 1.1;
const RAY_WIDTH_GAIN = 2.2;
/** x 위치를 낙하 위상과 탈상관시키는 배수. */
const RAY_X_SALT = 7.31;

/** 각진 빛 조각. */
const SHARD_MAX = 18;
const SHARD_MIN = 4;
const SHARD_FALL_MS = 1500;
/** 조각 크기 — 화면 폭 대비. */
const SHARD_SIZE_RATIO = 0.016;
const SHARD_ALPHA = 0.5;
const SHARD_X_SALT = 3.77;
/** 조각의 비대칭 꼬리 길이 배수 (각지게 보이도록 정삼각형을 피한다). */
const SHARD_TAIL = 2.1;

/** 비네트 띠 두께 — 화면 크기 대비. */
const VIGNETTE_BAND_RATIO = 0.14;
const VIGNETTE_ALPHA_BASE = 0.22;
const VIGNETTE_ALPHA_GAIN = 0.5;

/** 유령 차트선 꼭짓점 수. */
const GHOST_POINTS = 12;
const GHOST_ALPHA = 0.2;
const GHOST_WIDTH = 2;
/** 좌→우로 내려가는 낙폭 — 전장 높이 대비. */
const GHOST_DROP_RATIO = 0.42;
/** 유령선 지그재그 진폭 — 전장 높이 대비. */
const GHOST_JAG_RATIO = 0.06;
const GHOST_DRIFT_MS = 5200;

/** reduced-motion에서 줄이는 입자 비율. 모션은 멈추되 색·형태 정보는 남긴다. */
const REDUCED_COUNT_RATIO = 0.45;

function countFor(intensity: number, max: number, min: number, reducedMotion: boolean): number {
  const scaledMax = reducedMotion ? Math.max(min, Math.round(max * REDUCED_COUNT_RATIO)) : max;
  return activeCount(intensity, scaledMax, min);
}

/** 꺾여 떨어지는 청색 광선. 중앙 공백과 겹치는 광선은 통째로 건너뛴다. */
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

  ctx.strokeStyle = rgba(palette.ENEMY_DOWN, RAY_ALPHA_BASE + RAY_ALPHA_GAIN * view.intensity);
  ctx.lineWidth = RAY_WIDTH_BASE + RAY_WIDTH_GAIN * view.intensity;

  for (let i = 0; i < count; i += 1) {
    const seed = slotSeed(field, i);
    const length = span * RAY_LENGTH_RATIO * slotLength(field, i) * (1 + RAY_LENGTH_GAIN * view.intensity);
    const phase = fieldPhase(time, RAY_FALL_MS, seed, slotSpeed(field, i));

    const x0 = decorrelate(seed, RAY_X_SALT) * viewport.width;
    const y0 = viewport.top + phase * (span + length) - length;
    const x1 = x0 + length * RAY_SLANT;
    const y1 = y0 + length * RAY_KINK_AT;
    const x2 = x1 - length * RAY_KINK_BACK;
    const y2 = y0 + length;

    const minX = Math.min(x0, x1, x2);
    const maxX = Math.max(x0, x1, x2);
    if (overlapsCenterClear(minX, y0, maxX, y2, viewport)) continue;

    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
}

/** 각진 빛 조각 — 정삼각형을 피해 한쪽으로 길게 뽑은 삼각형. */
function drawShards(
  ctx: BattleCtx,
  palette: Palette,
  viewport: WeatherViewport,
  view: WeatherView,
  field: WeatherField,
): void {
  const span = Math.max(0, viewport.height - viewport.top);
  const size = viewport.width * SHARD_SIZE_RATIO;
  const count = countFor(view.intensity, SHARD_MAX, SHARD_MIN, view.reducedMotion);
  const time = motionTime(view.timeMs, view.reducedMotion);

  ctx.fillStyle = rgba(palette.ENEMY_DEEP, SHARD_ALPHA);

  for (let i = 0; i < count; i += 1) {
    const seed = slotSeed(field, i);
    const phase = fieldPhase(time, SHARD_FALL_MS, decorrelate(seed, SHARD_X_SALT), slotSpeed(field, i));
    const x = seed * viewport.width;
    const y = viewport.top + phase * span;
    const tail = size * SHARD_TAIL;

    if (overlapsCenterClear(x - size, y, x + size, y + tail, viewport)) continue;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + size, y + size);
    ctx.lineTo(x - size * 0.4, y + tail);
    ctx.closePath();
    ctx.fill();
  }
}

/** 가장자리에서 조여드는 비네트 — 네 변 띠. 중앙 공백은 애초에 건드리지 않는다. */
function drawVignette(ctx: BattleCtx, palette: Palette, viewport: WeatherViewport, intensity: number): void {
  const bandW = viewport.width * VIGNETTE_BAND_RATIO;
  const bandH = viewport.height * VIGNETTE_BAND_RATIO;

  ctx.fillStyle = rgba(palette.LINE, clamp01(VIGNETTE_ALPHA_BASE + VIGNETTE_ALPHA_GAIN * intensity));
  ctx.fillRect(0, 0, bandW, viewport.height);
  ctx.fillRect(viewport.width - bandW, 0, bandW, viewport.height);
  ctx.fillRect(0, 0, viewport.width, bandH);
  ctx.fillRect(0, viewport.height - bandH, viewport.width, bandH);
}

/** 중경에 유령처럼 겹친 하강 차트선. 중앙 공백에 걸리는 구간은 끊어져 더 유령처럼 보인다. */
function drawGhostChartLine(
  ctx: BattleCtx,
  palette: Palette,
  viewport: WeatherViewport,
  view: WeatherView,
): void {
  const span = Math.max(0, viewport.height - viewport.top);
  const time = motionTime(view.timeMs, view.reducedMotion);
  const drift = fieldPhase(time, GHOST_DRIFT_MS, 0, 1);

  ctx.strokeStyle = rgba(palette.ENEMY_DEEP, GHOST_ALPHA * (0.5 + 0.5 * view.intensity));
  ctx.lineWidth = GHOST_WIDTH;

  const top = viewport.top + span * 0.12;
  for (let i = 0; i < GHOST_POINTS - 1; i += 1) {
    const f0 = i / (GHOST_POINTS - 1);
    const f1 = (i + 1) / (GHOST_POINTS - 1);
    const x0 = f0 * viewport.width;
    const x1 = f1 * viewport.width;
    const y0 = top + lerp(0, span * GHOST_DROP_RATIO, f0) + Math.sin((f0 + drift) * Math.PI * 6) * span * GHOST_JAG_RATIO;
    const y1 = top + lerp(0, span * GHOST_DROP_RATIO, f1) + Math.sin((f1 + drift) * Math.PI * 6) * span * GHOST_JAG_RATIO;

    if (overlapsCenterClear(x0, y0, x1, y1, viewport)) continue;

    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
}

export function drawPanicRain(
  ctx: BattleCtx,
  palette: Palette,
  viewport: WeatherViewport,
  view: WeatherView,
  field: WeatherField,
): void {
  ctx.save();
  ctx.setLineDash([]);
  drawVignette(ctx, palette, viewport, view.intensity);
  drawGhostChartLine(ctx, palette, viewport, view);
  drawShards(ctx, palette, viewport, view, field);
  drawRays(ctx, palette, viewport, view, field);
  ctx.restore();
}
