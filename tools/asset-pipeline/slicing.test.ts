import { describe, expect, test } from 'vitest';
import { sliceGrid, sliceLineup } from './slicing.js';
import { renderMagentaSheet } from './fixtures/synth.js';
import type { Shape, SynthSubject } from './fixtures/synth.js';
import { keyMagenta } from './keying.js';
import { createImage } from './image.js';
import { AssetPipelineError } from './errors.js';

const NAVY = { r: 15, g: 21, b: 36, a: 255 };

function disc(cx: number, cy: number, r: number): Shape {
  return { kind: 'ellipse', cx, cy, rx: r, ry: r };
}

function subject(shapes: Shape[]): SynthSubject {
  return { color: NAVY, shapes };
}

function keyedSheet(width: number, height: number, subjects: SynthSubject[]) {
  return keyMagenta(renderMagentaSheet({ width, height, subjects })).image;
}

describe('sliceLineup', () => {
  const sheet = keyedSheet(180, 60, [
    subject([disc(30, 30, 12)]),
    subject([disc(90, 26, 16)]),
    subject([disc(150, 34, 10)]),
  ]);

  test('finds exactly the requested number of subjects', () => {
    expect(sliceLineup(sheet, { count: 3 })).toHaveLength(3);
  });

  test('returns rects ordered left to right and non-overlapping', () => {
    const rects = sliceLineup(sheet, { count: 3 });
    expect(rects[0]!.x).toBeLessThan(rects[1]!.x);
    expect(rects[1]!.x).toBeLessThan(rects[2]!.x);
    expect(rects[0]!.x + rects[0]!.width).toBeLessThanOrEqual(rects[1]!.x);
  });

  test('crops tightly around each subject instead of taking a full-height band', () => {
    const [, middle] = sliceLineup(sheet, { count: 3 });
    // 반지름 16 원 → 지름 32 안팎, 시트 높이 60 전체를 차지하면 안 됩니다.
    expect(middle!.height).toBeGreaterThan(28);
    expect(middle!.height).toBeLessThan(40);
  });

  test('preserves each subject vertical offset so baselines can differ', () => {
    const rects = sliceLineup(sheet, { count: 3 });
    const bottoms = rects.map((r) => r.y + r.height);
    expect(new Set(bottoms).size).toBeGreaterThan(1);
  });

  test('reports found vs expected when the sheet has fewer subjects', () => {
    expect(() => sliceLineup(sheet, { count: 5 })).toThrow(AssetPipelineError);
    expect(() => sliceLineup(sheet, { count: 5 })).toThrow(/3.*5|5.*3/s);
  });

  test('merges a detached prop back into its owner to hit the expected count', () => {
    const withProp = keyedSheet(180, 60, [
      subject([disc(28, 30, 12), disc(46, 20, 4)]),
      subject([disc(90, 26, 16)]),
      subject([disc(150, 34, 10)]),
    ]);
    const rects = sliceLineup(withProp, { count: 3 });

    expect(rects).toHaveLength(3);
    expect(rects[0]!.width).toBeGreaterThan(24);
  });

  test('rejects a fully transparent sheet with an actionable message', () => {
    expect(() => sliceLineup(createImage(40, 40), { count: 3 })).toThrow(/불투명|피사체/);
  });

  test('rejects a count below 1', () => {
    expect(() => sliceLineup(sheet, { count: 0 })).toThrow(AssetPipelineError);
  });
});

describe('sliceGrid', () => {
  const cells: SynthSubject[] = [];
  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      cells.push(subject([disc(30 + col * 60, 30 + row * 60, 14)]));
    }
  }
  const sheet = keyedSheet(180, 120, cells);

  test('returns rows x columns rects', () => {
    expect(sliceGrid(sheet, { columns: 3, rows: 2 })).toHaveLength(6);
  });

  test('returns them in reading order (top row left to right first)', () => {
    const rects = sliceGrid(sheet, { columns: 3, rows: 2 });
    expect(rects[0]!.y).toBeLessThan(rects[3]!.y);
    expect(rects[0]!.x).toBeLessThan(rects[1]!.x);
    expect(rects[3]!.x).toBeLessThan(rects[4]!.x);
  });

  test('reports the offending row when a row has the wrong column count', () => {
    expect(() => sliceGrid(sheet, { columns: 4, rows: 2 })).toThrow(AssetPipelineError);
    expect(() => sliceGrid(sheet, { columns: 4, rows: 2 })).toThrow(/행|row/i);
  });

  test('reports a row count mismatch', () => {
    expect(() => sliceGrid(sheet, { columns: 3, rows: 4 })).toThrow(AssetPipelineError);
  });

  test('rejects non-positive grid dimensions', () => {
    expect(() => sliceGrid(sheet, { columns: 0, rows: 2 })).toThrow(AssetPipelineError);
  });
});
