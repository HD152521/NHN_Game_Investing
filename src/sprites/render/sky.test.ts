import { describe, expect, test } from 'vitest';

import { createTheme } from '../../design/index';
import { drawBackground, groundSurfaceY, skyFarY } from '../../battle/draw-background.js';
import { computeBattleLayout } from '../../battle/layout.js';
import {
  createSoftwareRasterCache,
  createSpriteBattleSurface,
  hashRegion,
  pixelAt,
} from '../../battle/sprite-fake-ctx.js';
import { parseHex } from '../../design/color';
import type { Region } from '../types';
import { SPRITE_COMPOSITE } from './composite';
import {
  DEFAULT_TIME_OF_DAY,
  SKY_SCENE_HEIGHT,
  SKY_SCENE_WIDTH,
  SKY_WEATHER_KEYS,
  sceneGroundRow,
  skyCoverScale,
  skyOriginX,
  skyOriginY,
  skySceneKey,
  skySource,
  type TimeOfDay,
} from './sky';

/**
 * 하늘 레이어 — **실제로 그려지는가**를 픽셀로 확인한다.
 *
 * far/mid 밴드가 불투명이라 하늘은 밴드 위쪽에서만 보인다. 그래서 검증도 그 구간에서 한다.
 */

const { palette } = createTheme();
const WIDTH = 1024;
const HEIGHT = 300;
const layout = computeBattleLayout(WIDTH, HEIGHT);
/** 원본 배경 밴드 스프라이트의 높이(`mk(104, 30)`). */
const BAND_H = 30;

const REGIONS: readonly Region[] = [1, 2, 3];
const TIMES: readonly TimeOfDay[] = ['dawn', 'noon', 'dusk', 'night'];

function render(region: Region, timeOfDay: TimeOfDay = DEFAULT_TIME_OF_DAY) {
  const { ctx, surface } = createSpriteBattleSurface(WIDTH, HEIGHT);
  drawBackground(ctx, palette, layout, { region, timeOfDay, rasters: createSoftwareRasterCache() });
  return surface;
}

describe('하늘 소스 표', () => {
  test('지역 3 × 시간대 4 = 12칸이 전부 채워지고 크기·분류가 하나로 통일된다', () => {
    const ids = new Set<string>();
    for (const region of REGIONS) {
      for (const time of TIMES) {
        const source = skySource(region, time);
        ids.add(source.id);
        expect(source.composite, source.id).toBe('alpha');
        expect(source.grid, source.id).toHaveLength(SKY_SCENE_HEIGHT);
        expect(source.grid[0], source.id).toHaveLength(SKY_SCENE_WIDTH);
      }
    }
    // 12칸이 전부 서로 다른 그림이다 — 같은 그림을 돌려쓰지 않는다
    expect(ids.size).toBe(12);
  });

  test('원본이 구운 8칸은 키를 그대로 쓰고, 나머지 4칸만 파라메트릭이다', () => {
    const baked = REGIONS.flatMap((region) =>
      TIMES.map((time) => skySceneKey(region, time)).filter((key) => key !== null),
    );
    expect(baked).toHaveLength(8);
    for (const key of baked) expect(SPRITE_COMPOSITE[key], key).toBe('alpha');
    // 새벽 3지역 + R3 밤 = 원본에 없는 4칸
    expect(skySceneKey(1, 'dawn')).toBeNull();
    expect(skySceneKey(3, 'night')).toBeNull();
    expect(skySource(3, 'night').id).toBe('sky-r3-night');
  });

  test('같은 조합을 다시 물어도 그리드를 다시 만들지 않는다 (매 프레임 호출된다)', () => {
    expect(skySource(2, 'dawn')).toBe(skySource(2, 'dawn'));
    expect(skySource(1, 'noon')).toBe(skySource(1, 'noon'));
  });

  test('날씨 하늘 3종도 분류를 갖는다', () => {
    for (const key of Object.values(SKY_WEATHER_KEYS)) expect(SPRITE_COMPOSITE[key], key).toBe('alpha');
  });
});

describe('하늘 배치 계산', () => {
  test('지면선 행은 원본 `scene()` 의 `h - round(h * 0.10)` 이다', () => {
    expect(sceneGroundRow(56)).toBe(50);
    expect(sceneGroundRow(62)).toBe(56);
  });

  test('배율은 정수이고 가로·세로를 모두 덮는다', () => {
    const scale = skyCoverScale(WIDTH, 240, 108, 56);
    expect(Number.isInteger(scale)).toBe(true);
    expect(108 * scale).toBeGreaterThanOrEqual(WIDTH);
    expect(sceneGroundRow(56) * scale).toBeGreaterThanOrEqual(240);
  });

  test('씬 지면선이 화면 지면선에 정확히 얹히고, 위쪽에 빈 곳이 남지 않는다', () => {
    const groundY = Math.round(groundSurfaceY(layout));
    const scale = skyCoverScale(WIDTH, groundY, 108, 56);
    expect(skyOriginY(groundY, 56, scale) + sceneGroundRow(56) * scale).toBe(groundY);
    expect(skyOriginY(groundY, 56, scale)).toBeLessThanOrEqual(0);
    expect(skyOriginX(WIDTH, 108, scale)).toBeLessThanOrEqual(0);
  });

  test('크기 0 에서도 배율이 무너지지 않는다', () => {
    expect(skyCoverScale(0, 0, 0, 0)).toBe(1);
    expect(skyCoverScale(100, 100, 10, 0)).toBe(1);
  });
});

describe('하늘 레이어가 실제로 그려진다', () => {
  /** 밴드가 덮지 않는 하늘 구간. 여기 픽셀이 곧 하늘이다. */
  const skyBottom = skyFarY(layout, BAND_H);

  test('밴드 위 구간이 바탕색(BG_0)이 아니라 씬 픽셀이다', () => {
    expect(skyBottom).toBeGreaterThan(4);
    const surface = render(1);
    const base = parseHex(palette.BG_0);

    let painted = 0;
    for (let y = 0; y < skyBottom; y += 3) {
      for (let x = 0; x < WIDTH; x += 7) {
        const pixel = pixelAt(surface, x, y);
        if (pixel[0] !== base.r || pixel[1] !== base.g || pixel[2] !== base.b) painted += 1;
      }
    }
    expect(painted).toBeGreaterThan(0);
  });

  test('하늘 픽셀이 원본 씬 그리드와 색 단위로 일치한다', () => {
    const surface = render(1);
    const source = skySource(1, DEFAULT_TIME_OF_DAY);
    const grid = source.grid;
    const spriteH = grid.length;
    const spriteW = grid[0]?.length ?? 0;
    const groundY = Math.round(groundSurfaceY(layout));
    const scale = skyCoverScale(WIDTH, groundY, spriteW, spriteH);
    const originX = skyOriginX(WIDTH, spriteW, scale);
    const originY = skyOriginY(groundY, spriteH, scale);

    let checked = 0;
    for (let y = 0; y < skyBottom; y += 2) {
      const sy = Math.floor((y - originY) / scale);
      const row = grid[sy];
      if (row === undefined) continue;
      for (let x = 0; x < WIDTH; x += 5) {
        const cell = row[Math.floor((x - originX) / scale)];
        if (cell === undefined || cell === '.') continue;
        const expected = parseHex(cell);
        const pixel = pixelAt(surface, x, y);
        expect([pixel[0], pixel[1], pixel[2]], `${source.id} (${x}, ${y})`).toEqual([expected.r, expected.g, expected.b]);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  test('시간대 4종이 서로 다른 하늘을 그린다', () => {
    const hashes = TIMES.map((time) => hashRegion(render(1, time), 0, 0, WIDTH, skyBottom));
    expect(new Set(hashes).size).toBe(TIMES.length);
  });

  test('같은 시간대라도 지역이 다르면 하늘 실루엣이 다르다', () => {
    const hashes = REGIONS.map((region) => hashRegion(render(region, 'noon'), 0, 0, WIDTH, skyBottom));
    expect(new Set(hashes).size).toBe(REGIONS.length);
  });

  test('시간대를 안 넘기면 기본 시간대로 그린다 (호출부 변경 없이 동작)', () => {
    const { ctx, surface } = createSpriteBattleSurface(WIDTH, HEIGHT);
    drawBackground(ctx, palette, layout, { region: 1, rasters: createSoftwareRasterCache() });
    expect(hashRegion(surface, 0, 0, WIDTH, skyBottom)).toBe(
      hashRegion(render(1, DEFAULT_TIME_OF_DAY), 0, 0, WIDTH, skyBottom),
    );
  });
});
