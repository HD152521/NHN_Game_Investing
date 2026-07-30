import { applyAttack } from './clips/attack.js';
import { applyHitFlash } from './clips/hit.js';
import { applyIdle } from './clips/idle.js';
import { applyWalk } from './clips/walk.js';
import { resetPose } from './rig.js';
import type { AnimState, Pose, Rig } from './types.js';

/**
 * Turns animation state into a skeletal pose.
 *
 * This is the seam the PRD 11 "게임 로직과 렌더러 완전 분리" requirement rests
 * on: it touches no Canvas, no DOM and no clock. Given the same `rig` and
 * `state` it always writes the same values into `pose`, which makes it fully
 * testable headless and safe to run ahead of, or independently from, drawing.
 *
 * `pose` is caller-owned and fully overwritten, so a live entity can keep one
 * buffer for its whole lifetime and never allocate during play.
 */
export function samplePose(rig: Rig, state: AnimState, pose: Pose): void {
  resetPose(rig, pose);

  switch (state.clip) {
    case 'walk':
      applyWalk(rig, state, pose);
      break;
    case 'attack':
      applyAttack(rig, state, pose);
      break;
    case 'idle':
    case 'hit':
      applyIdle(rig, state, pose);
      break;
  }

  applyHitFlash(rig, effectiveHitTime(state), pose);
}

/**
 * The flash is an overlay, not a clip of its own: a unit can be walking and
 * flashing at the same time. Selecting `clip: 'hit'` simply means "the clip
 * timer is also the flash timer", which lets callers that track a single timer
 * still get the effect.
 */
function effectiveHitTime(state: AnimState): number {
  if (state.clip !== 'hit') {
    return state.hitTime;
  }
  return state.hitTime <= state.clipTime ? state.hitTime : state.clipTime;
}
