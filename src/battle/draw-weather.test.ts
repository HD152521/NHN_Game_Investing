import { describe, expect, test } from 'vitest';

import { createTheme, parseHex } from '../design/index.js';
import type { PaletteToken } from '../design/index.js';
import {
  BLACKOUT_SCANLINE_COUNT,
  WEATHER_KINDS,
  WEATHER_SIGNATURE_TOKEN,
  centerClearBottom,
  centerClearLeft,
  centerClearRight,
  centerClearTop,
  createWeatherField,
} from '../weather/index.js';
import type { WeatherKind, WeatherView, WeatherViewport } from '../weather/index.js';
import { drawWeather } from './draw-weather.js';
import type { BattleCall, FakeBattleCtx } from './fake-ctx.js';
import { createFakeBattleCtx } from './fake-ctx.js';
import { computeBattleLayout } from './layout.js';
import { weatherViewport } from './draw-weather.js';

const { palette } = createTheme();
const FIELD = createWeatherField();

const WIDTH = 960;
const HEIGHT = 420;
const LAYOUT = computeBattleLayout(WIDTH, HEIGHT);
const VIEWPORT: WeatherViewport = weatherViewport(LAYOUT);

/** 중앙 공백 규칙이 적용되는 상시 오버레이 3종 (WX-04 정전은 시트상 전체 화면이 의도). */
const OVERLAY_KINDS: readonly WeatherKind[] = ['panic_rain', 'fomo_updraft', 'range_fog'];

function view(overrides: Partial<WeatherView> = {}): WeatherView {
  return { kind: 'clear', intensity: 0, timeMs: 1234, reducedMotion: false, ...overrides };
}

function render(v: WeatherView): FakeBattleCtx {
  const ctx = createFakeBattleCtx();
  drawWeather(ctx, palette, VIEWPORT, v, FIELD);
  return ctx;
}

/** 좌표를 갖는 호출에서 (x, y) 점들을 뽑아낸다. */
function pointsOf(call: BattleCall): readonly (readonly [number, number])[] {
  switch (call.kind) {
    case 'moveTo':
    case 'lineTo':
    case 'arc':
      return [[call.x, call.y]];
    case 'fillRect':
    case 'strokeRect':
      return [
        [call.x, call.y],
        [call.x + call.w, call.y],
        [call.x, call.y + call.h],
        [call.x + call.w, call.y + call.h],
      ];
    case 'fillText':
      return [[call.x, call.y]];
    default:
      return [];
  }
}

function tokenPrefix(token: PaletteToken): string {
  const { r, g, b } = parseHex(palette[token]);
  return `rgba(${r}, ${g}, ${b},`;
}

function usesToken(ctx: FakeBattleCtx, token: PaletteToken): boolean {
  const prefix = tokenPrefix(token);
  const solid = palette[token];
  return ctx.calls.some((call) => {
    const style =
      call.kind === 'fill' || call.kind === 'fillRect' || call.kind === 'fillText'
        ? call.fillStyle
        : call.kind === 'stroke' || call.kind === 'strokeRect'
          ? call.strokeStyle
          : '';
    return style.startsWith(prefix) || style === solid;
  });
}

function drawCallCount(ctx: FakeBattleCtx): number {
  return ctx.calls.filter(
    (call) => call.kind === 'fill' || call.kind === 'fillRect' || call.kind === 'stroke' || call.kind === 'strokeRect',
  ).length;
}

describe('drawWeather — 맑음', () => {
  test("kind가 'clear'면 아무것도 그리지 않는다", () => {
    expect(render(view({ kind: 'clear', intensity: 0 })).calls).toHaveLength(0);
  });

  test('강도가 0이면 아무것도 그리지 않는다', () => {
    expect(render(view({ kind: 'panic_rain', intensity: 0 })).calls).toHaveLength(0);
  });
});

describe('drawWeather — 중앙 공백 (게임플레이 가림 금지)', () => {
  const left = centerClearLeft(VIEWPORT);
  const right = centerClearRight(VIEWPORT);
  const top = centerClearTop(VIEWPORT);
  const bottom = centerClearBottom(VIEWPORT);

  for (const kind of OVERLAY_KINDS) {
    test(`${kind}: 어떤 그리기 좌표도 중앙 공백 안으로 들어가지 않는다`, () => {
      for (const timeMs of [0, 250, 700, 1500, 3300, 9100]) {
        const ctx = render(view({ kind, intensity: 1, timeMs }));
        for (const call of ctx.calls) {
          for (const [x, y] of pointsOf(call)) {
            const inside = x > left && x < right && y > top && y < bottom;
            expect({ kind, timeMs, call: call.kind, x, y, inside }).toMatchObject({ inside: false });
          }
        }
      }
    });
  }
});

describe('drawWeather — WX-03 횡보 안개', () => {
  test('안개 띠는 전부 발판(지상 레인) 아래에 깔린다 — 유닛 실루엣을 가리지 않는다', () => {
    const ctx = render(view({ kind: 'range_fog', intensity: 1 }));
    const rects = ctx.calls.filter((call) => call.kind === 'fillRect');
    expect(rects.length).toBeGreaterThan(0);
    for (const rect of rects) {
      expect(rect.y).toBeGreaterThanOrEqual(VIEWPORT.groundY);
    }
  });

  test('안개는 두 겹이다 (시트 03)', () => {
    const ctx = render(view({ kind: 'range_fog', intensity: 1 }));
    expect(ctx.calls.filter((call) => call.kind === 'fillRect')).toHaveLength(2);
  });

  test('무채색(MUTED)을 쓴다', () => {
    expect(usesToken(render(view({ kind: 'range_fog', intensity: 1 })), 'MUTED')).toBe(true);
  });
});

describe('drawWeather — WX-04 서킷브레이커 정전', () => {
  test('화면 전체를 덮는 칠이 한 번 들어간다', () => {
    const ctx = render(view({ kind: 'blackout', intensity: 1 }));
    const full = ctx.calls.filter(
      (call) => call.kind === 'fillRect' && call.w >= VIEWPORT.width && call.h >= VIEWPORT.height,
    );
    expect(full).toHaveLength(1);
  });

  test('굵은 스캔라인이 두 줄이다 (시트 03)', () => {
    const ctx = render(view({ kind: 'blackout', intensity: 1 }));
    const scanlines = ctx.calls.filter(
      (call) => call.kind === 'fillRect' && call.w >= VIEWPORT.width && call.h < VIEWPORT.height,
    );
    expect(scanlines).toHaveLength(BLACKOUT_SCANLINE_COUNT);
    expect(BLACKOUT_SCANLINE_COUNT).toBe(2);
  });

  test('두 스캔라인은 서로 다른 높이를 훑는다 (위·아래)', () => {
    const ctx = render(view({ kind: 'blackout', intensity: 1, timeMs: 16 }));
    const ys = ctx.calls
      .filter((call) => call.kind === 'fillRect' && call.w >= VIEWPORT.width && call.h < VIEWPORT.height)
      .map((call) => (call.kind === 'fillRect' ? call.y : 0));
    expect(new Set(ys).size).toBe(BLACKOUT_SCANLINE_COUNT);
  });
});

describe('drawWeather — 강도가 연출 밀도에 반영된다', () => {
  test('폭우: 강도가 높을수록 그리기 호출이 늘어난다', () => {
    const weak = drawCallCount(render(view({ kind: 'panic_rain', intensity: 0.15 })));
    const strong = drawCallCount(render(view({ kind: 'panic_rain', intensity: 1 })));
    expect(strong).toBeGreaterThan(weak);
  });

  test('상승기류: 강도가 높을수록 그리기 호출이 늘어난다', () => {
    const weak = drawCallCount(render(view({ kind: 'fomo_updraft', intensity: 0.15 })));
    const strong = drawCallCount(render(view({ kind: 'fomo_updraft', intensity: 1 })));
    expect(strong).toBeGreaterThan(weak);
  });
});

describe('drawWeather — 진영색 규약 (아트가이드 §1.3)', () => {
  test('WX-01 패닉 셀은 청색(ENEMY_DOWN)이다', () => {
    expect(usesToken(render(view({ kind: 'panic_rain', intensity: 1 })), 'ENEMY_DOWN')).toBe(true);
  });

  test('WX-02 FOMO 랠리는 적색(UP_ALLY)이다', () => {
    expect(usesToken(render(view({ kind: 'fomo_updraft', intensity: 1 })), 'UP_ALLY')).toBe(true);
  });
});

describe('drawWeather — prefers-reduced-motion', () => {
  test('모션을 줄여도 날씨 종류는 색으로 식별된다', () => {
    for (const kind of WEATHER_KINDS) {
      const token = WEATHER_SIGNATURE_TOKEN[kind];
      if (token === null) continue;
      const ctx = render(view({ kind, intensity: 1, reducedMotion: true }));
      expect({ kind, identifiable: usesToken(ctx, token) }).toMatchObject({ identifiable: true });
    }
  });

  test('모션을 줄이면 시각이 흘러도 화면이 변하지 않는다', () => {
    const a = render(view({ kind: 'panic_rain', intensity: 1, reducedMotion: true, timeMs: 0 }));
    const b = render(view({ kind: 'panic_rain', intensity: 1, reducedMotion: true, timeMs: 5_000 }));
    expect(JSON.stringify(b.calls)).toBe(JSON.stringify(a.calls));
  });

  test('모션을 줄이지 않으면 시각에 따라 화면이 움직인다', () => {
    const a = render(view({ kind: 'panic_rain', intensity: 1, timeMs: 0 }));
    const b = render(view({ kind: 'panic_rain', intensity: 1, timeMs: 400 }));
    expect(JSON.stringify(b.calls)).not.toBe(JSON.stringify(a.calls));
  });

  test('모션을 줄여도 정전은 전체 화면을 완전히 죽이지 않는다 (섬광 회피)', () => {
    const ctx = render(view({ kind: 'blackout', intensity: 1, reducedMotion: true }));
    const full = ctx.calls.find(
      (call) => call.kind === 'fillRect' && call.w >= VIEWPORT.width && call.h >= VIEWPORT.height,
    );
    expect(full?.kind).toBe('fillRect');
    // 완전 불투명(alpha 1)이 아니라 반투명이어야 한다.
    expect(full && full.kind === 'fillRect' ? full.fillStyle : '').toMatch(/rgba\(.+,\s*0?\.\d+\)/);
  });

  test('중앙 공백 규칙은 reduced-motion에서도 지켜진다', () => {
    const left = centerClearLeft(VIEWPORT);
    const right = centerClearRight(VIEWPORT);
    const top = centerClearTop(VIEWPORT);
    const bottom = centerClearBottom(VIEWPORT);
    for (const kind of OVERLAY_KINDS) {
      const ctx = render(view({ kind, intensity: 1, reducedMotion: true }));
      for (const call of ctx.calls) {
        for (const [x, y] of pointsOf(call)) {
          expect(x > left && x < right && y > top && y < bottom).toBe(false);
        }
      }
    }
  });
});

describe('drawWeather — 방어', () => {
  test('0×0 뷰포트에서도 크래시하지 않는다', () => {
    const ctx = createFakeBattleCtx();
    const empty: WeatherViewport = { width: 0, height: 0, top: 0, groundY: 0 };
    for (const kind of WEATHER_KINDS) {
      expect(() => drawWeather(ctx, palette, empty, view({ kind, intensity: 1 }), FIELD)).not.toThrow();
    }
  });

  test('save/restore 짝이 맞는다', () => {
    for (const kind of WEATHER_KINDS) {
      const ctx = render(view({ kind, intensity: 1 }));
      const saves = ctx.calls.filter((call) => call.kind === 'save').length;
      const restores = ctx.calls.filter((call) => call.kind === 'restore').length;
      expect({ kind, saves, restores }).toMatchObject({ saves: restores });
    }
  });
});
