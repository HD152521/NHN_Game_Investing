import {
  ATTACK_DURATION_SECONDS,
  ATTACK_OFF_ARM_RATIO,
  ATTACK_STRIKE_ARM,
  ATTACK_STRIKE_FOREARM,
  ATTACK_STRIKE_PEAK_RATIO,
  ATTACK_TORSO_TWIST,
  ATTACK_WEAPON_SWING,
  ATTACK_WINDUP_ARM,
  ATTACK_WINDUP_FOREARM,
  ATTACK_WINDUP_RATIO,
  SQUASH_STRETCH_AMOUNT,
  SQUASH_VOLUME_EXPONENT,
} from '../constants.js';
import { easeInOutSine, easeOutCubic, wrap } from '../easing.js';
import { partIndex } from '../rig.js';
import type { AnimState, Pose, Rig } from '../types.js';

/**
 * Attack swing shaped as a single scalar in [-1, 1]:
 *   -1 = fully wound back,  0 = neutral,  +1 = peak of the strike.
 *
 * Every driven channel (arm, forearm, weapon, torso twist, squash & stretch)
 * is a multiple of this scalar, which keeps them in sync by construction and
 * guarantees the clip both starts and ends at rest.
 */
export function attackSwing(progress: number): number {
  if (progress <= 0 || progress >= 1) {
    return 0;
  }
  if (progress < ATTACK_WINDUP_RATIO) {
    return -easeInOutSine(progress / ATTACK_WINDUP_RATIO);
  }

  const strike = (progress - ATTACK_WINDUP_RATIO) / (1 - ATTACK_WINDUP_RATIO);
  if (strike < ATTACK_STRIKE_PEAK_RATIO) {
    return -1 + 2 * easeOutCubic(strike / ATTACK_STRIKE_PEAK_RATIO);
  }

  const recovery = (strike - ATTACK_STRIKE_PEAK_RATIO) / (1 - ATTACK_STRIKE_PEAK_RATIO);
  return 1 - easeInOutSine(recovery);
}

export function applyAttack(rig: Rig, state: AnimState, pose: Pose): void {
  const progress = wrap(state.clipTime / ATTACK_DURATION_SECONDS, 1);
  const swing = attackSwing(progress);

  const forward = swing > 0 ? swing : 0;
  const back = swing < 0 ? -swing : 0;

  const armDelta = forward * ATTACK_STRIKE_ARM + back * ATTACK_WINDUP_ARM;
  const forearmDelta = forward * ATTACK_STRIKE_FOREARM + back * ATTACK_WINDUP_FOREARM;

  addRotation(pose, partIndex(rig, 'upperArmNear'), armDelta);
  addRotation(pose, partIndex(rig, 'forearmNear'), forearmDelta);
  addRotation(pose, partIndex(rig, 'weapon'), swing * ATTACK_WEAPON_SWING);

  // Off hand counter-rotates so the body reads as balanced rather than limp.
  addRotation(pose, partIndex(rig, 'upperArmFar'), armDelta * ATTACK_OFF_ARM_RATIO);

  const torso = partIndex(rig, 'torso');
  addRotation(pose, torso, swing * ATTACK_TORSO_TWIST);
  applySquashStretch(pose, torso, swing);
}

/**
 * Anticipation stretches the torso tall and thin; the impact squashes it short
 * and wide. `SQUASH_VOLUME_EXPONENT` below 1 keeps the silhouette from looking
 * rubbery while still reading as volume preserving.
 */
export function applySquashStretch(pose: Pose, index: number, swing: number): void {
  const scaleY = 1 - swing * SQUASH_STRETCH_AMOUNT;
  const scaleX = Math.pow(1 / scaleY, SQUASH_VOLUME_EXPONENT);

  pose.scaleY[index] = (pose.scaleY[index] as number) * scaleY;
  pose.scaleX[index] = (pose.scaleX[index] as number) * scaleX;
}

function addRotation(pose: Pose, index: number, delta: number): void {
  pose.rotation[index] = (pose.rotation[index] as number) + delta;
}
