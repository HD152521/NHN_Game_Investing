import { describe, expect, test } from 'vitest';

import {
  ATTACK_DURATION_SECONDS,
  HIT_FLASH_PEAK,
  HIT_FLASH_SECONDS,
  WALK_CYCLE_SECONDS,
} from '../constants.js';
import { createHumanoidRig, createPose, partIndex, resetPose } from '../rig.js';
import type { AnimState } from '../types.js';
import { applyAttack } from './attack.js';
import { applyHitFlash } from './hit.js';
import { applyWalk } from './walk.js';

const rig = createHumanoidRig();

const thighNear = partIndex(rig, 'thighNear');
const thighFar = partIndex(rig, 'thighFar');
const upperArmNear = partIndex(rig, 'upperArmNear');
const torso = partIndex(rig, 'torso');
const weapon = partIndex(rig, 'weapon');

function state(overrides: Partial<AnimState>): AnimState {
  return { clip: 'idle', clipTime: 0, hitTime: Number.POSITIVE_INFINITY, phaseOffset: 0, ...overrides };
}

function walkPoseAt(clipTime: number) {
  const pose = createPose(rig);
  resetPose(rig, pose);
  applyWalk(rig, state({ clip: 'walk', clipTime }), pose);
  return pose;
}

function attackPoseAt(clipTime: number) {
  const pose = createPose(rig);
  resetPose(rig, pose);
  applyAttack(rig, state({ clip: 'attack', clipTime }), pose);
  return pose;
}

describe('walk clip', () => {
  test('the two legs swing in opposite phase', () => {
    // Quarter cycle: the sine term is at its extreme, so the split is clearest.
    const pose = walkPoseAt(WALK_CYCLE_SECONDS * 0.25);
    const near = pose.rotation[thighNear] as number;
    const far = pose.rotation[thighFar] as number;

    expect(Math.sign(near)).toBe(-Math.sign(far));
    expect(Math.abs(near)).toBeCloseTo(Math.abs(far));
  });

  test('the arms counter-swing against the leg on the same side', () => {
    const pose = walkPoseAt(WALK_CYCLE_SECONDS * 0.25);
    const legSwing = pose.rotation[thighNear] as number;
    const armSwing = (pose.rotation[upperArmNear] as number) - (rig.parts[upperArmNear]?.restRotation ?? 0);

    expect(Math.sign(armSwing)).toBe(-Math.sign(legSwing));
  });

  test('the torso bobs vertically over the cycle', () => {
    const low = walkPoseAt(0).offsetY[torso] as number;
    const mid = walkPoseAt(WALK_CYCLE_SECONDS * 0.125).offsetY[torso] as number;

    expect(low).not.toBeCloseTo(mid);
  });

  test('the knee never bends the wrong way', () => {
    const calfNear = partIndex(rig, 'calfNear');
    for (let i = 0; i <= 24; i += 1) {
      const pose = walkPoseAt((WALK_CYCLE_SECONDS * i) / 24);
      expect(pose.rotation[calfNear] as number).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('attack clip', () => {
  test('the weapon rotation moves away from rest during the strike', () => {
    const rest = createPose(rig);
    const mid = attackPoseAt(ATTACK_DURATION_SECONDS * 0.6);

    expect(mid.rotation[weapon] as number).not.toBeCloseTo(rest.rotation[weapon] as number);
    expect(mid.rotation[upperArmNear] as number).not.toBeCloseTo(
      rest.rotation[upperArmNear] as number,
    );
  });

  test('the arm winds back before it swings forward', () => {
    const windup = attackPoseAt(ATTACK_DURATION_SECONDS * 0.2);
    const strike = attackPoseAt(ATTACK_DURATION_SECONDS * 0.55);
    const restArm = rig.parts[upperArmNear]?.restRotation ?? 0;

    expect((windup.rotation[upperArmNear] as number) - restArm).toBeLessThan(0);
    expect((strike.rotation[upperArmNear] as number) - restArm).toBeGreaterThan(0);
  });

  test('squash and stretch deforms the torso and roughly preserves volume', () => {
    const windup = attackPoseAt(ATTACK_DURATION_SECONDS * 0.3);
    const stretchY = windup.scaleY[torso] as number;
    const stretchX = windup.scaleX[torso] as number;

    expect(stretchY).toBeGreaterThan(1);
    expect(stretchX).toBeLessThan(1);
    expect(stretchX * stretchY).toBeGreaterThan(0.9);
    expect(stretchX * stretchY).toBeLessThan(1.1);
  });

  test('the strike squashes the torso in the opposite direction to the windup', () => {
    const windupY = attackPoseAt(ATTACK_DURATION_SECONDS * 0.3).scaleY[torso] as number;
    const strikeY = attackPoseAt(ATTACK_DURATION_SECONDS * 0.45).scaleY[torso] as number;

    expect(windupY).toBeGreaterThan(1);
    expect(strikeY).toBeLessThan(1);
  });

  test('the clip starts and ends undeformed so it can loop cleanly', () => {
    for (const t of [0, ATTACK_DURATION_SECONDS, ATTACK_DURATION_SECONDS * 2]) {
      const pose = attackPoseAt(t);
      expect(pose.scaleY[torso] as number).toBeCloseTo(1);
      expect(pose.scaleX[torso] as number).toBeCloseTo(1);
    }
  });
});

describe('hit flash', () => {
  test('peaks at the moment of impact and decays to zero', () => {
    const pose = createPose(rig);

    applyHitFlash(rig, 0, pose);
    expect(pose.tintStrength).toBeCloseTo(HIT_FLASH_PEAK);

    applyHitFlash(rig, HIT_FLASH_SECONDS * 0.5, pose);
    expect(pose.tintStrength).toBeGreaterThan(0);
    expect(pose.tintStrength).toBeLessThan(HIT_FLASH_PEAK);

    applyHitFlash(rig, HIT_FLASH_SECONDS, pose);
    expect(pose.tintStrength).toBe(0);
  });

  test('decays monotonically', () => {
    const pose = createPose(rig);
    let previous = Number.POSITIVE_INFINITY;

    for (let i = 0; i <= 10; i += 1) {
      applyHitFlash(rig, (HIT_FLASH_SECONDS * i) / 10, pose);
      expect(pose.tintStrength).toBeLessThanOrEqual(previous);
      previous = pose.tintStrength;
    }
  });

  test('is inert when no hit is pending', () => {
    const pose = createPose(rig);
    applyHitFlash(rig, Number.POSITIVE_INFINITY, pose);
    expect(pose.tintStrength).toBe(0);
  });

  test('adds no extra skeletal frames — only tint and a recoil on the torso', () => {
    const pose = createPose(rig);
    const before = Array.from(pose.rotation);

    applyHitFlash(rig, 0, pose);
    const after = Array.from(pose.rotation);

    const changed = after.filter((value, i) => value !== before[i]).length;
    expect(changed).toBe(1);
    expect(after[torso]).not.toBe(before[torso]);
  });
});
