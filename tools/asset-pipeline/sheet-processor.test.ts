import { describe, expect, test } from 'vitest';
import { processSheet } from './sheet-processor.js';
import { FIXTURE_SPECS } from './fixtures/specs.js';
import { renderMagentaSheet } from './fixtures/synth.js';
import { createImage } from './image.js';
import { AssetPipelineError } from './errors.js';

const fixture = (name: string) => FIXTURE_SPECS.find((s) => s.fileName === name)!.build();

describe('processSheet', () => {
  test('turns E-01 into three baseline-aligned unit frames', () => {
    const result = processSheet('E-01.png', fixture('E-01.png'));

    expect(result.frames.map((f) => f.name)).toEqual([
      'unit/intern',
      'unit/analyst',
      'unit/trader',
    ]);
    expect(new Set(result.frames.map((f) => f.baselineY)).size).toBe(1);
    expect(new Set(result.frames.map((f) => `${f.image.width}x${f.image.height}`)).size).toBe(1);
  });

  test('records the source sheet on every frame', () => {
    const result = processSheet('E-01.png', fixture('E-01.png'));
    expect(result.frames.every((f) => f.source === 'E-01.png')).toBe(true);
  });

  test('turns G-03 into six icon frames without forcing a shared baseline', () => {
    const result = processSheet('G-03.png', fixture('G-03.png'));
    expect(result.frames.map((f) => f.name)).toEqual([
      'icon/gold',
      'icon/aum',
      'icon/hp',
      'icon/wave',
      'icon/accuracy',
      'icon/upkeep',
    ]);
  });

  test('reports keyed and fringe pixel counts', () => {
    const result = processSheet('D-01.png', fixture('D-01.png'));
    expect(result.keyedPixels).toBeGreaterThan(0);
    expect(result.fringePixels).toBeGreaterThan(0);
  });

  test('treats an unregistered sheet as a single subject named after the file', () => {
    const sheet = renderMagentaSheet({
      width: 64,
      height: 64,
      subjects: [
        {
          color: { r: 20, g: 30, b: 40, a: 255 },
          shapes: [{ kind: 'ellipse', cx: 32, cy: 32, rx: 20, ry: 20 }],
        },
      ],
    });

    const result = processSheet('C-01-hq.png', sheet);
    expect(result.frames).toHaveLength(1);
    expect(result.frames[0]!.name).toBe('C-01-hq');
  });

  test('crops each frame tightly rather than keeping the full sheet', () => {
    const result = processSheet('E-01.png', fixture('E-01.png'));
    expect(result.frames[0]!.image.width).toBeLessThan(200);
  });

  test('fails loudly when the sheet has no magenta background', () => {
    expect(() => processSheet('E-01.png', createImage(32, 32, { r: 9, g: 9, b: 9, a: 255 }))).toThrow(
      AssetPipelineError,
    );
    expect(() => processSheet('E-01.png', createImage(32, 32, { r: 9, g: 9, b: 9, a: 255 }))).toThrow(
      /마젠타/,
    );
  });

  test('names the offending sheet when slicing does not find the expected subjects', () => {
    const oneSubject = renderMagentaSheet({
      width: 128,
      height: 64,
      subjects: [
        {
          color: { r: 20, g: 30, b: 40, a: 255 },
          shapes: [{ kind: 'ellipse', cx: 64, cy: 32, rx: 20, ry: 20 }],
        },
      ],
    });

    expect(() => processSheet('E-01.png', oneSubject)).toThrow(/E-01\.png/);
  });
});
