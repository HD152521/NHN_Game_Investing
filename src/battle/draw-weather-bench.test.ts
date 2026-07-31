import { describe, expect, test } from 'vitest';

import { createTheme } from '../design/index.js';
import { createWeatherField } from '../weather/index.js';
import type { WeatherKind, WeatherView, WeatherViewport } from '../weather/index.js';
import { drawWeather, weatherViewport } from './draw-weather.js';
import { computeBattleLayout } from './layout.js';
import type { BattleCtx } from './surface.js';

/**
 * 날씨 오버레이 CPU 비용 벤치마크.
 *
 * 범위 주의: `src/anim/bench.test.ts`와 같은 성격이다 — Canvas 호출을 **발행하는**
 * CPU 비용만 잰다. 실제 래스터라이즈(GPU)는 브라우저 밖에서 관측할 수 없다.
 * 따라서 여기 나오는 수치는 하한이며, 유의미한 판독은 "16.6ms 예산 중 날씨가
 * 몇 %를 먹는가"다 (PRD §11 — 유닛 60체 + 타워 8기에서 60 FPS).
 */

const TARGET_FPS = 60;
const FRAME_BUDGET_MS = 1000 / TARGET_FPS;

/**
 * 날씨에 허용하는 프레임 예산 비율.
 *
 * 날씨는 배경 표시이지 주역이 아니다. 5%를 넘으면 유닛·타워 렌더가 쓸 예산을
 * 잠식하기 시작하므로 그 선에서 회귀를 막는다.
 */
const WEATHER_BUDGET_RATIO = 0.05;
const WEATHER_BUDGET_MS = FRAME_BUDGET_MS * WEATHER_BUDGET_RATIO;

const WARMUP_FRAMES = 300;
const MEASURED_FRAMES = 2000;

/** 1920×1080 전면 전투 화면 — 오버레이가 가장 비싼 조건. */
const WIDTH = 1920;
const HEIGHT = 1080;

const { palette } = createTheme();
const FIELD = createWeatherField();
const VIEWPORT: WeatherViewport = weatherViewport(computeBattleLayout(WIDTH, HEIGHT));

/**
 * 아무것도 기록하지 않는 컨텍스트.
 *
 * `FakeBattleCtx`는 호출마다 객체를 push하므로 벤치에 쓰면 스파이 비용이 측정값을
 * 삼킨다. 여기서는 날씨 코드 자체의 계산 비용만 재려고 빈 메서드를 쓴다.
 */
function createNullCtx(): BattleCtx {
  return {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arc: () => {},
    closePath: () => {},
    stroke: () => {},
    fill: () => {},
    setLineDash: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    fillText: () => {},
  };
}

/** 벤치용 뷰. 매 프레임 새로 만들지 않도록 호출부가 시각만 갈아 끼운다. */
function makeView(kind: WeatherKind, timeMs: number): WeatherView {
  return { kind, intensity: 1, timeMs, reducedMotion: false };
}

function measure(kind: WeatherKind): number {
  const ctx = createNullCtx();

  for (let i = 0; i < WARMUP_FRAMES; i += 1) {
    drawWeather(ctx, palette, VIEWPORT, makeView(kind, i * FRAME_BUDGET_MS), FIELD);
  }

  const start = performance.now();
  for (let i = 0; i < MEASURED_FRAMES; i += 1) {
    drawWeather(ctx, palette, VIEWPORT, makeView(kind, i * FRAME_BUDGET_MS), FIELD);
  }
  return (performance.now() - start) / MEASURED_FRAMES;
}

describe('날씨 오버레이 프레임 비용', () => {
  const kinds: readonly WeatherKind[] = ['panic_rain', 'fomo_updraft', 'range_fog', 'blackout'];

  for (const kind of kinds) {
    test(`${kind}: 프레임 예산의 ${WEATHER_BUDGET_RATIO * 100}% 이내다`, () => {
      const perFrameMs = measure(kind);
      const share = (perFrameMs / FRAME_BUDGET_MS) * 100;
      // eslint 없는 프로젝트이므로 수치는 실패 메시지로만 노출한다.
      expect({ kind, perFrameMs, share, withinBudget: perFrameMs < WEATHER_BUDGET_MS }).toMatchObject({
        withinBudget: true,
      });
    });
  }

  test('가장 비싼 날씨(폭우)도 최악 조건에서 예산을 넘지 않는다', () => {
    expect(measure('panic_rain')).toBeLessThan(WEATHER_BUDGET_MS);
  });
});
