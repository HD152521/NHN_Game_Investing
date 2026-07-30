import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { DEFAULT_INPUT_DIRS, DEFAULT_OUT_DIR, main, parseArgs } from './cli.js';
import { FIXTURE_SPECS } from './fixtures/specs.js';
import { writePng } from './png-io.js';
import { AssetPipelineError } from './errors.js';

describe('parseArgs', () => {
  test('defaults to the project raw + fixtures inputs and the atlas output', () => {
    const options = parseArgs([]);
    expect(options.inputDirs).toEqual([...DEFAULT_INPUT_DIRS]);
    expect(options.outDir).toBe(DEFAULT_OUT_DIR);
  });

  test('collects repeated --input flags and drops the defaults', () => {
    const options = parseArgs(['--input', 'a', '--input', 'b']);
    expect(options.inputDirs).toEqual(['a', 'b']);
  });

  test('reads --out', () => {
    expect(parseArgs(['--out', 'build/atlas']).outDir).toBe('build/atlas');
  });

  test('reads keying tuning flags', () => {
    const options = parseArgs(['--tolerance', '12', '--fringe-radius', '3']);
    expect(options.keying.tolerance).toBe(12);
    expect(options.keying.fringeRadius).toBe(3);
  });

  test('reads atlas and preview sizing flags', () => {
    const options = parseArgs(['--max-width', '512', '--preview-size', '32']);
    expect(options.maxAtlasWidth).toBe(512);
    expect(options.previewCellSize).toBe(32);
  });

  test('rejects a non-numeric value instead of silently using NaN', () => {
    expect(() => parseArgs(['--tolerance', 'abc'])).toThrow(AssetPipelineError);
    expect(() => parseArgs(['--tolerance', 'abc'])).toThrow(/tolerance/);
  });

  test('rejects a flag with no value', () => {
    expect(() => parseArgs(['--out'])).toThrow(/--out/);
  });

  test('rejects an unknown flag', () => {
    expect(() => parseArgs(['--wat'])).toThrow(/--wat/);
  });

  test('supports --help', () => {
    expect(parseArgs(['--help']).help).toBe(true);
  });
});

describe('main', () => {
  let root = '';
  let inputDir = '';
  let outDir = '';
  const lines: string[] = [];
  const errors: string[] = [];
  const log = (message: string): void => void lines.push(message);
  const logError = (message: string): void => void errors.push(message);

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cli-'));
    inputDir = join(root, 'raw');
    outDir = join(root, 'atlas');
    mkdirSync(inputDir, { recursive: true });
    for (const spec of FIXTURE_SPECS) writePng(join(inputDir, spec.fileName), spec.build());
    lines.length = 0;
    errors.length = 0;
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test('returns 0 and writes the atlas on success', () => {
    const code = main(['--input', inputDir, '--out', outDir], log, logError);

    expect(code).toBe(0);
    expect(existsSync(join(outDir, 'atlas.png'))).toBe(true);
    expect(lines.join('\n')).toMatch(/15/);
  });

  test('prints the magenta residue result', () => {
    main(['--input', inputDir, '--out', outDir], log, logError);
    expect(lines.join('\n')).toMatch(/마젠타 잔여/);
  });

  test('returns 1 and explains the failure when the input is empty', () => {
    const empty = join(root, 'empty');
    mkdirSync(empty);

    expect(main(['--input', empty, '--out', outDir], log, logError)).toBe(1);
    expect(errors.join('\n')).toMatch(/PNG/);
  });

  test('returns 1 on a bad flag without throwing out of main', () => {
    expect(main(['--nope'], log, logError)).toBe(1);
  });

  test('prints usage and returns 0 for --help', () => {
    expect(main(['--help'], log, logError)).toBe(0);
    expect(lines.join('\n')).toMatch(/--input/);
  });
});
