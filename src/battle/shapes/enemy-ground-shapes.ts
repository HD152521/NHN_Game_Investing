/**
 * 지상 악당 3종 실루엣 (아트 프로덕션 시트 v1.1 §5.1) — 좌향 · **각지고 꺾인 실루엣** ·
 * 얼굴은 검은 공백.
 *
 * ★ 이 파일에는 `arc`가 한 번도 나오지 않는다. 악당의 `angular` 분류
 *   (`src/combat/identity.ts`)와 그림을 잇는 유일한 구조적 신호이기 때문이다
 *   (`silhouette.test.ts`가 강제한다). 둥근 디테일이 필요해 보여도 꺾어서 표현한다.
 */

import type { Palette } from '../../design/index.js';
import type { BattleCtx } from '../surface.js';
import {
  DETAIL_LINE_WIDTH,
  LIMB_LINE_WIDTH,
  UNIT_RADIUS,
  fillQuad,
  fillTriangle,
  strokeBentSegment,
  strokeSegment,
} from './primitives.js';

/** 종류별 반높이 배율(× `UNIT_RADIUS`). 시트: 첨병은 얇고, 굴착기는 "크고 무겁다". */
export const GROUND_ENEMY_SCALE = {
  gapScout: 0.95,
  marginEnforcer: 1.15,
  liquidationDigger: 1.5,
} as const;

// ── E-01 갭하락 첨병 ──────────────────────────────────────────────
const SCOUT_SHOULDER_Y = -0.5;
const SCOUT_HEM_Y = 1;
const SCOUT_BACK_X = 0.3;
const SCOUT_FRONT_X = -0.05;
const SCOUT_HEM_FRONT_X = -0.45;
const HOOD_TOP_Y = -1;
const VOID_HALF_W = 0.12;
const VOID_TOP_Y = -0.85;
const VOID_BOTTOM_Y = -0.6;
const SPEAR_BUTT_X = 0.5;
const SPEAR_BUTT_Y = -0.75;
const SPEAR_KNEE_X = -0.1;
const SPEAR_KNEE_Y = 0.1;
const SPEAR_TIP_X = -0.6;
const SPEAR_TIP_Y = 1;
const SPEAR_HEAD_HALF = 0.18;

/** 후드 — 각진 사다리꼴 + 그 안의 검은 공백(LINE 토큰). 눈·얼굴은 그리지 않는다. */
function drawHoodedVoid(ctx: BattleCtx, palette: Palette, cx: number, cy: number, h: number): void {
  fillQuad(
    ctx,
    cx + h * (SCOUT_FRONT_X - 0.15), cy + h * SCOUT_SHOULDER_Y,
    cx + h * (SCOUT_BACK_X - 0.05), cy + h * (SCOUT_SHOULDER_Y - 0.05),
    cx + h * (SCOUT_BACK_X - 0.15), cy + h * HOOD_TOP_Y,
    cx + h * (SCOUT_FRONT_X - 0.3), cy + h * (HOOD_TOP_Y + 0.15),
    palette.ENEMY_DEEP,
    palette.LINE,
  );
  fillQuad(
    ctx,
    cx - h * VOID_HALF_W - h * 0.1, cy + h * VOID_TOP_Y,
    cx + h * VOID_HALF_W - h * 0.1, cy + h * (VOID_TOP_Y + 0.05),
    cx + h * VOID_HALF_W - h * 0.1, cy + h * VOID_BOTTOM_Y,
    cx - h * VOID_HALF_W - h * 0.1, cy + h * (VOID_BOTTOM_Y - 0.05),
    palette.LINE,
    palette.LINE,
    DETAIL_LINE_WIDTH,
  );
}

/** 아래로 꺾인 창 — 한 번 꺾인 대 + 끝의 각진 촉. */
function drawBentSpear(ctx: BattleCtx, palette: Palette, cx: number, cy: number, h: number): void {
  strokeBentSegment(
    ctx,
    cx + h * SPEAR_BUTT_X, cy + h * SPEAR_BUTT_Y,
    cx + h * SPEAR_KNEE_X, cy + h * SPEAR_KNEE_Y,
    cx + h * SPEAR_TIP_X, cy + h * SPEAR_TIP_Y,
    palette.ENEMY_DEEP,
    LIMB_LINE_WIDTH,
  );
  fillTriangle(
    ctx,
    cx + h * SPEAR_TIP_X, cy + h * (SPEAR_TIP_Y + SPEAR_HEAD_HALF),
    cx + h * (SPEAR_TIP_X + SPEAR_HEAD_HALF), cy + h * (SPEAR_TIP_Y - SPEAR_HEAD_HALF * 0.6),
    cx + h * (SPEAR_TIP_X - SPEAR_HEAD_HALF * 0.6), cy + h * (SPEAR_TIP_Y - SPEAR_HEAD_HALF),
    palette.ENEMY_DEEP,
    palette.LINE,
    DETAIL_LINE_WIDTH,
  );
}

/** E-01 — 얇고 길게 꺾인 몸, 각진 라펠 코트, 후드 안 검은 공백, 아래로 꺾인 창. */
export function drawGapScoutShape(ctx: BattleCtx, palette: Palette, cx: number, cy: number): void {
  const h = UNIT_RADIUS * GROUND_ENEMY_SCALE.gapScout;
  fillQuad(
    ctx,
    cx + h * SCOUT_FRONT_X, cy + h * SCOUT_SHOULDER_Y,
    cx + h * SCOUT_BACK_X, cy + h * (SCOUT_SHOULDER_Y + 0.05),
    cx + h * (SCOUT_HEM_FRONT_X + 0.4), cy + h * SCOUT_HEM_Y,
    cx + h * SCOUT_HEM_FRONT_X, cy + h * SCOUT_HEM_Y,
    palette.ENEMY_DOWN,
    palette.LINE,
  );
  // 각진 라펠 — 코트 앞섶이 꺾여 내려간다.
  fillTriangle(
    ctx,
    cx + h * SCOUT_FRONT_X, cy + h * SCOUT_SHOULDER_Y,
    cx + h * SCOUT_BACK_X, cy + h * (SCOUT_SHOULDER_Y + 0.05),
    cx + h * (SCOUT_FRONT_X + 0.05), cy + h * 0.05,
    palette.ENEMY_DEEP,
    palette.LINE,
    DETAIL_LINE_WIDTH,
  );
  drawHoodedVoid(ctx, palette, cx, cy, h);
  drawBentSpear(ctx, palette, cx, cy, h);
}

// ── E-02 반대매매 집행관 ──────────────────────────────────────────
const BLOCK_HALF_W = 0.45;
const BLOCK_TOP_Y = -0.45;
const BLOCK_BOTTOM_Y = 0.95;
const SPIKE_HEIGHT = 0.42;
const SPIKE_HALF_W = 0.16;
const SPIKE_X = 0.36;
const LEDGER_FRONT_X = -1;
const LEDGER_BACK_X = -0.58;
const LEDGER_TOP_Y = -0.55;
const LEDGER_BOTTOM_Y = 0.65;
const HAMMER_GRIP_X = 0.3;
const HAMMER_HEAD_X = 0.85;
const HAMMER_HEAD_Y = -0.8;
const HAMMER_HEAD_HALF = 0.2;

/** 좌/우 대칭 부품을 배열 재생성 없이 순회하기 위한 모듈 상수(프레임당 할당 0). */
const SPIKE_SIDES: readonly number[] = [-1, 1];

/** 어깨 스파이크 두 개 — 각진 판금 위로 솟는다. */
function drawShoulderSpikes(ctx: BattleCtx, palette: Palette, cx: number, cy: number, h: number): void {
  for (const side of SPIKE_SIDES) {
    const baseX = cx + h * SPIKE_X * side;
    fillTriangle(
      ctx,
      baseX - h * SPIKE_HALF_W, cy + h * BLOCK_TOP_Y,
      baseX + h * SPIKE_HALF_W, cy + h * BLOCK_TOP_Y,
      baseX, cy + h * (BLOCK_TOP_Y - SPIKE_HEIGHT),
      palette.ENEMY_DEEP,
      palette.LINE,
    );
  }
}

/** 장부 형태 방패 — 네모난 판 + 세로 등(책등) 선. */
function drawLedgerShield(ctx: BattleCtx, palette: Palette, cx: number, cy: number, h: number): void {
  fillQuad(
    ctx,
    cx + h * LEDGER_FRONT_X, cy + h * LEDGER_TOP_Y,
    cx + h * LEDGER_BACK_X, cy + h * LEDGER_TOP_Y,
    cx + h * LEDGER_BACK_X, cy + h * LEDGER_BOTTOM_Y,
    cx + h * LEDGER_FRONT_X, cy + h * LEDGER_BOTTOM_Y,
    palette.ENEMY_DEEP,
    palette.LINE,
  );
  const spineX = cx + h * (LEDGER_FRONT_X + 0.12);
  strokeSegment(ctx, spineX, cy + h * LEDGER_TOP_Y, spineX, cy + h * LEDGER_BOTTOM_Y, palette.LINE, DETAIL_LINE_WIDTH);
}

/** E-02 — 네모난 블록 실루엣 + 어깨 스파이크 + 장부 방패 + 봉인 망치. */
export function drawMarginEnforcerShape(ctx: BattleCtx, palette: Palette, cx: number, cy: number): void {
  const h = UNIT_RADIUS * GROUND_ENEMY_SCALE.marginEnforcer;
  drawShoulderSpikes(ctx, palette, cx, cy, h);
  fillQuad(
    ctx,
    cx - h * BLOCK_HALF_W, cy + h * BLOCK_TOP_Y,
    cx + h * BLOCK_HALF_W, cy + h * BLOCK_TOP_Y,
    cx + h * BLOCK_HALF_W, cy + h * BLOCK_BOTTOM_Y,
    cx - h * BLOCK_HALF_W, cy + h * BLOCK_BOTTOM_Y,
    palette.ENEMY_DOWN,
    palette.LINE,
  );
  // 투구 슬릿 — 얼굴 자리는 검은 공백만 남긴다.
  strokeSegment(
    ctx,
    cx - h * 0.3, cy + h * (BLOCK_TOP_Y + 0.2),
    cx + h * 0.3, cy + h * (BLOCK_TOP_Y + 0.2),
    palette.LINE,
    LIMB_LINE_WIDTH,
  );
  drawLedgerShield(ctx, palette, cx, cy, h);

  strokeSegment(ctx, cx + h * HAMMER_GRIP_X, cy, cx + h * HAMMER_HEAD_X, cy + h * HAMMER_HEAD_Y, palette.ENEMY_DEEP, LIMB_LINE_WIDTH);
  fillQuad(
    ctx,
    cx + h * (HAMMER_HEAD_X - HAMMER_HEAD_HALF), cy + h * (HAMMER_HEAD_Y - HAMMER_HEAD_HALF),
    cx + h * (HAMMER_HEAD_X + HAMMER_HEAD_HALF), cy + h * (HAMMER_HEAD_Y - HAMMER_HEAD_HALF * 0.6),
    cx + h * (HAMMER_HEAD_X + HAMMER_HEAD_HALF), cy + h * (HAMMER_HEAD_Y + HAMMER_HEAD_HALF * 0.6),
    cx + h * (HAMMER_HEAD_X - HAMMER_HEAD_HALF), cy + h * (HAMMER_HEAD_Y + HAMMER_HEAD_HALF),
    palette.ENEMY_DEEP,
    palette.LINE,
  );
}

// ── E-03 청산 굴착기 ──────────────────────────────────────────────
const TRACK_HALF_W = 0.9;
const TRACK_TOP_Y = 0.5;
const TRACK_BOTTOM_Y = 0.95;
const HULL_TOP_Y = -0.45;
const HULL_BACK_X = 0.8;
const HULL_FRONT_X = -0.75;
const CAB_BACK_X = 0.62;
const CAB_FRONT_X = 0.1;
const CAB_TOP_Y = -0.9;
const ARM_SHOULDER_X = 0.2;
const ARM_ELBOW_X = -0.75;
const ARM_ELBOW_Y = 0.05;
const ARM_WRIST_X = -1.2;
const ARM_WRIST_Y = 0.55;
const BUCKET_HALF = 0.3;
const ARROW_TOP_Y = -0.25;
const ARROW_TIP_Y = 0.25;
const ARROW_WING = 0.28;

/** 가슴판의 하강 화살표 — 축 + 아래로 벌어진 두 날개(글자·숫자 아님). */
function drawDescendingArrow(ctx: BattleCtx, palette: Palette, cx: number, cy: number, h: number): void {
  const shaftX = cx - h * 0.05;
  strokeSegment(ctx, shaftX, cy + h * ARROW_TOP_Y, shaftX, cy + h * ARROW_TIP_Y, palette.LINE, LIMB_LINE_WIDTH);
  strokeBentSegment(
    ctx,
    shaftX - h * ARROW_WING, cy + h * (ARROW_TIP_Y - ARROW_WING),
    shaftX, cy + h * ARROW_TIP_Y,
    shaftX + h * ARROW_WING, cy + h * (ARROW_TIP_Y - ARROW_WING),
    palette.LINE,
    LIMB_LINE_WIDTH,
  );
}

/** 굴착 암 — 두 번 꺾인 팔 + 끝의 각진 버킷. 사람 팔이 아니라 장비임이 읽혀야 한다. */
function drawDiggerArm(ctx: BattleCtx, palette: Palette, cx: number, cy: number, h: number): void {
  strokeBentSegment(
    ctx,
    cx + h * ARM_SHOULDER_X, cy + h * (HULL_TOP_Y + 0.15),
    cx + h * ARM_ELBOW_X, cy + h * ARM_ELBOW_Y,
    cx + h * ARM_WRIST_X, cy + h * ARM_WRIST_Y,
    palette.ENEMY_DEEP,
    LIMB_LINE_WIDTH,
  );
  fillQuad(
    ctx,
    cx + h * (ARM_WRIST_X - BUCKET_HALF * 0.4), cy + h * (ARM_WRIST_Y - BUCKET_HALF),
    cx + h * (ARM_WRIST_X + BUCKET_HALF), cy + h * (ARM_WRIST_Y - BUCKET_HALF * 0.5),
    cx + h * (ARM_WRIST_X + BUCKET_HALF * 0.5), cy + h * (ARM_WRIST_Y + BUCKET_HALF),
    cx + h * (ARM_WRIST_X - BUCKET_HALF), cy + h * (ARM_WRIST_Y + BUCKET_HALF * 0.4),
    palette.ENEMY_DEEP,
    palette.LINE,
  );
}

/** E-03 — 사람보다 장비. 궤도 + 트라페조이드 차체 + 굴착 암 + 하강 화살표. */
export function drawLiquidationDiggerShape(ctx: BattleCtx, palette: Palette, cx: number, cy: number): void {
  const h = UNIT_RADIUS * GROUND_ENEMY_SCALE.liquidationDigger;
  fillQuad(
    ctx,
    cx - h * TRACK_HALF_W, cy + h * TRACK_TOP_Y,
    cx + h * TRACK_HALF_W, cy + h * TRACK_TOP_Y,
    cx + h * (TRACK_HALF_W - 0.1), cy + h * TRACK_BOTTOM_Y,
    cx - h * (TRACK_HALF_W - 0.1), cy + h * TRACK_BOTTOM_Y,
    palette.ENEMY_DEEP,
    palette.LINE,
  );
  fillQuad(
    ctx,
    cx + h * (HULL_FRONT_X + 0.2), cy + h * HULL_TOP_Y,
    cx + h * HULL_BACK_X, cy + h * (HULL_TOP_Y + 0.1),
    cx + h * HULL_BACK_X, cy + h * TRACK_TOP_Y,
    cx + h * HULL_FRONT_X, cy + h * TRACK_TOP_Y,
    palette.ENEMY_DOWN,
    palette.LINE,
  );
  fillQuad(
    ctx,
    cx + h * CAB_FRONT_X, cy + h * HULL_TOP_Y,
    cx + h * CAB_BACK_X, cy + h * HULL_TOP_Y,
    cx + h * (CAB_BACK_X - 0.1), cy + h * CAB_TOP_Y,
    cx + h * (CAB_FRONT_X + 0.1), cy + h * CAB_TOP_Y,
    palette.ENEMY_DEEP,
    palette.LINE,
  );
  drawDescendingArrow(ctx, palette, cx, cy, h);
  drawDiggerArm(ctx, palette, cx, cy, h);
}
