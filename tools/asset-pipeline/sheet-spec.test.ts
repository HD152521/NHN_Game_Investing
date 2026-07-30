import { describe, expect, test } from 'vitest';
import { resolveSheetSpec } from './sheet-spec.js';
import { AssetPipelineError } from './errors.js';

describe('resolveSheetSpec', () => {
  test('reads E-01 as a 3-unit lineup with art-guide names', () => {
    const spec = resolveSheetSpec('E-01.png');
    expect(spec.layout).toEqual({ kind: 'lineup', count: 3 });
    expect(spec.frameNames).toEqual(['unit/intern', 'unit/analyst', 'unit/trader']);
  });

  test('reads F-01 as a 3-enemy lineup', () => {
    expect(resolveSheetSpec('F-01.png').frameNames).toEqual([
      'enemy/short-seller',
      'enemy/margin-caller',
      'enemy/bear-brute',
    ]);
  });

  test('reads D-01 as a 3-tower lineup', () => {
    expect(resolveSheetSpec('D-01.png').layout).toEqual({ kind: 'lineup', count: 3 });
  });

  test('reads G-03 as a 3x2 icon grid', () => {
    const spec = resolveSheetSpec('G-03.png');
    expect(spec.layout).toEqual({ kind: 'grid', columns: 3, rows: 2 });
    expect(spec.frameNames).toHaveLength(6);
  });

  test('aligns baselines for units and towers but not for HUD icons', () => {
    expect(resolveSheetSpec('E-01.png').alignBaselines).toBe(true);
    expect(resolveSheetSpec('D-01.png').alignBaselines).toBe(true);
    expect(resolveSheetSpec('G-03.png').alignBaselines).toBe(false);
  });

  test('ignores case and any suffix after the asset id', () => {
    expect(resolveSheetSpec('e-01_v3.png').id).toBe('E-01');
  });

  test('falls back to a single-subject sheet for unregistered files', () => {
    const spec = resolveSheetSpec('C-01-headquarters.png');
    expect(spec.layout).toEqual({ kind: 'single' });
    expect(spec.frameNames).toEqual(['C-01-headquarters']);
  });

  test('registered specs always name exactly as many frames as they slice', () => {
    for (const file of ['E-01.png', 'F-01.png', 'D-01.png', 'G-03.png']) {
      const spec = resolveSheetSpec(file);
      const expected =
        spec.layout.kind === 'lineup'
          ? spec.layout.count
          : spec.layout.kind === 'grid'
            ? spec.layout.columns * spec.layout.rows
            : 1;
      expect(spec.frameNames).toHaveLength(expected);
    }
  });

  test('rejects a non-png file name', () => {
    expect(() => resolveSheetSpec('E-01.jpg')).toThrow(AssetPipelineError);
  });
});
