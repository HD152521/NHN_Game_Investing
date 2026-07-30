import { MAT_STRIDE, composeTRSInto, setIdentity, setTRS } from './matrix.js';
import type { EntityTransform, Pose, Rig } from './types.js';

const NO_PARENT = -1;

/** Shared identity used when the caller supplies no entity-level root matrix. */
const IDENTITY_ROOT = ((): Float64Array => {
  const buffer = new Float64Array(MAT_STRIDE);
  setIdentity(buffer, 0);
  return buffer;
})();

/**
 * Writes the world matrix of every part into `out`.
 *
 * `out` must hold `rig.parts.length` matrices. Parts are visited in rig order,
 * which guarantees a parent is already solved by the time its child is
 * reached — one forward pass, no recursion, no sorting, no allocation.
 *
 * Deterministic and re-entrant: the only mutable state touched is `out`.
 */
export function solveWorld(
  rig: Rig,
  pose: Pose,
  out: Float64Array,
  root?: Float64Array,
  baseOffset = 0,
): void {
  const { parts, parentIndex } = rig;
  const rootMatrix = root ?? IDENTITY_ROOT;

  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i] as (typeof parts)[number];
    const parent = parentIndex[i] as number;

    const parentMatrix = parent === NO_PARENT ? rootMatrix : out;
    const parentOffset = parent === NO_PARENT ? 0 : baseOffset + parent * MAT_STRIDE;

    composeTRSInto(
      out,
      baseOffset + i * MAT_STRIDE,
      parentMatrix,
      parentOffset,
      part.attachX + (pose.offsetX[i] as number),
      part.attachY + (pose.offsetY[i] as number),
      pose.rotation[i] as number,
      pose.scaleX[i] as number,
      pose.scaleY[i] as number,
    );
  }
}

/**
 * Builds the entity-level root matrix. Facing left mirrors the x axis, which
 * is what turns the right-facing E-02 art sheet into a left-facing enemy unit
 * without a second set of sprites (art guide R4: strict side profile).
 */
export function setRootTransform(out: Float64Array, entity: EntityTransform): void {
  const flip = entity.facing === 'left' ? -1 : 1;
  setTRS(out, 0, entity.x, entity.y, 0, entity.scale * flip, entity.scale);
}
