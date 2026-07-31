/**
 * 적 · 아군 유닛 그리기 — 각자 위치에 실루엣 + HP 바.
 *
 * 색은 항상 진영 토큰(UP_ALLY/ENEMY_DOWN)을 그대로 쓴다(§팔레트 설계, 절대 분리 금지).
 * 형태로 성격을 구분한다:
 *   - 적(지상) : 마름모(다이아몬드) — 지상을 딛고 미는 느낌
 *   - 적(공중) : 좌측을 향한 삼각형(쐐기) — 날아오는 느낌
 *   - 아군 intern : 작은 원 — 신입, 존재감이 작다
 *   - 아군 analyst: 사각형 — 안정적으로 버티는 느낌
 *   - 아군 trader : 우측(적 방향)을 향한 삼각형 — 공격적으로 전진
 */

import type { Enemy, Unit, UnitKind } from '../combat/types.js';
import type { Palette } from '../design/index.js';
import { drawHpBar } from './draw-hp-bar.js';
import type { BattleLayout } from './layout.js';
import { laneY, progressToX } from './layout.js';
import type { BattleCtx } from './surface.js';

/** 유닛/적 반경(px) 기준값. */
const UNIT_RADIUS = 8;
const HP_BAR_WIDTH = 20;
const HP_BAR_HEIGHT = 3;
const HP_BAR_OFFSET_Y = 14;
const FULL_CIRCLE_START = 0;
const FULL_CIRCLE_END = Math.PI * 2;
/** 같은 지점에 겹치는 아군 유닛을 살짝 흩어 보이게 하는 세로 지터(px) — id 기반 결정적 패턴. */
const UNIT_Y_JITTER = 6;

function hpBarRect(cx: number, cy: number): { x: number; y: number; w: number; h: number } {
  return { x: cx - HP_BAR_WIDTH / 2, y: cy - HP_BAR_OFFSET_Y, w: HP_BAR_WIDTH, h: HP_BAR_HEIGHT };
}

function drawGroundEnemyShape(ctx: BattleCtx, palette: Palette, cx: number, cy: number): void {
  ctx.fillStyle = palette.ENEMY_DOWN;
  ctx.beginPath();
  ctx.moveTo(cx, cy - UNIT_RADIUS);
  ctx.lineTo(cx + UNIT_RADIUS, cy);
  ctx.lineTo(cx, cy + UNIT_RADIUS);
  ctx.lineTo(cx - UNIT_RADIUS, cy);
  ctx.closePath();
  ctx.fill();
}

function drawAirEnemyShape(ctx: BattleCtx, palette: Palette, cx: number, cy: number): void {
  ctx.fillStyle = palette.ENEMY_DOWN;
  ctx.beginPath();
  ctx.moveTo(cx - UNIT_RADIUS, cy);
  ctx.lineTo(cx + UNIT_RADIUS, cy - UNIT_RADIUS * 0.7);
  ctx.lineTo(cx + UNIT_RADIUS, cy + UNIT_RADIUS * 0.7);
  ctx.closePath();
  ctx.fill();
}

export function drawEnemies(ctx: BattleCtx, palette: Palette, layout: BattleLayout, enemies: readonly Enemy[]): void {
  for (const enemyUnit of enemies) {
    const cx = progressToX(enemyUnit.x, layout);
    const cy = laneY(enemyUnit.lane, layout);

    if (enemyUnit.lane === 'air') {
      drawAirEnemyShape(ctx, palette, cx, cy);
    } else {
      drawGroundEnemyShape(ctx, palette, cx, cy);
    }

    const bar = hpBarRect(cx, cy);
    drawHpBar(ctx, { ...bar, hp: enemyUnit.hp, maxHp: enemyUnit.maxHp, color: palette.ENEMY_DOWN, palette });
  }
}

function drawInternShape(ctx: BattleCtx, palette: Palette, cx: number, cy: number): void {
  ctx.fillStyle = palette.UP_ALLY;
  ctx.beginPath();
  ctx.arc(cx, cy, UNIT_RADIUS * 0.6, FULL_CIRCLE_START, FULL_CIRCLE_END);
  ctx.fill();
}

function drawAnalystShape(ctx: BattleCtx, palette: Palette, cx: number, cy: number): void {
  const half = UNIT_RADIUS * 0.75;
  ctx.fillStyle = palette.UP_ALLY;
  ctx.fillRect(cx - half, cy - half, half * 2, half * 2);
}

function drawTraderShape(ctx: BattleCtx, palette: Palette, cx: number, cy: number): void {
  ctx.fillStyle = palette.UP_ALLY;
  ctx.beginPath();
  ctx.moveTo(cx + UNIT_RADIUS, cy);
  ctx.lineTo(cx - UNIT_RADIUS, cy - UNIT_RADIUS * 0.7);
  ctx.lineTo(cx - UNIT_RADIUS, cy + UNIT_RADIUS * 0.7);
  ctx.closePath();
  ctx.fill();
}

const SHAPE_BY_UNIT_KIND: Readonly<Record<UnitKind, (ctx: BattleCtx, palette: Palette, cx: number, cy: number) => void>> = {
  intern: drawInternShape,
  analyst: drawAnalystShape,
  trader: drawTraderShape,
};

/** id 기반 결정적 세로 지터 — 같은 x에 겹치는 아군 유닛이 완전히 포개지지 않게 한다. */
function jitterFor(id: number): number {
  const bucket = ((id % 3) + 3) % 3;
  return (bucket - 1) * UNIT_Y_JITTER;
}

export function drawAllies(ctx: BattleCtx, palette: Palette, layout: BattleLayout, units: readonly Unit[]): void {
  for (const unit of units) {
    const cx = progressToX(unit.x, layout);
    const cy = layout.groundY + jitterFor(unit.id);

    const draw = SHAPE_BY_UNIT_KIND[unit.kind];
    draw(ctx, palette, cx, cy);

    const bar = hpBarRect(cx, cy);
    drawHpBar(ctx, { ...bar, hp: unit.hp, maxHp: unit.maxHp, color: palette.UP_ALLY, palette });
  }
}
