import { MAT_STRIDE } from './matrix.js';
import { createPose } from './rig.js';
import { samplePose } from './sample.js';
import { setRootTransform, solveWorld } from './solve.js';
import type { AnimState, EntityTransform, Pose, Rig } from './types.js';

/**
 * Fixed-capacity pool of solved skeletons.
 *
 * Everything is allocated once in the constructor: the world matrices for every
 * slot, the tint strengths, one root matrix and a single reusable pose. The
 * pose is scratch because it is consumed immediately by `solveWorld` and never
 * needed again — only the world matrices have to survive until draw time. That
 * turns 60 units + 8 towers into a couple of flat typed arrays instead of
 * hundreds of live objects, which is what keeps the frame free of GC spikes
 * (PRD 11).
 *
 * `solveEntity` allocates nothing.
 */
export class SkeletonBatch {
  readonly capacity: number;

  /** All slots' world matrices, `capacity * partCount` matrices end to end. */
  readonly world: Float64Array;

  /** Hit-flash strength per slot, parallel to the slot index. */
  readonly tint: Float64Array;

  private readonly rig: Rig;
  private readonly partCount: number;
  private readonly pose: Pose;
  private readonly root: Float64Array;

  constructor(rig: Rig, capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error(`SkeletonBatch capacity must be a positive integer, got ${capacity}`);
    }

    this.rig = rig;
    this.capacity = capacity;
    this.partCount = rig.parts.length;
    this.world = new Float64Array(capacity * this.partCount * MAT_STRIDE);
    this.tint = new Float64Array(capacity);
    this.pose = createPose(rig);
    this.root = new Float64Array(MAT_STRIDE);
  }

  /** Element offset of one part's world matrix inside `world`. */
  matrixOffset(slot: number, part: number): number {
    return (slot * this.partCount + part) * MAT_STRIDE;
  }

  /** Element offset of a slot's first world matrix. Pass this to the renderer. */
  slotOffset(slot: number): number {
    return slot * this.partCount * MAT_STRIDE;
  }

  /**
   * Samples the clip and solves the skeleton for one slot.
   *
   * `state` and `entity` are read-only and caller-owned: a game keeps these on
   * its long-lived entity records, so no object is created on either side of
   * the call.
   */
  solveEntity(slot: number, state: AnimState, entity: EntityTransform): void {
    if (!Number.isInteger(slot) || slot < 0 || slot >= this.capacity) {
      throw new RangeError(`slot ${slot} is outside batch capacity ${this.capacity}`);
    }

    samplePose(this.rig, state, this.pose);
    setRootTransform(this.root, entity);
    solveWorld(this.rig, this.pose, this.world, this.root, this.slotOffset(slot));
    this.tint[slot] = this.pose.tintStrength;
  }
}
