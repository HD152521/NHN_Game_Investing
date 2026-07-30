import { describe, expect, test } from 'vitest';

import {
  MAT_STRIDE,
  applyToX,
  applyToY,
  createMatrixBuffer,
  composeTRSInto,
  readMat,
  setIdentity,
  setTRS,
} from './matrix.js';

const HALF_PI = Math.PI / 2;

describe('matrix', () => {
  test('createMatrixBuffer allocates stride-sized slots and starts as identity', () => {
    const buf = createMatrixBuffer(3);

    expect(buf.length).toBe(3 * MAT_STRIDE);
    expect(readMat(buf, 0)).toEqual([1, 0, 0, 1, 0, 0]);
    expect(readMat(buf, 2 * MAT_STRIDE)).toEqual([1, 0, 0, 1, 0, 0]);
  });

  test('setIdentity leaves a point untouched', () => {
    const buf = createMatrixBuffer(1);
    setTRS(buf, 0, 5, 7, HALF_PI, 2, 2);
    setIdentity(buf, 0);

    expect(applyToX(buf, 0, 3, 4)).toBeCloseTo(3);
    expect(applyToY(buf, 0, 3, 4)).toBeCloseTo(4);
  });

  test('setTRS applies scale, then rotation, then translation', () => {
    const buf = createMatrixBuffer(1);
    setTRS(buf, 0, 10, 20, HALF_PI, 2, 3);

    // (1,0) -> scale (2,0) -> rotate 90deg (0,2) -> translate (10,22)
    expect(applyToX(buf, 0, 1, 0)).toBeCloseTo(10);
    expect(applyToY(buf, 0, 1, 0)).toBeCloseTo(22);
  });

  test('setTRS with negative x scale mirrors the x axis', () => {
    const buf = createMatrixBuffer(1);
    setTRS(buf, 0, 0, 0, 0, -1, 1);

    expect(applyToX(buf, 0, 4, 9)).toBeCloseTo(-4);
    expect(applyToY(buf, 0, 4, 9)).toBeCloseTo(9);
  });

  test('composeTRSInto composes parent then child in that order', () => {
    const buf = createMatrixBuffer(2);
    const parent = 0;
    const world = MAT_STRIDE;

    setTRS(buf, parent, 100, 0, 0, 1, 1);
    composeTRSInto(buf, world, buf, parent, 10, 0, HALF_PI, 1, 1);

    // child origin lands at parent translation + child translation
    expect(applyToX(buf, world, 0, 0)).toBeCloseTo(110);
    expect(applyToY(buf, world, 0, 0)).toBeCloseTo(0);
    // child local +x is rotated to world +y
    expect(applyToX(buf, world, 5, 0)).toBeCloseTo(110);
    expect(applyToY(buf, world, 5, 0)).toBeCloseTo(5);
  });

  test('composeTRSInto against an identity parent equals a plain setTRS', () => {
    const buf = createMatrixBuffer(3);
    setTRS(buf, MAT_STRIDE, 7, -3, 0.9, 1.3, 0.6);
    composeTRSInto(buf, MAT_STRIDE * 2, buf, 0, 7, -3, 0.9, 1.3, 0.6);

    expect(readMat(buf, MAT_STRIDE * 2)).toEqual(readMat(buf, MAT_STRIDE));
  });

  test('composeTRSInto inherits the parent mirror', () => {
    const buf = createMatrixBuffer(2);
    setTRS(buf, 0, 0, 0, 0, -1, 1);
    composeTRSInto(buf, MAT_STRIDE, buf, 0, 20, 5, 0, 1, 1);

    expect(applyToX(buf, MAT_STRIDE, 0, 0)).toBeCloseTo(-20);
    expect(applyToY(buf, MAT_STRIDE, 0, 0)).toBeCloseTo(5);
  });
});
