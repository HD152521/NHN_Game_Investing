import { describe, expect, test } from 'vitest';

import { parseHex } from '../../design/color';
import { resolvePalette } from '../../design/theme';
import { spriteGrid } from '../index';
import { SPRITE_PALETTE, TRANSPARENT, type SpriteCell } from '../palette';
import { ground } from '../ground';
import {
  ADDITIVE_INK_FLOOR,
  NON_RENDERABLE_SPRITE_KEYS,
  RENDERABLE_SPRITE_KEYS,
  SPRITE_COMPOSITE,
  COMPOSITE_SPECS,
} from './composite';
import { createSpriteRasterCache, spriteRasters, type SpriteRaster } from './cache';
import { drawSprite, drawSpriteBand, snapScale } from './draw';
import { droppedChars } from './rasterize';
import {
  channelDelta,
  contextlessSurfaceFactory,
  createSoftwareSurface,
  createSoftwareSurfaceFactory,
  createSurfaceStats,
  pixelAt,
  throwingSurfaceFactory,
  unsupportedSurfaceFactory,
  type SoftwareSurface,
} from './testing/software-canvas';

/**
 * Step 2 수용 기준 — 래스터 캐시와 렌더 API.
 *
 * 실제 캔버스가 없는 Node 에서 돌리려고 `testing/software-canvas.ts` 의 소프트웨어
 * 래스터라이저를 주입한다. 합성 공식은 Canvas 2D 명세 그대로이므로 여기서 읽은 픽셀은
 * 브라우저 결과와 같다.
 */

const OPAQUE = 255;

function cacheWithStats(mode: 'default' | 'colorblind' = 'default') {
  const stats = createSurfaceStats();
  const cache = createSpriteRasterCache({ mode, createSurface: createSoftwareSurfaceFactory(stats) });
  return { cache, stats };
}

function expectedChannels(cell: SpriteCell, mode: 'default' | 'colorblind' = 'default') {
  if (cell === TRANSPARENT) return null;
  return parseHex(resolvePalette(mode)[SPRITE_PALETTE[cell]]);
}

describe('합성 분류표', () => {
  test('43키에서 `tf-ally-parts` 만 빠진 42키를 전수 분류한다', () => {
    expect(RENDERABLE_SPRITE_KEYS).toHaveLength(42);
    expect(RENDERABLE_SPRITE_KEYS).not.toContain('tf-ally-parts');
    expect(NON_RENDERABLE_SPRITE_KEYS).toEqual(['tf-ally-parts']);
  });

  test('날씨·스킬FX·발사체는 가산, 나머지는 source-over 다', () => {
    for (const key of RENDERABLE_SPRITE_KEYS) {
      const additive = key.startsWith('tf-wx-') || key.startsWith('tf-fx-') || key.startsWith('tf-w-');
      if (additive) expect(SPRITE_COMPOSITE[key], key).toBe('additive');
      else expect(SPRITE_COMPOSITE[key], key).not.toBe('additive');
      expect(COMPOSITE_SPECS[SPRITE_COMPOSITE[key]].mode, key).toBe(additive ? 'lighter' : 'source-over');
    }
  });

  test('유닛·타워·기지는 alpha, 배경·발판·UI 는 opaque 다', () => {
    const alphaKeys = RENDERABLE_SPRITE_KEYS.filter((key) => SPRITE_COMPOSITE[key] === 'alpha');
    const opaqueKeys = RENDERABLE_SPRITE_KEYS.filter((key) => SPRITE_COMPOSITE[key] === 'opaque');
    expect(alphaKeys).toHaveLength(14);
    expect(opaqueKeys).toHaveLength(17);
    expect(RENDERABLE_SPRITE_KEYS.filter((key) => SPRITE_COMPOSITE[key] === 'additive')).toHaveLength(11);
  });

  test('가산 분류만 굽는 단계에서 검정 계열을 뺀다 (`0` LINE · `1` BG_0)', () => {
    for (const mode of ['default', 'colorblind'] as const) {
      const palette = resolvePalette(mode);
      expect(droppedChars(palette, COMPOSITE_SPECS.additive)).toEqual(['0', '1']);
      expect(droppedChars(palette, COMPOSITE_SPECS.opaque)).toEqual([]);
      expect(droppedChars(palette, COMPOSITE_SPECS.alpha)).toEqual([]);
    }
  });

  test('잉크 임계는 검정 계열과 실제로 그려진 색 사이의 빈 구간에 있다', () => {
    const palette = resolvePalette('default');
    const brightest = (hex: string) => {
      const { r, g, b } = parseHex(hex);
      return Math.max(r, g, b);
    };
    expect(brightest(palette.BG_0)).toBeLessThan(ADDITIVE_INK_FLOOR);
    expect(brightest(palette.LINE)).toBeLessThan(ADDITIVE_INK_FLOOR);
    expect(brightest(palette.BG_1)).toBeGreaterThan(ADDITIVE_INK_FLOOR);
  });
});

describe('래스터 캐시', () => {
  test('그리드 문자가 팔레트 색 그대로 구워진다 (`tf-ally-01` 전수 대조)', () => {
    const { cache } = cacheWithStats();
    const raster = cache.ofKey('tf-ally-01');
    expect(raster).not.toBeNull();
    const surface = (raster as SpriteRaster).surface as SoftwareSurface;
    const grid = spriteGrid('tf-ally-01');

    let checked = 0;
    for (let y = 0; y < grid.length; y += 1) {
      const row = grid[y] as SpriteCell[];
      for (let x = 0; x < row.length; x += 1) {
        const expected = expectedChannels(row[x] as SpriteCell);
        const [r, g, b, a] = pixelAt(surface, x, y);
        if (expected === null) {
          expect([x, y, a]).toEqual([x, y, 0]);
        } else {
          expect([x, y, r, g, b, a]).toEqual([x, y, expected.r, expected.g, expected.b, OPAQUE]);
        }
        checked += 1;
      }
    }
    expect(checked).toBe(grid.length * (grid[0]?.length ?? 0));
  });

  test('불투명 분류(`tf-gnd-r1`)는 검정 계열도 그대로 굽는다', () => {
    const { cache } = cacheWithStats();
    const raster = cache.ofKey('tf-gnd-r1') as SpriteRaster;
    const surface = raster.surface as SoftwareSurface;
    const grid = ground(1, 1);
    const palette = resolvePalette('default');
    // 발판 최상단 행은 전부 `m`(MUTED) 이다 — 문자→색 대응이 살아 있는지 표본 확인
    const muted = parseHex(palette.MUTED);
    expect(grid[4]?.[0]).toBe('m');
    expect(pixelAt(surface, 0, 4)).toEqual([muted.r, muted.g, muted.b, OPAQUE]);
  });

  test('같은 키를 두 번 요청하면 같은 캔버스 객체가 나온다', () => {
    const { cache } = cacheWithStats();
    const first = cache.ofKey('tf-tower-01');
    const second = cache.ofKey('tf-tower-01');
    expect(first).not.toBeNull();
    expect(second).toBe(first);
    expect((second as SpriteRaster).surface).toBe((first as SpriteRaster).surface);
    expect(cache.size).toBe(1);
  });

  test('캐시 적중이면 다시 굽지 않는다 (`fillRect` 추가 호출 0회)', () => {
    const { cache, stats } = cacheWithStats();
    cache.ofKey('tf-enemy-01');
    const afterFirst = stats.fillRect;
    expect(afterFirst).toBeGreaterThan(0);
    for (let i = 0; i < 20; i += 1) cache.ofKey('tf-enemy-01');
    expect(stats.fillRect).toBe(afterFirst);
  });

  test('파라메트릭 그리드도 id 로 캐시된다 (원본 43키에 없는 `ground(2, 2)`)', () => {
    const { cache } = cacheWithStats();
    const source = { id: 'gnd:2:2', grid: ground(2, 2), composite: 'opaque' as const };
    const first = cache.raster(source);
    expect(first).not.toBeNull();
    expect(cache.raster(source)).toBe(first);
    expect(cache.size).toBe(1);
  });

  test('빈 그리드는 굽지 않고 null 을 돌려준다', () => {
    const { cache } = cacheWithStats();
    expect(cache.raster({ id: 'empty', grid: [], composite: 'alpha' })).toBeNull();
  });
});

describe('색약 모드', () => {
  test('토글하면 캐시가 비워지고 색이 실제로 바뀐다', () => {
    const { cache } = cacheWithStats();
    const before = cache.ofKey('tf-ally-01') as SpriteRaster;
    const grid = spriteGrid('tf-ally-01');

    // `r`(UP_ALLY) 이 실제로 쓰인 첫 픽셀을 찾는다
    let found: readonly [number, number] | null = null;
    for (let y = 0; y < grid.length && found === null; y += 1) {
      const row = grid[y] as SpriteCell[];
      for (let x = 0; x < row.length; x += 1) {
        if (row[x] === 'r') {
          found = [x, y];
          break;
        }
      }
    }
    expect(found).not.toBeNull();
    const [px, py] = found as readonly [number, number];

    const normal = pixelAt(before.surface as SoftwareSurface, px, py);
    cache.setColorMode('colorblind');
    expect(cache.size).toBe(0);
    expect(cache.mode).toBe('colorblind');

    const after = cache.ofKey('tf-ally-01') as SpriteRaster;
    expect(after).not.toBe(before);
    const colorblind = pixelAt(after.surface as SoftwareSurface, px, py);
    expect(colorblind).not.toEqual(normal);
    expect(expectedChannels('r', 'colorblind')).toEqual({
      r: colorblind[0],
      g: colorblind[1],
      b: colorblind[2],
    });
  });

  test('같은 모드로 다시 설정하면 캐시를 버리지 않는다', () => {
    const { cache } = cacheWithStats();
    const before = cache.ofKey('tf-ally-01');
    cache.setColorMode('default');
    expect(cache.ofKey('tf-ally-01')).toBe(before);
  });
});

describe('캔버스 미지원 환경', () => {
  test.each([
    ['캔버스 자체가 없다', unsupportedSurfaceFactory],
    ['2D 컨텍스트가 null 이다', contextlessSurfaceFactory],
    ['getContext 가 던진다', throwingSurfaceFactory],
  ])('%s — 크래시하지 않고 null 을 돌려준다', (_label, createSurface) => {
    const cache = createSpriteRasterCache({ createSurface });
    expect(() => cache.ofKey('tf-ally-01')).not.toThrow();
    expect(cache.ofKey('tf-ally-01')).toBeNull();
    // 실패도 캐시된다 — 매 프레임 재시도를 막는다
    expect(cache.size).toBe(1);
  });

  test('모듈 기본 캐시도 Node 에서 크래시하지 않는다', () => {
    expect(() => spriteRasters.ofKey('tf-ally-01')).not.toThrow();
  });
});

describe('정수 배율 · 정수 스냅 (R4 픽셀 아트 선명도)', () => {
  test('실수 배율은 원본 `paint()` 처럼 floor 되고 최소 1 이다', () => {
    expect(snapScale(3.99)).toBe(3);
    expect(snapScale(1)).toBe(1);
    expect(snapScale(0.4)).toBe(1);
    expect(snapScale(0)).toBe(1);
    expect(snapScale(-2)).toBe(1);
  });

  test('실수 좌표로 그려도 목적지 사각형이 정수에 못 박힌다', () => {
    const { cache } = cacheWithStats();
    const raster = cache.ofKey('tf-w-02') as SpriteRaster;
    const target = createSoftwareSurface(120, 60);
    const ctx = target.getContext('2d');
    expect(ctx).not.toBeNull();
    if (ctx === null) return;

    // 배율 2.7 → 2, x 10.4 → 10
    drawSprite(ctx, raster, 10.4, 5.6, 2.7);
    const width = raster.width * 2;
    const height = raster.height * 2;

    // 사각형 바로 바깥은 손대지 않는다
    expect(pixelAt(target, 9, 20)[3]).toBe(0);
    expect(pixelAt(target, 10 + width, 20)[3]).toBe(0);
    expect(pixelAt(target, 20, 5)[3]).toBe(0);
    expect(pixelAt(target, 20, 6 + height)[3]).toBe(0);

    // 정수 배율이므로 원본 픽셀 하나가 정확히 2×2 블록이 된다
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        const base = pixelAt(target, 10 + x, 6 + y);
        expect(pixelAt(target, 10 + x + 1, 6 + y)).toEqual(base);
        expect(pixelAt(target, 10 + x, 6 + y + 1)).toEqual(base);
        expect(pixelAt(target, 10 + x + 1, 6 + y + 1)).toEqual(base);
      }
    }
  });

  test('`imageSmoothingEnabled` 를 매 그리기마다 끈다', () => {
    const { cache } = cacheWithStats();
    const raster = cache.ofKey('tf-ally-01') as SpriteRaster;
    const target = createSoftwareSurface(80, 80);
    const ctx = target.getContext('2d');
    if (ctx === null) return;
    ctx.imageSmoothingEnabled = true;
    drawSprite(ctx, raster, 0, 0, 1);
    expect(ctx.imageSmoothingEnabled).toBe(false);
  });
});

describe('좌우 반전 (`scale(-1, 1)`)', () => {
  test('그리드를 두 벌 만들지 않고 정확히 좌우 대칭이 된다 — 밀림 0', () => {
    const { cache } = cacheWithStats();
    const raster = cache.ofKey('tf-enemy-01') as SpriteRaster;
    const scale = 3;
    const width = raster.width * scale;
    const height = raster.height * scale;

    const plain = createSoftwareSurface(width + 20, height + 20);
    const mirrored = createSoftwareSurface(width + 20, height + 20);
    const plainCtx = plain.getContext('2d');
    const mirroredCtx = mirrored.getContext('2d');
    if (plainCtx === null || mirroredCtx === null) return;

    drawSprite(plainCtx, raster, 7, 5, scale, false);
    drawSprite(mirroredCtx, raster, 7, 5, scale, true);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        expect(pixelAt(mirrored, 7 + x, 5 + y)).toEqual(pixelAt(plain, 7 + width - 1 - x, 5 + y));
      }
    }
  });

  test('반전해도 목적지 사각형이 이동하지 않는다', () => {
    const { cache } = cacheWithStats();
    const raster = cache.ofKey('tf-enemy-02') as SpriteRaster;
    const scale = 2;
    const width = raster.width * scale;
    const target = createSoftwareSurface(width + 8, raster.height * scale + 8);
    const ctx = target.getContext('2d');
    if (ctx === null) return;
    drawSprite(ctx, raster, 4, 4, scale, true);
    for (let y = 0; y < target.height; y += 1) {
      expect(pixelAt(target, 3, y)[3], `x=3 y=${y}`).toBe(0);
      expect(pixelAt(target, 4 + width, y)[3], `x=${4 + width} y=${y}`).toBe(0);
    }
  });
});

describe('합성 모드 전환', () => {
  test.each([false, true])('가산 스프라이트는 `lighter` 로 그려진다 (flipX=%s)', (flipX) => {
    const { cache } = cacheWithStats();
    const raster = cache.ofKey('tf-wx-01') as SpriteRaster;
    expect(raster.mode).toBe('lighter');

    const target = createSoftwareSurface(120, 80);
    const ctx = target.getContext('2d');
    if (ctx === null) return;

    const seen: string[] = [];
    const spy: typeof ctx = {
      ...ctx,
      get globalCompositeOperation() {
        return ctx.globalCompositeOperation;
      },
      set globalCompositeOperation(value: string) {
        ctx.globalCompositeOperation = value;
      },
      drawImage: (image, dx, dy, dw, dh) => {
        seen.push(ctx.globalCompositeOperation);
        ctx.drawImage(image, dx, dy, dw, dh);
      },
    };

    drawSprite(spy, raster, 4, 4, 1, flipX);
    expect(seen).toEqual(['lighter']);
    // 그린 뒤에는 호출부의 합성 모드로 되돌린다
    expect(ctx.globalCompositeOperation).toBe('source-over');
  });

  test('alpha·opaque 스프라이트는 `source-over` 그대로다', () => {
    const { cache } = cacheWithStats();
    expect((cache.ofKey('tf-ally-01') as SpriteRaster).mode).toBe('source-over');
    expect((cache.ofKey('tf-gnd-r1') as SpriteRaster).mode).toBe('source-over');
  });
});

describe('프레임 비용', () => {
  test('유닛 60체 + 타워 8기를 그려도 `fillRect` 0회, `drawImage` 68회', () => {
    const bake = createSurfaceStats();
    const cache = createSpriteRasterCache({ createSurface: createSoftwareSurfaceFactory(bake) });
    const unitKeys = ['tf-ally-01', 'tf-ally-02', 'tf-ally-03', 'tf-enemy-01', 'tf-enemy-02', 'tf-enemy-03'] as const;
    const towerKeys = ['tf-tower-01', 'tf-tower-02', 'tf-tower-03'] as const;

    // 워밍업 — 캐시 구축은 프레임 밖이다
    for (const key of [...unitKeys, ...towerKeys]) cache.ofKey(key);
    const bakedFills = bake.fillRect;
    expect(bakedFills).toBeGreaterThan(0);

    const frameStats = createSurfaceStats();
    const screen = createSoftwareSurface(1024, 480, frameStats);
    const ctx = screen.getContext('2d');
    if (ctx === null) return;

    for (let i = 0; i < 60; i += 1) {
      const raster = cache.ofKey(unitKeys[i % unitKeys.length] as (typeof unitKeys)[number]);
      if (raster !== null) drawSprite(ctx, raster, (i * 17) % 900, 200 + (i % 3) * 40, 2, i % 2 === 0);
    }
    for (let i = 0; i < 8; i += 1) {
      const raster = cache.ofKey(towerKeys[i % towerKeys.length] as (typeof towerKeys)[number]);
      if (raster !== null) drawSprite(ctx, raster, 40 + i * 60, 300, 2);
    }

    expect(frameStats.fillRect).toBe(0);
    expect(frameStats.drawImage).toBe(68);
    // 프레임 중에 굽기가 다시 일어나지 않았다
    expect(bake.fillRect).toBe(bakedFills);
  });
});

describe('타일 이음새 — 교차 미러링 (C-4)', () => {
  function bandSurface(offset: number) {
    const { cache } = cacheWithStats();
    const raster = cache.ofKey('tf-gnd-r1') as SpriteRaster;
    const target = createSoftwareSurface(raster.width * 3, raster.height + 4);
    const ctx = target.getContext('2d');
    if (ctx === null) throw new Error('컨텍스트를 만들 수 없습니다.');
    drawSpriteBand(ctx, raster, 0, 0, target.width, 1, offset);
    return { target, raster };
  }

  test('타일 경계에서 양쪽 픽셀이 같다 (홀수 타일 좌우 반전)', () => {
    const { target, raster } = bandSurface(0);
    const seam = raster.width;
    for (let y = 0; y < raster.height; y += 1) {
      expect(pixelAt(target, seam - 1, y), `seam y=${y}`).toEqual(pixelAt(target, seam, y));
      expect(pixelAt(target, seam * 2 - 1, y), `seam2 y=${y}`).toEqual(pixelAt(target, seam * 2, y));
    }
  });

  test('단순 반복이었다면 이음새가 생겼다 (미러링이 실제로 문제를 고친다)', () => {
    const { target, raster } = bandSurface(0);
    const seam = raster.width;
    // 첫 열과 마지막 열이 다르다 = 반복 타일링이면 경계에서 그림이 끊긴다
    let differing = 0;
    for (let y = 0; y < raster.height; y += 1) {
      if (channelDelta(pixelAt(target, 0, y), pixelAt(target, seam - 1, y)) > 0) differing += 1;
    }
    expect(differing).toBeGreaterThan(0);
  });

  test('반전 여부는 절대 타일 번호로 정해져 스크롤해도 흔들리지 않는다', () => {
    const { target: a, raster } = bandSurface(0);
    const { target: b } = bandSurface(raster.width * 2);
    // 오프셋이 타일 2장이면 같은 짝수 타일이 다시 왼쪽에 온다
    for (let y = 0; y < raster.height; y += 1) {
      for (let x = 0; x < raster.width; x += 1) {
        expect(pixelAt(b, x, y), `x=${x} y=${y}`).toEqual(pixelAt(a, x, y));
      }
    }
  });

  test('밴드 밖으로 넘치지 않는다', () => {
    const { cache } = cacheWithStats();
    const raster = cache.ofKey('tf-gnd-r1') as SpriteRaster;
    const target = createSoftwareSurface(raster.width * 3, raster.height + 6);
    const ctx = target.getContext('2d');
    if (ctx === null) return;
    const bandWidth = raster.width + 30;
    drawSpriteBand(ctx, raster, 10, 3, bandWidth, 1, 7);

    for (let y = 0; y < target.height; y += 1) {
      expect(pixelAt(target, 9, y)[3], `left y=${y}`).toBe(0);
      expect(pixelAt(target, 10 + bandWidth, y)[3], `right y=${y}`).toBe(0);
    }
    for (let x = 0; x < target.width; x += 1) {
      expect(pixelAt(target, x, 2)[3], `top x=${x}`).toBe(0);
      expect(pixelAt(target, x, 3 + raster.height)[3], `bottom x=${x}`).toBe(0);
    }
  });
});
