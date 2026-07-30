import { describe, expect, test } from 'vitest';

import { MAT_STRIDE, applyToX, applyToY } from './matrix.js';
import {
  PART_ORDER,
  SPRITE_PART_KEYS,
  createHumanoidRig,
  createPose,
  createWorldBuffer,
  partIndex,
  resetPose,
} from './rig.js';
import { solveWorld } from './solve.js';
import type { PartId } from './types.js';

const rig = createHumanoidRig();

function worldOriginOf(partId: PartId, world: Float64Array): { x: number; y: number } {
  const offset = partIndex(rig, partId) * MAT_STRIDE;
  return { x: applyToX(world, offset, 0, 0), y: applyToY(world, offset, 0, 0) };
}

describe('humanoid rig definition', () => {
  test('exposes exactly the six art-sheet sprite parts from E-02', () => {
    expect([...SPRITE_PART_KEYS].sort()).toEqual(
      ['calf', 'forearm', 'thigh', 'torso', 'upperArm', 'weapon'].sort(),
    );
  });

  test('every part except the root has a parent that is declared before it', () => {
    const seen = new Set<PartId>();
    for (const part of rig.parts) {
      if (part.parent !== null) {
        expect(seen.has(part.parent)).toBe(true);
      }
      seen.add(part.id);
    }
    expect(rig.parts.length).toBe(PART_ORDER.length);
  });

  test('weapon inherits from the near forearm, which inherits from the near upper arm', () => {
    const byId = new Map(rig.parts.map((p) => [p.id, p]));
    expect(byId.get('weapon')?.parent).toBe('forearmNear');
    expect(byId.get('forearmNear')?.parent).toBe('upperArmNear');
    expect(byId.get('upperArmNear')?.parent).toBe('torso');
    expect(byId.get('torso')?.parent).toBe(null);
  });

  test('partIndex rejects an id the rig does not contain', () => {
    expect(() => partIndex(rig, 'nose' as PartId)).toThrow(/not present/);
  });

  test('each createHumanoidRig call returns an equivalent, independent rig', () => {
    const other = createHumanoidRig();
    expect(other.parts.map((p) => p.id)).toEqual(rig.parts.map((p) => p.id));
    expect(Array.from(other.drawOrder)).toEqual(Array.from(rig.drawOrder));
    expect(other).not.toBe(rig);
  });

  test('partIndex returns a stable index matching PART_ORDER', () => {
    PART_ORDER.forEach((id, i) => {
      expect(partIndex(rig, id)).toBe(i);
    });
  });
});

describe('world transform inheritance', () => {
  test('rotating a parent part carries the child part world transform with it', () => {
    const pose = createPose(rig);
    const world = createWorldBuffer(rig);

    resetPose(rig, pose);
    solveWorld(rig, pose, world);
    const restWeapon = worldOriginOf('weapon', world);

    resetPose(rig, pose);
    pose.rotation[partIndex(rig, 'upperArmNear')] = Math.PI / 2;
    solveWorld(rig, pose, world);
    const rotatedWeapon = worldOriginOf('weapon', world);

    const moved = Math.hypot(rotatedWeapon.x - restWeapon.x, rotatedWeapon.y - restWeapon.y);
    expect(moved).toBeGreaterThan(1);
  });

  test('rotating a child part does not move its parent', () => {
    const pose = createPose(rig);
    const world = createWorldBuffer(rig);

    resetPose(rig, pose);
    solveWorld(rig, pose, world);
    const restUpperArm = worldOriginOf('upperArmNear', world);

    resetPose(rig, pose);
    pose.rotation[partIndex(rig, 'forearmNear')] = 1.1;
    solveWorld(rig, pose, world);
    const afterUpperArm = worldOriginOf('upperArmNear', world);

    expect(afterUpperArm.x).toBeCloseTo(restUpperArm.x);
    expect(afterUpperArm.y).toBeCloseTo(restUpperArm.y);
  });

  test('a 180 degree parent rotation places the child on the opposite side of the joint', () => {
    const pose = createPose(rig);
    const world = createWorldBuffer(rig);
    const jointIndex = partIndex(rig, 'upperArmNear');
    const baseAngle = 0.3;

    resetPose(rig, pose);
    pose.rotation[jointIndex] = baseAngle;
    solveWorld(rig, pose, world);
    const joint = worldOriginOf('upperArmNear', world);
    const rest = worldOriginOf('forearmNear', world);

    resetPose(rig, pose);
    pose.rotation[jointIndex] = baseAngle + Math.PI;
    solveWorld(rig, pose, world);
    const flipped = worldOriginOf('forearmNear', world);

    expect(flipped.x - joint.x).toBeCloseTo(-(rest.x - joint.x));
    expect(flipped.y - joint.y).toBeCloseTo(-(rest.y - joint.y));
  });

  test('scaling the torso propagates to descendant world positions', () => {
    const pose = createPose(rig);
    const world = createWorldBuffer(rig);
    const torsoIndex = partIndex(rig, 'torso');

    resetPose(rig, pose);
    solveWorld(rig, pose, world);
    const rest = worldOriginOf('forearmNear', world);

    resetPose(rig, pose);
    pose.scaleY[torsoIndex] = 2;
    solveWorld(rig, pose, world);
    const stretched = worldOriginOf('forearmNear', world);

    expect(stretched.y).toBeCloseTo(rest.y * 2);
  });
});
