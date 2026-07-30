import { describe, expect, test } from 'vitest';
import { assertNoMagentaResidue, findMagentaResidue } from './verify.js';
import { ImageBuilder, createImage } from './image.js';
import { keyMagenta } from './keying.js';
import { renderMagentaSheet } from './fixtures/synth.js';
import { MagentaResidueError } from './errors.js';
import { MAGENTA } from './constants.js';

const NAVY = { r: 15, g: 21, b: 36, a: 255 };

describe('findMagentaResidue', () => {
  test('reports zero on a properly keyed sprite', () => {
    const sheet = renderMagentaSheet({
      width: 40,
      height: 40,
      subjects: [{ color: NAVY, shapes: [{ kind: 'ellipse', cx: 20, cy: 20, rx: 13, ry: 13 }] }],
    });

    expect(findMagentaResidue(keyMagenta(sheet).image).count).toBe(0);
  });

  test('ignores fully transparent magenta — invisible pixels cannot bleed', () => {
    const builder = new ImageBuilder(4, 4);
    builder.setPixel(1, 1, { ...MAGENTA, a: 0 });
    expect(findMagentaResidue(builder.toImage()).count).toBe(0);
  });

  test('catches a visible magenta pixel and reports where it is', () => {
    const builder = new ImageBuilder(8, 8);
    builder.setPixel(5, 3, MAGENTA);
    const report = findMagentaResidue(builder.toImage());

    expect(report.count).toBe(1);
    expect(report.samples[0]).toMatchObject({ x: 5, y: 3 });
  });

  test('catches a near-magenta fringe leftover, not just exact #FF00FF', () => {
    const builder = new ImageBuilder(4, 4);
    builder.setPixel(0, 0, { r: 240, g: 30, b: 238, a: 200 });
    expect(findMagentaResidue(builder.toImage()).count).toBe(1);
  });

  test('does not flag an unkeyed magenta-free image', () => {
    expect(findMagentaResidue(createImage(4, 4, NAVY)).count).toBe(0);
  });

  test('caps the number of reported samples', () => {
    const report = findMagentaResidue(createImage(20, 20, MAGENTA), { maxSamples: 3 });
    expect(report.count).toBe(400);
    expect(report.samples).toHaveLength(3);
  });
});

describe('assertNoMagentaResidue', () => {
  test('passes silently on a clean image', () => {
    expect(() => assertNoMagentaResidue(createImage(4, 4, NAVY), 'atlas.png')).not.toThrow();
  });

  test('throws MagentaResidueError naming the artifact and a coordinate', () => {
    const builder = new ImageBuilder(8, 8);
    builder.setPixel(2, 6, MAGENTA);

    expect(() => assertNoMagentaResidue(builder.toImage(), 'atlas.png')).toThrow(
      MagentaResidueError,
    );
    expect(() => assertNoMagentaResidue(builder.toImage(), 'atlas.png')).toThrow(/atlas\.png/);
    expect(() => assertNoMagentaResidue(builder.toImage(), 'atlas.png')).toThrow(/2\s*,\s*6/);
  });
});
