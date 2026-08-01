/**
 * 발판(GROUND) 판정 공개 API — 아트-프로덕션시트 §02.
 *
 * 사용 예:
 * ```ts
 * const state = classifyGroundState({
 *   maxAdvance: maxEnemyAdvance(combat.enemies),
 *   wave: combat.wave,
 *   waveCount: combat.waveCount,
 * });
 * // → 'intact' | 'cracked' | 'collapsed' 를 렌더러(src/battle/draw-ground.ts)에 넘긴다.
 * ```
 */

export { CRACK_ADVANCE_THRESHOLD, LATE_WAVE_PROGRESS } from './constants.js';

export { classifyGroundState, isLateWave, maxEnemyAdvance } from './advance.js';

export { classifySlotDecal } from './slots.js';

export { GROUND_STATES, SLOT_DECAL_STATES } from './types.js';
export type {
  AdvancingEnemy,
  GroundConditions,
  GroundState,
  SlotConditions,
  SlotDecalState,
} from './types.js';
