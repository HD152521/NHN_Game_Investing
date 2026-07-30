/** Shared types for the parts-based animation system (art guide R5 / E-02). */

/** The six sprite images produced by art-sheet prompt E-02. */
export type SpritePartKey = 'torso' | 'upperArm' | 'forearm' | 'thigh' | 'calf' | 'weapon';

/**
 * Rig slots. A side-profile humanoid needs two arms and two legs, so several
 * slots reuse the same E-02 sprite; `side` tells the renderer which of them sit
 * behind the torso.
 */
export type PartId =
  | 'torso'
  | 'thighFar'
  | 'calfFar'
  | 'upperArmFar'
  | 'forearmFar'
  | 'thighNear'
  | 'calfNear'
  | 'upperArmNear'
  | 'forearmNear'
  | 'weapon';

export type PartSide = 'far' | 'near' | 'center';

export interface RigPart {
  readonly id: PartId;
  readonly parent: PartId | null;
  readonly sprite: SpritePartKey;
  readonly side: PartSide;
  /** Joint position in the parent's local space. Also this part's rotation pivot. */
  readonly attachX: number;
  readonly attachY: number;
  /** Rotation applied when no clip is driving this part, in radians. */
  readonly restRotation: number;
}

export interface Rig {
  readonly parts: readonly RigPart[];
  /** Index of each part's parent, or -1 for the root. Parallel to `parts`. */
  readonly parentIndex: Int32Array;
  /** Part indices in painter's order: far limbs, torso, near limbs, weapon. */
  readonly drawOrder: Int32Array;
  /** O(1) id -> index lookup, precomputed so clips never scan the part list. */
  readonly index: Readonly<Record<PartId, number>>;
}

/**
 * Mutable per-entity skeletal state. Reused across frames; clip sampling
 * overwrites every field, so no allocation happens during play.
 */
export interface Pose {
  readonly rotation: Float64Array;
  readonly scaleX: Float64Array;
  readonly scaleY: Float64Array;
  readonly offsetX: Float64Array;
  readonly offsetY: Float64Array;
  /** 0 = normal, 1 = fully tinted. Drives the hit flash without extra frames. */
  tintStrength: number;
}

export type Facing = 'right' | 'left';

export type ClipId = 'idle' | 'walk' | 'attack' | 'hit';

/**
 * Everything a pose depends on. Sampling is a pure function of this value, so
 * the same state always yields the same pose regardless of wall-clock time.
 */
export interface AnimState {
  readonly clip: ClipId;
  /** Seconds elapsed inside the current clip. */
  readonly clipTime: number;
  /** Seconds elapsed since the last damage event; drives the tint flash. */
  readonly hitTime: number;
  /** Per-entity phase offset so a crowd does not march in lockstep. */
  readonly phaseOffset: number;
}

export interface EntityTransform {
  readonly x: number;
  readonly y: number;
  readonly facing: Facing;
  readonly scale: number;
}
