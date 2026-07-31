/**
 * 상단 HUD — 웨이브 표시 · 공시 폭탄(스킬) 쿨다운 게이지.
 *
 * `CombatState`에는 스킬 쿨다운의 "총량"이 없고 남은 시간(`skillCooldownMs`)만 있으므로,
 * 정확한 비율 게이지 대신 준비(READY)/충전 중 두 상태만 색으로 구분하고 남은 초를
 * 텍스트로 보여준다 — 총량이 배선되면 추후 비율 게이지로 교체하기 쉽다.
 */

import type { CombatPhase, CombatState } from '../combat/types.js';
import type { Palette } from '../design/index.js';
import { rgba } from './style.js';
import type { BattleLayout } from './layout.js';
import type { BattleCtx } from './surface.js';

const HUD_FONT = '12px monospace';
const HUD_TEXT_PADDING_X = 8;
const GAUGE_WIDTH = 90;
const GAUGE_HEIGHT = 8;
const GAUGE_RIGHT_PADDING = 8;
const CHARGING_ALPHA = 0.35;
const MS_PER_SECOND = 1000;

function waveLabel(state: CombatState): string {
  if (state.phase === 'cleared') return 'CLEARED';
  if (state.phase === 'defeated') return 'DEFEATED';
  return `WAVE ${state.wave}/${state.waveCount}`;
}

function waveColor(phase: CombatPhase, palette: Palette): string {
  if (phase === 'defeated') return palette.ENEMY_DOWN;
  if (phase === 'cleared') return palette.UP_ALLY;
  return palette.TEXT;
}

export function drawHud(ctx: BattleCtx, palette: Palette, layout: BattleLayout, state: CombatState): void {
  if (layout.hudHeight <= 0) return;
  const midY = layout.hudHeight / 2;

  ctx.save();
  ctx.font = HUD_FONT;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = waveColor(state.phase, palette);
  ctx.fillText(waveLabel(state), HUD_TEXT_PADDING_X, midY);
  ctx.restore();

  const gaugeX = Math.max(0, layout.width - GAUGE_WIDTH - GAUGE_RIGHT_PADDING);
  const gaugeY = midY - GAUGE_HEIGHT / 2;
  const ready = state.skillCooldownMs <= 0;

  ctx.save();
  ctx.fillStyle = rgba(palette.MUTED, CHARGING_ALPHA);
  ctx.fillRect(gaugeX, gaugeY, GAUGE_WIDTH, GAUGE_HEIGHT);

  if (ready) {
    ctx.fillStyle = palette.GOLD;
    ctx.fillRect(gaugeX, gaugeY, GAUGE_WIDTH, GAUGE_HEIGHT);
  }

  ctx.font = HUD_FONT;
  ctx.textAlign = 'right';
  ctx.fillStyle = ready ? palette.GOLD : palette.MUTED;
  const label = ready ? 'READY' : `${Math.ceil(state.skillCooldownMs / MS_PER_SECOND)}s`;
  ctx.fillText(label, gaugeX - HUD_TEXT_PADDING_X, midY);
  ctx.restore();
}
