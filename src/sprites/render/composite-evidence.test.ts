import { describe, expect, test } from 'vitest';

import { parseHex } from '../../design/color';
import { resolvePalette } from '../../design/theme';
import type { SpriteGrid } from '../grid';
import { spriteGrid } from '../index';
import { SPRITE_PALETTE, TRANSPARENT, type SpriteCell } from '../palette';
import type { SpriteRaster } from './cache';
import { COMPOSITE_SPECS, type CompositeSpec } from './composite';
import { drawSprite } from './draw';
import { rasterizeGrid } from './rasterize';
import { channelDelta, createSoftwareSurface, pixelAt, type SoftwareSurface } from './testing/software-canvas';

/**
 * ★ S2-A — 가산 합성 결정을 **실제 렌더된 픽셀**로 검증한다.
 *
 * "가산이면 검정은 기여하지 않는다" 는 자동으로 참이 아니다. `1` = `#070A12` 는 완전
 * 검정이 아니라 (7, 10, 18) 이고, `0` = `#05070C` 는 (5, 7, 12) 다. `lighter` 로 그려도
 * 스프라이트 사각 영역이 그만큼 밝아진다 — 검은 상자가 **미세하게 밝은 상자**로 바뀔 뿐이다.
 *
 * 그래서 두 정책을 같은 조건에서 그려 픽셀을 읽고 비교한다.
 *   NAIVE   : `lighter` 만 적용 (검정 배경을 그대로 굽는다)
 *   SHIPPED : `lighter` + 잉크 임계 미만 색을 알파 0 으로 굽는다 (실제 채택안)
 *
 * 가시 임계는 지시받은 대로 **ΔRGB ≥ 7**(채널별 최대 차) 이다.
 */

/** 눈에 띄기 시작하는 채널 차이. 이 값 이상이면 사각형 자국이 보인다. */
const VISIBLE_DELTA = 7;

/**
 * 같은 FX 를 같은 자리에 3회 쌓았을 때 "색 분리가 무너졌다" 고 볼 배수.
 * 1회 대비 이 배수 밑으로 떨어지면 두 잉크가 서로 구분되지 않는다고 본다.
 */
const CLIPPING_COLLAPSE_RATIO = 4;

/** 검정 배경을 그대로 굽는 "가산만" 정책 — 비교 대조군이다. */
const NAIVE_ADDITIVE: CompositeSpec = { mode: 'lighter', inkFloor: null };

const palette = resolvePalette('default');
const FIELD = parseHex(palette.BG_1);

function bake(grid: SpriteGrid, spec: CompositeSpec): SpriteRaster {
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  const surface = createSoftwareSurface(width, height);
  const ctx = surface.getContext('2d');
  if (ctx === null) throw new Error('소프트웨어 캔버스를 만들 수 없습니다.');
  rasterizeGrid(ctx, grid, palette, spec);
  return { surface, width, height, mode: spec.mode };
}

function field(width: number, height: number): SoftwareSurface {
  const surface = createSoftwareSurface(width, height);
  const ctx = surface.getContext('2d');
  if (ctx === null) throw new Error('소프트웨어 캔버스를 만들 수 없습니다.');
  ctx.fillStyle = palette.BG_1;
  ctx.fillRect(0, 0, width, height);
  return surface;
}

const FIELD_PIXEL = [FIELD.r, FIELD.g, FIELD.b, 255] as const;

interface RectReport {
  /** 스프라이트 사각형 경계에서 안팎 픽셀의 최대 ΔRGB. */
  readonly edgeDelta: number;
  /** 그리드가 검정 계열(`0`/`1`) 인 픽셀에서 배경 대비 최대 ΔRGB. */
  readonly chromeDelta: number;
  /** 그 검정 계열 픽셀 중 가시 임계를 넘은 개수. */
  readonly visiblePixels: number;
}

/** 배경 위에 스프라이트 하나를 그리고 "사각형 자국" 을 계측한다. */
function measureRect(grid: SpriteGrid, spec: CompositeSpec, originX: number, originY: number): RectReport {
  const raster = bake(grid, spec);
  const surface = field(raster.width + originX * 2, raster.height + originY * 2);
  const ctx = surface.getContext('2d');
  if (ctx === null) throw new Error('소프트웨어 캔버스를 만들 수 없습니다.');
  drawSprite(ctx, raster, originX, originY, 1);

  let edgeDelta = 0;
  let chromeDelta = 0;
  let visiblePixels = 0;

  for (let y = 0; y < raster.height; y += 1) {
    const row = grid[y] as SpriteCell[];
    for (let x = 0; x < raster.width; x += 1) {
      const inside = pixelAt(surface, originX + x, originY + y);
      const cell = row[x] as SpriteCell;
      const chrome = cell !== TRANSPARENT && SPRITE_PALETTE[cell] !== undefined && isChrome(cell);
      if (chrome) {
        const delta = channelDelta(inside, FIELD_PIXEL);
        chromeDelta = Math.max(chromeDelta, delta);
        if (delta >= VISIBLE_DELTA) visiblePixels += 1;
      }
      const onEdge = x === 0 || y === 0 || x === raster.width - 1 || y === raster.height - 1;
      if (!onEdge) continue;
      const outside = pixelAt(surface, originX + (x === 0 ? -1 : x === raster.width - 1 ? raster.width : x), originY + (y === 0 ? -1 : y === raster.height - 1 ? raster.height : y));
      edgeDelta = Math.max(edgeDelta, channelDelta(inside, outside));
    }
  }

  return { edgeDelta, chromeDelta, visiblePixels };
}

/** 가산 합성에서 빛으로 뜨지 못하는 검정 계열 문자. */
function isChrome(cell: SpriteCell): boolean {
  return cell === '0' || cell === '1';
}

describe('S2-A 측정 1 — 발사체 `tf-w-01`(28×14) 가 검은 상자로 날아가는가', () => {
  const grid = spriteGrid('tf-w-01');

  test('주변 배경 픽셀은 어느 정책에서도 변하지 않는다', () => {
    for (const spec of [NAIVE_ADDITIVE, COMPOSITE_SPECS.additive]) {
      const raster = bake(grid, spec);
      const surface = field(raster.width + 20, raster.height + 20);
      const ctx = surface.getContext('2d');
      if (ctx === null) return;
      drawSprite(ctx, raster, 10, 10, 1);
      for (let y = 0; y < surface.height; y += 1) {
        for (let x = 0; x < surface.width; x += 1) {
          const insideRect = x >= 10 && x < 10 + raster.width && y >= 10 && y < 10 + raster.height;
          if (insideRect) continue;
          expect(pixelAt(surface, x, y), `x=${x} y=${y}`).toEqual([...FIELD_PIXEL]);
        }
      }
    }
  });

  test('★ 사각형 자국: 가산만으로는 남고, 채택안에서는 0 이다', () => {
    const naive = measureRect(grid, NAIVE_ADDITIVE, 10, 10);
    const shipped = measureRect(grid, COMPOSITE_SPECS.additive, 10, 10);
    console.info('[S2-A 측정1] tf-w-01 28x14', { naive, shipped, visibleThreshold: VISIBLE_DELTA });

    expect(naive.chromeDelta).toBeGreaterThanOrEqual(VISIBLE_DELTA);
    expect(naive.visiblePixels).toBeGreaterThan(0);
    expect(shipped.chromeDelta).toBe(0);
    expect(shipped.visiblePixels).toBe(0);
  });
});

describe('S2-A 측정 2 — 날씨 `tf-wx-01`(80×44) 의 사각 경계선이 보이는가', () => {
  const grid = spriteGrid('tf-wx-01');

  test('★ 경계 ΔRGB: 가산만이면 임계를 넘고, 채택안은 0 이다', () => {
    const naive = measureRect(grid, NAIVE_ADDITIVE, 6, 6);
    const shipped = measureRect(grid, COMPOSITE_SPECS.additive, 6, 6);
    console.info('[S2-A 측정2] tf-wx-01 80x44', { naive, shipped, visibleThreshold: VISIBLE_DELTA });

    // 원본 wx-01 은 바깥 테두리가 `0`(#05070C), 안쪽 채움이 `1`(#070A12) 이다
    expect(naive.edgeDelta).toBeGreaterThanOrEqual(VISIBLE_DELTA);
    expect(naive.chromeDelta).toBeGreaterThanOrEqual(VISIBLE_DELTA);
    expect(shipped.edgeDelta).toBe(0);
    expect(shipped.chromeDelta).toBe(0);
  });

  test('검정 계열 두 색의 가산 기여량이 곧 자국의 크기다', () => {
    const bg0 = parseHex(palette.BG_0);
    const line = parseHex(palette.LINE);
    const bg0Delta = Math.max(bg0.r, bg0.g, bg0.b);
    const lineDelta = Math.max(line.r, line.g, line.b);
    console.info('[S2-A 근거] 가산 기여량', { BG_0: bg0Delta, LINE: lineDelta, visibleThreshold: VISIBLE_DELTA });
    expect(bg0Delta).toBeGreaterThanOrEqual(VISIBLE_DELTA);
    expect(lineDelta).toBeGreaterThanOrEqual(VISIBLE_DELTA);
  });
});

describe('S2-A 측정 3 — 스킬FX `tf-fx-01` 3회 중첩 시 클리핑', () => {
  const grid = spriteGrid('tf-fx-01');

  /** 특정 문자가 쓰인 첫 픽셀 좌표. */
  function firstCell(target: SpriteCell): readonly [number, number] {
    for (let y = 0; y < grid.length; y += 1) {
      const row = grid[y] as SpriteCell[];
      for (let x = 0; x < row.length; x += 1) if (row[x] === target) return [x, y];
    }
    throw new Error(`문자 ${target} 이 없습니다.`);
  }

  function stack(spec: CompositeSpec, times: number, step: number) {
    const raster = bake(grid, spec);
    const surface = field(raster.width + 20, raster.height + 20);
    const ctx = surface.getContext('2d');
    if (ctx === null) throw new Error('소프트웨어 캔버스를 만들 수 없습니다.');
    for (let i = 0; i < times; i += 1) drawSprite(ctx, raster, 10 + i * step, 10, 1);
    return { surface, raster };
  }

  function saturated(surface: SoftwareSurface): number {
    let count = 0;
    for (let i = 0; i < surface.data.length; i += 4) {
      if (surface.data[i] === 255 || surface.data[i + 1] === 255 || surface.data[i + 2] === 255) count += 1;
    }
    return count;
  }

  test('★ 같은 자리에 3회 겹치면 클리핑으로 색 구분이 무너진다 (두 정책 공통)', () => {
    const [gx, gy] = firstCell('g');
    const [wx, wy] = firstCell('w');

    const report = [1, 2, 3].map((times) => {
      const { surface } = stack(COMPOSITE_SPECS.additive, times, 0);
      const gold = pixelAt(surface, 10 + gx, 10 + gy);
      const white = pixelAt(surface, 10 + wx, 10 + wy);
      return { times, goldVsWhite: channelDelta(gold, white), saturatedPixels: saturated(surface) };
    });
    console.info('[S2-A 측정3] tf-fx-01 동일 위치 중첩', report);

    const single = report[0]?.goldVsWhite ?? 0;
    const tripled = report[2]?.goldVsWhite ?? 0;
    expect(single).toBeGreaterThanOrEqual(VISIBLE_DELTA);
    // 실측: 158 → 97 → 36. 완전히 같아지지는 않지만 색 분리가 1/4 밑으로 무너진다.
    // 즉 같은 FX 를 같은 자리에 쌓으면 형태가 뭉개진다 — Step 6~7 에서 중첩을 금지해야 한다.
    expect(tripled).toBeLessThan(single / CLIPPING_COLLAPSE_RATIO);
    expect(report[2]?.saturatedPixels).toBeGreaterThan(report[0]?.saturatedPixels ?? 0);
  });

  test('어긋나게 3회 겹치면 형태가 남는다 (실제 사용 형태)', () => {
    const { surface, raster } = stack(COMPOSITE_SPECS.additive, 3, 6);
    // 겹치지 않는 첫 인스턴스 왼쪽 영역은 1회 그린 것과 같아야 한다
    const single = stack(COMPOSITE_SPECS.additive, 1, 0);
    for (let y = 0; y < raster.height; y += 1) {
      for (let x = 0; x < 6; x += 1) {
        expect(pixelAt(surface, 10 + x, 10 + y), `x=${x} y=${y}`).toEqual(pixelAt(single.surface, 10 + x, 10 + y));
      }
    }
  });
});

describe('S2-A 결론 — 채택안이 세 측정을 모두 통과한다', () => {
  test('가산 스프라이트 11종 전부 사각형 자국이 0 이다', () => {
    const additiveKeys = [
      'tf-wx-01',
      'tf-wx-02',
      'tf-wx-03',
      'tf-wx-04',
      'tf-fx-01',
      'tf-fx-02',
      'tf-fx-03',
      'tf-w-01',
      'tf-w-02',
      'tf-w-03',
      'tf-w-04',
    ] as const;

    const worst = additiveKeys.map((key) => {
      const naive = measureRect(spriteGrid(key), NAIVE_ADDITIVE, 4, 4);
      const shipped = measureRect(spriteGrid(key), COMPOSITE_SPECS.additive, 4, 4);
      return { key, naiveChrome: naive.chromeDelta, naiveEdge: naive.edgeDelta, shippedChrome: shipped.chromeDelta };
    });
    console.info('[S2-A 결론] 가산 11종', worst);

    for (const row of worst) {
      expect(row.naiveChrome, row.key).toBeGreaterThanOrEqual(VISIBLE_DELTA);
      expect(row.shippedChrome, row.key).toBe(0);
    }
  });
});
