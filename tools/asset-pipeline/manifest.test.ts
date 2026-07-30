import { describe, expect, test } from 'vitest';
import { buildManifest, serializeManifest } from './manifest.js';
import { packShelves } from './packing.js';
import { createImage } from './image.js';
import { AssetPipelineError } from './errors.js';
import { MANIFEST_VERSION } from './constants.js';
import type { PackInput } from './packing.js';

const frame = (name: string, w: number, h: number): PackInput => ({
  name,
  image: createImage(w, h, { r: 1, g: 2, b: 3, a: 255 }),
  baselineY: h - 3,
});

const inputs = [frame('unit/intern', 20, 30), frame('unit/analyst', 22, 34)];
const pack = packShelves(inputs, { maxWidth: 128 });

const meta = inputs.map((i) => ({ name: i.name, baselineY: i.baselineY, source: 'E-01.png' }));

describe('buildManifest', () => {
  const manifest = buildManifest({
    imageFile: 'atlas.png',
    previewFile: 'preview.png',
    pack,
    frames: meta,
  });

  test('stamps the schema version so the runtime loader can gate on it', () => {
    expect(manifest.version).toBe(MANIFEST_VERSION);
  });

  test('records the atlas image and preview file names', () => {
    expect(manifest.image).toBe('atlas.png');
    expect(manifest.preview).toBe('preview.png');
  });

  test('records the atlas size', () => {
    expect(manifest.size).toEqual({ width: pack.width, height: pack.height });
  });

  test('keys frames by name with their packed rect', () => {
    const placement = pack.placements.find((p) => p.name === 'unit/analyst')!;
    expect(manifest.frames['unit/analyst']).toMatchObject({
      x: placement.rect.x,
      y: placement.rect.y,
      width: 22,
      height: 34,
    });
  });

  test('stores baselineY relative to the frame top, not the atlas', () => {
    expect(manifest.frames['unit/analyst']!.baselineY).toBe(31);
  });

  test('keeps the source sheet name for re-keying later', () => {
    expect(manifest.frames['unit/intern']!.source).toBe('E-01.png');
  });

  test('rejects a placement with no matching metadata', () => {
    expect(() =>
      buildManifest({ imageFile: 'a.png', previewFile: 'p.png', pack, frames: [meta[0]!] }),
    ).toThrow(AssetPipelineError);
  });

  test('rejects a baselineY outside the frame', () => {
    const broken = [meta[0]!, { ...meta[1]!, baselineY: 999 }];
    expect(() =>
      buildManifest({ imageFile: 'a.png', previewFile: 'p.png', pack, frames: broken }),
    ).toThrow(/baseline/i);
  });
});

describe('serializeManifest', () => {
  const manifest = buildManifest({
    imageFile: 'atlas.png',
    previewFile: 'preview.png',
    pack,
    frames: meta,
  });

  test('produces JSON that parses back to the same object', () => {
    expect(JSON.parse(serializeManifest(manifest))).toEqual(manifest);
  });

  test('ends with a newline so the file is diff friendly', () => {
    expect(serializeManifest(manifest).endsWith('\n')).toBe(true);
  });

  test('sorts frame keys for a stable diff across runs', () => {
    const keys = Object.keys(JSON.parse(serializeManifest(manifest)).frames);
    expect(keys).toEqual([...keys].sort());
  });
});
