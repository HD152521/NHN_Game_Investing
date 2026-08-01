/**
 * 아군 사옥(좌) · 적 본진(우) 그리기 — 아트 프로덕션 시트 v1.1 §07.
 *
 * 실제 형태는 `src/battle/shapes/base-shapes.ts`에 있고, 이 파일은 레이아웃 사각형과
 * 전투 상태를 형태 코드에 넘기는 얇은 층이다.
 *
 * `CombatState`에는 `baseHp`/`maxBaseHp` 하나만 있다 — 이는 적이 공격하는
 * "우리 쪽" 본진 체력이므로(적이 x=0 방향으로 밀고 들어와 baseDamage를 준다),
 * HP 바는 아군 사옥에만 그린다. 적 본진(우측)은 시각적 기준점일 뿐 체력 데이터가
 * 없으므로 HP 바를 그리지 않는다.
 *
 * ★ 시트 §07의 두 가지 요구를 실제로 구현한 곳 ★
 *   - 사옥: **위로 자란다** + "피격 시 창 조명이 하나씩 꺼진다" → HP 비율이 곧 창 조명 수다.
 *   - 요새: **아래로 꺾인다** → 상단 실루엣이 계단식으로 내려가는 차트선이다.
 */

import type { CombatState } from '../combat/types.js';
import type { Palette } from '../design/index.js';
import { drawHpBar } from './draw-hp-bar.js';
import type { BattleLayout } from './layout.js';
import { BASE_SIDE_PADDING, drawBearFortressShape, drawHqShape } from './shapes/base-shapes.js';
import { hpRatio } from './style.js';
import type { BattleCtx } from './surface.js';

/** HP 바 높이(px) — 가시성 수정으로 5→6. */
const HP_BAR_HEIGHT = 6;
/** HP 바와 건물 사이 여백(px). */
const HP_BAR_GAP = 4;

/** 아군 사옥 — 둥근 첨탑 관 + 창 조명(HP 비율만큼 켜짐) + 상단 HP 바. */
export function drawHq(ctx: BattleCtx, palette: Palette, layout: BattleLayout, state: CombatState): void {
  const rect = layout.hqRect;
  const x = rect.x + BASE_SIDE_PADDING;
  const w = Math.max(0, rect.w - BASE_SIDE_PADDING * 2);
  if (w <= 0 || rect.h <= 0) return;

  drawHqShape(ctx, palette, rect, hpRatio(state.baseHp, state.maxBaseHp));

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

/** 적 본진 — 브루탈리즘 덩어리 + 꺾여 내려가는 상단 차트선(각진 실루엣). */
export function drawEnemyBase(ctx: BattleCtx, palette: Palette, layout: BattleLayout): void {
  drawBearFortressShape(ctx, palette, layout.baseRect);
}
