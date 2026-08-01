import { describe, expect, test } from 'vitest';

import { createTheme } from '../design/index.js';
import { bgFar, bgMid } from '../sprites/index.js';
import type { Region, SpriteGrid } from '../sprites/index.js';
import { createFakeBattleCtx } from './fake-ctx.js';
import { drawBackground, skyFarY, skyMidY, tileBandScale } from './draw-background.js';
import { computeBattleLayout } from './layout.js';
import { cellRgb, createSoftwareRasterCache, createSpriteBattleSurface, hashRegion, pixelAt } from './sprite-fake-ctx.js';

const { palette } = createTheme();
const WIDTH = 1024;
const HEIGHT = 300;
const layout = computeBattleLayout(WIDTH, HEIGHT);
/** 원본 배경 스프라이트의 크기(원본 `mk(104, 30)`). */
const SPRITE_W = 104;
const SPRITE_H = 30;

const REGIONS: readonly Region[] = [1, 2, 3];

function render(region: Region, scrollX = 0) {
  const { ctx, surface } = createSpriteBattleSurface(WIDTH, HEIGHT);
  drawBackground(ctx, palette, layout, { region, scrollX, rasters: createSoftwareRasterCache() });
  return surface;
}

const scale = tileBandScale(layout);
const bands = {
  farY: skyFarY(layout, SPRITE_H),
  midY: skyMidY(layout, SPRITE_H),
  midHeight: SPRITE_H * scale,
};
/** 중경이 덮기 전까지 원경이 실제로 보이는 행 수(1× 그리드 기준). */
const FAR_VISIBLE_ROWS = Math.floor((bands.midY - bands.farY) / scale);

/** 밴드 첫 타일(반전 없음)의 픽셀이 원본 그리드와 문자 단위로 일치하는지 센다. */
function mismatchesAgainstGrid(
  surface: ReturnType<typeof render>,
  grid: SpriteGrid,
  bandY: number,
  rows: number,
): number {
  let mismatches = 0;
  for (let gy = 0; gy < rows; gy += 1) {
    const row = grid[gy];
    if (row === undefined) continue;
    for (let gx = 0; gx < SPRITE_W; gx += 1) {
      const cell = row[gx];
      if (cell === undefined) continue;
      const expected = cellRgb(palette, cell);
      if (expected === null) continue;
      const actual = pixelAt(surface, gx * scale, bandY + gy * scale);
      if (actual[0] !== expected[0] || actual[1] !== expected[1] || actual[2] !== expected[2]) mismatches += 1;
    }
  }
  return mismatches;
}

describe('drawBackground — 원본 스프라이트가 그대로 화면에 나온다', () => {
  test('중경 3장이 원본 그리드와 픽셀 단위로 일치한다', () => {
    for (const region of REGIONS) {
      expect(mismatchesAgainstGrid(render(region), bgMid(region), bands.midY, SPRITE_H)).toBe(0);
    }
  });

  test('원경 3장이 (중경에 가려지지 않는 구간에서) 원본 그리드와 일치한다', () => {
    expect(FAR_VISIBLE_ROWS).toBeGreaterThan(0);
    for (const region of REGIONS) {
      expect(mismatchesAgainstGrid(render(region), bgFar(region), bands.farY, FAR_VISIBLE_ROWS)).toBe(0);
    }
  });

  test('지역 3종의 배경이 서로 구분된다', () => {
    const hashes = REGIONS.map((region) => hashRegion(render(region), 0, bands.farY, WIDTH, HEIGHT - bands.farY));
    expect(new Set(hashes).size).toBe(REGIONS.length);
  });
});

describe('drawBackground — 타일 이음새 (PLAN 0.1 C-4 교차 미러링)', () => {
  test('인접 타일 경계 2열의 ΔRGB 가 0이다', () => {
    const surface = render(1);
    const tileWidth = SPRITE_W * scale;

    let boundaries = 0;
    for (let boundary = tileWidth; boundary < WIDTH; boundary += tileWidth) {
      boundaries += 1;
      for (let y = bands.midY; y < bands.midY + bands.midHeight; y += 1) {
        const left = pixelAt(surface, boundary - 1, y);
        const right = pixelAt(surface, boundary, y);
        const delta = Math.max(
          Math.abs(left[0] - right[0]),
          Math.abs(left[1] - right[1]),
          Math.abs(left[2] - right[2]),
        );
        expect(delta).toBe(0);
      }
    }
    expect(boundaries).toBeGreaterThan(0);
  });
});

describe('drawBackground — 패럴랙스', () => {
  test('원경이 중경보다 느리게 흐른다', () => {
    const still = render(1);
    const scrolled = render(1, 1);
    const farBox = { y: bands.farY, h: bands.midY - bands.farY };

    // 스크롤 1px 에서 중경(×0.55)은 1px 움직이고 원경(×0.25)은 아직 움직이지 않는다.
    expect(hashRegion(scrolled, 0, farBox.y, WIDTH, farBox.h)).toBe(hashRegion(still, 0, farBox.y, WIDTH, farBox.h));
    expect(hashRegion(scrolled, 0, bands.midY, WIDTH, bands.midHeight)).not.toBe(
      hashRegion(still, 0, bands.midY, WIDTH, bands.midHeight),
    );
  });
});

describe('drawBackground — 캔버스를 못 굽는 환경', () => {
  test('스프라이트가 없으면 폴백 실루엣을 그리고 크래시하지 않는다', () => {
    const ctx = createFakeBattleCtx();
    expect(() => drawBackground(ctx, palette, layout)).not.toThrow();
    expect(ctx.calls.some((c) => c.kind === 'fillRect' && c.fillStyle === palette.BG_1)).toBe(true);
  });

  test('캔버스 크기 0에서도 크래시하지 않는다', () => {
    const ctx = createFakeBattleCtx();
    expect(() => drawBackground(ctx, palette, computeBattleLayout(0, 0))).not.toThrow();
  });
});
