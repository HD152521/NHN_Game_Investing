import { describe, expect, test } from 'vitest';
import { buildPreviewSheet, downscaleToFit } from './preview.js';
import { ImageBuilder, createImage, getPixel } from './image.js';
import { AssetPipelineError } from './errors.js';

const WHITE = { r: 255, g: 255, b: 255, a: 255 };

describe('downscaleToFit', () => {
  test('fits the longer side to the requested size', () => {
    const small = downscaleToFit(createImage(200, 100, WHITE), 64);
    expect(small.width).toBe(64);
    expect(small.height).toBe(32);
  });

  test('keeps at least one pixel on the shorter side', () => {
    const small = downscaleToFit(createImage(1000, 3, WHITE), 64);
    expect(small.height).toBeGreaterThanOrEqual(1);
  });

  test('leaves an already small image untouched', () => {
    const source = createImage(10, 10, WHITE);
    const small = downscaleToFit(source, 64);
    expect(small.width).toBe(10);
    expect(getPixel(small, 5, 5)).toEqual(WHITE);
  });

  test('keeps a solid area solid', () => {
    const small = downscaleToFit(createImage(128, 128, WHITE), 64);
    expect(getPixel(small, 32, 32)).toEqual(WHITE);
  });

  test('weights color by alpha so transparent pixels do not darken the result', () => {
    const builder = new ImageBuilder(2, 2);
    builder.setPixel(0, 0, WHITE); // 나머지 3픽셀은 투명한 검정
    const small = downscaleToFit(builder.toImage(), 1);
    const pixel = getPixel(small, 0, 0);

    expect(pixel.a).toBeCloseTo(64, -1);
    expect(pixel.r).toBeGreaterThan(200); // 순진한 평균이면 64 근처가 됩니다
  });

  test('rejects a non-positive target size', () => {
    expect(() => downscaleToFit(createImage(4, 4), 0)).toThrow(AssetPipelineError);
  });
});

describe('buildPreviewSheet', () => {
  const entries = Array.from({ length: 5 }, (_, i) => ({
    name: `unit-${i}`,
    image: createImage(120 + i * 10, 200, WHITE),
  }));

  test('lays every entry out on a fixed cell grid', () => {
    const sheet = buildPreviewSheet(entries, { cellSize: 64, columns: 3 });
    expect(sheet.cells).toHaveLength(5);
    expect(sheet.image.width).toBe(64 * 3);
    expect(sheet.image.height).toBe(64 * 2);
  });

  test('scales every entry down to the cell size', () => {
    const sheet = buildPreviewSheet(entries, { cellSize: 64, columns: 3 });
    for (const cell of sheet.cells) {
      expect(cell.rect.width).toBeLessThanOrEqual(64);
      expect(cell.rect.height).toBeLessThanOrEqual(64);
    }
  });

  test('places cells in reading order', () => {
    const sheet = buildPreviewSheet(entries, { cellSize: 64, columns: 3 });
    expect(sheet.cells[0]!.rect.y).toBeLessThan(sheet.cells[3]!.rect.y);
    expect(sheet.cells[0]!.rect.x).toBeLessThan(sheet.cells[1]!.rect.x);
  });

  test('keeps the entry names for the review sheet', () => {
    const sheet = buildPreviewSheet(entries, { cellSize: 64, columns: 3 });
    expect(sheet.cells.map((c) => c.name)).toEqual(entries.map((e) => e.name));
  });

  test('rejects an empty entry list', () => {
    expect(() => buildPreviewSheet([], { cellSize: 64, columns: 3 })).toThrow(AssetPipelineError);
  });
});
