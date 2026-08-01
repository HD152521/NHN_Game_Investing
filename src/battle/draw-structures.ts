/**
 * 아군 사옥(좌) · 베어 요새(우) · 보스 그리기 — 디자인 원본의 `baseAlly` / `baseEnemy` /
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
import { BOSS_IDENTITY } from '../combat/identity.js';
import type { Palette } from '../design/index.js';
import { drawSpriteStanding, syncSpriteColorMode } from './draw-sprite.js';
import { BOSS_SPRITE, ENEMY_BASE_SPRITE, HQ_SPRITE } from './entity-sprites.js';
import { drawHpBar } from './draw-hp-bar.js';
import type { BattleLayout } from './layout.js';
import { enemyBaseSpriteRect, hqSpriteRect } from './layout.js';
import type { BattleCtx } from './surface.js';

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
  drawSpriteStanding(ctx, HQ_SPRITE.key, hqSpriteRect(layout, state.towerSlots), layout.groundY);

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
 * 베어 요새 — 원본 `baseEnemy` 스프라이트. 마지막 웨이브에는 그 앞에 보스(B-03 마진콜
 * 심판관, 원본 `boss`)가 선다.
 *
 * ★ `state`가 선택 항목인 이유 ★ 보스는 시뮬레이션 개체가 아니다 — `Enemy`로 스폰되지
 *   않고 `identity.ts`에만 있는 **연출**이다(등장 웨이브 = `BOSS_IDENTITY.appearWave`).
 *   그래서 웨이브를 알아야 그릴 수 있는데, 기존 호출부(`battle.ts`)는 인자 셋만 넘긴다.
 *   필수 인자로 바꾸면 빌드가 깨지므로 **뒤에 선택 인자로 붙였다**: 호출부가 `state`를
 *   넘기기 시작하면 그때부터 보스가 화면에 선다.
 */
export function drawEnemyBase(
  ctx: BattleCtx,
  palette: Palette,
  layout: BattleLayout,
  state?: CombatState | null,
): void {
  syncSpriteColorMode(palette);
  const rect = enemyBaseSpriteRect(layout);
  drawSpriteStanding(ctx, ENEMY_BASE_SPRITE.key, rect, layout.groundY);

  if (state && state.wave >= BOSS_IDENTITY.appearWave) {
    drawSpriteStanding(ctx, BOSS_SPRITE.key, rect, layout.groundY);
  }
}
