/**
 * 공중 악당 2종 실루엣 (아트 프로덕션 시트 v1.1 §5.2) — 좌향 · 각진 실루엣 · 조종석 없음.
 *
 * 지상 악당과 마찬가지로 `arc`를 쓰지 않는다(이중 인코딩 규약, `primitives.ts` 참고).
 */

import type { Palette } from '../../design/index.js';
import type { BattleCtx } from '../surface.js';
import {
  DETAIL_LINE_WIDTH,
  LIMB_LINE_WIDTH,
  UNIT_RADIUS,
  fillQuad,
  strokeBentSegment,
  strokeSegment,
} from './primitives.js';

/** 종류별 반높이 배율(× `UNIT_RADIUS`). */
export const AIR_ENEMY_SCALE = {
  rumorKite: 1,
  panicSiren: 1.15,
} as const;

// ── E-04 루머 연 ──────────────────────────────────────────────────
const KITE_HALF_W = 0.72;
const KITE_HALF_H = 1;
const TAIL_KNOT_COUNT = 3;
const TAIL_STEP_X = 0.55;
const TAIL_DROP_Y = 0.18;
const TAIL_SWING_Y = 0.3;
const TAIL_TICK_LEN = 0.22;

/** 꼬리에 매달린 데이터 줄 — 지그재그 + 짧은 가지. 화면 밖까지 이어지는 느낌을 준다. */
function drawKiteTail(ctx: BattleCtx, palette: Palette, cx: number, cy: number, h: number): void {
  let prevX = cx;
  let prevY = cy + h * KITE_HALF_H;
  for (let knot = 1; knot <= TAIL_KNOT_COUNT; knot += 1) {
    const nextX = cx + h * TAIL_STEP_X * knot;
    const swing = knot % 2 === 0 ? -TAIL_SWING_Y : TAIL_SWING_Y;
    const nextY = cy + h * (KITE_HALF_H - TAIL_DROP_Y * knot + swing);
    strokeSegment(ctx, prevX, prevY, nextX, nextY, palette.ENEMY_DOWN, DETAIL_LINE_WIDTH);
    strokeSegment(ctx, nextX, nextY, nextX, nextY + h * TAIL_TICK_LEN, palette.ENEMY_DEEP, DETAIL_LINE_WIDTH);
    prevX = nextX;
    prevY = nextY;
  }
}

/** E-04 — 뼈대만 남은 마름모 골조에 찌라시가 발려 있고, 꼬리에 데이터 줄. */
export function drawRumorKiteShape(ctx: BattleCtx, palette: Palette, cx: number, cy: number): void {
  const h = UNIT_RADIUS * AIR_ENEMY_SCALE.rumorKite;
  fillQuad(
    ctx,
    cx, cy - h * KITE_HALF_H,
    cx + h * KITE_HALF_W, cy,
    cx, cy + h * KITE_HALF_H,
    cx - h * KITE_HALF_W, cy,
    palette.ENEMY_DEEP,
    palette.LINE,
  );
  // 골조(스파) — 세로/가로 뼈대만 남은 연.
  strokeSegment(ctx, cx, cy - h * KITE_HALF_H, cx, cy + h * KITE_HALF_H, palette.ENEMY_DOWN, DETAIL_LINE_WIDTH);
  strokeSegment(ctx, cx - h * KITE_HALF_W, cy, cx + h * KITE_HALF_W, cy, palette.ENEMY_DOWN, DETAIL_LINE_WIDTH);
  drawKiteTail(ctx, palette, cx, cy, h);
}

// ── E-05 패닉 사이렌 ──────────────────────────────────────────────
const HUB_HALF_W = 0.78;
const HUB_TOP_Y = -0.62;
const HUB_BOTTOM_Y = -0.32;
const HORN_COUNT = 3;
const HORN_SPACING = 0.62;
const HORN_THROAT_HALF = 0.12;
const HORN_MOUTH_HALF = 0.34;
const HORN_TOP_Y = -0.32;
const HORN_MOUTH_Y = 0.42;
const RING_COUNT = 2;
const RING_TOP_Y = 0.62;
const RING_STEP_Y = 0.32;
const RING_HALF_W = 0.5;
const RING_WIDEN = 0.28;
const RING_DIP = 0.22;

/** 뒤집힌 확성기 하나 — 좁은 목에서 아래로 벌어진 나팔(각진 사다리꼴). */
function drawInvertedHorn(ctx: BattleCtx, palette: Palette, hornX: number, cy: number, h: number): void {
  fillQuad(
    ctx,
    hornX - h * HORN_THROAT_HALF, cy + h * HORN_TOP_Y,
    hornX + h * HORN_THROAT_HALF, cy + h * HORN_TOP_Y,
    hornX + h * HORN_MOUTH_HALF, cy + h * HORN_MOUTH_Y,
    hornX - h * HORN_MOUTH_HALF, cy + h * HORN_MOUTH_Y,
    palette.ENEMY_DOWN,
    palette.LINE,
  );
}

/** 아래로 각진 음파 링 — 넓어지며 내려가는 꺾은선 두 겹. */
function drawSoundRings(ctx: BattleCtx, palette: Palette, cx: number, cy: number, h: number): void {
  for (let ring = 0; ring < RING_COUNT; ring += 1) {
    const halfW = h * (RING_HALF_W + RING_WIDEN * ring);
    const topY = cy + h * (RING_TOP_Y + RING_STEP_Y * ring);
    strokeBentSegment(
      ctx,
      cx - halfW, topY,
      cx, topY + h * RING_DIP,
      cx + halfW, topY,
      palette.ENEMY_DEEP,
      DETAIL_LINE_WIDTH,
    );
  }
}

/** E-05 — 뒤집힌 확성기 세 개가 프로펠러처럼 묶여 날고, 아래로 음파 링을 떨군다. */
export function drawPanicSirenShape(ctx: BattleCtx, palette: Palette, cx: number, cy: number): void {
  const h = UNIT_RADIUS * AIR_ENEMY_SCALE.panicSiren;
  fillQuad(
    ctx,
    cx - h * HUB_HALF_W, cy + h * HUB_TOP_Y,
    cx + h * HUB_HALF_W, cy + h * HUB_TOP_Y,
    cx + h * (HUB_HALF_W - 0.12), cy + h * HUB_BOTTOM_Y,
    cx - h * (HUB_HALF_W - 0.12), cy + h * HUB_BOTTOM_Y,
    palette.ENEMY_DEEP,
    palette.LINE,
  );
  const firstOffset = -((HORN_COUNT - 1) / 2) * HORN_SPACING;
  for (let horn = 0; horn < HORN_COUNT; horn += 1) {
    drawInvertedHorn(ctx, palette, cx + h * (firstOffset + HORN_SPACING * horn), cy, h);
  }
  strokeSegment(ctx, cx, cy + h * HUB_TOP_Y, cx, cy + h * (HUB_TOP_Y - 0.25), palette.ENEMY_DEEP, LIMB_LINE_WIDTH);
  drawSoundRings(ctx, palette, cx, cy, h);
}
