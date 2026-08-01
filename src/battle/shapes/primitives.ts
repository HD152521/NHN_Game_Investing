/**
 * 실루엣 드로잉 원시 도형 — 아트 프로덕션 시트 v1.1 의 형태 묘사를 Canvas 패스로 옮길 때
 * 모든 엔티티가 공유하는 최소 단위.
 *
 * ★ 설계 규칙 (시트 00 이중 인코딩) ★
 *   아군 = 둥근 실루엣(`rounded`) → 반드시 `arc`가 하나 이상 들어간다.
 *   악당 = 각진 실루엣(`angular`) → `arc`를 **한 번도 쓰지 않는다**.
 *   이 규칙이 `src/combat/identity.ts`의 `silhouette` 분류값과 실제 그림을 잇는 다리다
 *   (`silhouette.test.ts`가 그림의 arc 유무로 검증한다). 색을 못 보는 상황에서 진영을
 *   가르는 유일한 신호이므로, 편의로 악당에 원을 하나 넣는 순간 규약이 무너진다.
 *
 * ★ 프레임당 할당 0 (PRD §11: 유닛 60체 + 타워 8기에서 60 FPS) ★
 *   좌표 배열·점 객체를 만들지 않는다. 모든 헬퍼는 **스칼라만** 받아 곧바로
 *   `moveTo`/`lineTo`/`arc`로 흘려보낸다. `setLineDash`도 모듈 전역 빈 배열을 재사용한다.
 */

import type { Palette } from '../../design/index.js';
import type { BattleCtx } from '../surface.js';

/** 유닛/적 실루엣의 기준 반경(px). 종류별 배율은 각 shape 파일이 이 값에 곱해 쓴다. */
export const UNIT_RADIUS = 12;

/** 모든 실루엣 공통 외곽선 굵기 — 배경(하늘·스카이라인·지면)과 경계를 확실히 한다. */
export const OUTLINE_WIDTH = 1.5;
/** 탱커·기지처럼 "버틴다"는 인상이 필요한 실루엣의 두꺼운 외곽선. */
export const HEAVY_OUTLINE_WIDTH = 3;
/** 장식선(전표·다이얼 눈금·음파 링 등) 굵기. */
export const DETAIL_LINE_WIDTH = 1.2;
/** 무기·팔처럼 실루엣의 일부로 읽혀야 하는 굵은 선. */
export const LIMB_LINE_WIDTH = 2.5;

export const FULL_CIRCLE_START = 0;
export const FULL_CIRCLE_END = Math.PI * 2;
/** 위쪽 반원(종 머리·돔 지붕) — 캔버스 y가 아래로 커지므로 π~2π가 위쪽이다. */
export const UPPER_ARC_START = Math.PI;
export const UPPER_ARC_END = Math.PI * 2;

/**
 * 점선 없음 상태를 만들 때 재사용하는 단 하나의 빈 배열.
 * `ctx.setLineDash([])`를 그대로 쓰면 실루엣 하나마다 배열이 새로 생겨 유닛 60체 × 수 회 =
 * 프레임당 수백 개의 쓰레기가 된다.
 */
const NO_DASH: number[] = [];

export function clearDash(ctx: BattleCtx): void {
  ctx.setLineDash(NO_DASH);
}

/** 현재 열린 경로를 채우고, 같은 경로에 외곽선을 둘러 배경과 분리한다. */
export function fillAndOutline(
  ctx: BattleCtx,
  fillColor: string,
  lineColor: string,
  lineWidth: number = OUTLINE_WIDTH,
): void {
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = lineWidth;
  clearDash(ctx);
  ctx.stroke();
}

/** 반지름이 0 이하로 내려가 캔버스가 예외를 던지지 않도록 보정한다(극소 캔버스 방어). */
export function safeRadius(radius: number): number {
  return radius > 0 ? radius : 0.5;
}

export function circlePath(ctx: BattleCtx, cx: number, cy: number, radius: number): void {
  ctx.beginPath();
  ctx.arc(cx, cy, safeRadius(radius), FULL_CIRCLE_START, FULL_CIRCLE_END);
}

export function fillCircle(
  ctx: BattleCtx,
  cx: number,
  cy: number,
  radius: number,
  fillColor: string,
  lineColor: string,
  lineWidth: number = OUTLINE_WIDTH,
): void {
  circlePath(ctx, cx, cy, radius);
  fillAndOutline(ctx, fillColor, lineColor, lineWidth);
}

/** 사각형 경로(채움 전용 `fillRect`와 달리 외곽선을 같은 경로로 두를 수 있다). */
export function rectPath(ctx: BattleCtx, x: number, y: number, w: number, h: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
}

export function fillRectPath(
  ctx: BattleCtx,
  x: number,
  y: number,
  w: number,
  h: number,
  fillColor: string,
  lineColor: string,
  lineWidth: number = OUTLINE_WIDTH,
): void {
  rectPath(ctx, x, y, w, h);
  fillAndOutline(ctx, fillColor, lineColor, lineWidth);
}

export function trianglePath(
  ctx: BattleCtx,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.closePath();
}

export function fillTriangle(
  ctx: BattleCtx,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  fillColor: string,
  lineColor: string,
  lineWidth: number = OUTLINE_WIDTH,
): void {
  trianglePath(ctx, x1, y1, x2, y2, x3, y3);
  fillAndOutline(ctx, fillColor, lineColor, lineWidth);
}

/** 네 점 다각형(사다리꼴·평행사변형·꺾인 판금 등 각진 실루엣의 주력). */
export function quadPath(
  ctx: BattleCtx,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  x4: number,
  y4: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.lineTo(x4, y4);
  ctx.closePath();
}

export function fillQuad(
  ctx: BattleCtx,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  x4: number,
  y4: number,
  fillColor: string,
  lineColor: string,
  lineWidth: number = OUTLINE_WIDTH,
): void {
  quadPath(ctx, x1, y1, x2, y2, x3, y3, x4, y4);
  fillAndOutline(ctx, fillColor, lineColor, lineWidth);
}

/** 선분 하나(팔·다리·창대·데이터 줄). */
export function strokeSegment(
  ctx: BattleCtx,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  lineWidth: number = DETAIL_LINE_WIDTH,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  clearDash(ctx);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

/** 꺾인 선 하나(아래로 꺾인 창 · 굴착 암 · 접이식 안테나). */
export function strokeBentSegment(
  ctx: BattleCtx,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  color: string,
  lineWidth: number = DETAIL_LINE_WIDTH,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  clearDash(ctx);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.stroke();
}

/** 유닛 한 종을 그리는 함수 — 중심 좌표만 받는다(레이아웃 계산은 호출부가 끝낸 상태). */
export type UnitShapeDrawer = (ctx: BattleCtx, palette: Palette, cx: number, cy: number) => void;
