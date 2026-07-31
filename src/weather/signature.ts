/**
 * 날씨 종류를 대표하는 팔레트 토큰.
 *
 * ★ 접근성 계약: `prefers-reduced-motion`에서 모션을 다 끄더라도, 각 날씨는 반드시
 *   이 토큰 색을 화면에 남겨야 한다. 날씨는 장식이 아니라 **시장 상태 정보**이므로
 *   모션을 줄인다고 정보까지 사라지면 안 된다. 렌더러와 테스트가 이 표를 함께 본다.
 *
 * 색 배정은 아트가이드 §1.3을 그대로 따른다 — 하락=파랑=적군 / 상승=빨강=아군.
 */

import type { PaletteToken } from '../design/index.js';
import type { WeatherKind } from './types.js';

export const WEATHER_SIGNATURE_TOKEN: Readonly<Record<WeatherKind, PaletteToken | null>> = {
  /** 표시할 시장 상태가 없으므로 색도 없다. */
  clear: null,
  /** WX-01 패닉 셀 — 청색 폭우. */
  panic_rain: 'ENEMY_DOWN',
  /** WX-02 FOMO 랠리 — 적색 상승기류. */
  fomo_updraft: 'UP_ALLY',
  /** WX-03 횡보 안개 — 무채색. */
  range_fog: 'MUTED',
  /** WX-04 정전 — 거의 검정. */
  blackout: 'LINE',
};
