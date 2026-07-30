import { describe, expect, test } from 'vitest';

import { SkeletonBatch } from './batch.js';
import { MAT_STRIDE, applyToX, applyToY } from './matrix.js';
import { createHumanoidRig, createPose, createWorldBuffer, partIndex } from './rig.js';
import { samplePose } from './sample.js';
import { setRootTransform, solveWorld } from './solve.js';
import type { AnimState, EntityTransform } from './types.js';

const rig = createHumanoidRig();

const STATE: AnimState = { clip: 'walk', clipTime: 0.31, hitTime: 0.04, phaseOffset: 0.2 };
const ENTITY: EntityTransform = { x: 640, y: 480, facing: 'left', scale: 1.5 };

describe('SkeletonBatch', () => {
  test('reports the capacity it was built with', () => {
    expect(new SkeletonBatch(rig, 68).capacity).toBe(68);
  });

  test('rejects a nonsensical capacity at construction time', () => {
    expect(() => new SkeletonBatch(rig, 0)).toThrow(/capacity/);
    expect(() => new SkeletonBatch(rig, -3)).toThrow(/capacity/);
    expect(() => new SkeletonBatch(rig, 2.5)).toThrow(/capacity/);
  });

  test('slotOffset and matrixOffset agree for the first part', () => {
    const batch = new SkeletonBatch(rig, 5);
    expect(batch.matrixOffset(3, 0)).toBe(batch.slotOffset(3));
  });

  test('produces the same world matrices as solving a single entity by hand', () => {
    const batch = new SkeletonBatch(rig, 4);
    batch.solveEntity(2, STATE, ENTITY);

    const pose = createPose(rig);
    const world = createWorldBuffer(rig);
    const root = new Float64Array(MAT_STRIDE);
    samplePose(rig, STATE, pose);
    setRootTransform(root, ENTITY);
    solveWorld(rig, pose, world, root);

    for (let part = 0; part < rig.parts.length; part += 1) {
      const batchOffset = batch.matrixOffset(2, part);
      const soloOffset = part * MAT_STRIDE;
      expect(applyToX(batch.world, batchOffset, 3, 5)).toBeCloseTo(
        applyToX(world, soloOffset, 3, 5),
      );
      expect(applyToY(batch.world, batchOffset, 3, 5)).toBeCloseTo(
        applyToY(world, soloOffset, 3, 5),
      );
    }
  });

  test('keeps slots independent', () => {
    const batch = new SkeletonBatch(rig, 3);
    batch.solveEntity(0, STATE, { x: 0, y: 0, facing: 'right', scale: 1 });
    batch.solveEntity(1, STATE, { x: 500, y: 0, facing: 'right', scale: 1 });

    const torso = partIndex(rig, 'torso');
    expect(applyToX(batch.world, batch.matrixOffset(0, torso), 0, 0)).toBeCloseTo(0);
    expect(applyToX(batch.world, batch.matrixOffset(1, torso), 0, 0)).toBeCloseTo(500);
  });

  test('stores tint strength per slot', () => {
    const batch = new SkeletonBatch(rig, 2);
    batch.solveEntity(0, { ...STATE, hitTime: 0 }, ENTITY);
    batch.solveEntity(1, { ...STATE, hitTime: Number.POSITIVE_INFINITY }, ENTITY);

    expect(batch.tint[0] as number).toBeGreaterThan(0);
    expect(batch.tint[1] as number).toBe(0);
  });

  test('rejects an out-of-range slot instead of corrupting a neighbour', () => {
    const batch = new SkeletonBatch(rig, 2);

    expect(() => batch.solveEntity(2, STATE, ENTITY)).toThrow();
    expect(() => batch.solveEntity(-1, STATE, ENTITY)).toThrow();
  });

  test('re-solving a slot overwrites it rather than accumulating', () => {
    const batch = new SkeletonBatch(rig, 1);
    const torso = partIndex(rig, 'torso');

    batch.solveEntity(0, STATE, ENTITY);
    const first = applyToX(batch.world, batch.matrixOffset(0, torso), 1, 1);
    batch.solveEntity(0, STATE, ENTITY);
    const second = applyToX(batch.world, batch.matrixOffset(0, torso), 1, 1);

    expect(second).toBe(first);
  });

});
