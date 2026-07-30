import { IDLE_ARM_SWAY, IDLE_BREATH_AMOUNT, IDLE_CYCLE_SECONDS, TAU } from '../constants.js';
import { wrap } from '../easing.js';
import { partIndex } from '../rig.js';
import type { AnimState, Pose, Rig } from '../types.js';

/** Slow breathing plus a faint arm sway so a standing unit never reads as frozen. */
export function applyIdle(rig: Rig, state: AnimState, pose: Pose): void {
  const phase = wrap(state.clipTime / IDLE_CYCLE_SECONDS + state.phaseOffset, 1);
  const breath = Math.sin(TAU * phase);

  const torso = partIndex(rig, 'torso');
  pose.scaleY[torso] = (pose.scaleY[torso] as number) * (1 + breath * IDLE_BREATH_AMOUNT);

  const sway = breath * IDLE_ARM_SWAY;
  addRotation(pose, partIndex(rig, 'upperArmNear'), sway);
  addRotation(pose, partIndex(rig, 'upperArmFar'), -sway);
}

function addRotation(pose: Pose, index: number, delta: number): void {
  pose.rotation[index] = (pose.rotation[index] as number) + delta;
}
