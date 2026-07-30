import { describe, expect, test } from 'vitest';
import { alignBaselines, findBaseline } from './baseline.js';
import { ImageBuilder, createImage, opaqueBounds } from './image.js';
import { AssetPipelineError } from './errors.js';
import type { RgbaImage } from './types.js';

const WHITE = { r: 255, g: 255, b: 255, a: 255 };

/** width x height 캔버스에 (x, top)~(x, bottom) 세로 막대 하나를 그린 스프라이트. */
function bar(width: number, height: number, x: number, top: number, bottom: number): RgbaImage {
  const builder = new ImageBuilder(width, height);
  for (let y = top; y <= bottom; y += 1) builder.setPixel(x, y, WHITE);
  return builder.toImage();
}

function countOpaque(image: RgbaImage): number {
  let count = 0;
  for (let i = 3; i < image.data.length; i += 4) if ((image.data[i] ?? 0) > 0) count += 1;
  return count;
}

describe('findBaseline', () => {
  test('returns the lowest row containing an opaque pixel', () => {
    expect(findBaseline(bar(8, 16, 3, 2, 11))).toBe(11);
  });

  test('ignores alpha below the threshold', () => {
    const builder = new ImageBuilder(4, 8);
    builder.setPixel(1, 1, WHITE);
    builder.setPixel(1, 6, { r: 255, g: 255, b: 255, a: 2 });
    expect(findBaseline(builder.toImage())).toBe(1);
  });

  test('throws on a fully transparent sprite instead of returning -1', () => {
    expect(() => findBaseline(createImage(4, 4))).toThrow(AssetPipelineError);
  });
});

describe('alignBaselines', () => {
  // 발밑 y가 각각 11, 9, 13 으로 어긋난 유닛 3종
  const sprites = [bar(8, 16, 3, 2, 11), bar(10, 16, 4, 1, 9), bar(6, 16, 2, 5, 13)];

  test('puts every sprite on an identical canvas', () => {
    const aligned = alignBaselines(sprites);
    const sizes = new Set(aligned.map((s) => `${s.image.width}x${s.image.height}`));
    expect(sizes.size).toBe(1);
  });

  test('lands every baseline on the exact same row (PART 6 check 2)', () => {
    const aligned = alignBaselines(sprites);
    const baselines = aligned.map((s) => findBaseline(s.image));
    expect(new Set(baselines).size).toBe(1);
    expect(baselines[0]).toBe(aligned[0]!.baselineY);
  });

  test('centers each sprite horizontally', () => {
    const aligned = alignBaselines(sprites);
    for (const sprite of aligned) {
      const bounds = opaqueBounds(sprite.image)!;
      const leftGap = bounds.x;
      const rightGap = sprite.image.width - (bounds.x + bounds.width);
      expect(Math.abs(leftGap - rightGap)).toBeLessThanOrEqual(1);
    }
  });

  test('loses no opaque pixels', () => {
    const aligned = alignBaselines(sprites);
    aligned.forEach((sprite, index) => {
      expect(countOpaque(sprite.image)).toBe(countOpaque(sprites[index]!));
    });
  });

  test('leaves the requested padding below the baseline', () => {
    const aligned = alignBaselines(sprites, { padding: 4 });
    const first = aligned[0]!;
    expect(first.image.height - 1 - first.baselineY).toBe(4);
  });

  test('is idempotent — aligning already aligned sprites changes nothing', () => {
    const once = alignBaselines(sprites);
    const twice = alignBaselines(once.map((s) => s.image));
    expect(twice.map((s) => findBaseline(s.image))).toEqual(once.map((s) => findBaseline(s.image)));
  });

  test('rejects an empty input list', () => {
    expect(() => alignBaselines([])).toThrow(AssetPipelineError);
  });

  test('names the offending index when one sprite is fully transparent', () => {
    expect(() => alignBaselines([sprites[0]!, createImage(4, 4)])).toThrow(/1/);
  });
});
