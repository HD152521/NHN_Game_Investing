import {
  TAU,
  WALK_ARM_SWING,
  WALK_BOB_AMPLITUDE,
  WALK_BOB_HARMONIC,
  WALK_CALF_BEND,
  WALK_CALF_PHASE,
  WALK_CYCLE_SECONDS,
  WALK_FOREARM_SWING,
  WALK_THIGH_SWING,
  WALK_TORSO_LEAN,
} from '../constants.js';
import { wrap } from '../easing.js';
import { partIndex } from '../rig.js';
import type { AnimState, Pose, Rig } from '../types.js';

/**
 * Walk cycle built entirely from sine terms (art guide R5 — no AI frames).
 *
 * Half a cycle apart, the two legs swap roles, which is why `near` uses the
 * raw sine and `far` uses its negation. Arms take the opposite sign again so a
 * leg and the arm on the same side counter-swing, as a real gait does.
 */
export function applyWalk(rig: Rig, state: AnimState, pose: Pose): void {
  const phase = wrap(state.clipTime / WALK_CYCLE_SECONDS + state.phaseOffset, 1);
  const angle = TAU * phase;
  const swing = Math.sin(angle);

  writeLeg(rig, pose, 'thighNear', 'calfNear', angle, swing);
  writeLeg(rig, pose, 'thighFar', 'calfFar', angle + Math.PI, -swing);

  writeArm(rig, pose, 'upperArmNear', 'forearmNear', -swing);
  writeArm(rig, pose, 'upperArmFar', 'forearmFar', swing);

  const torso = partIndex(rig, 'torso');
  addRotation(pose, torso, WALK_TORSO_LEAN);
  pose.offsetY[torso] =
    (pose.offsetY[torso] as number) + WALK_BOB_AMPLITUDE * Math.sin(WALK_BOB_HARMONIC * angle);
}

function writeLeg(
  rig: Rig,
  pose: Pose,
  thighId: 'thighNear' | 'thighFar',
  calfId: 'calfNear' | 'calfFar',
  angle: number,
  swing: number,
): void {
  addRotation(pose, partIndex(rig, thighId), swing * WALK_THIGH_SWING);

  // The knee is a hinge: it only ever folds backwards, so the negative half of
  // the sine is clipped away instead of bending the shin the wrong way.
  const bend = Math.max(0, Math.sin(angle + WALK_CALF_PHASE));
  addRotation(pose, partIndex(rig, calfId), bend * WALK_CALF_BEND);
}

function writeArm(
  rig: Rig,
  pose: Pose,
  upperId: 'upperArmNear' | 'upperArmFar',
  lowerId: 'forearmNear' | 'forearmFar',
  swing: number,
): void {
  addRotation(pose, partIndex(rig, upperId), swing * WALK_ARM_SWING);
  addRotation(pose, partIndex(rig, lowerId), Math.max(0, swing) * WALK_FOREARM_SWING);
}

function addRotation(pose: Pose, index: number, delta: number): void {
  pose.rotation[index] = (pose.rotation[index] as number) + delta;
}
