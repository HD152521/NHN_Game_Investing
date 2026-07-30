/**
 * Flat 2D affine matrix math.
 *
 * Matrices live inside a shared `Float64Array` so that a whole skeleton can be
 * solved without allocating a single object per frame (PRD 11: 60 FPS with 60
 * units + 8 towers). Every function takes an explicit byte-free element offset
 * instead of returning a new matrix.
 *
 * Layout per matrix (identical to `CanvasRenderingContext2D.setTransform`):
 *   [a, b, c, d, e, f]  =>  x' = a*x + c*y + e
 *                           y' = b*x + d*y + f
 */

export const MAT_STRIDE = 6;

const M_A = 0;
const M_B = 1;
const M_C = 2;
const M_D = 3;
const M_E = 4;
const M_F = 5;

/**
 * `noUncheckedIndexedAccess` widens typed-array reads to `number | undefined`.
 * Offsets here are always computed from a validated part index, so this single
 * helper narrows once instead of scattering non-null assertions through the
 * hot path.
 */
function at(m: Float64Array, index: number): number {
  return m[index] as number;
}

export function createMatrixBuffer(count: number): Float64Array {
  const buffer = new Float64Array(count * MAT_STRIDE);
  for (let i = 0; i < count; i += 1) {
    setIdentity(buffer, i * MAT_STRIDE);
  }
  return buffer;
}

export function setIdentity(m: Float64Array, o: number): void {
  m[o + M_A] = 1;
  m[o + M_B] = 0;
  m[o + M_C] = 0;
  m[o + M_D] = 1;
  m[o + M_E] = 0;
  m[o + M_F] = 0;
}

/** Composes translate(tx,ty) * rotate(rot) * scale(sx,sy) directly into `m`. */
export function setTRS(
  m: Float64Array,
  o: number,
  tx: number,
  ty: number,
  rot: number,
  sx: number,
  sy: number,
): void {
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  m[o + M_A] = cos * sx;
  m[o + M_B] = sin * sx;
  m[o + M_C] = -sin * sy;
  m[o + M_D] = cos * sy;
  m[o + M_E] = tx;
  m[o + M_F] = ty;
}

/**
 * `out = parent * TRS(...)` without ever materialising the local matrix.
 *
 * This is the skeleton solver's inner loop. Keeping the local transform in
 * plain locals means the whole solve needs no scratch buffer and no shared
 * module state, so it stays re-entrant and allocation-free.
 */
export function composeTRSInto(
  out: Float64Array,
  oo: number,
  parent: Float64Array,
  po: number,
  tx: number,
  ty: number,
  rot: number,
  sx: number,
  sy: number,
): void {
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const la = cos * sx;
  const lb = sin * sx;
  const lc = -sin * sy;
  const ld = cos * sy;

  const pa = at(parent, po + M_A);
  const pb = at(parent, po + M_B);
  const pc = at(parent, po + M_C);
  const pd = at(parent, po + M_D);
  const pe = at(parent, po + M_E);
  const pf = at(parent, po + M_F);

  out[oo + M_A] = pa * la + pc * lb;
  out[oo + M_B] = pb * la + pd * lb;
  out[oo + M_C] = pa * lc + pc * ld;
  out[oo + M_D] = pb * lc + pd * ld;
  out[oo + M_E] = pa * tx + pc * ty + pe;
  out[oo + M_F] = pb * tx + pd * ty + pf;
}

export function applyToX(m: Float64Array, o: number, x: number, y: number): number {
  return at(m, o + M_A) * x + at(m, o + M_C) * y + at(m, o + M_E);
}

export function applyToY(m: Float64Array, o: number, x: number, y: number): number {
  return at(m, o + M_B) * x + at(m, o + M_D) * y + at(m, o + M_F);
}

/** Copies one matrix out as a plain tuple. Test/debug helper, not a hot path. */
export function readMat(
  m: Float64Array,
  o: number,
): [number, number, number, number, number, number] {
  return [
    at(m, o + M_A),
    at(m, o + M_B),
    at(m, o + M_C),
    at(m, o + M_D),
    at(m, o + M_E),
    at(m, o + M_F),
  ];
}
