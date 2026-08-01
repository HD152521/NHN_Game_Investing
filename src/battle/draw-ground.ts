/**
 * 발판 상태 3단계 렌더링 — 아트-프로덕션시트 §02 `GND-STATE`.
 *
 * ★ 판정은 여기 없다. 상태(`intact`/`cracked`/`collapsed`)는 `src/ground`(순수 함수)가
 *   이미 정해서 넘겨준다. `draw-weather.ts`와 같은 구조다 — 이 파일이 적 좌표나 웨이브
 *   번호를 읽기 시작하면 판정/렌더 분리가 무너진다.
 *
 * 그리는 것:
 *   1. **1px 림 라이트** — 발판 상단 모서리. 모든 발이 이 선 위에 정렬된다. 3단계 공통.
 *   2. **균열** — 각진 지그재그 선(정상에는 없음). 사실적 텍스처 없이 납작하게.
 *   3. **청색 잔광** — 함몰에서만. 균열에 스며드는 빛만 더한다(형태는 균열과 동일).
 *
 * ★ reduced-motion: 잔광의 **맥동만** 멈춘다. 균열 형태와 잔광 자체는 그대로 남는다 —
 *   발판 상태는 장식이 아니라 전황 표시라서, 모션을 껐다고 정보가 사라지면 안 된다.
 *
 * 프레임당 할당 0: 균열 좌표는 배열이 아니라 인덱스 → 결정적 해시로 매번 **계산**한다.
 */

import type { GroundState } from '../ground/index.js';
import type { Palette } from '../design/index.js';
import { GROUND_BAND_RISE } from './draw-background.js';
import type { BattleLayout } from './layout.js';
import { rgba } from './style.js';
import type { BattleCtx } from './surface.js';

/** 지면선(림 라이트) 굵기 — 시트가 못 박은 1px. */
const RIM_LINE_WIDTH = 1;
const RIM_ALPHA = 0.55;

/** 균열 개수. 폭 전체에 고르게 흩어진다. */
const CRACK_COUNT = 9;
/** 균열 한 줄의 꺾임 수 — 각지게 보이려면 곡선이 아니라 짧은 직선 몇 개여야 한다. */
const CRACK_SEGMENTS = 3;
/** 균열이 발판 아래로 얼마나 깊게 내려가는지 — 발판 띠 높이 대비 비율. */
const CRACK_DEPTH_RATIO = 0.72;
/** 균열 가로 흔들림 폭(px) — 이 이상 벌어지면 균열이 아니라 낙서로 보인다. */
const CRACK_SWAY = 7;
const CRACK_CORE_WIDTH = 2;
const CRACK_CORE_ALPHA = 0.85;
/** 균열 옆 하이라이트 — 어두운 코어만 있으면 어두운 배경에 묻힌다. */
const CRACK_EDGE_WIDTH = 1;
const CRACK_EDGE_ALPHA = 0.4;
const CRACK_EDGE_OFFSET = 1.5;

/** 함몰 잔광 굵기 — 균열보다 굵게 번져 "스며든다"로 읽히게 한다. */
const GLOW_LINE_WIDTH = 5;
/** 잔광 알파 하한 / 맥동 폭. reduced-motion이면 하한 + 폭/2로 고정한다. */
const GLOW_ALPHA_MIN = 0.18;
const GLOW_ALPHA_SPAN = 0.22;
/** 잔광 맥동 1주기(ms). */
const GLOW_PULSE_PERIOD_MS = 1_800;

/**
 * 발판 상단 모서리의 y(px) — 지면선.
 *
 * 전장 상단보다 위로 올라가지 않도록 자른다(캔버스가 극단적으로 낮을 때).
 */
export function groundSurfaceY(layout: BattleLayout): number {
  return Math.max(layout.battlefieldTop, layout.groundY - GROUND_BAND_RISE);
}

/** 인덱스 → 0~1 결정적 해시. 시드 RNG 없이 매 프레임 같은 균열 배치를 재현한다. */
function hash01(index: number, salt: number): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

/** 균열 한 줄의 시작 x(px) — 폭 전체에 고르게 흩되 균등 간격으로 줄서지 않게 흔든다. */
function crackStartX(index: number, width: number): number {
  const even = ((index + 0.5) / CRACK_COUNT) * width;
  return even + (hash01(index, 1) - 0.5) * (width / CRACK_COUNT) * 0.8;
}

/** 균열 한 줄을 경로로 깐다(획은 호출자가 긋는다 — 코어·하이라이트·잔광이 같은 형태를 공유). */
function traceCrack(ctx: BattleCtx, index: number, width: number, top: number, depth: number, offsetX: number): void {
  const startX = crackStartX(index, width);
  ctx.beginPath();
  ctx.moveTo(startX + offsetX, top);

  for (let segment = 1; segment <= CRACK_SEGMENTS; segment += 1) {
    const t = segment / CRACK_SEGMENTS;
    const sway = (hash01(index, segment + 2) - 0.5) * 2 * CRACK_SWAY;
    ctx.lineTo(startX + offsetX + sway, top + depth * t);
  }
}

/** 균열 전체를 한 번 훑는다 — 획 스타일만 다르게 해서 코어/하이라이트/잔광에 재사용한다. */
function strokeAllCracks(
  ctx: BattleCtx,
  strokeStyle: string,
  lineWidth: number,
  offsetX: number,
  width: number,
  top: number,
  depth: number,
): void {
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  for (let index = 0; index < CRACK_COUNT; index += 1) {
    traceCrack(ctx, index, width, top, depth, offsetX);
    ctx.stroke();
  }
}

/** 함몰 잔광 알파 — reduced-motion이면 맥동 중간값으로 고정한다(정보는 남고 모션만 사라진다). */
function glowAlpha(timeMs: number, reducedMotion: boolean): number {
  if (reducedMotion) return GLOW_ALPHA_MIN + GLOW_ALPHA_SPAN / 2;
  const phase = (timeMs % GLOW_PULSE_PERIOD_MS) / GLOW_PULSE_PERIOD_MS;
  return GLOW_ALPHA_MIN + GLOW_ALPHA_SPAN * (0.5 + 0.5 * Math.sin(phase * Math.PI * 2));
}

/** 발판 상단 모서리 1px 림 라이트 — 지면선. 3단계 공통이라 항상 마지막에 얹는다. */
function drawRimLight(ctx: BattleCtx, palette: Palette, width: number, surfaceY: number): void {
  ctx.save();
  ctx.strokeStyle = rgba(palette.TEXT, RIM_ALPHA);
  ctx.lineWidth = RIM_LINE_WIDTH;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(0, surfaceY);
  ctx.lineTo(width, surfaceY);
  ctx.stroke();
  ctx.restore();
}

/**
 * 발판 한 프레임을 그린다. 배경(`drawBackground`)이 발판 띠를 깐 **직후**에 호출한다 —
 * 유닛·타워보다 먼저 그려야 발이 지면선 위에 서 보인다.
 *
 * @param state         `src/ground`의 `classifyGroundState` 결과.
 * @param reducedMotion `prefers-reduced-motion`. 맥동만 멈추고 상태 정보는 유지한다.
 * @param timeMs        잔광 맥동 위상용 시각.
 */
export function drawGroundState(
  ctx: BattleCtx,
  palette: Palette,
  layout: BattleLayout,
  state: GroundState,
  reducedMotion: boolean,
  timeMs: number,
): void {
  if (layout.width <= 0 || layout.height <= 0) return;

  const surfaceY = groundSurfaceY(layout);
  const bandHeight = Math.max(0, layout.height - surfaceY);

  if (state !== 'intact' && bandHeight > 0) {
    const depth = bandHeight * CRACK_DEPTH_RATIO;

    ctx.save();
    ctx.setLineDash([]);
    // 함몰 잔광은 균열 **아래**에 깔아, 균열이 잔광에 잠기지 않고 위에 또렷이 남게 한다.
    if (state === 'collapsed') {
      const alpha = glowAlpha(timeMs, reducedMotion);
      strokeAllCracks(ctx, rgba(palette.ENEMY_DOWN, alpha), GLOW_LINE_WIDTH, 0, layout.width, surfaceY, depth);
    }
    strokeAllCracks(
      ctx,
      rgba(palette.MUTED, CRACK_EDGE_ALPHA),
      CRACK_EDGE_WIDTH,
      CRACK_EDGE_OFFSET,
      layout.width,
      surfaceY,
      depth,
    );
    strokeAllCracks(ctx, rgba(palette.LINE, CRACK_CORE_ALPHA), CRACK_CORE_WIDTH, 0, layout.width, surfaceY, depth);
    ctx.restore();
  }

  drawRimLight(ctx, palette, layout.width, surfaceY);
}
