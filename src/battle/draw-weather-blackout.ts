/**
 * `WX-04` 서킷브레이커 정전 (아트-프로덕션시트 §03).
 *
 * 화면 전체가 한 프레임 검게 죽고, 굵은 스캔라인 **두 줄**이 위아래로 훑는다.
 * 지속 상한(3프레임)은 렌더가 아니라 `src/weather/resolve.ts`가 강제한다 —
 * 여기서는 "지금 정전이다"를 그리기만 한다.
 *
 * ★ 중앙 공백 규칙의 유일한 예외다. 시트가 "화면 전체가 검게 죽는다"고 명시하므로
 *   전체 화면을 덮는 게 의도된 연출이다. 대신 3프레임 상한이 그 대가를 치른다.
 */

import type { Palette } from '../design/index.js';
import type { WeatherView, WeatherViewport } from '../weather/index.js';
import { BLACKOUT_SCANLINE_COUNT, fieldPhase } from '../weather/index.js';
import { rgba } from './style.js';
import type { BattleCtx } from './surface.js';

/** 스캔라인 1회 훑기 주기(ms). 3프레임(≈50ms) 안에 눈에 띄게 움직여야 하므로 짧다. */
const SWEEP_MS = 220;
/** 스캔라인 두께 — 화면 높이 대비. "굵은"이 시트 요구사항이다. */
const SCANLINE_THICKNESS_RATIO = 0.02;
const SCANLINE_ALPHA = 0.85;
/**
 * reduced-motion에서의 암전 불투명도.
 *
 * 완전 암전은 그 자체가 섬광(flash)이라 광과민성 위험이 있다. 모션을 줄인 사용자에게는
 * 반투명으로 낮추되 **정전이라는 정보는 그대로 남긴다** (색·스캔라인 유지).
 */
const REDUCED_BLACKOUT_ALPHA = 0.55;
/** reduced-motion에서 스캔라인이 고정되는 위치 — 화면 높이 대비. */
const REDUCED_SCANLINE_POSITIONS = [0.28, 0.72] as const;

export function drawBlackout(
  ctx: BattleCtx,
  palette: Palette,
  viewport: WeatherViewport,
  view: WeatherView,
): void {
  const span = Math.max(0, viewport.height - viewport.top);
  const thickness = Math.max(1, viewport.height * SCANLINE_THICKNESS_RATIO);

  ctx.save();
  ctx.setLineDash([]);

  // 화면 전체 암전.
  ctx.fillStyle = view.reducedMotion
    ? rgba(palette.LINE, REDUCED_BLACKOUT_ALPHA)
    : palette.LINE;
  ctx.fillRect(0, 0, viewport.width, viewport.height);

  // 굵은 스캔라인 두 줄 — 하나는 위에서, 하나는 아래에서.
  ctx.fillStyle = rgba(palette.TEXT, SCANLINE_ALPHA);
  for (let line = 0; line < BLACKOUT_SCANLINE_COUNT; line += 1) {
    ctx.fillRect(0, scanlineY(line, viewport, view, span, thickness), viewport.width, thickness);
  }

  ctx.restore();
}

/** 스캔라인 `line`의 y. reduced-motion에서는 훑지 않고 고정 위치에 선다. */
function scanlineY(
  line: number,
  viewport: WeatherViewport,
  view: WeatherView,
  span: number,
  thickness: number,
): number {
  if (view.reducedMotion) {
    const ratio = REDUCED_SCANLINE_POSITIONS[line] ?? 0.5;
    return viewport.top + span * ratio;
  }

  const phase = fieldPhase(view.timeMs, SWEEP_MS, 0, 1);
  const downward = line % 2 === 0;
  return downward
    ? viewport.top + phase * Math.max(0, span - thickness)
    : viewport.height - thickness - phase * Math.max(0, span - thickness);
}
