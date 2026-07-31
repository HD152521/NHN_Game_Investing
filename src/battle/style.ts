/**
 * 전장 전용 색·수치 파생 유틸.
 *
 * 하드코딩 HEX가 금지되어 있으므로(§`design/no-hardcoded-hex.test.ts`), 투명도가
 * 필요한 곳은 전부 팔레트 토큰을 `parseHex`로 분해해 rgba 문자열로 파생한다.
 * `src/chart/style.ts`의 `rgba()`와 같은 아이디어이지만, 디렉터리 경계를 지키기 위해
 * import하지 않고 이 파일 안에서 다시 구현한다.
 */

import { parseHex } from '../design/index.js';
import type { HexColor } from '../design/index.js';

/** 팔레트 토큰(HEX) + 알파값 → `rgba(...)` 문자열. */
export function rgba(hex: HexColor, alpha: number): string {
  const { r, g, b } = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * HP 비율(0~1)을 계산한다. `maxHp<=0`이면(비정상 입력) 0을 반환해 나눗셈을 막는다.
 * 결과는 항상 0~1로 잘린다.
 */
export function hpRatio(hp: number, maxHp: number): number {
  if (maxHp <= 0) return 0;
  return Math.min(1, Math.max(0, hp / maxHp));
}
