/**
 * 적 · 아군 유닛 그리기 — 각자 위치에 스프라이트 + HP 바.
 *
 * ★ 이 파일은 "무엇을 어디에 그릴지"만 정한다. 실제 그림은 전부 `src/sprites/**` 의
 *   이식본이다 — 디자인 원본(`docs/design-reference/ticker-front-sprites.js`)의 드로잉
 *   코드를 문자 단위로 옮긴 것이라, 화면에 나오는 유닛이 디자인 원본과 같은 그림이다.
 *   예전에는 `src/battle/shapes/**` 에서 아트 시트의 *글로 된 묘사*만 보고 도형을 새로
 *   발명했는데, 그래서 "디자인이 다 다르다"는 상태가 됐다(PLAN Step 3).
 *
 * ★ 좌우 반전을 쓰지 않는다 ★ 원본 그리드가 이미 전투 방향을 보고 있다.
 *   근거와 실측은 `entity-sprites.ts` 머리말에 있다.
 *
 * ★ 적의 종류 선택: `Enemy`에는 종류 필드가 없다(시뮬레이션은 레인과 스탯만으로 돈다).
 *   렌더러가 id로 결정적으로 고르므로(`enemyKindForId`) 같은 적은 매 프레임 같은 모습이고,
 *   한 화면에 지상 3종 · 공중 2종이 섞여 보인다.
 */

import type { Enemy, Unit } from '../combat/types.js';
import type { Palette } from '../design/index.js';
import { drawSpriteCentered, syncSpriteColorMode } from './draw-sprite.js';
import { drawHpBar } from './draw-hp-bar.js';
import { ALLY_SPRITES, ENEMY_SPRITES, enemyKindForId } from './entity-sprites.js';
import type { BattleLayout } from './layout.js';
import { laneY, progressToX } from './layout.js';
import type { BattleCtx } from './surface.js';

const HP_BAR_WIDTH = 26;
const HP_BAR_HEIGHT = 4;
/** 가장 큰 스프라이트(34 px 높이)의 머리 위로 넉넉히 띄운다. */
const HP_BAR_OFFSET_Y = 32;
/** 같은 지점에 겹치는 아군 유닛을 살짝 흩어 보이게 하는 세로 지터(px) — id 기반 결정적 패턴. */
const UNIT_Y_JITTER = 9;

/**
 * 유닛 스프라이트 배율.
 *
 * 원본 그리드가 26~30 × 34 px 라, 1× 가 예전 도형 실루엣(반높이 `UNIT_RADIUS` 12 × 0.85~1.3
 * = 높이 20~31 px)과 거의 같은 화면 크기다. 즉 레이아웃 상수(레인 간격 · `HP_BAR_OFFSET_Y`)를
 * 하나도 건드리지 않고 그림만 교체할 수 있다. 2× 로 키우면 지상 유닛이 공중 레인까지 닿는다.
 */
const UNIT_SPRITE_SCALE = 1;

function hpBarRect(cx: number, cy: number): { x: number; y: number; w: number; h: number } {
  return { x: cx - HP_BAR_WIDTH / 2, y: cy - HP_BAR_OFFSET_Y, w: HP_BAR_WIDTH, h: HP_BAR_HEIGHT };
}

export function drawEnemies(ctx: BattleCtx, palette: Palette, layout: BattleLayout, enemies: readonly Enemy[]): void {
  syncSpriteColorMode(palette);

  for (const enemyUnit of enemies) {
    const cx = progressToX(enemyUnit.x, layout);
    const cy = laneY(enemyUnit.lane, layout);

    const kind = enemyKindForId(enemyUnit.lane, enemyUnit.id);
    drawSpriteCentered(ctx, ENEMY_SPRITES[kind].key, cx, cy, UNIT_SPRITE_SCALE);

    const bar = hpBarRect(cx, cy);
    drawHpBar(ctx, { ...bar, hp: enemyUnit.hp, maxHp: enemyUnit.maxHp, color: palette.ENEMY_DOWN, palette });
  }
}

/** id 기반 결정적 세로 지터 — 같은 x에 겹치는 아군 유닛이 완전히 포개지지 않게 한다. */
function jitterFor(id: number): number {
  const bucket = ((id % 3) + 3) % 3;
  return (bucket - 1) * UNIT_Y_JITTER;
}

/**
 * 아군 유닛이 실제로 그려지는 화면 y(지상 고정 + id 기반 지터).
 *
 * 예광선(`draw-unit-tracers.ts`)이 공격선의 시작점을 이 스프라이트의 실제 위치와 맞추려면
 * 같은 지터 계산을 재사용해야 한다 — 여기서 export해 중복 계산을 막는다.
 */
export function allyUnitScreenY(unit: Unit, layout: BattleLayout): number {
  return layout.groundY + jitterFor(unit.id);
}

export function drawAllies(ctx: BattleCtx, palette: Palette, layout: BattleLayout, units: readonly Unit[]): void {
  syncSpriteColorMode(palette);

  for (const unit of units) {
    const cx = progressToX(unit.x, layout);
    const cy = allyUnitScreenY(unit, layout);

    drawSpriteCentered(ctx, ALLY_SPRITES[unit.kind].key, cx, cy, UNIT_SPRITE_SCALE);

    const bar = hpBarRect(cx, cy);
    drawHpBar(ctx, { ...bar, hp: unit.hp, maxHp: unit.maxHp, color: palette.UP_ALLY, palette });
  }
}
