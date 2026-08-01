/**
 * 날씨 스프라이트 렌더 검사 (PLAN Step 6) — 실제로 그려진 픽셀을 읽는다.
 *
 * `draw-weather.test.ts`는 호출 기록(`FakeBattleCtx`)으로 **벡터 폴백**을 검사한다.
 * 여기서는 소프트웨어 캔버스를 물려 **스프라이트 경로**를 본다. 두 경로가 다른 질문에
 * 답하므로 파일을 나눈다.
 *
 * 이 파일이 지키는 수용 기준:
 *  1. 날씨 4종이 시트 원본 그리드와 픽셀 단위로 일치한다
 *  2. 강도가 변하면 화면 결과가 실제로 변한다 (연속값 유지)
 *  3. **같은 자리에 두 번 얹지 않는다** — 가산 합성 포화(Step 2 실측)를 피한다
 */

import { describe, expect, test } from 'vitest';

import { createTheme, parseHex } from '../design/index.js';
import type { Palette } from '../design/index.js';
import { SPRITE_PALETTE, TRANSPARENT, spriteGrid } from '../sprites/index.js';
import type { SpriteCell } from '../sprites/index.js';
import { ADDITIVE_INK_FLOOR } from '../sprites/render/index.js';
import type { RenderableSpriteKey } from '../sprites/render/index.js';
import { centerClearBottom, createWeatherField } from '../weather/index.js';
import type { WeatherKind, WeatherView, WeatherViewport } from '../weather/index.js';
import { drawWeather, weatherViewport } from './draw-weather.js';
import { weatherTileScale } from './draw-weather-shared.js';
import { computeBattleLayout } from './layout.js';
import { createSoftwareRasterCache, createSpriteBattleSurface, hashRegion } from './sprite-fake-ctx.js';
import type { SpriteBattleSurface } from './sprite-fake-ctx.js';

const { palette } = createTheme();
const FIELD = createWeatherField();

const WIDTH = 960;
const HEIGHT = 420;
const LAYOUT = computeBattleLayout(WIDTH, HEIGHT);
const VIEWPORT: WeatherViewport = weatherViewport(LAYOUT);
const SCALE = weatherTileScale(VIEWPORT);

/** 날씨 종류 → 시트 키. 프로덕션 코드와 같은 배정이어야 검사가 의미를 갖는다. */
const KIND_KEY = {
  panic_rain: 'tf-wx-01',
  fomo_updraft: 'tf-wx-02',
  range_fog: 'tf-wx-03',
  blackout: 'tf-wx-04',
} as const satisfies Record<WeatherKind extends 'clear' ? never : Exclude<WeatherKind, 'clear'>, RenderableSpriteKey>;

type OverlayKind = keyof typeof KIND_KEY;

const OVERLAY_KINDS: readonly OverlayKind[] = ['panic_rain', 'fomo_updraft', 'range_fog', 'blackout'];

/**
 * `timeMs: 0`이므로 위상은 어느 쪽이든 0이다 — 격자가 원점에 선다.
 *
 * ★ `reducedMotion`을 켜지 않는 이유: 정전의 reduced-motion 암전만 `rgba(...)` 문자열을
 *   쓰는데 소프트웨어 캔버스는 `#RRGGBB`만 파싱한다. 그 분기는 호출 기록으로 보는
 *   `draw-weather.test.ts`가 이미 검사한다.
 */
function view(kind: OverlayKind, intensity: number, reducedMotion = false): WeatherView {
  return { kind, intensity, timeMs: 0, reducedMotion };
}

function render(v: WeatherView): SpriteBattleSurface {
  const target = createSpriteBattleSurface(WIDTH, HEIGHT);
  drawWeather(target.ctx, palette, VIEWPORT, v, FIELD, createSoftwareRasterCache());
  return target;
}

/**
 * 가산 합성으로 실제 화면에 남는 색. `ADDITIVE_INK_FLOOR` 미만(=`LINE`·`BG_0`)은
 * 굽는 단계에서 알파 0이 되므로 화면에 아무 것도 남기지 않는다.
 */
function additiveRgb(pal: Palette, cell: SpriteCell): readonly [number, number, number] | null {
  if (cell === TRANSPARENT) return null;
  const { r, g, b } = parseHex(pal[SPRITE_PALETTE[cell]]);
  if (Math.max(r, g, b) < ADDITIVE_INK_FLOOR) return null;
  return [r, g, b];
}

/**
 * 스프라이트 아래에 이미 깔려 있는 색.
 *
 * 정전만 벡터 암전(`LINE`)을 한 겹 깔고 그 위에 스캔라인을 가산한다 — 가산 스프라이트는
 * 화면을 어둡게 만들 수 없기 때문이다. 나머지 3종은 빈 캔버스 위에 바로 얹힌다.
 */
function baseRgb(kind: OverlayKind): readonly [number, number, number] {
  if (kind !== 'blackout') return [0, 0, 0];
  const { r, g, b } = parseHex(palette.LINE);
  return [r, g, b];
}

/** 바탕 + 스프라이트 색의 가산 결과(0-255 포화). 화면에 실제로 남아야 할 값이다. */
function screenRgb(kind: OverlayKind, cell: SpriteCell): readonly [number, number, number] | null {
  const ink = additiveRgb(palette, cell);
  if (ink === null) return null;
  const base = baseRgb(kind);
  return [
    Math.min(255, base[0] + ink[0]),
    Math.min(255, base[1] + ink[1]),
    Math.min(255, base[2] + ink[2]),
  ];
}

/** 오버레이 띠의 상단 y — 프로덕션과 같은 규칙(안개만 발판 아래에서 시작한다). */
function bandTopOf(kind: OverlayKind): number {
  if (kind === 'blackout') return 0;
  if (kind === 'range_fog') return Math.max(VIEWPORT.groundY, centerClearBottom(VIEWPORT));
  return VIEWPORT.top;
}

/**
 * 위상 0(reduced-motion)일 때 절대 칸 `(absCol, absRow)`의 좌상단.
 * `drawWeatherTiles`의 격자 규칙(한 칸 위·왼쪽에서 시작)을 그대로 재현한다.
 */
function tileOrigin(kind: OverlayKind, absCol: number, absRow: number, tileW: number, tileH: number) {
  return { x: (absCol - 1) * tileW, y: bandTopOf(kind) - tileH + absRow * tileH };
}

function pixel(surface: SpriteBattleSurface['surface'], x: number, y: number): readonly number[] {
  const index = (y * surface.width + x) * 4;
  return [surface.data[index] ?? 0, surface.data[index + 1] ?? 0, surface.data[index + 2] ?? 0];
}

describe('날씨 스프라이트 — 원본 그리드와 픽셀이 일치한다', () => {
  test.each(OVERLAY_KINDS)('%s 타일이 시트 원본 그대로 찍힌다', (kind) => {
    const target = render(view(kind, 1));
    const grid = spriteGrid(KIND_KEY[kind]);
    const tileH = grid.length * SCALE;
    const tileW = (grid[0]?.length ?? 0) * SCALE;
    // 짝수 칸이라 좌우 반전이 걸리지 않는다(홀수 칸은 이음새 맞춤으로 뒤집힌다).
    const origin = tileOrigin(kind, 2, 1, tileW, tileH);

    let compared = 0;
    const mismatches: unknown[] = [];
    for (let gy = 0; gy < grid.length; gy += 1) {
      const row = grid[gy];
      if (row === undefined) continue;
      for (let gx = 0; gx < row.length; gx += 1) {
        const cell = row[gx];
        if (cell === undefined) continue;
        const expected = screenRgb(kind, cell);
        if (expected === null) continue;

        const px = Math.round(origin.x) + gx * SCALE;
        const py = Math.round(origin.y) + gy * SCALE;
        if (px < 0 || px >= WIDTH || py < 0 || py >= HEIGHT) continue;

        const got = pixel(target.surface, px, py);
        compared += 1;
        if (got.join(',') !== expected.join(',')) mismatches.push({ gx, gy, got, expected });
      }
    }

    expect({ kind, mismatches: mismatches.slice(0, 5) }).toMatchObject({ mismatches: [] });
    expect(compared).toBeGreaterThan(50);
  });
});

describe('날씨 스프라이트 — 같은 자리 중첩이 없다 (가산 포화 회피)', () => {
  test.each(OVERLAY_KINDS)('%s: 화면의 모든 색이 원본 색 중 하나다 — 합산된 색이 없다', (kind) => {
    const target = render(view(kind, 1));
    const grid = spriteGrid(KIND_KEY[kind]);

    // 허용 = "빈 화면" + "바탕" + "바탕 + 원본 색 한 겹". 두 겹 이상 가산되면 이 밖의 색이 나온다.
    const allowed = new Set<string>(['0,0,0', baseRgb(kind).join(',')]);
    for (const row of grid) {
      for (const cell of row) {
        const rgb = screenRgb(kind, cell);
        if (rgb !== null) allowed.add(rgb.join(','));
      }
    }

    const seen = new Set<string>();
    for (let y = 0; y < HEIGHT; y += 1) {
      for (let x = 0; x < WIDTH; x += 1) {
        seen.add(pixel(target.surface, x, y).join(','));
      }
    }

    const unexpected = [...seen].filter((color) => !allowed.has(color));
    expect({ kind, unexpected }).toMatchObject({ unexpected: [] });
  });
});

describe('날씨 스프라이트 — 강도 연속값이 살아 있다', () => {
  test.each(OVERLAY_KINDS)('%s: 강도가 오르면 그려진 타일 수가 늘어난다', (kind) => {
    const counts = [0.2, 0.4, 0.6, 0.8, 1].map((intensity) => render(view(kind, intensity)).surface.stats.drawImage);

    for (let i = 1; i < counts.length; i += 1) {
      expect({ kind, i, prev: counts[i - 1], next: counts[i] }).toMatchObject({
        next: expect.any(Number),
      });
      expect(counts[i] as number).toBeGreaterThanOrEqual(counts[i - 1] as number);
    }
    expect(counts[counts.length - 1] as number).toBeGreaterThan(counts[0] as number);
  });

  test.each(OVERLAY_KINDS)('%s: 강도가 다르면 화면 결과가 실제로 다르다', (kind) => {
    const weak = render(view(kind, 0.3));
    const strong = render(view(kind, 1));
    expect(hashRegion(strong.surface, 0, 0, WIDTH, HEIGHT)).not.toBe(
      hashRegion(weak.surface, 0, 0, WIDTH, HEIGHT),
    );
  });

  test('강도 0이면 스프라이트를 한 장도 그리지 않는다', () => {
    for (const kind of OVERLAY_KINDS) {
      expect({ kind, drawn: render(view(kind, 0)).surface.stats.drawImage }).toMatchObject({ drawn: 0 });
    }
  });
});

describe('날씨 스프라이트 — 배치 규칙', () => {
  test('안개는 발판 위쪽에 한 픽셀도 찍히지 않는다', () => {
    const target = render(view('range_fog', 1));
    const limit = Math.floor(Math.max(VIEWPORT.groundY, centerClearBottom(VIEWPORT)));

    // 픽셀마다 expect를 부르면 30만 번이라 타임아웃난다 — 먼저 스캔하고 한 번만 단언한다.
    let firstPainted: { x: number; y: number } | null = null;
    for (let y = 0; y < limit && firstPainted === null; y += 1) {
      for (let x = 0; x < WIDTH; x += 1) {
        if (pixel(target.surface, x, y).some((channel) => channel > 0)) {
          firstPainted = { x, y };
          break;
        }
      }
    }

    expect({ limit, firstPainted }).toMatchObject({ firstPainted: null });
  });

  test('모션을 줄이지 않으면 시각에 따라 화면이 흐른다', () => {
    const a = render({ kind: 'panic_rain', intensity: 1, timeMs: 0, reducedMotion: false });
    const b = render({ kind: 'panic_rain', intensity: 1, timeMs: 310, reducedMotion: false });
    expect(hashRegion(b.surface, 0, 0, WIDTH, HEIGHT)).not.toBe(hashRegion(a.surface, 0, 0, WIDTH, HEIGHT));
  });

  test('0×0 뷰포트에서도 스프라이트 경로가 크래시하지 않는다', () => {
    const target = createSpriteBattleSurface(4, 4);
    const empty: WeatherViewport = { width: 0, height: 0, top: 0, groundY: 0 };
    for (const kind of OVERLAY_KINDS) {
      expect(() =>
        drawWeather(target.ctx, palette, empty, view(kind, 1), FIELD, createSoftwareRasterCache()),
      ).not.toThrow();
    }
  });
});
