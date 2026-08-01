/**
 * 날씨 오버레이 디스패처 — "무엇을 그릴지"만 고르고 실제 그리기는 종류별 모듈에 위임한다.
 * `battle.ts`의 `drawBattle`과 같은 패턴이다.
 *
 * ★ 판정은 여기 없다. 종류·강도는 `src/weather`(순수 함수)가 이미 정해서 넘겨준다.
 *   이 파일이 시장 지표를 읽기 시작하면 판정/렌더 분리가 무너진다.
 */

import type { Palette } from '../design/index.js';
import type { SpriteRasterCache } from '../sprites/render/index.js';
import type { WeatherField, WeatherView, WeatherViewport } from '../weather/index.js';
import { DEFAULT_WEATHER_RASTERS } from './draw-weather-shared.js';
import { drawBlackout } from './draw-weather-blackout.js';
import { drawRangeFog } from './draw-weather-fog.js';
import { drawPanicRain } from './draw-weather-rain.js';
import { drawFomoUpdraft } from './draw-weather-updraft.js';
import type { BattleLayout } from './layout.js';
import type { BattleCtx } from './surface.js';

/**
 * 전장 레이아웃에서 날씨가 필요한 4개 값만 뽑아낸다.
 *
 * 이 방향(battle → weather)으로만 변환하므로 `src/weather`는 `src/battle`을 모른다.
 * 캔버스 크기가 바뀌지 않으면 결과도 같으니 호출부에서 캐시해도 된다.
 */
export function weatherViewport(layout: BattleLayout): WeatherViewport {
  return {
    width: layout.width,
    height: layout.height,
    top: layout.battlefieldTop,
    groundY: layout.groundY,
  };
}

/**
 * 날씨 한 프레임을 그린다.
 *
 * 아무것도 그리지 않는 경우: 맑음 / 강도 0 / 캔버스 크기 0.
 * 유닛·타워를 그린 뒤, HUD를 그리기 전에 호출한다 (전장 위에 얹고 HUD는 가리지 않는다).
 *
 * `rasters`는 테스트 주입구다(기본은 게임이 공유하는 캐시). 선택 인자이므로 `battle.ts`
 * 호출부는 그대로다 — `draw-background.ts`의 `options.rasters`와 같은 패턴이다.
 */
export function drawWeather(
  ctx: BattleCtx,
  palette: Palette,
  viewport: WeatherViewport,
  view: WeatherView,
  field: WeatherField,
  rasters: SpriteRasterCache = DEFAULT_WEATHER_RASTERS,
): void {
  if (viewport.width <= 0 || viewport.height <= 0) return;
  if (view.kind === 'clear' || view.intensity <= 0) return;

  switch (view.kind) {
    case 'panic_rain':
      drawPanicRain(ctx, palette, viewport, view, field, rasters);
      return;
    case 'fomo_updraft':
      drawFomoUpdraft(ctx, palette, viewport, view, field, rasters);
      return;
    case 'range_fog':
      drawRangeFog(ctx, palette, viewport, view, rasters);
      return;
    case 'blackout':
      drawBlackout(ctx, palette, viewport, view, rasters);
      return;
  }
}
