import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { buildFixtures, main } from './build-fixtures.js';
import { FIXTURE_SPECS } from './specs.js';

let outDir = '';

beforeEach(() => {
  outDir = mkdtempSync(join(tmpdir(), 'fixtures-'));
});

afterEach(() => {
  rmSync(outDir, { recursive: true, force: true });
});

describe('buildFixtures', () => {
  test('writes one PNG per registered spec', () => {
    const paths = buildFixtures(outDir);

    expect(paths).toHaveLength(FIXTURE_SPECS.length);
    for (const path of paths) expect(existsSync(path)).toBe(true);
  });

  test('is deterministic — regenerating produces byte-identical files', () => {
    const [first] = buildFixtures(outDir);
    const before = readFileSync(first!);
    buildFixtures(outDir);

    expect(readFileSync(first!).equals(before)).toBe(true);
  });
});

describe('build-fixtures main', () => {
  test('returns 0 and logs each generated file', () => {
    const lines: string[] = [];
    const code = main(outDir, (message: string) => void lines.push(message));

    expect(code).toBe(0);
    expect(lines).toHaveLength(FIXTURE_SPECS.length);
  });

  test('returns 1 when the output path cannot be written', () => {
    const blocked = join(outDir, 'E-01.png', 'nested');
    buildFixtures(outDir);
    expect(main(blocked, () => undefined)).toBe(1);
  });
});
