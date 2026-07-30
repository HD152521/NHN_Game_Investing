import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { readPng, writePng } from './png-io.js';
import { createImage, getPixel } from './image.js';
import { AssetPipelineError } from './errors.js';
import { MAGENTA } from './constants.js';

let workDir = '';

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), 'png-io-'));
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('writePng / readPng', () => {
  test('round-trips pixel data losslessly', () => {
    const source = createImage(3, 2, MAGENTA);
    const path = join(workDir, 'round-trip.png');

    writePng(path, source);
    const loaded = readPng(path);

    expect(loaded.width).toBe(3);
    expect(loaded.height).toBe(2);
    expect(getPixel(loaded, 2, 1)).toEqual({ r: 255, g: 0, b: 255, a: 255 });
  });

  test('preserves partial alpha', () => {
    const source = createImage(1, 1, { r: 10, g: 20, b: 30, a: 128 });
    const path = join(workDir, 'alpha.png');

    writePng(path, source);
    expect(getPixel(readPng(path), 0, 0)).toEqual({ r: 10, g: 20, b: 30, a: 128 });
  });

  test('creates missing parent directories on write', () => {
    const path = join(workDir, 'nested', 'deep', 'out.png');
    writePng(path, createImage(1, 1, MAGENTA));
    expect(readPng(path).width).toBe(1);
  });
});

describe('readPng error handling', () => {
  test('reports a missing file with its path', () => {
    const path = join(workDir, 'does-not-exist.png');
    expect(() => readPng(path)).toThrow(AssetPipelineError);
    expect(() => readPng(path)).toThrow(/does-not-exist\.png/);
  });

  test('reports a zero-byte file explicitly instead of failing on decode', () => {
    const path = join(workDir, 'empty.png');
    writeFileSync(path, Buffer.alloc(0));
    expect(() => readPng(path)).toThrow(/0바이트|비어/);
  });

  test('wraps a corrupt PNG in AssetPipelineError rather than leaking the decoder error', () => {
    const path = join(workDir, 'corrupt.png');
    writeFileSync(path, Buffer.from('this is definitely not a png file, at all'));

    expect(() => readPng(path)).toThrow(AssetPipelineError);
    expect(() => readPng(path)).toThrow(/PNG/);
  });
});
