import { describe, expect, test } from 'vitest';

import { createTheme, parseHex } from '../design/index.js';
import { createWeatherField } from '../weather/index.js';
import type { WeatherView } from '../weather/index.js';
import { drawBattle } from './battle.js';
import { makeCombatState } from './combat-fixtures.js';
import { createFakeBattleCtx } from './fake-ctx.js';
import type { FakeBattleCtx } from './fake-ctx.js';

/**
 * `drawBattle`에 날씨를 얹었을 때의 통합 규칙.
 *
 * 개별 연출은 `draw-weather.test.ts`가 검증한다. 여기서는 **배선**만 본다:
 * 날씨를 넘기지 않으면 아무 변화가 없어야 하고, 넘기면 HUD 앞에 들어가야 한다.
 */

const { palette } = createTheme();
const FIELD = createWeatherField();
const WIDTH = 960;
const HEIGHT = 420;

function view(overrides: Partial<WeatherView> = {}): WeatherView {
  return { kind: 'panic_rain', intensity: 1, timeMs: 500, reducedMotion: false, ...overrides };
}

function render(weather: { view: WeatherView; field: typeof FIELD } | null): FakeBattleCtx {
  const ctx = createFakeBattleCtx();
  drawBattle(ctx, {
    state: makeCombatState(),
    palette,
    width: WIDTH,
    height: HEIGHT,
    weather,
  });
  return ctx;
}

/** 폭우가 쓰는 ENEMY_DOWN 반투명 stroke 호출 수. */
function rainStrokeCount(ctx: FakeBattleCtx): number {
  const { r, g, b } = parseHex(palette.ENEMY_DOWN);
  const prefix = `rgba(${r}, ${g}, ${b},`;
  return ctx.calls.filter((call) => call.kind === 'stroke' && call.strokeStyle.startsWith(prefix)).length;
}

describe('drawBattle — 날씨 배선', () => {
  test('날씨를 넘기지 않으면 기존 렌더와 완전히 동일하다', () => {
    const without = render(null);
    const ctx = createFakeBattleCtx();
    drawBattle(ctx, { state: makeCombatState(), palette, width: WIDTH, height: HEIGHT });
    expect(JSON.stringify(ctx.calls)).toBe(JSON.stringify(without.calls));
  });

  test('날씨를 넘기면 오버레이 그리기가 추가된다', () => {
    expect(rainStrokeCount(render({ view: view(), field: FIELD }))).toBeGreaterThan(0);
  });

  test("맑음(clear)이면 오버레이가 붙지 않는다", () => {
    const clear = render({ view: view({ kind: 'clear', intensity: 0 }), field: FIELD });
    expect(JSON.stringify(clear.calls)).toBe(JSON.stringify(render(null).calls));
  });

  test('날씨는 HUD보다 먼저 그려진다 (수치 판독을 가리지 않는다)', () => {
    const ctx = render({ view: view(), field: FIELD });
    const lastWeatherIndex = ctx.calls.reduce((last, call, index) => {
      const { r, g, b } = parseHex(palette.ENEMY_DOWN);
      const isWeather = call.kind === 'stroke' && call.strokeStyle.startsWith(`rgba(${r}, ${g}, ${b},`);
      return isWeather ? index : last;
    }, -1);
    // 스킬 게이지 라벨('READY' / '<n>s')은 HUD만 그린다 — HUD 시작점의 확실한 표식.
    const hudTextIndex = ctx.calls.findIndex(
      (call) => call.kind === 'fillText' && /^(READY|\d+s)$/.test(call.text),
    );

    expect(lastWeatherIndex).toBeGreaterThan(-1);
    expect(hudTextIndex).toBeGreaterThan(-1);
    expect(lastWeatherIndex).toBeLessThan(hudTextIndex);
  });
});
