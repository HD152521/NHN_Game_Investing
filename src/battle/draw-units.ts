/**
 * 적 · 아군 유닛 그리기 — 각자 위치에 실루엣 + HP 바.
 *
 * ★ 가시성 수정(플레이테스트: "캐릭터가 안 보임"): 기존 UNIT_RADIUS=8px는 1024px 폭
 *   캔버스에서 지름 16px(근접 유닛 intern은 몸통 반지름이 그 55%인 4.4px, 지름 8.8px)에
 *   불과해 사실상 점(dot) 수준이었다. UNIT_RADIUS를 12로 올려(+50%) 지름을 24px로 키우고,
 *   모든 실루엣에 LINE 토큰 외곽선을 둘러 배경(하늘/스카이라인/지면)과 확실히 분리한다 —
 *   외곽선이 없으면 진영색(UP_ALLY/ENEMY_DOWN)이 배경과 색상거리는 있어도 형태 경계가
 *   흐려 보인다.
 *
 * 색은 항상 진영 토큰(UP_ALLY/ENEMY_DOWN)을 그대로 쓴다(§팔레트 설계, 절대 분리 금지).
 * 형태로 성격을 구분한다:
 *   - 적(지상) : 마름모(다이아몬드) — 지상을 딛고 미는 느낌
 *   - 적(공중) : 좌측을 향한 삼각형(쐐기) — 날아오는 느낌
 *
 * 아군 유닛 3종은 역할(근접/원거리/탱커)이 실루엣만으로 읽혀야 한다:
 *   - intern (근접) : 작은 원 몸통 + 적 방향으로 짧게 뻗은 무기 선 — 붙어서 때린다.
 *   - analyst(원거리): 사각 몸통 + 길게 뻗은 무기 선과 끝의 발사체(점) — 거리를 두고 쏜다.
 *   - trader (탱커) : 다른 유닛보다 눈에 띄게 큰 방패형 실루엣 + 두꺼운 외곽선 — 버틴다.
 */

import type { Enemy, Unit, UnitKind } from '../combat/types.js';
import type { Palette } from '../design/index.js';
import { drawHpBar } from './draw-hp-bar.js';
import type { BattleLayout } from './layout.js';
import { laneY, progressToX } from './layout.js';
import type { BattleCtx } from './surface.js';

/** 유닛/적 반경(px) 기준값 — 가시성 수정으로 8→12(+50%). */
const UNIT_RADIUS = 12;
const HP_BAR_WIDTH = 26;
const HP_BAR_HEIGHT = 4;
/** 탱커(trader)가 다른 유닛보다 커진 만큼 HP 바를 더 위로 띄운다. */
const HP_BAR_OFFSET_Y = 30;
const FULL_CIRCLE_START = 0;
const FULL_CIRCLE_END = Math.PI * 2;
/** 같은 지점에 겹치는 아군 유닛을 살짝 흩어 보이게 하는 세로 지터(px) — id 기반 결정적 패턴. */
const UNIT_Y_JITTER = 9;
/** 모든 실루엣 공통 외곽선(LINE 토큰) 굵기 — 배경과의 경계를 확실히 한다. */
const OUTLINE_LINE_WIDTH = 1.5;

function hpBarRect(cx: number, cy: number): { x: number; y: number; w: number; h: number } {
  return { x: cx - HP_BAR_WIDTH / 2, y: cy - HP_BAR_OFFSET_Y, w: HP_BAR_WIDTH, h: HP_BAR_HEIGHT };
}

/** 지상 적 — 마름모. fill() 직후 같은 경로에 stroke()를 재사용해 외곽선을 두른다. */
function drawGroundEnemyShape(ctx: BattleCtx, palette: Palette, cx: number, cy: number): void {
  ctx.fillStyle = palette.ENEMY_DOWN;
  ctx.beginPath();
  ctx.moveTo(cx, cy - UNIT_RADIUS);
  ctx.lineTo(cx + UNIT_RADIUS, cy);
  ctx.lineTo(cx, cy + UNIT_RADIUS);
  ctx.lineTo(cx - UNIT_RADIUS, cy);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = palette.LINE;
  ctx.lineWidth = OUTLINE_LINE_WIDTH;
  ctx.setLineDash([]);
  ctx.stroke();
}

/** 공중 적 — 쐐기(삼각형). */
function drawAirEnemyShape(ctx: BattleCtx, palette: Palette, cx: number, cy: number): void {
  ctx.fillStyle = palette.ENEMY_DOWN;
  ctx.beginPath();
  ctx.moveTo(cx - UNIT_RADIUS, cy);
  ctx.lineTo(cx + UNIT_RADIUS, cy - UNIT_RADIUS * 0.7);
  ctx.lineTo(cx + UNIT_RADIUS, cy + UNIT_RADIUS * 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = palette.LINE;
  ctx.lineWidth = OUTLINE_LINE_WIDTH;
  ctx.setLineDash([]);
  ctx.stroke();
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

/** 근접 무기 길이(px) — 짧게 붙어서 때리는 intern. */
const MELEE_WEAPON_LENGTH = UNIT_RADIUS * 0.9;
const MELEE_WEAPON_WIDTH = 2.5;
/** 원거리 무기 길이(px) — 근접보다 훨씬 길게 뻗어 "거리를 둔다"는 느낌을 준다. */
const RANGED_WEAPON_LENGTH = UNIT_RADIUS * 1.8;
const RANGED_WEAPON_WIDTH = 1.5;
const RANGED_PROJECTILE_RADIUS = 3;
/** 탱커 몸체 배율 — 다른 유닛보다 눈에 띄게 크다. */
const TANK_RADIUS_SCALE = 1.7;
/** 탱커 외곽선 — 다른 유닛(OUTLINE_LINE_WIDTH)보다 확실히 두껍게 해 "버틴다"는 인상을 준다. */
const TANK_OUTLINE_WIDTH = 3;

/** intern(근접) — 작은 원 몸통 + 적 방향(+x)으로 짧게 뻗은 무기 선. 몸통에 LINE 외곽선. */
function drawInternShape(ctx: BattleCtx, palette: Palette, cx: number, cy: number): void {
  const bodyRadius = UNIT_RADIUS * 0.55;
  ctx.fillStyle = palette.UP_ALLY;
  ctx.beginPath();
  ctx.arc(cx, cy, bodyRadius, FULL_CIRCLE_START, FULL_CIRCLE_END);
  ctx.fill();
  ctx.strokeStyle = palette.LINE;
  ctx.lineWidth = OUTLINE_LINE_WIDTH;
  ctx.setLineDash([]);
  ctx.stroke();

  ctx.strokeStyle = palette.UP_DEEP;
  ctx.lineWidth = MELEE_WEAPON_WIDTH;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(cx + bodyRadius, cy);
  ctx.lineTo(cx + bodyRadius + MELEE_WEAPON_LENGTH, cy);
  ctx.stroke();
}

/** analyst(원거리) — 사각 몸통 + 길게 뻗은 무기 선과 끝의 발사체(점). 몸통에 LINE 외곽선. */
function drawAnalystShape(ctx: BattleCtx, palette: Palette, cx: number, cy: number): void {
  const half = UNIT_RADIUS * 0.65;
  ctx.fillStyle = palette.UP_ALLY;
  ctx.fillRect(cx - half, cy - half, half * 2, half * 2);
  ctx.strokeStyle = palette.LINE;
  ctx.lineWidth = OUTLINE_LINE_WIDTH;
  ctx.setLineDash([]);
  ctx.strokeRect(cx - half, cy - half, half * 2, half * 2);

  ctx.strokeStyle = palette.UP_DEEP;
  ctx.lineWidth = RANGED_WEAPON_WIDTH;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(cx + half, cy);
  ctx.lineTo(cx + half + RANGED_WEAPON_LENGTH, cy);
  ctx.stroke();

  ctx.fillStyle = palette.UP_DEEP;
  ctx.beginPath();
  ctx.arc(cx + half + RANGED_WEAPON_LENGTH, cy, RANGED_PROJECTILE_RADIUS, FULL_CIRCLE_START, FULL_CIRCLE_END);
  ctx.fill();
}

/** trader(탱커) — 다른 유닛보다 눈에 띄게 큰 방패형 실루엣 + 다른 유닛보다 두꺼운 LINE 외곽선. */
function drawTraderShape(ctx: BattleCtx, palette: Palette, cx: number, cy: number): void {
  const r = UNIT_RADIUS * TANK_RADIUS_SCALE;
  ctx.fillStyle = palette.UP_ALLY;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.6, cy - r);
  ctx.lineTo(cx + r * 0.6, cy - r);
  ctx.lineTo(cx + r * 0.75, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r * 0.75, cy);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = palette.LINE;
  ctx.lineWidth = TANK_OUTLINE_WIDTH;
  ctx.setLineDash([]);
  ctx.stroke();
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
