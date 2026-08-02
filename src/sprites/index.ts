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
import { ANIM_FRAMES, canFrame, canSpin, meleeFrame, shieldFrame, throwFrame, type AnimFrame } from './anim';
import { baseAlly, baseEnemy, boss } from './base';
import { baseAllyDamage, baseEnemyCollapse } from './base-anim';
import { bgFar, bgMid } from './bg';
import { bossFrame } from './boss-anim';
import { enemyBlocker, enemyKite, enemyRusher, enemySiren, enemyTank } from './enemy';
import { eAirAtk, eAtk } from './enemy-anim';
import { fx } from './fx';
import { fxScreen, fxSeq } from './fx-seq';
import type { SpriteGrid } from './grid';
import { ground, groundSlot } from './ground';
import { proj } from './proj';
import { scene } from './scene';
import { scrimCompare, wideScene } from './scene-wide';
import { revealScreen, titleScreen } from './screens';
import { SPRITE_STRIPS, strip } from './strip';
import { towerAA, towerBasic, towerSplash } from './tower';
import { towerFire } from './tower-anim';
import { uiButtons, uiChart, uiIcons, uiReveal } from './ui';
import { death, walk } from './walk';
import { weather } from './weather';

/** 4프레임 생성기를 원본 `strip([0,1,2,3].map(...), gap)` 그대로 한 장으로 만든다. */
function stripFrames(build: (frame: AnimFrame) => SpriteGrid, gap: number): SpriteGrid {
  return strip(
    ANIM_FRAMES.map((f) => build(f)),
    gap,
  );
}

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
export { scene } from './scene';
export type { SceneOptions } from './scene';
export { darkenGrid, scrimCompare, stampGrid, stampOnGrid, wideScene } from './scene-wide';
export { isSceneColor, MOOD, sceneColor } from './mood';
export type { Mood, MoodKey } from './mood';
export { weather } from './weather';
export { canFrame, canSpin, meleeFrame, shieldFrame, throwFrame, ANIM_FRAMES, ANIM_FRAME_COUNT } from './anim';
export type { AnimFrame } from './anim';
export { fxBomb, fxHeal, fxScreen, fxSeq, fxShield, ringPx, FX_FRAMES } from './fx-seq';
export type { FxFrame } from './fx-seq';
export { strip, stripFrameGrid, stripFrameRect, SPRITE_STRIPS, STRIP_SPRITE_KEYS } from './strip';
export type { FrameRect, StripMeta, StripSpriteKey } from './strip';
export { eAirAtk, eAtk } from './enemy-anim';
export type { EnemyAirAtkKind, EnemyAtkKind } from './enemy-anim';
export { death, walk } from './walk';
export type { SpriteBase } from './walk';
export { towerFire } from './tower-anim';
export type { TowerFireKind } from './tower-anim';
export { bossFrame } from './boss-anim';
export type { BossPattern } from './boss-anim';
export { baseAllyDamage, baseEnemyCollapse } from './base-anim';
export type { DamageStage } from './base-anim';
export { revealScreen, titleScreen, SCREEN_HEIGHT, SCREEN_WIDTH } from './screens';

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
  // ── 시간대·하늘 시스템 (원본 갱신분 18키). 전부 `scene()` 의 별칭이다.
  'tf-sky-dawn': () => scene('dawn', 116, 62),
  'tf-sky-noon': () => scene('noon', 116, 62),
  'tf-sky-dusk': () => scene('dusk', 116, 62),
  'tf-sky-night': () => scene('night', 116, 62),
  'tf-sky-rain': () => scene('rain', 100, 56, { rain: true }),
  'tf-sky-snow': () => scene('snow', 100, 56, { snowFall: true }),
  'tf-sky-dust': () => scene('dust', 100, 56, { haze: true }),
  'tf-sky-scrim': scrimCompare,
  'tf-sky-wide': wideScene,
  'tf-r1-noon': () => scene('noon', 108, 56, { region: 1 }),
  'tf-r1-dusk': () => scene('dusk', 108, 56, { region: 1 }),
  'tf-r1-night': () => scene('night', 108, 56, { region: 1 }),
  'tf-r2-noon': () => scene('noon', 108, 56, { region: 2 }),
  'tf-r2-dusk': () => scene('dusk', 108, 56, { region: 2 }),
  'tf-r2-night': () => scene('night', 108, 56, { region: 2 }),
  'tf-r3-noon': () => scene('noon', 108, 56, { region: 3 }),
  'tf-r3-dusk': () => scene('dusk', 108, 56, { region: 3 }),
  'tf-r3-dust': () => scene('dust', 108, 56, { region: 3, haze: true }),
  // ── 공격 모션 · 스킬 시퀀스 (원본 갱신분 11키).
  //    유닛 공격 3종은 `anim.ts` 의 프레임 생성기 위의 스트립이고, FX 3종은 5프레임 시퀀스다.
  //    ⚠️ `tf-fx-screen` 은 게임 화면에 얹는 오버레이가 아니라 **3패널 비교 시트**다
  //       (`fx-seq.ts` 머리말 참조 — 직접 blit 금지).
  'tf-melee-loop': () => strip(ANIM_FRAMES.map((f) => meleeFrame(f)), SPRITE_STRIPS['tf-melee-loop'].gap),
  'tf-melee-hold': () => meleeFrame(1),
  'tf-can-idle': () => canFrame(0),
  'tf-can-spin': canSpin,
  'tf-throw-loop': () => strip(ANIM_FRAMES.map((f) => throwFrame(f)), SPRITE_STRIPS['tf-throw-loop'].gap),
  'tf-shield-idle': () => shieldFrame(0),
  'tf-shield-loop': () => strip(ANIM_FRAMES.map((f) => shieldFrame(f)), SPRITE_STRIPS['tf-shield-loop'].gap),
  'tf-fx-seq-01': () => fxSeq(1),
  'tf-fx-seq-02': () => fxSeq(2),
  'tf-fx-seq-03': () => fxSeq(3),
  'tf-fx-screen': fxScreen,
  // ── 적 공격 · 걷기 · 사망 · 타워 발사 · 보스 페이즈 · 기지 피격 · 화면 목업 (원본 갱신분 22키).
  //    ⚠️ `tf-t2-01~03` 은 스트립이 아니라 `towerFire(kind, 0, true)` 한 장이다.
  //    ⚠️ `tf-title` · `tf-reveal` 은 화면 목업이라 전장에 blit 하면 안 된다(`screens.ts` 머리말).
  'tf-eatk-01': () => stripFrames((f) => eAtk(1, f), SPRITE_STRIPS['tf-eatk-01'].gap),
  'tf-eatk-02': () => stripFrames((f) => eAtk(2, f), SPRITE_STRIPS['tf-eatk-02'].gap),
  'tf-eatk-03': () => stripFrames((f) => eAtk(3, f), SPRITE_STRIPS['tf-eatk-03'].gap),
  'tf-eatk-04': () => stripFrames((f) => eAirAtk(1, f), SPRITE_STRIPS['tf-eatk-04'].gap),
  'tf-eatk-05': () => stripFrames((f) => eAirAtk(2, f), SPRITE_STRIPS['tf-eatk-05'].gap),
  'tf-walk-ally': () => stripFrames((f) => walk(allyRookie, f), SPRITE_STRIPS['tf-walk-ally'].gap),
  'tf-walk-tank': () => stripFrames((f) => walk(allyAnchor, f), SPRITE_STRIPS['tf-walk-tank'].gap),
  'tf-walk-enemy': () => stripFrames((f) => walk(enemyBlocker, f), SPRITE_STRIPS['tf-walk-enemy'].gap),
  'tf-death-ally': () => stripFrames((f) => death(allyRookie, f, 'r'), SPRITE_STRIPS['tf-death-ally'].gap),
  'tf-death-enemy': () => stripFrames((f) => death(enemyRusher, f, 'b'), SPRITE_STRIPS['tf-death-enemy'].gap),
  'tf-tfire-01': () => stripFrames((f) => towerFire(1, f), SPRITE_STRIPS['tf-tfire-01'].gap),
  'tf-tfire-02': () => stripFrames((f) => towerFire(2, f), SPRITE_STRIPS['tf-tfire-02'].gap),
  'tf-tfire-03': () => stripFrames((f) => towerFire(3, f), SPRITE_STRIPS['tf-tfire-03'].gap),
  'tf-t2-01': () => towerFire(1, 0, true),
  'tf-t2-02': () => towerFire(2, 0, true),
  'tf-t2-03': () => towerFire(3, 0, true),
  'tf-boss-p1': () => stripFrames((f) => bossFrame(1, f), SPRITE_STRIPS['tf-boss-p1'].gap),
  'tf-boss-p2': () => stripFrames((f) => bossFrame(2, f), SPRITE_STRIPS['tf-boss-p2'].gap),
  'tf-basedmg-ally': () => stripFrames(baseAllyDamage, SPRITE_STRIPS['tf-basedmg-ally'].gap),
  'tf-basedmg-enemy': () => stripFrames(baseEnemyCollapse, SPRITE_STRIPS['tf-basedmg-enemy'].gap),
  'tf-title': titleScreen,
  'tf-reveal': revealScreen,
} as const satisfies Record<string, () => SpriteGrid>;

/**
 * 원본 `sheets()` 의 94개 키
 * (기존 43 + 시간대·하늘 18 + 공격 모션·스킬 시퀀스 11 + 적공격·이동·구조물 22).
 */
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
