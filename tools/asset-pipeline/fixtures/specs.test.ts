import { describe, expect, test } from 'vitest';
import { FIXTURE_SPECS } from './specs.js';
import { keyMagenta } from '../keying.js';
import { sliceGrid, sliceLineup } from '../slicing.js';
import { frameCountOf, resolveSheetSpec } from '../sheet-spec.js';
import { findMagentaResidue } from '../verify.js';
import { cropImage } from '../image.js';
import { findBaseline } from '../baseline.js';

describe('FIXTURE_SPECS', () => {
  test('covers the four lineup/grid cases from PLAN STEP 8', () => {
    expect(FIXTURE_SPECS.map((s) => s.fileName)).toEqual([
      'E-01.png',
      'F-01.png',
      'D-01.png',
      'G-03.png',
    ]);
  });

  test.each(FIXTURE_SPECS.map((spec) => [spec.fileName, spec] as const))(
    '%s keys cleanly and slices into the expected frame count',
    (fileName, spec) => {
      const sheetSpec = resolveSheetSpec(fileName);
      const keyed = keyMagenta(spec.build(), { requireMagenta: true });

      expect(keyed.keyedPixels).toBeGreaterThan(0);
      expect(keyed.fringePixels).toBeGreaterThan(0);
      expect(findMagentaResidue(keyed.image).count).toBe(0);

      const rects =
        sheetSpec.layout.kind === 'grid'
          ? sliceGrid(keyed.image, sheetSpec.layout)
          : sliceLineup(keyed.image, { count: frameCountOf(sheetSpec.layout) });

      expect(rects).toHaveLength(frameCountOf(sheetSpec.layout));
    },
  );

  test.each(['E-01.png', 'F-01.png', 'D-01.png'])(
    '%s deliberately misaligns baselines so the alignment step is actually exercised',
    (fileName) => {
      const spec = FIXTURE_SPECS.find((s) => s.fileName === fileName)!;
      const keyed = keyMagenta(spec.build()).image;
      const rects = sliceLineup(keyed, { count: 3 });
      const baselines = rects.map((rect) => findBaseline(cropImage(keyed, rect)) + rect.y);

      expect(new Set(baselines).size).toBeGreaterThan(1);
    },
  );

  test('every fixture is fully opaque before keying — real AI output has no alpha', () => {
    for (const spec of FIXTURE_SPECS) {
      const image = spec.build();
      for (let i = 3; i < image.data.length; i += 4) {
        if (image.data[i] !== 255) throw new Error(`${spec.fileName} has a non-opaque pixel`);
      }
    }
  });
});
