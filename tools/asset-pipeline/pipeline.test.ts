import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { runPipeline } from './pipeline.js';
import { FIXTURE_SPECS } from './fixtures/specs.js';
import { readPng, writePng } from './png-io.js';
import { findMagentaResidue } from './verify.js';
import { AssetPipelineError } from './errors.js';
import type { AtlasManifest } from './manifest.js';

let root = '';
let inputDir = '';
let outDir = '';

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pipeline-'));
  inputDir = join(root, 'raw');
  outDir = join(root, 'atlas');
  mkdirSync(inputDir, { recursive: true });
  for (const spec of FIXTURE_SPECS) writePng(join(inputDir, spec.fileName), spec.build());
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function readManifest(): AtlasManifest {
  return JSON.parse(readFileSync(join(outDir, 'atlas.json'), 'utf8')) as AtlasManifest;
}

describe('runPipeline', () => {
  test('produces an atlas, a manifest and a preview from one call', () => {
    const report = runPipeline({ inputDirs: [inputDir], outDir });

    expect(existsSync(join(outDir, 'atlas.png'))).toBe(true);
    expect(existsSync(join(outDir, 'atlas.json'))).toBe(true);
    expect(existsSync(join(outDir, 'atlas.preview.png'))).toBe(true);
    expect(report.sheets).toHaveLength(4);
  });

  test('emits 3 + 3 + 3 + 6 frames for the four fixture sheets', () => {
    expect(runPipeline({ inputDirs: [inputDir], outDir }).frameCount).toBe(15);
  });

  test('every manifest frame sits inside the atlas image', () => {
    runPipeline({ inputDirs: [inputDir], outDir });
    const manifest = readManifest();
    const atlas = readPng(join(outDir, 'atlas.png'));

    expect(atlas.width).toBe(manifest.size.width);
    for (const frame of Object.values(manifest.frames)) {
      expect(frame.x + frame.width).toBeLessThanOrEqual(atlas.width);
      expect(frame.y + frame.height).toBeLessThanOrEqual(atlas.height);
      expect(frame.baselineY).toBeLessThan(frame.height);
    }
  });

  test('leaves zero magenta residue in both the atlas and the preview', () => {
    const report = runPipeline({ inputDirs: [inputDir], outDir });

    expect(report.residuePixels).toBe(0);
    expect(findMagentaResidue(readPng(join(outDir, 'atlas.png'))).count).toBe(0);
    expect(findMagentaResidue(readPng(join(outDir, 'atlas.preview.png'))).count).toBe(0);
  });

  test('aligns the three unit baselines to the same row (PART 6 check 2)', () => {
    runPipeline({ inputDirs: [inputDir], outDir });
    const frames = readManifest().frames;
    const unitBaselines = Object.entries(frames)
      .filter(([name]) => name.startsWith('unit/'))
      .map(([, frame]) => frame.baselineY);

    expect(unitBaselines).toHaveLength(3);
    expect(new Set(unitBaselines).size).toBe(1);
  });

  test('caps every preview cell at the requested silhouette size', () => {
    runPipeline({ inputDirs: [inputDir], outDir, previewCellSize: 64 });
    const preview = readPng(join(outDir, 'atlas.preview.png'));
    expect(preview.height % 64).toBe(0);
    expect(preview.width % 64).toBe(0);
  });

  test('never modifies the input directory', () => {
    const before = FIXTURE_SPECS.map((s) => readFileSync(join(inputDir, s.fileName)));
    runPipeline({ inputDirs: [inputDir], outDir });
    const after = FIXTURE_SPECS.map((s) => readFileSync(join(inputDir, s.fileName)));

    after.forEach((buffer, index) => expect(buffer.equals(before[index]!)).toBe(true));
  });

  test('is deterministic — two runs write the same manifest', () => {
    runPipeline({ inputDirs: [inputDir], outDir });
    const first = readFileSync(join(outDir, 'atlas.json'), 'utf8');
    runPipeline({ inputDirs: [inputDir], outDir });
    expect(readFileSync(join(outDir, 'atlas.json'), 'utf8')).toBe(first);
  });

  test('skips a missing input directory but still uses the ones that exist', () => {
    const report = runPipeline({ inputDirs: [join(root, 'nope'), inputDir], outDir });
    expect(report.sheets).toHaveLength(4);
    expect(report.skippedDirs).toEqual([join(root, 'nope')]);
  });

  test('fails when no PNG is found anywhere', () => {
    const empty = join(root, 'empty');
    mkdirSync(empty);
    expect(() => runPipeline({ inputDirs: [empty], outDir })).toThrow(AssetPipelineError);
    expect(() => runPipeline({ inputDirs: [empty], outDir })).toThrow(/PNG/);
  });

  test('names the file that failed to decode', () => {
    writeFileSync(join(inputDir, 'Z-99.png'), Buffer.from('not a png'));
    expect(() => runPipeline({ inputDirs: [inputDir], outDir })).toThrow(/Z-99\.png/);
  });

  test('ignores non-png files sitting next to the sheets', () => {
    writeFileSync(join(inputDir, 'notes.txt'), 'prompt notes');
    expect(runPipeline({ inputDirs: [inputDir], outDir }).sheets).toHaveLength(4);
  });
});
