/**
 * 아군 3종 실루엣 (아트 프로덕션 시트 v1.1 §04) — 우향 · 3헤드 비율 · **둥근 어깨와 곡선**.
 *
 * 크기 서열이 곧 정보다: `사환 < 통신원 < 반장`. 시트가 A-01을 "셋 중 가장 작다",
 * A-03을 "가장 크고 둥글다"로 못 박았으므로, 배율을 한곳(`ALLY_SCALE`)에 모아
 * 테스트가 그려진 크기로 서열을 검증할 수 있게 한다.
 *
 * 모든 부품은 `arc`(둥근 신호)를 포함한다 — `primitives.ts` 머리말의 이중 인코딩 규약.
 */

import type { Palette } from '../../design/index.js';
import type { BattleCtx } from '../surface.js';
import {
  DETAIL_LINE_WIDTH,
  HEAVY_OUTLINE_WIDTH,
  LIMB_LINE_WIDTH,
  OUTLINE_WIDTH,
  UNIT_RADIUS,
  UPPER_ARC_END,
  UPPER_ARC_START,
  fillAndOutline,
  fillCircle,
  safeRadius,
  strokeBentSegment,
  strokeSegment,
} from './primitives.js';

/** 종류별 반높이 배율(× `UNIT_RADIUS`). 시트 §04의 `smallest / mid build / bulkiest`. */
export const ALLY_SCALE = {
  intern: 0.85,
  analyst: 1.1,
  trader: 1.5,
} as const;

// ── 3헤드 비율 골격(전부 반높이 h 기준 비율) ──────────────────────
const HEAD_RADIUS_RATIO = 0.27;
const HEAD_CENTER_RATIO = -0.7;
const TORSO_CENTER_RATIO = -0.05;
const TORSO_RADIUS_RATIO = 0.36;
const SHOULDER_Y_RATIO = -0.32;
const HIP_Y_RATIO = 0.28;
const FOOT_Y_RATIO = 1;
const HIP_HALF_WIDTH_RATIO = 0.12;

/** 둥근 몸통 + 머리 — 세 아군이 공유하는 곡선 골격. */
function drawRoundBody(ctx: BattleCtx, palette: Palette, cx: number, cy: number, h: number, drawHead: boolean): void {
  fillCircle(ctx, cx, cy + h * TORSO_CENTER_RATIO, h * TORSO_RADIUS_RATIO, palette.UP_ALLY, palette.LINE);
  if (drawHead) {
    fillCircle(ctx, cx, cy + h * HEAD_CENTER_RATIO, h * HEAD_RADIUS_RATIO, palette.UP_ALLY, palette.LINE);
  }
}

/** 다리 두 개. `spread`가 클수록 넓은 자세(반장). */
function drawLegs(ctx: BattleCtx, palette: Palette, cx: number, cy: number, h: number, spread: number): void {
  const hipY = cy + h * HIP_Y_RATIO;
  const footY = cy + h * FOOT_Y_RATIO;
  const hipHalf = h * HIP_HALF_WIDTH_RATIO;
  strokeSegment(ctx, cx - hipHalf, hipY, cx - h * spread, footY, palette.UP_DEEP, LIMB_LINE_WIDTH);
  strokeSegment(ctx, cx + hipHalf, hipY, cx + h * spread, footY, palette.UP_DEEP, LIMB_LINE_WIDTH);
}

// ── A-01 개장벨 사환 ──────────────────────────────────────────────
/** 놋쇠 개장벨을 뒤집어 쓴 머리 — 위쪽 반원(돔) + 아래로 벌어진 치마. */
const BELL_RADIUS_RATIO = 0.34;
const BELL_FLARE_RATIO = 1.35;
const BELL_SKIRT_RATIO = 0.85;
const INTERN_LEG_SPREAD = 0.22;
const TAPE_WRAP_COUNT = 2;
const TAPE_WRAP_STEP_RATIO = 0.14;
const TAPE_WRAP_HALF_RATIO = 0.1;
const CLUB_REACH_RATIO = 0.95;
const CLUB_RISE_RATIO = -0.14;
const CLAPPER_RADIUS_RATIO = 0.13;
const ARM_REACH_RATIO = 0.5;

function drawOpeningBell(ctx: BattleCtx, palette: Palette, cx: number, cy: number, h: number): void {
  const bellY = cy + h * HEAD_CENTER_RATIO;
  const r = safeRadius(h * BELL_RADIUS_RATIO);
  ctx.beginPath();
  ctx.arc(cx, bellY, r, UPPER_ARC_START, UPPER_ARC_END);
  ctx.lineTo(cx + r * BELL_FLARE_RATIO, bellY + r * BELL_SKIRT_RATIO);
  ctx.lineTo(cx - r * BELL_FLARE_RATIO, bellY + r * BELL_SKIRT_RATIO);
  ctx.closePath();
  fillAndOutline(ctx, palette.UP_ALLY, palette.LINE);

  const rimY = bellY + r * BELL_SKIRT_RATIO;
  strokeSegment(ctx, cx - r * BELL_FLARE_RATIO, rimY, cx + r * BELL_FLARE_RATIO, rimY, palette.UP_DEEP, DETAIL_LINE_WIDTH);
}

/** 팔에 감은 시세 전표 — 팔 선 위에 짧은 가로 띠 몇 개. */
function drawTapedArm(ctx: BattleCtx, palette: Palette, cx: number, cy: number, h: number): void {
  const armY = cy + h * SHOULDER_Y_RATIO * 0.3;
  const handX = cx + h * ARM_REACH_RATIO;
  strokeSegment(ctx, cx, armY, handX, armY, palette.UP_DEEP, LIMB_LINE_WIDTH);
  for (let i = 1; i <= TAPE_WRAP_COUNT; i += 1) {
    const wrapX = cx + h * TAPE_WRAP_STEP_RATIO * i;
    strokeSegment(ctx, wrapX, armY - h * TAPE_WRAP_HALF_RATIO, wrapX, armY + h * TAPE_WRAP_HALF_RATIO, palette.UP_ALLY, DETAIL_LINE_WIDTH);
  }
}

/** A-01 — 종 머리 + 전표 감은 팔 + 벨 채 곤봉. 셋 중 가장 작다. */
export function drawInternShape(ctx: BattleCtx, palette: Palette, cx: number, cy: number): void {
  const h = UNIT_RADIUS * ALLY_SCALE.intern;
  drawLegs(ctx, palette, cx, cy, h, INTERN_LEG_SPREAD);
  drawRoundBody(ctx, palette, cx, cy, h, false);
  drawOpeningBell(ctx, palette, cx, cy, h);
  drawTapedArm(ctx, palette, cx, cy, h);

  const handX = cx + h * ARM_REACH_RATIO;
  const handY = cy + h * SHOULDER_Y_RATIO * 0.3;
  const tipX = cx + h * CLUB_REACH_RATIO;
  const tipY = handY + h * CLUB_RISE_RATIO;
  strokeSegment(ctx, handX, handY, tipX, tipY, palette.UP_DEEP, LIMB_LINE_WIDTH);
  fillCircle(ctx, tipX, tipY, h * CLAPPER_RADIUS_RATIO, palette.UP_DEEP, palette.LINE);
}

// ── A-02 호가 통신원 ──────────────────────────────────────────────
const REEL_CENTER_X_RATIO = -0.44;
const REEL_RADIUS_RATIO = 0.34;
const REEL_HUB_RATIO = 0.4;
const TAPE_LOOP_RADIUS_RATIO = 0.5;
const ANTENNA_ELBOW_X_RATIO = 0.12;
const ANTENNA_ELBOW_Y_RATIO = -0.75;
const ANTENNA_TIP_X_RATIO = 0.42;
const ANTENNA_TIP_Y_RATIO = -1.05;
const ANTENNA_JAW_RATIO = 0.16;
const FLARE_MUZZLE_RADIUS_RATIO = 0.11;
const ANALYST_LEG_SPREAD = 0.26;
const ANALYST_ARM_REACH_RATIO = 0.62;

/** 등에 짊어진 티커테이프 릴 — 원형 백팩 + 중심 허브. */
function drawTapeReel(ctx: BattleCtx, palette: Palette, cx: number, cy: number, h: number): void {
  const reelX = cx + h * REEL_CENTER_X_RATIO;
  const reelY = cy + h * TORSO_CENTER_RATIO;
  const r = h * REEL_RADIUS_RATIO;
  fillCircle(ctx, reelX, reelY, r, palette.UP_DEEP, palette.LINE);
  fillCircle(ctx, reelX, reelY, r * REEL_HUB_RATIO, palette.UP_ALLY, palette.LINE, DETAIL_LINE_WIDTH);
}

/** 어깨 위 접이식 집게 안테나 — 한 번 꺾인 대 + 끝의 집게 두 날. */
function drawClipAntenna(ctx: BattleCtx, palette: Palette, cx: number, cy: number, h: number): void {
  const shoulderY = cy + h * SHOULDER_Y_RATIO;
  const elbowX = cx + h * ANTENNA_ELBOW_X_RATIO;
  const elbowY = cy + h * ANTENNA_ELBOW_Y_RATIO;
  const tipX = cx + h * ANTENNA_TIP_X_RATIO;
  const tipY = cy + h * ANTENNA_TIP_Y_RATIO;
  strokeBentSegment(ctx, cx, shoulderY, elbowX, elbowY, tipX, tipY, palette.UP_DEEP, DETAIL_LINE_WIDTH);
  const jaw = h * ANTENNA_JAW_RATIO;
  strokeSegment(ctx, tipX, tipY, tipX + jaw, tipY - jaw, palette.UP_DEEP, DETAIL_LINE_WIDTH);
  strokeSegment(ctx, tipX, tipY, tipX + jaw, tipY + jaw * 0.4, palette.UP_DEEP, DETAIL_LINE_WIDTH);
}

/** A-02 — 릴 백팩 + 집게 안테나 + 신호탄 권총. 몸을 감은 테이프가 원거리임을 알린다. */
export function drawAnalystShape(ctx: BattleCtx, palette: Palette, cx: number, cy: number): void {
  const h = UNIT_RADIUS * ALLY_SCALE.analyst;
  drawLegs(ctx, palette, cx, cy, h, ANALYST_LEG_SPREAD);
  drawTapeReel(ctx, palette, cx, cy, h);
  drawRoundBody(ctx, palette, cx, cy, h, true);

  // 몸을 한 바퀴 감은 테이프 — 몸통보다 큰 원호를 겹쳐 "풀린 테이프"를 만든다.
  ctx.strokeStyle = palette.UP_DEEP;
  ctx.lineWidth = DETAIL_LINE_WIDTH;
  ctx.beginPath();
  ctx.arc(cx, cy + h * TORSO_CENTER_RATIO, safeRadius(h * TAPE_LOOP_RADIUS_RATIO), UPPER_ARC_START, UPPER_ARC_END);
  ctx.stroke();

  drawClipAntenna(ctx, palette, cx, cy, h);

  const armY = cy + h * SHOULDER_Y_RATIO * 0.5;
  const handX = cx + h * ANALYST_ARM_REACH_RATIO;
  strokeSegment(ctx, cx, armY, handX, armY, palette.UP_DEEP, LIMB_LINE_WIDTH);
  fillCircle(ctx, handX, armY, h * FLARE_MUZZLE_RADIUS_RATIO, palette.UP_DEEP, palette.LINE);
}

// ── A-03 락업 반장 ────────────────────────────────────────────────
const SHIELD_CENTER_X_RATIO = 0.5;
const SHIELD_RADIUS_RATIO = 0.68;
const DIAL_RADIUS_RATIO = 0.34;
const DIAL_TICK_COUNT = 4;
const DIAL_TICK_INNER_RATIO = 1.15;
const DIAL_TICK_OUTER_RATIO = 1.5;
const SHOULDER_PAD_X_RATIO = 0.3;
const SHOULDER_PAD_RADIUS_RATIO = 0.24;
const TRADER_LEG_SPREAD = 0.52;

/** 금고문 방패의 다이얼 — 동심원 + 네 방향 눈금(글자·숫자는 넣지 않는다, 시트 공통 금지). */
function drawVaultDial(ctx: BattleCtx, palette: Palette, shieldX: number, cy: number, shieldR: number): void {
  const dialR = shieldR * DIAL_RADIUS_RATIO;
  fillCircle(ctx, shieldX, cy, dialR, palette.UP_DEEP, palette.LINE);
  for (let i = 0; i < DIAL_TICK_COUNT; i += 1) {
    const angle = (Math.PI * 2 * i) / DIAL_TICK_COUNT;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    strokeSegment(
      ctx,
      shieldX + dx * dialR * DIAL_TICK_INNER_RATIO,
      cy + dy * dialR * DIAL_TICK_INNER_RATIO,
      shieldX + dx * dialR * DIAL_TICK_OUTER_RATIO,
      cy + dy * dialR * DIAL_TICK_OUTER_RATIO,
      palette.LINE,
      DETAIL_LINE_WIDTH,
    );
  }
}

/** 두꺼운 곡선 어깨패드 두 장. */
function drawShoulderPads(ctx: BattleCtx, palette: Palette, cx: number, cy: number, h: number): void {
  const padY = cy + h * SHOULDER_Y_RATIO;
  fillCircle(ctx, cx - h * SHOULDER_PAD_X_RATIO, padY, h * SHOULDER_PAD_RADIUS_RATIO, palette.UP_DEEP, palette.LINE);
  fillCircle(ctx, cx + h * SHOULDER_PAD_X_RATIO, padY, h * SHOULDER_PAD_RADIUS_RATIO, palette.UP_DEEP, palette.LINE);
}

/** A-03 — 가장 크고 둥글다. 다이얼 붙은 금고문 방패 + 두꺼운 어깨패드 + 넓은 자세. */
export function drawTraderShape(ctx: BattleCtx, palette: Palette, cx: number, cy: number): void {
  const h = UNIT_RADIUS * ALLY_SCALE.trader;
  drawLegs(ctx, palette, cx, cy, h, TRADER_LEG_SPREAD);
  drawRoundBody(ctx, palette, cx, cy, h, true);
  drawShoulderPads(ctx, palette, cx, cy, h);

  const shieldX = cx + h * SHIELD_CENTER_X_RATIO;
  const shieldR = h * SHIELD_RADIUS_RATIO;
  fillCircle(ctx, shieldX, cy, shieldR, palette.UP_ALLY, palette.LINE, HEAVY_OUTLINE_WIDTH);
  drawVaultDial(ctx, palette, shieldX, cy, shieldR);
}

/** 아군 실루엣이 실제로 차지하는 반높이(px) — HP 바 배치와 테스트가 함께 쓴다. */
export function allyHalfHeight(scale: number): number {
  return UNIT_RADIUS * scale + OUTLINE_WIDTH;
}
