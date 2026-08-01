/**
 * 스프라이트 문자 팔레트 — 원본 `ticker-front-sprites.js` 의 `PAL` 를 그대로 이식.
 *
 * 원본은 문자 → 생 HEX 였지만, 이 프로젝트는 `src/design/palette.ts` 가 색의 단일
 * 소스이므로 문자 → 팔레트 토큰으로 옮긴다. 값은 동일하다(테스트로 고정).
 *
 * 원본 `PAL` 의 문자 대응:
 *   '.' 투명 / '0' LINE / '1' BG_0 / '2' BG_1 / '3' BG_2
 *   m MUTED / w TEXT / r UP_ALLY / d UP_DEEP
 *   b ENEMY_DOWN / n ENEMY_DEEP / g GOLD / p AUM
 */

import type { PaletteToken } from '../design/palette';

/** 투명 픽셀 sentinel. 원본 `PAL['.'] = null` 에 대응한다. */
export const TRANSPARENT = '.';

/** 외곽선 문자. 원본 `outline('0')` / `rim()` 의 제외 조건에서 쓰인다. */
export const OUTLINE = '0';

/**
 * 스프라이트 문자 → 팔레트 토큰. `TRANSPARENT` 는 포함하지 않는다(색이 없음).
 * 키 순서는 원본 `PAL` 선언 순서를 따른다.
 */
export const SPRITE_PALETTE = {
  '0': 'LINE',
  '1': 'BG_0',
  '2': 'BG_1',
  '3': 'BG_2',
  m: 'MUTED',
  w: 'TEXT',
  r: 'UP_ALLY',
  d: 'UP_DEEP',
  b: 'ENEMY_DOWN',
  n: 'ENEMY_DEEP',
  g: 'GOLD',
  p: 'AUM',
} as const satisfies Record<string, PaletteToken>;

/** 색이 있는 스프라이트 문자. */
export type SpriteChar = keyof typeof SPRITE_PALETTE;

/** 스프라이트 그리드에 등장할 수 있는 모든 문자(투명 포함). */
export type SpriteCell = SpriteChar | typeof TRANSPARENT;

export const SPRITE_CHARS = Object.keys(SPRITE_PALETTE) as readonly SpriteChar[];

/** 문자가 팔레트에 존재하는지 확인한다(투명 sentinel 포함). */
export function isSpriteCell(char: string): char is SpriteCell {
  return char === TRANSPARENT || char in SPRITE_PALETTE;
}
