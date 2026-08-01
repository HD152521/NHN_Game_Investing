/**
 * 스프라이트 43키 — 원본 `ticker-front-sprites.js` 의 `sheets()` 이식.
 *
 * ★ 43키는 **별칭**이다. 진짜 소스는 아래 파라메트릭 함수들이다:
 *     `ground(region, state)` 9조합 / `bgFar(region)` / `bgMid(region)`
 *     `weather(kind)` / `fx(kind)` / `proj(kind)`
 *   원본 키에는 `tf-gnd-r2-s2`(R2 균열 발판) 같은 조합이 없으므로, 43키를 상수로
 *   굳히면 지역×상태 배선이 불가능해진다. 필요한 조합은 함수를 직접 호출해라.
 *
 * 이 단계는 그리드 데이터만 만든다. 래스터화·렌더는 다음 단계다.
 */

import { allyAnchor, allyParts, allyRookie, allyScout } from './ally';
import { baseAlly, baseEnemy, boss } from './base';
import { bgFar, bgMid } from './bg';
import { enemyBlocker, enemyKite, enemyRusher, enemySiren, enemyTank } from './enemy';
import { fx } from './fx';
import type { SpriteGrid } from './grid';
import { ground, groundSlot } from './ground';
import { proj } from './proj';
import { towerAA, towerBasic, towerSplash } from './tower';
import { uiButtons, uiChart, uiIcons, uiReveal } from './ui';
import { weather } from './weather';

export { mk } from './grid';
export type { GridBuilder, Point, SpriteGrid } from './grid';
export { isSpriteCell, OUTLINE, SPRITE_CHARS, SPRITE_PALETTE, TRANSPARENT } from './palette';
export type { SpriteCell, SpriteChar } from './palette';
export type { FxKind, GroundState, ProjKind, Region, WeatherKind } from './types';

// 파라메트릭 생성기 (43키가 아니라 이쪽이 소스다)
export { bgFar, bgMid } from './bg';
export { fx } from './fx';
export { ground, groundSlot } from './ground';
export { proj } from './proj';
export { weather } from './weather';

// 고정 스프라이트
export { allyAnchor, allyParts, allyRookie, allyScout } from './ally';
export { baseAlly, baseEnemy, boss } from './base';
export { enemyBlocker, enemyKite, enemyRusher, enemySiren, enemyTank } from './enemy';
export { towerAA, towerBasic, towerSplash } from './tower';
export { uiButtons, uiChart, uiIcons, uiReveal } from './ui';

/**
 * 원본 `sheets()` 의 키 → 생성기. 키 순서도 원본 그대로다.
 *
 * ⚠️ `tf-ally-parts` 는 부품 참조 시트다. 게임 엔티티가 아니므로 화면에 그리지 마라.
 */
export const SPRITE_BUILDERS = {
  'tf-ally-01': allyRookie,
  'tf-ally-02': allyScout,
  'tf-ally-03': allyAnchor,
  'tf-ally-parts': allyParts,
  'tf-enemy-01': enemyRusher,
  'tf-enemy-02': enemyBlocker,
  'tf-enemy-03': enemyTank,
  'tf-enemy-air-01': enemyKite,
  'tf-enemy-air-02': enemySiren,
  'tf-tower-01': towerBasic,
  'tf-tower-02': towerAA,
  'tf-tower-03': towerSplash,
  'tf-base-ally': baseAlly,
  'tf-base-enemy': baseEnemy,
  'tf-boss': boss,
  'tf-bg-r1-far': () => bgFar(1),
  'tf-bg-r1-mid': () => bgMid(1),
  'tf-bg-r2-far': () => bgFar(2),
  'tf-bg-r2-mid': () => bgMid(2),
  'tf-bg-r3-far': () => bgFar(3),
  'tf-bg-r3-mid': () => bgMid(3),
  'tf-gnd-r1': () => ground(1, 1),
  'tf-gnd-r2': () => ground(2, 1),
  'tf-gnd-r3': () => ground(3, 1),
  'tf-gnd-s1': () => ground(1, 1),
  'tf-gnd-s2': () => ground(1, 2),
  'tf-gnd-s3': () => ground(1, 3),
  'tf-gnd-slot': groundSlot,
  'tf-wx-01': () => weather(1),
  'tf-wx-02': () => weather(2),
  'tf-wx-03': () => weather(3),
  'tf-wx-04': () => weather(4),
  'tf-fx-01': () => fx(1),
  'tf-fx-02': () => fx(2),
  'tf-fx-03': () => fx(3),
  'tf-w-01': () => proj(1),
  'tf-w-02': () => proj(2),
  'tf-w-03': () => proj(3),
  'tf-w-04': () => proj(4),
  'tf-ui-chart': uiChart,
  'tf-ui-btn': uiButtons,
  'tf-ui-icons': uiIcons,
  'tf-ui-reveal': uiReveal,
} as const satisfies Record<string, () => SpriteGrid>;

/** 원본 `sheets()` 의 43개 키. */
export type SpriteKey = keyof typeof SPRITE_BUILDERS;

export const SPRITE_KEYS = Object.keys(SPRITE_BUILDERS) as readonly SpriteKey[];

/** 키 하나의 그리드를 새로 만든다. */
export function spriteGrid(key: SpriteKey): SpriteGrid {
  return SPRITE_BUILDERS[key]();
}

/** 원본 `sheets()` 와 같은 형태의 전체 시트를 만든다. */
export function buildSpriteSheets(): Record<SpriteKey, SpriteGrid> {
  const sheets = {} as Record<SpriteKey, SpriteGrid>;
  for (const key of SPRITE_KEYS) sheets[key] = SPRITE_BUILDERS[key]();
  return sheets;
}
