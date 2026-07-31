/**
 * 공중/지상 레인 구분선 — 배경 위에 옅은 안내선 + 라벨을 그려 "여기가 공중, 여기가
 * 지상"을 항상 알 수 있게 한다(가시성 수정 4번째 항목: 전반적 대비/레인 구분).
 *
 * 배경 위에 그려지되(§battle.ts 순서: drawBackground 다음) 다른 전경 요소보다는
 * 먼저 그려 항상 가장 뒤에 깔린다 — 경고 배너(draw-lane-warning.ts)나 타워·유닛이
 * 그 위를 덮어도 자연스럽다.
 */

import type { Palette } from '../design/index.js';
import type { BattleLayout } from './layout.js';
import { rgba } from './style.js';
import type { BattleCtx } from './surface.js';

const GUIDE_DASH: readonly number[] = [3, 5];
const GUIDE_LINE_WIDTH = 1;
const GUIDE_ALPHA = 0.4;
const LABEL_FONT = '10px sans-serif';
const LABEL_ALPHA = 0.8;
const LABEL_PADDING_X = 4;
/** 라벨을 레인 선 위로 얼마나 띄우는지(px). */
const LABEL_OFFSET_Y = 3;

function drawGuideLine(ctx: BattleCtx, palette: Palette, y: number, width: number): void {
  ctx.save();
  ctx.strokeStyle = rgba(palette.MUTED, GUIDE_ALPHA);
  ctx.lineWidth = GUIDE_LINE_WIDTH;
  ctx.setLineDash([...GUIDE_DASH]);
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(width, y);
  ctx.stroke();
  ctx.restore();
}

function drawGuideLabel(ctx: BattleCtx, palette: Palette, text: string, x: number, y: number): void {
  ctx.save();
  ctx.font = LABEL_FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = rgba(palette.MUTED, LABEL_ALPHA);
  ctx.fillText(text, x, y - LABEL_OFFSET_Y);
  ctx.restore();
}

/** 공중·지상 레인 각각에 옅은 점선 안내선 + 라벨("공중"/"지상")을 그린다. */
export function drawLaneGuides(ctx: BattleCtx, palette: Palette, layout: BattleLayout): void {
  if (layout.width <= 0) return;

  drawGuideLine(ctx, palette, layout.airY, layout.width);
  drawGuideLabel(ctx, palette, '공중', layout.laneLeft + LABEL_PADDING_X, layout.airY);

  drawGuideLine(ctx, palette, layout.groundY, layout.width);
  drawGuideLabel(ctx, palette, '지상', layout.laneLeft + LABEL_PADDING_X, layout.groundY);
}
