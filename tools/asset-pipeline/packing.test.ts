import { describe, expect, test } from 'vitest';
import { composeAtlas, packShelves } from './packing.js';
import { createImage, getPixel } from './image.js';
import { AssetPipelineError } from './errors.js';
import type { PackInput } from './packing.js';
import type { Rect } from './types.js';

const RED = { r: 255, g: 0, b: 0, a: 255 };
const BLUE = { r: 0, g: 0, b: 255, a: 255 };

function input(name: string, width: number, height: number, color = RED): PackInput {
  return { name, image: createImage(width, height, color), baselineY: height - 1 };
}

function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
  );
}

describe('packShelves', () => {
  test('places every frame', () => {
    const result = packShelves([input('a', 10, 10), input('b', 20, 5), input('c', 8, 12)]);
    expect(result.placements.map((p) => p.name).sort()).toEqual(['a', 'b', 'c']);
  });

  test('never overlaps two frames', () => {
    const items = Array.from({ length: 12 }, (_, i) => input(`f${i}`, 20 + i, 10 + (i % 5) * 3));
    const result = packShelves(items, { maxWidth: 64, padding: 1 });

    for (let i = 0; i < result.placements.length; i += 1) {
      for (let j = i + 1; j < result.placements.length; j += 1) {
        expect(overlaps(result.placements[i]!.rect, result.placements[j]!.rect)).toBe(false);
      }
    }
  });

  test('keeps every frame inside the reported atlas size', () => {
    const result = packShelves([input('a', 30, 10), input('b', 40, 20)], { maxWidth: 64 });
    for (const placement of result.placements) {
      expect(placement.rect.x + placement.rect.width).toBeLessThanOrEqual(result.width);
      expect(placement.rect.y + placement.rect.height).toBeLessThanOrEqual(result.height);
    }
  });

  test('wraps to a new shelf when the row is full', () => {
    const result = packShelves([input('a', 30, 10), input('b', 30, 10)], {
      maxWidth: 40,
      padding: 0,
    });
    expect(result.placements[1]!.rect.y).toBeGreaterThan(0);
  });

  test('rejects duplicate frame names — the manifest is keyed by name', () => {
    expect(() => packShelves([input('dup', 4, 4), input('dup', 5, 5)])).toThrow(/dup/);
  });

  test('rejects an empty input list', () => {
    expect(() => packShelves([])).toThrow(AssetPipelineError);
  });

  test('names the frame that is too wide to ever fit', () => {
    expect(() => packShelves([input('huge', 200, 10)], { maxWidth: 64 })).toThrow(/huge/);
  });
});

describe('composeAtlas', () => {
  test('draws each frame at its packed position', () => {
    const items = [input('a', 4, 4, RED), input('b', 4, 4, BLUE)];
    const result = packShelves(items, { maxWidth: 32, padding: 0 });
    const atlas = composeAtlas(items, result);

    for (const placement of result.placements) {
      const expected = placement.name === 'a' ? RED : BLUE;
      expect(getPixel(atlas, placement.rect.x, placement.rect.y)).toEqual(expected);
    }
  });

  test('leaves the padding gutters transparent', () => {
    const items = [input('a', 4, 4), input('b', 4, 4)];
    const result = packShelves(items, { maxWidth: 32, padding: 2 });
    const atlas = composeAtlas(items, result);
    const gutterX = result.placements[0]!.rect.width;

    expect(getPixel(atlas, gutterX, 0).a).toBe(0);
  });

  test('rejects a placement set that does not match the inputs', () => {
    const items = [input('a', 4, 4)];
    const result = packShelves(items, { maxWidth: 32 });
    expect(() => composeAtlas([input('other', 4, 4)], result)).toThrow(AssetPipelineError);
  });
});
