import { describe, expect, test } from 'vitest';
import { columnAlphaHistogram, findSegments, mergeToCount, rowAlphaHistogram } from './histogram.js';
import { ImageBuilder } from './image.js';
import { AssetPipelineError } from './errors.js';

const WHITE = { r: 255, g: 255, b: 255, a: 255 };

describe('columnAlphaHistogram', () => {
  test('counts opaque pixels per column', () => {
    const builder = new ImageBuilder(4, 3);
    builder.setPixel(1, 0, WHITE);
    builder.setPixel(1, 2, WHITE);
    builder.setPixel(3, 1, WHITE);

    expect(columnAlphaHistogram(builder.toImage())).toEqual([0, 2, 0, 1]);
  });

  test('ignores near-transparent antialiasing dust', () => {
    const builder = new ImageBuilder(2, 1);
    builder.setPixel(0, 0, { r: 255, g: 255, b: 255, a: 4 });
    expect(columnAlphaHistogram(builder.toImage())).toEqual([0, 0]);
  });
});

describe('rowAlphaHistogram', () => {
  test('counts opaque pixels per row', () => {
    const builder = new ImageBuilder(3, 4);
    builder.setPixel(0, 2, WHITE);
    builder.setPixel(2, 2, WHITE);

    expect(rowAlphaHistogram(builder.toImage())).toEqual([0, 0, 2, 0]);
  });
});

describe('findSegments', () => {
  test('splits runs separated by a gap of at least minGap', () => {
    const histogram = [0, 3, 3, 0, 0, 0, 5, 5, 0];
    expect(findSegments(histogram, { minGap: 3, minSize: 1 })).toEqual([
      { start: 1, end: 2 },
      { start: 6, end: 7 },
    ]);
  });

  test('keeps runs joined when the gap is shorter than minGap', () => {
    const histogram = [0, 3, 0, 3, 0];
    expect(findSegments(histogram, { minGap: 3, minSize: 1 })).toEqual([{ start: 1, end: 3 }]);
  });

  test('drops runs narrower than minSize', () => {
    const histogram = [4, 0, 0, 0, 7, 7, 7, 7];
    expect(findSegments(histogram, { minGap: 2, minSize: 3 })).toEqual([{ start: 4, end: 7 }]);
  });

  test('returns an empty list for an all-zero histogram', () => {
    expect(findSegments([0, 0, 0], { minGap: 1, minSize: 1 })).toEqual([]);
  });

  test('rejects a non-positive minGap', () => {
    expect(() => findSegments([1], { minGap: 0, minSize: 1 })).toThrow(AssetPipelineError);
  });
});

describe('mergeToCount', () => {
  const segments = [
    { start: 0, end: 4 },
    { start: 6, end: 8 },
    { start: 30, end: 40 },
  ];

  test('merges across the narrowest gap first', () => {
    expect(mergeToCount(segments, 2)).toEqual([
      { start: 0, end: 8 },
      { start: 30, end: 40 },
    ]);
  });

  test('returns the input untouched when the count already matches', () => {
    expect(mergeToCount(segments, 3)).toEqual(segments);
  });

  test('refuses to invent segments when there are too few', () => {
    expect(() => mergeToCount(segments, 5)).toThrow(AssetPipelineError);
    expect(() => mergeToCount(segments, 5)).toThrow(/3.*5|5.*3/);
  });

  test('rejects a target below 1', () => {
    expect(() => mergeToCount(segments, 0)).toThrow(AssetPipelineError);
  });
});
