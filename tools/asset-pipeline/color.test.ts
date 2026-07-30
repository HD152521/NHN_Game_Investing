import { describe, expect, test } from 'vitest';
import { magentaDistance, spillRatio, subjectSpillBias, unmixFromMagenta } from './color.js';

describe('magentaDistance', () => {
  test('is 0 for pure #FF00FF', () => {
    expect(magentaDistance({ r: 255, g: 0, b: 255 })).toBe(0);
  });

  test('is large for white — that is exactly why R2 picks magenta over white', () => {
    expect(magentaDistance({ r: 255, g: 255, b: 255 })).toBe(255);
  });

  test('uses the worst channel, not the average', () => {
    expect(magentaDistance({ r: 255, g: 10, b: 235 })).toBe(20);
  });
});

describe('spillRatio', () => {
  test('is 1 for pure magenta', () => {
    expect(spillRatio({ r: 255, g: 0, b: 255 })).toBeCloseTo(1, 5);
  });

  test('is 0 for a neutral color', () => {
    expect(spillRatio({ r: 128, g: 128, b: 128 })).toBeCloseTo(0, 5);
  });

  test('is ~0.5 for an even mix of magenta and white', () => {
    expect(spillRatio({ r: 255, g: 128, b: 255 })).toBeCloseTo(0.498, 2);
  });

  test('never goes below 0 even when green dominates', () => {
    expect(spillRatio({ r: 10, g: 200, b: 10 })).toBe(0);
  });
});

describe('subjectSpillBias', () => {
  test('is ~0 for neutral subjects', () => {
    expect(subjectSpillBias({ r: 15, g: 21, b: 36 })).toBeLessThan(0.05);
  });

  test('is meaningfully positive for a purple subject like #9B6BFF', () => {
    expect(subjectSpillBias({ r: 155, g: 107, b: 255 })).toBeGreaterThan(0.15);
  });
});

describe('unmixFromMagenta', () => {
  test('recovers the original subject color from a 50% magenta mix', () => {
    // navy #0F1524 를 마젠타와 반반 섞은 값
    const mixed = { r: 135, g: 11, b: 146 };
    const recovered = unmixFromMagenta(mixed, 0.5);

    expect(recovered.r).toBeCloseTo(15, -1);
    expect(recovered.g).toBeCloseTo(21, -1);
    expect(recovered.b).toBeCloseTo(36, -1);
  });

  test('returns the input untouched at full coverage', () => {
    expect(unmixFromMagenta({ r: 10, g: 20, b: 30 }, 1)).toEqual({ r: 10, g: 20, b: 30 });
  });

  test('returns black at zero coverage rather than dividing by zero', () => {
    expect(unmixFromMagenta({ r: 255, g: 0, b: 255 }, 0)).toEqual({ r: 0, g: 0, b: 0 });
  });

  test('clamps recovered channels into 0..255', () => {
    const recovered = unmixFromMagenta({ r: 255, g: 0, b: 255 }, 0.05);
    expect(recovered.r).toBeLessThanOrEqual(255);
    expect(recovered.r).toBeGreaterThanOrEqual(0);
  });
});
