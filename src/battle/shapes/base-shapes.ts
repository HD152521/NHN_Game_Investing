/**
 * 기지 2종 실루엣 (아트 프로덕션 시트 v1.1 §07) — 화면 양 끝의 대비.
 *
 *   아군 사옥(B-01)  : **위로 자란다.** 둥근 첨탑 관(冠) + 창 리듬.
 *                      피격 시 창 조명이 하나씩 꺼진다(현재 HP 비율).
 *   베어 요새(B-02)  : **아래로 꺾인다.** 상단 실루엣이 꺾여 내려가는 차트선.
 *
 * 이중 인코딩 규약대로 사옥에는 `arc`(둥근 관)가 있고, 요새에는 `arc`가 전혀 없다.
 * 시트 공통 금지에 따라 창에는 글자·숫자를 넣지 않는다 — 빛의 개수만으로 상태를 말한다.
 */

import type { Palette } from '../../design/index.js';
import type { Rect } from '../layout.js';
import type { BattleCtx } from '../surface.js';
import {
  HEAVY_OUTLINE_WIDTH,
  OUTLINE_WIDTH,
  UPPER_ARC_END,
  UPPER_ARC_START,
  fillAndOutline,
  fillRectPath,
  safeRadius,
} from './primitives.js';

/** 좌우 여백(px) — 영역 가장자리에 완전히 붙지 않도록. */
export const BASE_SIDE_PADDING = 4;

// ── B-01 아군 사옥 ────────────────────────────────────────────────
const BODY_HEIGHT_RATIO = 0.62;
const SPIRE_WIDTH_RATIO = 0.46;
const SPIRE_HEIGHT_RATIO = 0.2;
const CROWN_RADIUS_RATIO = 0.5;

/** 창 격자 — 행이 늘어도 "선 굵기와 창 리듬은 동일"(시트 B-01). */
export const HQ_WINDOW_ROWS = 4;
export const HQ_WINDOW_COLS = 3;
export const HQ_WINDOW_TOTAL = HQ_WINDOW_ROWS * HQ_WINDOW_COLS;
const WINDOW_CELL_FILL_RATIO = 0.5;
/** 창 한 칸이 이보다 작아지면 점으로만 뭉개지므로 아예 그리지 않는다(극소 캔버스 방어). */
const MIN_WINDOW_SIZE = 1.5;

/**
 * 켜져 있어야 할 창 개수 — HP 비율에 비례한다.
 * 만피는 전부 켜지고, 0이면 전부 꺼진다. 위쪽 층부터 꺼져 "사옥이 식는" 인상을 준다.
 */
export function litWindowCount(ratio: number): number {
  const clamped = Math.min(1, Math.max(0, ratio));
  return Math.min(HQ_WINDOW_TOTAL, Math.ceil(clamped * HQ_WINDOW_TOTAL));
}

function drawWindows(ctx: BattleCtx, palette: Palette, x: number, y: number, w: number, h: number, lit: number): void {
  const cellW = w / HQ_WINDOW_COLS;
  const cellH = h / HQ_WINDOW_ROWS;
  const windowW = cellW * WINDOW_CELL_FILL_RATIO;
  const windowH = cellH * WINDOW_CELL_FILL_RATIO;
  if (windowW < MIN_WINDOW_SIZE || windowH < MIN_WINDOW_SIZE) return;

  for (let row = 0; row < HQ_WINDOW_ROWS; row += 1) {
    // 아래 행부터 켜진 것으로 센다 — 피격이 누적되면 위층부터 어두워진다.
    const rowsFromBottom = HQ_WINDOW_ROWS - row;
    for (let col = 0; col < HQ_WINDOW_COLS; col += 1) {
      const index = (rowsFromBottom - 1) * HQ_WINDOW_COLS + col;
      ctx.fillStyle = index < lit ? palette.GOLD : palette.LINE;
      ctx.fillRect(
        x + cellW * col + (cellW - windowW) / 2,
        y + cellH * row + (cellH - windowH) / 2,
        windowW,
        windowH,
      );
    }
  }
}

/** 둥근 첨탑 관 — 아군 사옥이 `rounded` 진영임을 알리는 유일한 곡선. */
function drawRoundedCrown(ctx: BattleCtx, palette: Palette, cx: number, capY: number, radius: number): void {
  ctx.beginPath();
  ctx.arc(cx, capY, safeRadius(radius), UPPER_ARC_START, UPPER_ARC_END);
  ctx.closePath();
  fillAndOutline(ctx, palette.UP_ALLY, palette.LINE, OUTLINE_WIDTH);
}

/** B-01 — 몸통 + 창 조명 + 위로 뻗은 첨탑과 둥근 관. `hpRatio`가 창 조명 수를 정한다. */
export function drawHqShape(ctx: BattleCtx, palette: Palette, rect: Rect, hpRatio: number): void {
  const x = rect.x + BASE_SIDE_PADDING;
  const w = Math.max(0, rect.w - BASE_SIDE_PADDING * 2);
  if (w <= 0 || rect.h <= 0) return;

  const bodyHeight = rect.h * BODY_HEIGHT_RATIO;
  const bodyTop = rect.y + rect.h - bodyHeight;
  fillRectPath(ctx, x, bodyTop, w, bodyHeight, palette.UP_ALLY, palette.LINE, HEAVY_OUTLINE_WIDTH);
  drawWindows(ctx, palette, x, bodyTop, w, bodyHeight, litWindowCount(hpRatio));

  const spireW = w * SPIRE_WIDTH_RATIO;
  const spireH = rect.h * SPIRE_HEIGHT_RATIO;
  const spireX = x + (w - spireW) / 2;
  const spireTop = Math.max(rect.y, bodyTop - spireH);
  fillRectPath(ctx, spireX, spireTop, spireW, bodyTop - spireTop, palette.UP_DEEP, palette.LINE);

  drawRoundedCrown(ctx, palette, x + w / 2, spireTop, spireW * CROWN_RADIUS_RATIO);
}

// ── B-02 베어 요새 ────────────────────────────────────────────────
const FORTRESS_BODY_RATIO = 0.58;
/** 꺾여 내려가는 차트선 — 왼쪽이 가장 높고 오른쪽으로 두 번 떨어진다. */
const CHART_STEP_TOPS: readonly number[] = [0.34, 0.2, 0.08];
const CHART_STEP_XS: readonly number[] = [0.36, 0.72, 1];
const SIEGE_WIDTH_RATIO = 0.28;
const SIEGE_HEIGHT_RATIO = 0.14;

/** 상단 실루엣 = 계단식으로 꺾여 내려가는 차트선. 원은 쓰지 않는다(각진 진영). */
function drawDescendingChartRoof(ctx: BattleCtx, palette: Palette, x: number, w: number, rect: Rect, bodyTop: number): void {
  ctx.beginPath();
  ctx.moveTo(x, bodyTop);
  let cursorX = x;
  for (let step = 0; step < CHART_STEP_TOPS.length; step += 1) {
    const stepTop = Math.max(rect.y, bodyTop - rect.h * CHART_STEP_TOPS[step]!);
    const stepEnd = x + w * CHART_STEP_XS[step]!;
    ctx.lineTo(cursorX, stepTop);
    ctx.lineTo(stepEnd, stepTop);
    cursorX = stepEnd;
  }
  ctx.lineTo(cursorX, bodyTop);
  ctx.closePath();
  fillAndOutline(ctx, palette.ENEMY_DEEP, palette.LINE, OUTLINE_WIDTH);
}

/** B-02 — 브루탈리즘 덩어리 + 공성탑 + 꺾여 내려가는 상단 차트선. */
export function drawBearFortressShape(ctx: BattleCtx, palette: Palette, rect: Rect): void {
  const x = rect.x + BASE_SIDE_PADDING;
  const w = Math.max(0, rect.w - BASE_SIDE_PADDING * 2);
  if (w <= 0 || rect.h <= 0) return;

  const bodyHeight = rect.h * FORTRESS_BODY_RATIO;
  const bodyTop = rect.y + rect.h - bodyHeight;
  fillRectPath(ctx, x, bodyTop, w, bodyHeight, palette.ENEMY_DOWN, palette.LINE, HEAVY_OUTLINE_WIDTH);

  // 금고에 붙은 공성탑 — 몸통 왼쪽(전장 쪽)에서 웨이브가 쏟아져 나온다.
  const siegeW = w * SIEGE_WIDTH_RATIO;
  const siegeH = rect.h * SIEGE_HEIGHT_RATIO;
  fillRectPath(ctx, x, bodyTop + bodyHeight * 0.2, siegeW, siegeH, palette.ENEMY_DEEP, palette.LINE);

  drawDescendingChartRoof(ctx, palette, x, w, rect, bodyTop);
}
