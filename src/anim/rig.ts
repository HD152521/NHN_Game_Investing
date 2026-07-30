import {
  ELBOW_LENGTH,
  GRIP_X,
  HAND_LENGTH,
  HIP_X_FAR,
  HIP_X_NEAR,
  HIP_Y,
  REST_FOREARM,
  REST_UPPER_ARM,
  REST_WEAPON,
  SHOULDER_X_FAR,
  SHOULDER_X_NEAR,
  SHOULDER_Y,
  THIGH_LENGTH,
} from './constants.js';
import { createMatrixBuffer } from './matrix.js';
import type { PartId, Pose, Rig, RigPart, SpritePartKey } from './types.js';

/** The six sprite images the E-02 art-sheet prompt produces. */
export const SPRITE_PART_KEYS: readonly SpritePartKey[] = [
  'torso',
  'upperArm',
  'forearm',
  'thigh',
  'calf',
  'weapon',
];

/**
 * Solve order. Parents must always appear before their children so a single
 * forward pass is enough — no recursion, no sorting at runtime.
 */
export const PART_ORDER: readonly PartId[] = [
  'torso',
  'thighFar',
  'calfFar',
  'upperArmFar',
  'forearmFar',
  'thighNear',
  'calfNear',
  'upperArmNear',
  'forearmNear',
  'weapon',
];

/** Painter's order: everything behind the torso, the torso, then the near side. */
const DRAW_ORDER: readonly PartId[] = [
  'thighFar',
  'calfFar',
  'upperArmFar',
  'forearmFar',
  'torso',
  'thighNear',
  'calfNear',
  'upperArmNear',
  'forearmNear',
  'weapon',
];

const PART_SPECS: readonly RigPart[] = [
  {
    id: 'torso',
    parent: null,
    sprite: 'torso',
    side: 'center',
    attachX: 0,
    attachY: 0,
    restRotation: 0,
  },
  {
    id: 'thighFar',
    parent: 'torso',
    sprite: 'thigh',
    side: 'far',
    attachX: HIP_X_FAR,
    attachY: HIP_Y,
    restRotation: 0,
  },
  {
    id: 'calfFar',
    parent: 'thighFar',
    sprite: 'calf',
    side: 'far',
    attachX: 0,
    attachY: THIGH_LENGTH,
    restRotation: 0,
  },
  {
    id: 'upperArmFar',
    parent: 'torso',
    sprite: 'upperArm',
    side: 'far',
    attachX: SHOULDER_X_FAR,
    attachY: SHOULDER_Y,
    restRotation: REST_UPPER_ARM,
  },
  {
    id: 'forearmFar',
    parent: 'upperArmFar',
    sprite: 'forearm',
    side: 'far',
    attachX: 0,
    attachY: ELBOW_LENGTH,
    restRotation: REST_FOREARM,
  },
  {
    id: 'thighNear',
    parent: 'torso',
    sprite: 'thigh',
    side: 'near',
    attachX: HIP_X_NEAR,
    attachY: HIP_Y,
    restRotation: 0,
  },
  {
    id: 'calfNear',
    parent: 'thighNear',
    sprite: 'calf',
    side: 'near',
    attachX: 0,
    attachY: THIGH_LENGTH,
    restRotation: 0,
  },
  {
    id: 'upperArmNear',
    parent: 'torso',
    sprite: 'upperArm',
    side: 'near',
    attachX: SHOULDER_X_NEAR,
    attachY: SHOULDER_Y,
    restRotation: REST_UPPER_ARM,
  },
  {
    id: 'forearmNear',
    parent: 'upperArmNear',
    sprite: 'forearm',
    side: 'near',
    attachX: 0,
    attachY: ELBOW_LENGTH,
    restRotation: REST_FOREARM,
  },
  {
    id: 'weapon',
    parent: 'forearmNear',
    sprite: 'weapon',
    side: 'near',
    attachX: GRIP_X,
    attachY: HAND_LENGTH,
    restRotation: REST_WEAPON,
  },
];

function indexOfPart(id: PartId): number {
  const index = PART_ORDER.indexOf(id);
  if (index < 0) {
    throw new Error(`unknown rig part: ${id}`);
  }
  return index;
}

/**
 * Builds the side-profile humanoid rig. The result is immutable and shareable:
 * one rig instance serves every unit on screen.
 */
export function createHumanoidRig(): Rig {
  const parts = PART_ORDER.map((id) => {
    const spec = PART_SPECS.find((candidate) => candidate.id === id);
    if (spec === undefined) {
      throw new Error(`missing rig spec for part: ${id}`);
    }
    return spec;
  });

  const parentIndex = new Int32Array(parts.length);
  parts.forEach((part, i) => {
    parentIndex[i] = part.parent === null ? -1 : indexOfPart(part.parent);
  });

  const drawOrder = Int32Array.from(DRAW_ORDER, indexOfPart);

  const index = Object.fromEntries(parts.map((part, i) => [part.id, i])) as Record<PartId, number>;

  return { parts, parentIndex, drawOrder, index };
}

export function partIndex(rig: Rig, id: PartId): number {
  const index = rig.index[id];
  if (index === undefined) {
    throw new Error(`part ${id} is not present in this rig`);
  }
  return index;
}

/** Allocates a reusable pose. Call once per entity, never per frame. */
export function createPose(rig: Rig): Pose {
  const count = rig.parts.length;
  const pose: Pose = {
    rotation: new Float64Array(count),
    scaleX: new Float64Array(count),
    scaleY: new Float64Array(count),
    offsetX: new Float64Array(count),
    offsetY: new Float64Array(count),
    tintStrength: 0,
  };
  resetPose(rig, pose);
  return pose;
}

/** Restores the rest pose in place. */
export function resetPose(rig: Rig, pose: Pose): void {
  for (let i = 0; i < rig.parts.length; i += 1) {
    const part = rig.parts[i] as (typeof rig.parts)[number];
    pose.rotation[i] = part.restRotation;
    pose.scaleX[i] = 1;
    pose.scaleY[i] = 1;
    pose.offsetX[i] = 0;
    pose.offsetY[i] = 0;
  }
  pose.tintStrength = 0;
}

/** Allocates the world-matrix scratch buffer for one entity. */
export function createWorldBuffer(rig: Rig): Float64Array {
  return createMatrixBuffer(rig.parts.length);
}
