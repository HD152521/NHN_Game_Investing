import { describe, expect, test } from 'vitest';
import {
  ImageBuilder,
  createImage,
  cropImage,
  getPixel,
  opaqueBounds,
} from './image.js';
import { AssetPipelineError } from './errors.js';
import { MAGENTA } from './constants.js';

const TRANSPARENT = { r: 0, g: 0, b: 0, a: 0 };
const WHITE = { r: 255, g: 255, b: 255, a: 255 };

describe('createImage', () => {
  test('allocates width * height * 4 bytes', () => {
    const image = createImage(3, 2);
    expect(image.data.length).toBe(3 * 2 * 4);
  });

  test('fills every pixel with the given color', () => {
    const image = createImage(2, 2, MAGENTA);
    expect(getPixel(image, 1, 1)).toEqual({ r: 255, g: 0, b: 255, a: 255 });
  });

  test('defaults to fully transparent pixels', () => {
    const image = createImage(1, 1);
    expect(getPixel(image, 0, 0)).toEqual(TRANSPARENT);
  });

  test('rejects non-positive dimensions instead of returning an empty image', () => {
    expect(() => createImage(0, 4)).toThrow(AssetPipelineError);
    expect(() => createImage(4, -1)).toThrow(AssetPipelineError);
  });

  test('rejects non-integer dimensions', () => {
    expect(() => createImage(2.5, 4)).toThrow(AssetPipelineError);
  });
});

describe('getPixel', () => {
  test('throws with coordinates in the message when out of bounds', () => {
    const image = createImage(2, 2);
    expect(() => getPixel(image, 2, 0)).toThrow(/2\s*,\s*0/);
    expect(() => getPixel(image, -1, 0)).toThrow(AssetPipelineError);
  });
});

describe('cropImage', () => {
  test('extracts the requested region', () => {
    const builder = new ImageBuilder(4, 4);
    builder.setPixel(3, 2, WHITE);
    const cropped = cropImage(builder.toImage(), { x: 2, y: 2, width: 2, height: 2 });

    expect(cropped.width).toBe(2);
    expect(cropped.height).toBe(2);
    expect(getPixel(cropped, 1, 0)).toEqual(WHITE);
    expect(getPixel(cropped, 0, 0)).toEqual(TRANSPARENT);
  });

  test('does not alias the source buffer', () => {
    const source = createImage(4, 4, WHITE);
    const cropped = cropImage(source, { x: 0, y: 0, width: 2, height: 2 });
    expect(cropped.data.buffer).not.toBe(source.data.buffer);
  });

  test('rejects a rect that reaches outside the source', () => {
    const source = createImage(4, 4);
    expect(() => cropImage(source, { x: 3, y: 0, width: 2, height: 1 })).toThrow(
      AssetPipelineError,
    );
  });
});

describe('ImageBuilder', () => {
  test('draws a source image at an offset', () => {
    const sprite = createImage(2, 2, WHITE);
    const builder = new ImageBuilder(6, 6);
    builder.draw(sprite, 4, 1);

    const sheet = builder.toImage();
    expect(getPixel(sheet, 4, 1)).toEqual(WHITE);
    expect(getPixel(sheet, 5, 2)).toEqual(WHITE);
    expect(getPixel(sheet, 3, 1)).toEqual(TRANSPARENT);
  });

  test('clips draws that fall partly outside the canvas', () => {
    const sprite = createImage(4, 4, WHITE);
    const builder = new ImageBuilder(2, 2);
    builder.draw(sprite, -1, -1);
    expect(getPixel(builder.toImage(), 0, 0)).toEqual(WHITE);
  });

  test('toImage returns an independent snapshot', () => {
    const builder = new ImageBuilder(2, 2);
    const first = builder.toImage();
    builder.setPixel(0, 0, WHITE);
    expect(getPixel(first, 0, 0)).toEqual(TRANSPARENT);
  });
});

describe('opaqueBounds', () => {
  test('returns the tight box around opaque pixels', () => {
    const builder = new ImageBuilder(8, 8);
    builder.setPixel(2, 3, WHITE);
    builder.setPixel(5, 6, WHITE);

    expect(opaqueBounds(builder.toImage())).toEqual({ x: 2, y: 3, width: 4, height: 4 });
  });

  test('returns null for a fully transparent image', () => {
    expect(opaqueBounds(createImage(4, 4))).toBeNull();
  });

  test('ignores pixels below the alpha threshold', () => {
    const builder = new ImageBuilder(4, 4);
    builder.setPixel(1, 1, { r: 255, g: 255, b: 255, a: 3 });
    expect(opaqueBounds(builder.toImage())).toBeNull();
  });
});
