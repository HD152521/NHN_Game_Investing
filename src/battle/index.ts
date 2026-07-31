/**
 * 전장 렌더러 공개 API 배럴.
 */

export { drawBattle } from './battle.js';
export type { DrawBattleOptions } from './battle.js';

export { computeBattleLayout, laneY, progressToX, slotRect } from './layout.js';
export type { BattleLayout, Rect } from './layout.js';

export { slotAt } from './hit-test.js';

export type { BattleCtx } from './surface.js';
