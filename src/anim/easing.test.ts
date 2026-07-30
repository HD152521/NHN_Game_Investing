import { describe, expect, test } from 'vitest';

import { clamp01, easeInOutSine, easeOutCubic, wrap } from './easing.js';

describe('clamp01', () => {
  test('passes values inside the unit range through unchanged', () => {
    expect(clamp01(0.42)).toBe(0.42);
  });

  test('clamps out-of-range values to the unit interval', () => {
    expect(clamp01(-5)).toBe(0);
    expect(clamp01(1.7)).toBe(1);
    expect(clamp01(0)).toBe(0);
    expect(clamp01(1)).toBe(1);
  });

  test('treats NaN as zero rather than propagating it into a pose', () => {
    expect(clamp01(Number.NaN)).toBe(0);
  });
});

describe('easing curves', () => {
  test('easeInOutSine spans 0 to 1 and is symmetric about the midpoint', () => {
    expect(easeInOutSine(0)).toBeCloseTo(0);
    expect(easeInOutSine(1)).toBeCloseTo(1);
    expect(easeInOutSine(0.5)).toBeCloseTo(0.5);
    expect(easeInOutSine(0.25) + easeInOutSine(0.75)).toBeCloseTo(1);
  });

  test('easeOutCubic spans 0 to 1 and front-loads its motion', () => {
    expect(easeOutCubic(0)).toBeCloseTo(0);
    expect(easeOutCubic(1)).toBeCloseTo(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });

  test('both curves clamp instead of overshooting outside [0,1]', () => {
    expect(easeInOutSine(-3)).toBeCloseTo(0);
    expect(easeOutCubic(9)).toBeCloseTo(1);
  });
});

describe('wrap', () => {
  test('keeps a value inside [0, period)', () => {
    expect(wrap(0.3, 1)).toBeCloseTo(0.3);
    expect(wrap(1.3, 1)).toBeCloseTo(0.3);
    expect(wrap(40.25, 1)).toBeCloseTo(0.25);
  });

  test('wraps negative values forward instead of returning a negative phase', () => {
    expect(wrap(-0.25, 1)).toBeCloseTo(0.75);
    expect(wrap(-2.5, 2)).toBeCloseTo(1.5);
  });
});
