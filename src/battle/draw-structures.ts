/**
 * 아군 사옥(좌) · 베어 요새(우) 그리기 — 디자인 원본의 `baseAlly` / `baseEnemy` /
 * `boss` 스프라이트를 그대로 쓴다(`src/sprites/base.ts`, 매핑은 `entity-sprites.ts`).
 *
 * 예전에는 `src/battle/shapes/base-shapes.ts`에서 시트의 *글로 된 묘사*만 보고 도형을 새로
 * 발명했다("위로 자라는 첨탑", "꺾여 내려가는 차트선", HP에 반응하는 창 조명). 원본 드로잉
 * 코드에는 그런 동적 창 조명이 없다 — 이식본은 원본 픽셀을 그대로 쓰므로 그 연출은 사라지고,
 * 사옥의 피해 표현은 **HP 바 하나**로 남는다(PLAN 공통 제약: "이식은 재해석 금지").
 *
 * `CombatState`에는 `baseHp`/`maxBaseHp` 하나만 있다 — 이는 적이 공격하는 "우리 쪽" 본진
 * 체력이므로, HP 바는 아군 사옥에만 그린다. 베어 요새(우측)는 시각적 기준점일 뿐 체력
 * 데이터가 없다.
 *
 * ★ 바닥선 ★ 두 건물 모두 **지면선(`layout.groundY`)** 위에 세운다. 유닛이 걷는 선과 같은
 *   선에 서야 건물이 전장 바닥에 붙어 보인다.
 *
 * ★ 크기 ★ 배율은 여기서 정하지 않는다 — `drawSpriteStanding`이 받은 사각형에 들어가는
 *   최대 **정수** 배율을 쓰므로, 사각형을 고르는 것이 곧 배율을 고르는 것이다. 그 사각형은
 *   `layout.ts`의 `hqSpriteRect` / `enemyBaseSpriteRect`가 만든다(지면선·공중 레인·타워 슬롯
 *   제약이 전부 그 안에 들어 있다). 배치 사각형(`hqRect`·`baseRect`)을 그대로 넘기던 예전
 *   코드는 사옥이 1×(76×40)로 쪼그라들고 요새만 4×(120×176)로 커지는 좌우 불균형을 낳았다.
 */

import type { CombatState } from '../combat/types.js';
import type { Palette } from '../design/index.js';
import type { DamageStage } from '../sprites/base-anim';
import { entityAnimFrameRaster, spriteRasters } from '../sprites/render/index.js';
import type { EntityAnimId } from '../sprites/render/index.js';
import { drawRasterStanding, drawSpriteStanding, syncSpriteColorMode } from './draw-sprite.js';
import { ENEMY_BASE_SPRITE, HQ_SPRITE } from './entity-sprites.js';
import { drawHpBar } from './draw-hp-bar.js';
import type { BattleLayout, Rect } from './layout.js';
import { enemyBaseSpriteRect, hqSpriteRect } from './layout.js';
import type { BattleCtx } from './surface.js';

/** 아군 사옥 피해 모션. 프레임 번호 = 피해 단계다(루프가 아니다 — `sprites/base-anim.ts`). */
const HQ_DAMAGE_ANIM: EntityAnimId = 'basedmg-ally';

/* ------------------------------------------------------------------ *
 * 기지 피격 · 보스 (원본 갱신분 `tf-basedmg-ally` / `tf-boss-p1`)
 * ------------------------------------------------------------------ */

/**
 * `baseHp / maxBaseHp` → 피해 단계(0 = 멀쩡 … 3 = 붕괴 직전).
 *
 * 원본 `baseAllyDamage` 의 창문 점등 비율이 `[1, 0.7, 0.35, 0]` 이라 4단계이므로, 체력을
 * 4등분해 그대로 대응시킨다. **새 상태를 만들지 않는다** — `baseHp` 는 이미 있는 필드다.
 */
export function baseDamageStage(hp: number, maxHp: number): DamageStage {
  if (!Number.isFinite(hp) || !Number.isFinite(maxHp) || maxHp <= 0) return 0;
  const ratio = hp / maxHp;
  if (ratio > 0.75) return 0;
  if (ratio > 0.5) return 1;
  if (ratio > 0.25) return 2;
  return 3;
}

/**
 * 단계 1 부터 손상 시트로 갈아끼운다.
 *
 * ⚠️ **두 시트는 같은 건물이 아니다** ⚠️
 *    `tf-base-ally` 는 76×40 짜리 4동 사옥이고, `tf-basedmg-ally` 는 30×44 짜리 **1동**이다
 *    (원본이 그렇게 그려져 있다 — 실측·비교는 이 파일의 테스트에 있다). 그래서 단계 0 에서
 *    손상 시트를 쓰면 멀쩡한데도 사옥 실루엣이 통째로 바뀐다. 체력 75% 를 넘는 동안에는
 *    기존 사옥을 그대로 두고, **눈에 띄게 깎인 뒤(≤75%)** 부터 손상 시트로 바꾼다.
 *    "언제나 손상 시트" 로 통일할지는 디자인 결정이 필요하다 — 임의로 정하지 않는다.
 */
const HQ_DAMAGE_MIN_STAGE = 1;

/** HP 바 높이(px) — 가시성 수정으로 5→6. */
const HP_BAR_HEIGHT = 6;
/** HP 바와 사옥 영역 가장자리 사이 여백(px). */
const HP_BAR_GAP = 4;
/** HP 바를 사옥 영역보다 좌우로 얼마나 들여 그리는지(px). */
const HP_BAR_SIDE_PADDING = 6;

/**
 * 아군 사옥 — 원본 `baseAlly` 스프라이트 + 상단 HP 바.
 *
 * ★ 그림은 `hqSpriteRect`, HP 바는 `hqRect` ★ 배율을 정하는 것은 그리기용 사각형이다
 * (`layout.ts` 참조 — 첫 타워 슬롯 앞에서 멈추고 천장이 공중 레인에서 잘린다). HP 바는
 * 예전처럼 사옥 영역 상단에 걸쳐 두어, 기지가 커져도 읽는 위치가 바뀌지 않게 한다.
 */
export function drawHq(ctx: BattleCtx, palette: Palette, layout: BattleLayout, state: CombatState): void {
  const rect = layout.hqRect;
  const x = rect.x + HP_BAR_SIDE_PADDING;
  const w = Math.max(0, rect.w - HP_BAR_SIDE_PADDING * 2);
  if (w <= 0 || rect.h <= 0) return;

  syncSpriteColorMode(palette);
  const spriteRect = hqSpriteRect(layout, state.towerSlots);
  const stage = baseDamageStage(state.baseHp, state.maxBaseHp);
  if (stage >= HQ_DAMAGE_MIN_STAGE) {
    const raster = entityAnimFrameRaster(spriteRasters, HQ_DAMAGE_ANIM, stage);
    if (raster !== null && drawRasterStanding(ctx, raster, spriteRect, layout.groundY)) {
      drawHqHpBar(ctx, palette, rect, x, w, state);
      return;
    }
  }
  drawSpriteStanding(ctx, HQ_SPRITE.key, spriteRect, layout.groundY);
  drawHqHpBar(ctx, palette, rect, x, w, state);
}

/** 사옥 상단 HP 바. 그림이 바뀌어도 읽는 위치가 바뀌지 않게 사옥 **영역**(`hqRect`) 기준이다. */
function drawHqHpBar(
  ctx: BattleCtx,
  palette: Palette,
  rect: Rect,
  x: number,
  w: number,
  state: CombatState,
): void {

  drawHpBar(ctx, {
    x,
    y: rect.y + HP_BAR_GAP,
    w,
    h: HP_BAR_HEIGHT,
    hp: state.baseHp,
    maxHp: state.maxBaseHp,
    color: palette.UP_ALLY,
    palette,
  });
}

/**
 * 베어 요새 — 원본 `baseEnemy` 스프라이트.
 *
 * ★★ 보스는 **더 이상 여기서 그리지 않는다** ★★
 * 예전에는 `state.wave >= BOSS_IDENTITY.appearWave`일 때 요새 위에 보스 그림을 얹었다.
 * 그게 "보스가 등장했는데 안 걸어오고 그냥 기지에 서 있다"의 정체다 — 보스가 `enemies`로
 * 스폰되지 않는 **정지 연출**이었기 때문에, 위치라고 부를 것이 요새 앞 한 점밖에 없었다.
 *
 * 지금 보스는 `Enemy`(`isBoss: true`)로 스폰되어 x를 갖고 걸어오므로, **자기 좌표에서**
 * 그려져야 한다 — 그 일은 다른 적들과 같은 곳(`draw-units.ts drawEnemies`)이 한다.
 * 여기서 같이 그리면 화면에 보스가 두 마리 보인다.
 *
 * `state`는 시그니처 호환을 위해 남긴 선택 인자다(호출부 `battle.ts`가 계속 넘긴다).
 * 요새 자체는 상태와 무관하므로 읽지 않는다.
 */
export function drawEnemyBase(
  ctx: BattleCtx,
  palette: Palette,
  layout: BattleLayout,
  _state?: CombatState | null,
): void {
  syncSpriteColorMode(palette);
  drawSpriteStanding(ctx, ENEMY_BASE_SPRITE.key, enemyBaseSpriteRect(layout), layout.groundY);
}
