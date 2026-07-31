/**
 * 색·표기 파생 유틸.
 *
 * 하드코딩 HEX가 금지되어 있으므로(§`no-hardcoded-hex.test.ts`), 투명도가 필요한 곳은
 * 전부 팔레트 토큰을 `parseHex`로 분해해 rgba 문자열로 파생한다.
 */

import { parseHex } from '../design/index.js';
import type { HexColor, Palette } from '../design/index.js';
import type { Bar } from '../market/types.js';

/** 팔레트 토큰(HEX) + 알파값 → `rgba(...)` 문자열. */
export function rgba(hex: HexColor, alpha: number): string {
  const { r, g, b } = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * 봉 하나의 방향 색.
 *
 * 국내 차트 관습을 따라 종가가 시가 이상이면 상승(양봉), 미만이면 하락(음봉)으로
 * 본다. 진영 색과 완전히 같은 토큰(UP_ALLY/ENEMY_DOWN)을 그대로 쓴다 — 차트 색과
 * 진영 색을 분리하면 안 된다는 팔레트 설계(§1.3)를 지키기 위함이다.
 */
export function candleColor(bar: Bar, palette: Palette): HexColor {
  return bar.c >= bar.o ? palette.UP_ALLY : palette.ENEMY_DOWN;
}

/** 등락률(%) 계산. 시가가 0이면(이론상 없어야 하지만) 0을 반환해 Infinity를 막는다. */
export function percentChange(price: number, basePrice: number): number {
  if (basePrice === 0) return 0;
  return ((price - basePrice) / basePrice) * 100;
}

/** `+2.34%` / `-1.20%` 형태로 등락률을 포맷한다. */
export function formatPercent(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${Math.abs(value).toFixed(2)}%`;
}
