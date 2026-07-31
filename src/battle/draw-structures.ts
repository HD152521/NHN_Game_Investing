/**
 * 아군 사옥(좌) · 적 본진(우) 그리기.
 *
 * `CombatState`에는 `baseHp`/`maxBaseHp` 하나만 있다 — 이는 적이 공격하는
 * "우리 쪽" 본진 체력이므로(적이 x=0 방향으로 밀고 들어와 baseDamage를 준다),
 * HP 바는 아군 사옥에만 그린다. 적 본진(우측)은 시각적 기준점일 뿐 체력 데이터가
 * 없으므로 HP 바를 그리지 않는다.
 */

import type { CombatState } from '../combat/types.js';
import type { Palette } from '../design/index.js';
import { drawHpBar } from './draw-hp-bar.js';
import type { BattleLayout } from './layout.js';
import type { BattleCtx } from './surface.js';

/** HP 바 높이(px). */
const HP_BAR_HEIGHT = 5;
/** HP 바와 건물 사이 여백(px). */
const HP_BAR_GAP = 4;
/** 건물 몸통이 영역 하단에서 차지하는 비율. */
const BODY_HEIGHT_RATIO = 0.62;
/** 상단 액센트(음영) 블록의 폭 비율. */
const ACCENT_WIDTH_RATIO = 0.55;
/** 상단 액센트 블록의 높이 비율. */
const ACCENT_HEIGHT_RATIO = 0.28;
/** 좌우 여백(px) — 영역 가장자리에 완전히 붙지 않도록. */
const SIDE_PADDING = 4;

/** 아군 사옥 — 원형 실루엣 규약(§encoding `rounded`)을 반영해 상단 액센트에 둥근 느낌을 준다. */
export function drawHq(ctx: BattleCtx, palette: Palette, layout: BattleLayout, state: CombatState): void {
  const rect = layout.hqRect;
  const x = rect.x + SIDE_PADDING;
  const w = Math.max(0, rect.w - SIDE_PADDING * 2);
  if (w <= 0 || rect.h <= 0) return;

  const bodyHeight = rect.h * BODY_HEIGHT_RATIO;
  const bodyTop = rect.y + rect.h - bodyHeight;
  ctx.fillStyle = palette.UP_ALLY;
  ctx.fillRect(x, bodyTop, w, bodyHeight);

  const accentWidth = w * ACCENT_WIDTH_RATIO;
  const accentHeight = rect.h * ACCENT_HEIGHT_RATIO;
  const accentX = x + (w - accentWidth) / 2;
  const accentY = bodyTop - accentHeight;
  ctx.fillStyle = palette.UP_DEEP;
  ctx.fillRect(accentX, Math.max(rect.y, accentY), accentWidth, accentHeight);

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

/** 적 본진 — 각진 실루엣 규약(§encoding `angular`)을 반영해 지붕을 뾰족한 삼각으로 그린다. */
export function drawEnemyBase(ctx: BattleCtx, palette: Palette, layout: BattleLayout): void {
  const rect = layout.baseRect;
  const x = rect.x + SIDE_PADDING;
  const w = Math.max(0, rect.w - SIDE_PADDING * 2);
  if (w <= 0 || rect.h <= 0) return;

  const bodyHeight = rect.h * BODY_HEIGHT_RATIO;
  const bodyTop = rect.y + rect.h - bodyHeight;
  ctx.fillStyle = palette.ENEMY_DOWN;
  ctx.fillRect(x, bodyTop, w, bodyHeight);

  // 각진 지붕(삼각형) — 적 진영의 뾰족한 실루엣.
  const roofHeight = rect.h * ACCENT_HEIGHT_RATIO;
  ctx.fillStyle = palette.ENEMY_DEEP;
  ctx.beginPath();
  ctx.moveTo(x, bodyTop);
  ctx.lineTo(x + w / 2, Math.max(rect.y, bodyTop - roofHeight));
  ctx.lineTo(x + w, bodyTop);
  ctx.closePath();
  ctx.fill();
}
