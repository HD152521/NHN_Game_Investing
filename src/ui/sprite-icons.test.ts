import { describe, expect, test } from 'vitest';

import { isSpriteCell, uiIcons } from '../sprites';
import { createSpriteRasterCache } from '../sprites/render';
import { createSoftwareSurfaceFactory, pixelAt } from '../sprites/render/testing/software-canvas';
import type { SoftwareSurface } from '../sprites/render/testing/software-canvas';
import {
  UI_ICON_COLUMNS,
  UI_ICON_HEIGHT,
  UI_ICON_NAMES,
  UI_ICON_ROWS,
  UI_ICON_SHEET_HEIGHT,
  UI_ICON_SHEET_WIDTH,
  UI_ICON_WIDTH,
  uiIconGrid,
  uiIconRaster,
  uiIconRect,
} from './sprite-icons';
import type { UiIconName } from './sprite-icons';

const SHEET = uiIcons();

function softwareCache() {
  return createSpriteRasterCache({ createSurface: createSoftwareSurfaceFactory() });
}

describe('tf-ui-icons — 3×2 칸 나누기가 원본 그리드와 문자 단위로 일치한다', () => {
  test('시트 크기가 원본 mk(54, 34) 그대로다', () => {
    expect(SHEET).toHaveLength(UI_ICON_SHEET_HEIGHT);
    expect(SHEET[0]).toHaveLength(UI_ICON_SHEET_WIDTH);
    expect(UI_ICON_WIDTH).toBe(18);
    expect(UI_ICON_HEIGHT).toBe(17);
    expect(UI_ICON_COLUMNS * UI_ICON_ROWS).toBe(UI_ICON_NAMES.length);
  });

  test.each(UI_ICON_NAMES)('%s 칸의 모든 픽셀이 원본 시트의 같은 좌표와 같다', (name) => {
    const rect = uiIconRect(name);
    const grid = uiIconGrid(name);

    expect(grid).toHaveLength(UI_ICON_HEIGHT);
    for (let y = 0; y < UI_ICON_HEIGHT; y += 1) {
      const row = grid[y];
      expect(row).toHaveLength(UI_ICON_WIDTH);
      for (let x = 0; x < UI_ICON_WIDTH; x += 1) {
        expect(row?.[x]).toBe(SHEET[rect.y + y]?.[rect.x + x]);
      }
    }
  });

  test('6칸을 다시 이어 붙이면 원본 시트가 그대로 복원된다 (빠진 픽셀 0)', () => {
    for (let y = 0; y < UI_ICON_SHEET_HEIGHT; y += 1) {
      for (let x = 0; x < UI_ICON_SHEET_WIDTH; x += 1) {
        const index =
          Math.floor(y / UI_ICON_HEIGHT) * UI_ICON_COLUMNS + Math.floor(x / UI_ICON_WIDTH);
        const name = UI_ICON_NAMES[index] as UiIconName;
        const cell = uiIconGrid(name)[y % UI_ICON_HEIGHT]?.[x % UI_ICON_WIDTH];
        expect(cell).toBe(SHEET[y]?.[x]);
      }
    }
  });
});

describe('아이콘 순서 — 원본 코드가 진실이다 (시트 09 문구와 대조)', () => {
  /**
   * 원본 `uiIcons()` 는 칸마다 **서로 다른 팔레트 문자**를 주력으로 쓴다. 그 문자가 그 칸에
   * 실제로 있는지 보면 "몇 번째 칸이 무엇인가"가 코드 근거로 확정된다.
   */
  const SIGNATURE: readonly (readonly [UiIconName, string])[] = [
    ['gold', 'g'],
    ['aum', 'p'],
    ['hp', 'r'],
    ['wave', 'b'],
    ['accuracy', 'w'],
    ['upkeep', 'm'],
  ];

  test.each(SIGNATURE)('%s 칸의 주력 색 문자는 "%s" 이고 다른 칸에는 없다', (name, char) => {
    const has = (target: UiIconName): boolean =>
      uiIconGrid(target).some((row) => row.includes(char as never));

    expect(has(name)).toBe(true);
    for (const other of UI_ICON_NAMES) {
      if (other === name) continue;
      expect(has(other)).toBe(false);
    }
  });

  test('시트 09 순서(골드·AUM·HP·웨이브·정확도·유지비)와 행 우선 순서가 같다', () => {
    expect([...UI_ICON_NAMES]).toEqual(['gold', 'aum', 'hp', 'wave', 'accuracy', 'upkeep']);
  });
});

describe('아이콘 6종은 실사용 크기에서 서로 구분된다', () => {
  /** 굽힌 뒤 실제 픽셀을 읽어 "그려진 그림"을 문자열로 만든다(교차 diff 용). */
  function inkSignature(name: UiIconName): string {
    const cache = softwareCache();
    const raster = uiIconRaster(name, cache);
    if (raster === null) throw new Error(`${name} 래스터를 굽지 못했다.`);

    const surface = raster.surface as SoftwareSurface;
    const cells: string[] = [];
    for (let y = 0; y < raster.height; y += 1) {
      for (let x = 0; x < raster.width; x += 1) {
        const [r, g, b] = pixelAt(surface, x, y);
        cells.push(`${r},${g},${b}`);
      }
    }
    return cells.join('|');
  }

  test('1× 배율(18×17)에서 6종의 픽셀이 모두 서로 다르다', () => {
    const signatures = new Map<string, UiIconName>();
    for (const name of UI_ICON_NAMES) {
      const signature = inkSignature(name);
      const clash = signatures.get(signature);
      expect(clash, `${name} 과 ${clash} 가 같은 그림이다`).toBeUndefined();
      signatures.set(signature, name);
    }
    expect(signatures.size).toBe(UI_ICON_NAMES.length);
  });

  test('두 칸씩 비교해도 다른 픽셀이 충분히 많다 (한두 점 차이가 아니다)', () => {
    const inks = UI_ICON_NAMES.map((name) => inkSignature(name).split('|'));
    const total = UI_ICON_WIDTH * UI_ICON_HEIGHT;

    for (let a = 0; a < inks.length; a += 1) {
      for (let b = a + 1; b < inks.length; b += 1) {
        const left = inks[a] as string[];
        const right = inks[b] as string[];
        let differing = 0;
        for (let i = 0; i < total; i += 1) {
          if (left[i] !== right[i]) differing += 1;
        }
        // 18×17=306칸 중 최소 5% 가 달라야 "작게 봐도 구분된다"고 볼 수 있다.
        expect(
          differing / total,
          `${UI_ICON_NAMES[a]} vs ${UI_ICON_NAMES[b]}`,
        ).toBeGreaterThan(0.05);
      }
    }
  });

  test('색약 모드에서도 6종이 서로 다르다', () => {
    const cache = softwareCache();
    cache.setColorMode('colorblind');
    expect(cache.mode).toBe('colorblind');

    const seen = new Set<string>();
    for (const name of UI_ICON_NAMES) {
      const raster = uiIconRaster(name, cache);
      expect(raster).not.toBeNull();
      const surface = raster?.surface as SoftwareSurface;
      const cells: string[] = [];
      for (let y = 0; y < UI_ICON_HEIGHT; y += 1) {
        for (let x = 0; x < UI_ICON_WIDTH; x += 1) {
          cells.push(pixelAt(surface, x, y).join(','));
        }
      }
      seen.add(cells.join('|'));
    }
    expect(seen.size).toBe(UI_ICON_NAMES.length);
  });
});

describe('시트 09 원칙 — 아이콘에는 글자가 없다', () => {
  test('모든 칸이 팔레트 문자만 쓴다 (텍스트 렌더 흔적 0)', () => {
    for (const name of UI_ICON_NAMES) {
      for (const row of uiIconGrid(name)) {
        for (const cell of row) {
          // 그리드는 스프라이트 팔레트 문자(또는 투명)만 담는다 — 글리프가 들어올 자리가 없다.
          expect(isSpriteCell(cell)).toBe(true);
        }
      }
    }
  });
});
