/**
 * 공중 레인 위험 경고 — 공중 적이 존재하는데 대공 포대가 없으면 공중 레인 배경을
 * 강조하고 "대공 포대 필요" 문구를 띄운다.
 *
 * 배경: 공중 적은 대공 포대(`antiair`)로만 잡힌다(FR-6.2). 기본/광역 포탑과 지상
 * 유닛은 공중을 전혀 때리지 못하는데, 화면에는 이 사실이 드러나지 않아 플레이어가
 * 대공 포대 없이 공중 웨이브를 그냥 흘려보내는 사고가 반복됐다 — 이 경고가 그
 * 정보 공백을 메운다.
 */

import type { CombatState, Enemy, Tower } from '../combat/types.js';
import type { Palette } from '../design/index.js';
import type { BattleLayout } from './layout.js';
import { rgba } from './style.js';
import type { BattleCtx } from './surface.js';

const WARNING_LABEL = '⚠ 대공 포대 필요';
const WARNING_FONT = '11px sans-serif';
/** 경고 배경 띠의 채움 투명도. */
const WARNING_FILL_ALPHA = 0.2;
/** 경고 배경 띠의 테두리 투명도. */
const WARNING_BORDER_ALPHA = 0.85;
const WARNING_BORDER_WIDTH = 1.5;
/** 공중~지상 레인 간격 대비 경고 띠 높이 비율. */
const WARNING_BAND_HEIGHT_RATIO = 0.6;
const WARNING_TEXT_PADDING_X = 6;

/** 공중 적이 한 마리라도 있는지. */
export function hasAirEnemy(enemies: readonly Enemy[]): boolean {
  return enemies.some((enemy) => enemy.lane === 'air');
}

/** 대공 포대가 한 기라도 지어져 있는지. */
export function hasAntiairTower(towers: readonly Tower[]): boolean {
  return towers.some((tower) => tower.kind === 'antiair');
}

/** 경고 상태 여부 — 공중 적이 있는데 대공 포대가 없으면 true. */
export function isAirLaneWarningActive(enemies: readonly Enemy[], towers: readonly Tower[]): boolean {
  return hasAirEnemy(enemies) && !hasAntiairTower(towers);
}

/** 공중 레인 배경을 강조하고 경고 문구를 그린다. 경고 상태가 아니면 아무것도 하지 않는다. */
export function drawAirLaneWarning(ctx: BattleCtx, palette: Palette, layout: BattleLayout, state: CombatState): void {
  if (!isAirLaneWarningActive(state.enemies, state.towers)) return;

  const bandHeight = Math.max(0, (layout.groundY - layout.airY) * WARNING_BAND_HEIGHT_RATIO);
  const bandTop = layout.airY - bandHeight / 2;
  const width = Math.max(0, layout.width);

  ctx.save();
  ctx.setLineDash([]);
  ctx.fillStyle = rgba(palette.GOLD, WARNING_FILL_ALPHA);
  ctx.fillRect(0, bandTop, width, bandHeight);

  ctx.strokeStyle = rgba(palette.GOLD, WARNING_BORDER_ALPHA);
  ctx.lineWidth = WARNING_BORDER_WIDTH;
  ctx.strokeRect(0, bandTop, width, bandHeight);

  ctx.font = WARNING_FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = palette.GOLD;
  ctx.fillText(WARNING_LABEL, layout.laneLeft + WARNING_TEXT_PADDING_X, layout.airY);
  ctx.restore();
}
