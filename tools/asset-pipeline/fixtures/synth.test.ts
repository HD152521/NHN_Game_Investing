import { describe, expect, test } from 'vitest';
import { renderMagentaSheet } from './synth.js';
import { getPixel } from '../image.js';
import { AssetPipelineError } from '../errors.js';

const NAVY = { r: 15, g: 21, b: 36, a: 255 };
const WHITE = { r: 255, g: 255, b: 255, a: 255 };

const isMagenta = (p: { r: number; g: number; b: number }): boolean =>
  p.r === 255 && p.g === 0 && p.b === 255;

describe('renderMagentaSheet', () => {
  test('fills untouched area with pure #FF00FF', () => {
    const sheet = renderMagentaSheet({
      width: 16,
      height: 16,
      subjects: [{ color: NAVY, shapes: [{ kind: 'rect', x: 4, y: 4, width: 4, height: 4 }] }],
    });

    expect(getPixel(sheet, 0, 0)).toEqual({ r: 255, g: 0, b: 255, a: 255 });
    expect(getPixel(sheet, 15, 15)).toEqual({ r: 255, g: 0, b: 255, a: 255 });
  });

  test('renders the subject body at full opacity with its own color', () => {
    const sheet = renderMagentaSheet({
      width: 16,
      height: 16,
      subjects: [{ color: NAVY, shapes: [{ kind: 'rect', x: 4, y: 4, width: 6, height: 6 }] }],
    });

    expect(getPixel(sheet, 6, 6)).toEqual(NAVY);
  });

  test('produces antialiased magenta fringe on curved edges', () => {
    const sheet = renderMagentaSheet({
      width: 32,
      height: 32,
      subjects: [{ color: NAVY, shapes: [{ kind: 'ellipse', cx: 16, cy: 16, rx: 10, ry: 10 }] }],
    });

    let fringeCount = 0;
    for (let y = 0; y < 32; y += 1) {
      for (let x = 0; x < 32; x += 1) {
        const p = getPixel(sheet, x, y);
        const isBody = p.r === NAVY.r && p.g === NAVY.g && p.b === NAVY.b;
        if (!isMagenta(p) && !isBody) fringeCount += 1;
      }
    }

    // 원 둘레를 따라 혼색 픽셀이 실제로 생겨야 키잉 테스트가 의미를 가집니다.
    expect(fringeCount).toBeGreaterThan(20);
  });

  test('is always fully opaque — real AI output has no alpha channel', () => {
    const sheet = renderMagentaSheet({
      width: 8,
      height: 8,
      subjects: [{ color: WHITE, shapes: [{ kind: 'ellipse', cx: 4, cy: 4, rx: 3, ry: 3 }] }],
    });

    for (let i = 3; i < sheet.data.length; i += 4) {
      expect(sheet.data[i]).toBe(255);
    }
  });

  test('places multiple subjects independently', () => {
    const sheet = renderMagentaSheet({
      width: 24,
      height: 12,
      subjects: [
        { color: NAVY, shapes: [{ kind: 'rect', x: 2, y: 2, width: 4, height: 4 }] },
        { color: WHITE, shapes: [{ kind: 'rect', x: 16, y: 2, width: 4, height: 4 }] },
      ],
    });

    expect(getPixel(sheet, 3, 3)).toEqual(NAVY);
    expect(getPixel(sheet, 17, 3)).toEqual(WHITE);
    expect(isMagenta(getPixel(sheet, 10, 3))).toBe(true);
  });

  test('rejects a spec with no subjects — an all-magenta sheet is never a valid fixture', () => {
    expect(() => renderMagentaSheet({ width: 8, height: 8, subjects: [] })).toThrow(
      AssetPipelineError,
    );
  });
});
