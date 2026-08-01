/**
 * 적 · 아군 유닛 그리기 — 각자 위치에 실루엣 + HP 바.
 *
 * ★ 이 파일은 "무엇을 어디에 그릴지"만 정한다. 실제 형태는 전부
 *   `src/battle/shapes/**`에 있고, 그 형태는 아트 프로덕션 시트 v1.1 §04·§05의
 *   묘사를 그대로 옮긴 것이다. 예전에는 여기서 마름모·삼각형 같은 임시 도형을 직접
 *   그렸는데, 그러면 시트와 코드가 갈라져도 아무도 모른다(실제로 갈라져 있었다).
 *
 * 색은 항상 진영 토큰(UP_ALLY/ENEMY_DOWN)을 그대로 쓴다(§팔레트 설계, 절대 분리 금지).
 * 형태는 이중 인코딩 규약을 따른다: 아군=둥근 실루엣 / 악당=각진 실루엣(시트 00).
 *
 * ★ 적의 종류 선택: `Enemy`에는 종류 필드가 없다(시뮬레이션은 레인과 스탯만으로 돈다).
 *   렌더러가 id로 결정적으로 고르므로(`enemyKindForId`) 같은 적은 매 프레임 같은 모습이고,
 *   한 화면에 지상 3종 · 공중 2종이 섞여 보인다.
 */

import type { Enemy, Unit } from '../combat/types.js';
import type { Palette } from '../design/index.js';
import { drawHpBar } from './draw-hp-bar.js';
import type { BattleLayout } from './layout.js';
import { laneY, progressToX } from './layout.js';
import { ALLY_SHAPES, ENEMY_SHAPES, enemyKindForId } from './shapes/index.js';
import type { BattleCtx } from './surface.js';

const HP_BAR_WIDTH = 26;
const HP_BAR_HEIGHT = 4;
/** 가장 큰 실루엣(락업 반장 · 청산 굴착기)의 머리 위로 넉넉히 띄운다. */
const HP_BAR_OFFSET_Y = 32;
/** 같은 지점에 겹치는 아군 유닛을 살짝 흩어 보이게 하는 세로 지터(px) — id 기반 결정적 패턴. */
const UNIT_Y_JITTER = 9;

function hpBarRect(cx: number, cy: number): { x: number; y: number; w: number; h: number } {
  return { x: cx - HP_BAR_WIDTH / 2, y: cy - HP_BAR_OFFSET_Y, w: HP_BAR_WIDTH, h: HP_BAR_HEIGHT };
}

export function drawEnemies(ctx: BattleCtx, palette: Palette, layout: BattleLayout, enemies: readonly Enemy[]): void {
  for (const enemyUnit of enemies) {
    const cx = progressToX(enemyUnit.x, layout);
    const cy = laneY(enemyUnit.lane, layout);

    const kind = enemyKindForId(enemyUnit.lane, enemyUnit.id);
    ENEMY_SHAPES[kind].draw(ctx, palette, cx, cy);

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
 * 예광선(`draw-unit-tracers.ts`)이 공격선의 시작점을 이 실루엣의 실제 위치와 맞추려면
 * 같은 지터 계산을 재사용해야 한다 — 여기서 export해 중복 계산을 막는다.
 */
export function allyUnitScreenY(unit: Unit, layout: BattleLayout): number {
  return layout.groundY + jitterFor(unit.id);
}

export function drawAllies(ctx: BattleCtx, palette: Palette, layout: BattleLayout, units: readonly Unit[]): void {
  for (const unit of units) {
    const cx = progressToX(unit.x, layout);
    const cy = allyUnitScreenY(unit, layout);

    ALLY_SHAPES[unit.kind].draw(ctx, palette, cx, cy);

    const bar = hpBarRect(cx, cy);
    drawHpBar(ctx, { ...bar, hp: unit.hp, maxHp: unit.maxHp, color: palette.UP_ALLY, palette });
  }
}
