import { describe, expect, test } from 'vitest';

import { isSpriteCell, uiReveal } from '../sprites';
import { createSpriteRasterCache } from '../sprites/render';
import type { RasterContext2D } from '../sprites/render';
import {
  createSoftwareSurface,
  createSoftwareSurfaceFactory,
  pixelAt,
} from '../sprites/render/testing/software-canvas';
import {
  REVEAL_CONTENT_HEIGHT,
  REVEAL_CONTENT_WIDTH,
  REVEAL_CONTENT_X,
  REVEAL_CONTENT_Y,
  REVEAL_HEIGHT,
  REVEAL_WIDTH,
  drawRevealBackdrop,
  revealContentRect,
  revealCoverScale,
  revealRaster,
} from './reveal-backdrop';

const GRID = uiReveal();

function softwareCache() {
  return createSpriteRasterCache({ createSurface: createSoftwareSurfaceFactory() });
}

describe('tf-ui-reveal — 원본 그리드 그대로다', () => {
  test('크기가 원본 mk(80, 44) 이다', () => {
    expect(GRID).toHaveLength(REVEAL_HEIGHT);
    expect(GRID[0]).toHaveLength(REVEAL_WIDTH);
  });

  test('팔레트 문자만 쓴다 (글자 픽셀 0 — 시트 09 원칙)', () => {
    for (const row of GRID) {
      for (const cell of row) {
        expect(isSpriteCell(cell)).toBe(true);
      }
    }
  });

  test('텍스트 자리(중앙 1/3)에는 덮는 면이 없다 — 금색 받침선과 링뿐이다', () => {
    const found = new Set<string>();
    for (let y = REVEAL_CONTENT_Y; y < REVEAL_CONTENT_Y + REVEAL_CONTENT_HEIGHT; y += 1) {
      for (let x = REVEAL_CONTENT_X; x < REVEAL_CONTENT_X + REVEAL_CONTENT_WIDTH; x += 1) {
        found.add(GRID[y]?.[x] as string);
      }
    }
    // `1` 바탕 · `2` 배경 막대 · `g` 금색 연출선. 흰 글자(`w`)도 표식(`m`)도 없다.
    expect(found.has('w')).toBe(false);
    expect(found.has('m')).toBe(false);
    expect(found.has('g')).toBe(true);
  });
});

describe('drawRevealBackdrop — FR-9 구현 시 붙일 렌더 API', () => {
  test('사각형을 정수 배율로 덮는다', () => {
    expect(revealCoverScale(160, 88)).toBe(2);
    expect(revealCoverScale(320, 88)).toBe(4);
    // 최소 배율은 1 — 0배율이면 그림이 사라진다.
    expect(revealCoverScale(10, 10)).toBe(1);
  });

  test('텍스트 자리를 화면 좌표로 돌려준다', () => {
    const rect = revealContentRect(100, 50, 2);
    expect(rect).toEqual({
      x: 100 + REVEAL_CONTENT_X * 2,
      y: 50 + REVEAL_CONTENT_Y * 2,
      w: REVEAL_CONTENT_WIDTH * 2,
      h: REVEAL_CONTENT_HEIGHT * 2,
    });
  });

  test('실제로 픽셀을 찍는다', () => {
    const surface = createSoftwareSurface(160, 88);
    const ctx = surface.getContext('2d') as unknown as RasterContext2D;

    const drawn = drawRevealBackdrop(ctx, {
      x: 0,
      y: 0,
      w: 160,
      h: 88,
      rasters: softwareCache(),
    });

    expect(drawn).toBe(true);
    expect(pixelAt(surface, 80, 44)[3]).toBeGreaterThan(0);
  });

  test('크기가 0이면 그리지 않는다', () => {
    const surface = createSoftwareSurface(10, 10);
    const ctx = surface.getContext('2d') as unknown as RasterContext2D;
    expect(
      drawRevealBackdrop(ctx, { x: 0, y: 0, w: 0, h: 0, rasters: softwareCache() }),
    ).toBe(false);
  });

  test('굽지 못하는 환경에서는 null 래스터가 나온다 (크래시 금지)', () => {
    const cache = createSpriteRasterCache({ createSurface: () => null });
    expect(revealRaster(cache)).toBeNull();
  });
});
