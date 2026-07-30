import { describe, expect, test } from 'vitest';
import { keyMagenta } from './keying.js';
import { renderMagentaSheet } from './fixtures/synth.js';
import { createImage, getPixel } from './image.js';
import { magentaDistance } from './color.js';
import { AssetPipelineError } from './errors.js';
import { MAGENTA } from './constants.js';

const NAVY = { r: 15, g: 21, b: 36, a: 255 };
const WHITE = { r: 255, g: 255, b: 255, a: 255 };
const PURPLE = { r: 155, g: 107, b: 255, a: 255 };

function navyDisc(size: number, color = NAVY) {
  return renderMagentaSheet({
    width: size,
    height: size,
    subjects: [
      { color, shapes: [{ kind: 'ellipse', cx: size / 2, cy: size / 2, rx: size / 3, ry: size / 3 }] },
    ],
  });
}

describe('keyMagenta — background removal', () => {
  test('turns pure #FF00FF fully transparent', () => {
    const keyed = keyMagenta(createImage(4, 4, MAGENTA)).image;
    expect(getPixel(keyed, 0, 0).a).toBe(0);
  });

  test('keeps a white subject fully opaque and unchanged (art guide R2)', () => {
    const sheet = renderMagentaSheet({
      width: 24,
      height: 24,
      subjects: [{ color: WHITE, shapes: [{ kind: 'rect', x: 6, y: 6, width: 12, height: 12 }] }],
    });

    const keyed = keyMagenta(sheet).image;
    expect(getPixel(keyed, 12, 12)).toEqual({ r: 255, g: 255, b: 255, a: 255 });
  });

  test('keys near-magenta noise within the tolerance', () => {
    const noisy = createImage(2, 2, { r: 250, g: 6, b: 249, a: 255 });
    expect(keyMagenta(noisy, { tolerance: 16 }).image.data[3]).toBe(0);
  });

  test('respects a tightened tolerance', () => {
    const noisy = createImage(2, 2, { r: 250, g: 6, b: 249, a: 255 });
    expect(keyMagenta(noisy, { tolerance: 2 }).image.data[3]).toBe(255);
  });

  test('reports how many pixels it keyed', () => {
    const result = keyMagenta(createImage(4, 4, MAGENTA));
    expect(result.keyedPixels).toBe(16);
    expect(result.fringePixels).toBe(0);
  });

  test('reports zero keyed pixels when the image has no magenta at all', () => {
    const result = keyMagenta(createImage(4, 4, NAVY));
    expect(result.keyedPixels).toBe(0);
  });

  test('rejects requireMagenta when nothing was keyed', () => {
    expect(() => keyMagenta(createImage(4, 4, NAVY), { requireMagenta: true })).toThrow(
      AssetPipelineError,
    );
    expect(() => keyMagenta(createImage(4, 4, NAVY), { requireMagenta: true })).toThrow(/마젠타/);
  });
});

describe('keyMagenta — fringe removal (despill)', () => {
  const sheet = navyDisc(48);
  const result = keyMagenta(sheet);
  const keyed = result.image;

  test('produces a soft alpha ramp rather than a hard binary edge', () => {
    let partial = 0;
    for (let i = 3; i < keyed.data.length; i += 4) {
      const alpha = keyed.data[i] ?? 0;
      if (alpha > 0 && alpha < 255) partial += 1;
    }
    expect(partial).toBeGreaterThan(10);
    expect(result.fringePixels).toBe(partial);
  });

  test('leaves no magenta cast on any visible pixel', () => {
    let worst = 255;
    for (let y = 0; y < keyed.height; y += 1) {
      for (let x = 0; x < keyed.width; x += 1) {
        const p = getPixel(keyed, x, y);
        if (p.a === 0) continue;
        worst = Math.min(worst, magentaDistance(p));
      }
    }
    // 보이는 픽셀 중 가장 마젠타에 가까운 것조차 충분히 멀어야 합니다.
    expect(worst).toBeGreaterThan(64);
  });

  test('recovers the true subject color on partially covered edge pixels', () => {
    for (let y = 0; y < keyed.height; y += 1) {
      for (let x = 0; x < keyed.width; x += 1) {
        const p = getPixel(keyed, x, y);
        if (p.a === 0 || p.a === 255) continue;
        expect(Math.abs(p.r - NAVY.r)).toBeLessThan(48);
        expect(Math.abs(p.g - NAVY.g)).toBeLessThan(48);
        expect(Math.abs(p.b - NAVY.b)).toBeLessThan(48);
      }
    }
  });

  test('does not erode the interior of the subject', () => {
    expect(getPixel(keyed, 24, 24)).toEqual(NAVY);
  });

  test('does not erode a purple subject whose own hue is magenta-adjacent', () => {
    const purple = keyMagenta(navyDisc(48, PURPLE)).image;
    expect(getPixel(purple, 24, 24).a).toBe(255);
    // 코어 색을 기준으로 알파를 추정하므로 보라색 경계도 두껍게 남아야 합니다.
    let opaqueCount = 0;
    for (let i = 3; i < purple.data.length; i += 4) {
      if ((purple.data[i] ?? 0) === 255) opaqueCount += 1;
    }
    expect(opaqueCount).toBeGreaterThan(600);
  });
});
