/**
 * 날씨 시스템 공개 API — 아트-프로덕션시트 v1.1 §03 WEATHER FX.
 *
 * > 날씨는 분위기가 아니라 **시장 상태 표시**다.
 *
 * 이 모듈은 **판정만** 한다. Canvas는 한 줄도 없다 (그리기는 `src/battle/draw-weather*.ts`).
 *
 * 사용 예:
 * ```ts
 * const field = createWeatherField();           // 앱 시작 시 1회
 *
 * // 매 프레임
 * const conditions = {
 *   recentChangePct: recentChangePct(set.bars, state.barIndex),
 *   sigma30: set.sigma30,
 *   halted: false,
 *   event: activeEventAt(set.events, state.elapsedMs),
 * };
 * const kind = resolveWeatherKind(conditions, previousKind, blackoutFrames);
 * const intensity = weatherIntensity(conditions, kind);
 * ```
 */

export {
  BLACKOUT_MAX_FRAMES,
  BLACKOUT_SCANLINE_COUNT,
  DIRECTIONAL_FULL_Z,
  DIRECTIONAL_MIN_Z,
  EVENT_INTENSITY_FLOOR,
  EVENT_WINDOW_MS,
  FOG_BAND_COUNT,
  FOG_FULL_SIGMA_PCT,
  FOG_MAX_ABS_CHANGE_PCT,
  FOG_MAX_SIGMA_PCT,
  Z_SIGMA_FLOOR_PCT,
} from './constants.js';

export { WEATHER_KINDS } from './types.js';
export type { MarketConditions, WeatherKind, WeatherView, WeatherViewport } from './types.js';

export { classifyWeatherKind, marketZ, weatherIntensity } from './classify.js';
export { isBlackoutVisible, resolveWeatherKind } from './resolve.js';
export { activeEventAt } from './event-window.js';
export { RECENT_WINDOW_BARS, recentChangePct } from './indicators.js';

export {
  CENTER_CLEAR_HEIGHT_RATIO,
  CENTER_CLEAR_WIDTH_RATIO,
  centerClearBottom,
  centerClearLeft,
  centerClearRight,
  centerClearTop,
  isInsideCenterClear,
  overlapsCenterClear,
} from './geometry.js';

export {
  FIELD_SLOT_COUNT,
  activeCount,
  createWeatherField,
  fieldPhase,
  slotLength,
  slotSeed,
  slotSpeed,
} from './field.js';
export type { WeatherField } from './field.js';

export { WEATHER_SIGNATURE_TOKEN } from './signature.js';
