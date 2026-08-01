import { describe, expect, test } from 'vitest';

import { isSpriteCell, uiButtons } from '../sprites';
import { createSpriteRasterCache } from '../sprites/render';
import { createSoftwareSurfaceFactory, pixelAt } from '../sprites/render/testing/software-canvas';
import type { SoftwareSurface } from '../sprites/render/testing/software-canvas';
import { parseHex, resolvePalette } from '../design';
import {
  PREDICTION_BUTTON_HEIGHT,
  PREDICTION_BUTTON_WIDTH,
  PREDICTION_SHEET_HEIGHT,
  PREDICTION_SHEET_WIDTH,
  predictionButtonGrid,
  predictionButtonRaster,
  predictionButtonRect,
} from './sprite-buttons';
import type { Direction } from './trade-panel-logic';

const SHEET = uiButtons();
const DIRECTIONS: readonly Direction[] = ['long', 'short'];

function softwareCache() {
  return createSpriteRasterCache({ createSurface: createSoftwareSurfaceFactory() });
}

describe('tf-ui-btn — 위/아래 두 판으로 나눈 결과가 원본 그리드와 일치한다', () => {
  test('시트 크기가 원본 mk(40, 34) 그대로다', () => {
    expect(SHEET).toHaveLength(PREDICTION_SHEET_HEIGHT);
    expect(SHEET[0]).toHaveLength(PREDICTION_SHEET_WIDTH);
    expect(PREDICTION_BUTTON_HEIGHT).toBe(17);
  });

  test.each(DIRECTIONS)('%s 판의 모든 픽셀이 원본 시트의 같은 좌표와 같다', (direction) => {
    const rect = predictionButtonRect(direction);
    const grid = predictionButtonGrid(direction);

    expect(grid).toHaveLength(PREDICTION_BUTTON_HEIGHT);
    for (let y = 0; y < PREDICTION_BUTTON_HEIGHT; y += 1) {
      for (let x = 0; x < PREDICTION_BUTTON_WIDTH; x += 1) {
        expect(grid[y]?.[x]).toBe(SHEET[rect.y + y]?.[rect.x + x]);
      }
    }
  });

  test('두 판을 이어 붙이면 원본 시트가 그대로 복원된다', () => {
    for (let y = 0; y < PREDICTION_SHEET_HEIGHT; y += 1) {
      const direction: Direction = y < PREDICTION_BUTTON_HEIGHT ? 'long' : 'short';
      const row = predictionButtonGrid(direction)[y % PREDICTION_BUTTON_HEIGHT];
      expect(row).toEqual(SHEET[y]);
    }
  });
});

describe('색약 모드에서도 방향이 읽힌다 (FR-13.1 이중 인코딩)', () => {
  /**
   * 색을 못 봐도 방향을 알려면 **형태**가 방향을 말해야 한다. 원본은 흰색(`w`) 삼각형으로
   * 그것을 하는데, 상승판은 삼각형이 **위로 갈수록 좁아지고** 하락판은 **아래로 갈수록**
   * 좁아진다. 흰 픽셀의 행별 개수를 세면 색과 무관하게 그 방향이 확인된다.
   */
  function whitePerRow(direction: Direction): readonly number[] {
    return predictionButtonGrid(direction).map(
      (row) => row.filter((cell) => cell === 'w').length,
    );
  }

  test('상승판(long)의 흰 삼각형은 위가 뾰족하다', () => {
    const counts = whitePerRow('long').filter((n) => n > 0);
    expect(counts.length).toBeGreaterThan(2);
    expect(counts[0]).toBeLessThan(counts[counts.length - 1] as number);
  });

  test('하락판(short)의 흰 삼각형은 아래가 뾰족하다', () => {
    const counts = whitePerRow('short').filter((n) => n > 0);
    expect(counts.length).toBeGreaterThan(2);
    expect(counts[0]).toBeGreaterThan(counts[counts.length - 1] as number);
  });

  test('색약 팔레트로 구워도 삼각형 픽셀(TEXT 색)이 그대로 남는다', () => {
    const cache = softwareCache();
    cache.setColorMode('colorblind');
    const palette = resolvePalette('colorblind');
    const text = parseHex(palette.TEXT);

    for (const direction of DIRECTIONS) {
      const raster = predictionButtonRaster(direction, cache);
      expect(raster).not.toBeNull();
      const surface = raster?.surface as SoftwareSurface;

      let white = 0;
      for (let y = 0; y < PREDICTION_BUTTON_HEIGHT; y += 1) {
        for (let x = 0; x < PREDICTION_BUTTON_WIDTH; x += 1) {
          const [r, g, b] = pixelAt(surface, x, y);
          if (r === text.r && g === text.g && b === text.b) white += 1;
        }
      }
      expect(white, `${direction} 삼각형이 사라졌다`).toBeGreaterThan(20);
    }
  });

  test('두 판은 색약 모드에서도 서로 다른 그림이다', () => {
    const cache = softwareCache();
    cache.setColorMode('colorblind');

    const signatures = DIRECTIONS.map((direction) => {
      const surface = predictionButtonRaster(direction, cache)?.surface as SoftwareSurface;
      const cells: string[] = [];
      for (let y = 0; y < PREDICTION_BUTTON_HEIGHT; y += 1) {
        for (let x = 0; x < PREDICTION_BUTTON_WIDTH; x += 1) {
          cells.push(pixelAt(surface, x, y).join(','));
        }
      }
      return cells.join('|');
    });

    expect(signatures[0]).not.toBe(signatures[1]);
  });
});

describe('시트 09 원칙 — 버튼 판에는 글자가 없다', () => {
  test('두 판 모두 팔레트 문자만 쓴다', () => {
    for (const direction of DIRECTIONS) {
      for (const row of predictionButtonGrid(direction)) {
        for (const cell of row) {
          expect(isSpriteCell(cell)).toBe(true);
        }
      }
    }
  });

  test('흰 픽셀은 삼각형 한 덩어리뿐이다 (글리프처럼 흩어져 있지 않다)', () => {
    for (const direction of DIRECTIONS) {
      const grid = predictionButtonGrid(direction);
      const rowsWithWhite = grid
        .map((row, y) => (row.includes('w') ? y : -1))
        .filter((y) => y >= 0);

      // 연속된 행 한 구간이어야 한다 — 글자였다면 행이 끊겨 나타난다.
      const span = (rowsWithWhite[rowsWithWhite.length - 1] as number) - (rowsWithWhite[0] as number);
      expect(span + 1).toBe(rowsWithWhite.length);
    }
  });
});
