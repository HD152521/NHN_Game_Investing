/**
 * 전장 렌더러 공개 API 배럴.
 */

export { drawBattle } from './battle.js';
export type { BattleWeather, DrawBattleOptions } from './battle.js';

export { drawWeather, weatherViewport } from './draw-weather.js';

export { computeBattleLayout, laneY, progressToX, slotRect } from './layout.js';
export type { BattleLayout, Rect } from './layout.js';

export { slotAt } from './hit-test.js';

export type { BattleCtx } from './surface.js';

export { createDeathField, drawDeaths, pushDeaths, DEATH_DURATION_MS } from './death-fx.js';
export type { DeathField } from './death-fx.js';
