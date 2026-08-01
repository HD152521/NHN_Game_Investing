import { describe, expect, test } from 'vitest';

import { resolvePalette, parseHex } from '../design/index.js';
import { SPRITE_PALETTE, TRANSPARENT, uiChart } from '../sprites/index.js';
import { createSpriteRasterCache } from '../sprites/render/index.js';
import type { RasterContext2D } from '../sprites/render/index.js';
import {
  createSoftwareSurface,
  createSoftwareSurfaceFactory,
  pixelAt,
} from '../sprites/render/testing/software-canvas.js';
import type { SoftwareSurface } from '../sprites/render/testing/software-canvas.js';
import { createFakeChartCtx } from './fake-ctx.js';
import {
  CHART_FRAME_HEIGHT,
  CHART_FRAME_SCALE,
  CHART_FRAME_WIDTH,
  FRAME_BOTTOM,
  FRAME_LEFT,
  FRAME_RIGHT,
  FRAME_TOP,
  drawChartFrame,
} from './draw-frame.js';
import type { ChartCtx } from './surface.js';

const SHEET = uiChart();
const PALETTE = resolvePalette('default');

function softwareCache() {
  return createSpriteRasterCache({ createSurface: createSoftwareSurfaceFactory() });
}

interface Painted {
  readonly surface: SoftwareSurface;
  readonly drawn: boolean;
}

function paint(width: number, height: number, scale = CHART_FRAME_SCALE): Painted {
  const surface = createSoftwareSurface(width, height);
  const raster = surface.getContext('2d');
  if (raster === null) throw new Error('소프트웨어 캔버스가 2D 컨텍스트를 주지 못했습니다.');

  const drawn = drawChartFrame(raster as unknown as ChartCtx, {
    palette: PALETTE,
    width,
    height,
    scale,
    rasters: softwareCache(),
  });

  return { surface, drawn };
}

describe('tf-ui-chart — 시트 09 원칙 "내부 완전히 비움"', () => {
  test('원본 그리드의 안쪽은 표식 하나 없이 단일 색이다', () => {
    const inside = new Set<string>();
    for (let y = FRAME_TOP; y < CHART_FRAME_HEIGHT - FRAME_BOTTOM; y += 1) {
      for (let x = FRAME_LEFT; x < CHART_FRAME_WIDTH - FRAME_RIGHT; x += 1) {
        inside.add(SHEET[y]?.[x] as string);
      }
    }
    expect([...inside]).toEqual(['2']);
  });

  test('축 눈금은 전부 9슬라이스 테두리 두께 안에 들어 있다', () => {
    // 좌측 눈금 rect(1, y, 2, 1) → x=1,2 < FRAME_LEFT
    // 하단 눈금 rect(x, 27, 1, 2) → y=27,28 ≥ 30 - FRAME_BOTTOM
    expect(FRAME_LEFT).toBeGreaterThan(2);
    expect(CHART_FRAME_HEIGHT - FRAME_BOTTOM).toBeLessThanOrEqual(27);
  });
});

describe('drawChartFrame — 가운데를 건드리지 않는다', () => {
  test('테두리 안쪽 픽셀은 한 점도 칠해지지 않는다 (차트가 그대로 보인다)', () => {
    const width = 1024;
    const height = 200;
    const { surface, drawn } = paint(width, height);
    expect(drawn).toBe(true);

    const left = FRAME_LEFT * CHART_FRAME_SCALE;
    const right = width - FRAME_RIGHT * CHART_FRAME_SCALE;
    const top = FRAME_TOP * CHART_FRAME_SCALE;
    const bottom = height - FRAME_BOTTOM * CHART_FRAME_SCALE;

    for (let y = top; y < bottom; y += 7) {
      for (let x = left; x < right; x += 11) {
        expect(pixelAt(surface, x, y)[3], `(${x}, ${y}) 가 칠해졌다`).toBe(0);
      }
    }
  });

  test('네 변에는 실제로 픽셀이 있다', () => {
    const width = 1024;
    const height = 200;
    const { surface } = paint(width, height);

    expect(pixelAt(surface, 0, 0)[3]).toBeGreaterThan(0);
    expect(pixelAt(surface, width - 1, 0)[3]).toBeGreaterThan(0);
    expect(pixelAt(surface, 0, height - 1)[3]).toBeGreaterThan(0);
    expect(pixelAt(surface, width - 1, height - 1)[3]).toBeGreaterThan(0);
    // 변 한가운데
    expect(pixelAt(surface, width / 2, 1)[3]).toBeGreaterThan(0);
    expect(pixelAt(surface, 1, height / 2)[3]).toBeGreaterThan(0);
  });
});

describe('drawChartFrame — 원본 픽셀과 문자 단위로 일치한다 (표본)', () => {
  test('좌상단 모서리 표식이 원본 좌표 그대로 나온다', () => {
    const { surface } = paint(1024, 200, 1);

    for (let y = 0; y < FRAME_TOP; y += 1) {
      for (let x = 0; x < FRAME_LEFT; x += 1) {
        const cell = SHEET[y]?.[x];
        if (cell === undefined || cell === TRANSPARENT) continue;
        const expected = parseHex(PALETTE[SPRITE_PALETTE[cell]]);
        const [r, g, b] = pixelAt(surface, x, y);
        expect([r, g, b], `(${x}, ${y}) = "${cell}"`).toEqual([expected.r, expected.g, expected.b]);
      }
    }
  });

  test('우측 테두리 마지막 열이 원본의 마지막 열과 같다', () => {
    const { surface } = paint(1024, 200, 1);
    const cell = SHEET[10]?.[CHART_FRAME_WIDTH - 1];
    expect(cell).toBe('m');

    const muted = parseHex(PALETTE.MUTED);
    const [r, g, b] = pixelAt(surface, 1024 - 1, 10);
    expect([r, g, b]).toEqual([muted.r, muted.g, muted.b]);
  });
});

describe('톤 연결 — 차트 패널이 전장과 같은 잉크만 쓴다 (시트 10 게이트 5)', () => {
  /**
   * "차트 패널과 톤이 이어지는가" 를 눈이 아니라 **픽셀로** 확인한다.
   * 전장은 같은 `SpriteRasterCache` 가 같은 12색 팔레트로 구운 스프라이트만 그린다.
   * 차트 프레임이 그 팔레트 밖의 색을 한 점이라도 내놓으면 두 패널은 다른 화면이 된다.
   */
  test('프레임이 화면에 내놓는 색은 전부 스프라이트 팔레트 12색 안에 있다', () => {
    const { surface } = paint(1024, 200);

    const allowed = new Set(
      Object.values(SPRITE_PALETTE).map((token) => {
        const { r, g, b } = parseHex(PALETTE[token]);
        return `${r},${g},${b}`;
      }),
    );

    for (let y = 0; y < 200; y += 1) {
      for (let x = 0; x < 1024; x += 13) {
        const [r, g, b, a] = pixelAt(surface, x, y);
        if (a === 0) continue;
        expect(allowed.has(`${r},${g},${b}`), `(${x}, ${y}) 가 팔레트 밖 색이다`).toBe(true);
      }
    }
  });

  test('프레임 두께가 전장의 정수 배율 픽셀과 같은 격자를 쓴다', () => {
    // 정수 배율이라야 두 캔버스의 "픽셀 한 칸" 크기가 같다 — 아니면 위아래가 갈라져 보인다.
    expect(Number.isInteger(CHART_FRAME_SCALE)).toBe(true);
    expect(CHART_FRAME_SCALE).toBeGreaterThanOrEqual(1);
  });
});

describe('drawChartFrame — 안전 장치', () => {
  test('스프라이트를 못 그리는 컨텍스트면 조용히 false', () => {
    const fake = createFakeChartCtx();
    expect(drawChartFrame(fake, { palette: PALETTE, width: 1024, height: 200 })).toBe(false);
  });

  test('프레임 두께가 캔버스를 다 먹으면 그리지 않는다', () => {
    const { drawn } = paint(8, 8);
    expect(drawn).toBe(false);
  });

  test('색약 모드 팔레트를 넘기면 캐시 모드가 따라간다', () => {
    const cache = softwareCache();
    const surface = createSoftwareSurface(200, 80);
    const raster = surface.getContext('2d') as unknown as RasterContext2D;

    drawChartFrame(raster as unknown as ChartCtx, {
      palette: resolvePalette('colorblind'),
      width: 200,
      height: 80,
      rasters: cache,
    });
    expect(cache.mode).toBe('colorblind');

    drawChartFrame(raster as unknown as ChartCtx, {
      palette: PALETTE,
      width: 200,
      height: 80,
      rasters: cache,
    });
    expect(cache.mode).toBe('default');
  });
});
