/**
 * 상단 HUD — 웨이브 표시 · 공시 폭탄(스킬) 쿨다운 게이지.
 *
 * `CombatState`에는 스킬 쿨다운의 "총량"이 없고 남은 시간(`skillCooldownMs`)만 있으므로,
 * 정확한 비율 게이지 대신 준비(READY)/충전 중 두 상태만 색으로 구분하고 남은 초를
 * 텍스트로 보여준다 — 총량이 배선되면 추후 비율 게이지로 교체하기 쉽다.
 */

import { bossPhaseOf } from '../combat/boss.js';
import { BOSS_IDENTITY } from '../combat/identity.js';
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

/* ------------------------------------------------------------------ *
 * 보스 HP 바 (B-03 마진콜 심판관)
 *
 * ★ 화면을 어지럽히지 않기 위한 제약 ★
 *   ① **보스가 살아 있을 때만** 그린다. 등장 전·처치 후에는 HUD가 예전과 완전히 같다.
 *   ② 웨이브 텍스트(좌)와 스킬 게이지(우) **사이의 남는 폭**만 쓴다 — 기존 두 요소의
 *      위치를 한 픽셀도 밀지 않는다.
 *   ③ 새 줄을 만들지 않는다. HUD는 한 줄이고, 줄을 늘리면 전장 높이가 줄어든다.
 * ------------------------------------------------------------------ */

/** 보스 바가 양옆 요소와 부딪히지 않으려면 최소 이만큼은 남아야 한다. 안 되면 안 그린다. */
const BOSS_BAR_MIN_WIDTH = 80;
const BOSS_BAR_MAX_WIDTH = 220;
const BOSS_BAR_HEIGHT = 6;
/** 좌측 웨이브 텍스트가 차지한다고 보는 폭. 고정폭 폰트 12px × 'WAVE 13/13' 기준 여유값. */
const WAVE_LABEL_WIDTH = 96;
/** 바와 이름표 사이 간격. */
const BOSS_LABEL_GAP = 6;

/**
 * 보스 HP 바 — 살아 있을 때만. 2페이즈에 들어가면 색이 바뀌어 **"더 위험해졌다"**를
 * 전장 스프라이트(`tf-boss-p2`)와 같은 신호로 반복한다.
 *
 * 페이즈 판정은 `bossPhaseOf`(`src/combat/boss.ts`)를 부른다 — HUD가 자기 비율 상수를
 * 들면 전장 그림과 HUD 색이 서로 다른 시점에 바뀔 수 있다.
 */
function drawBossBar(ctx: BattleCtx, palette: Palette, layout: BattleLayout, state: CombatState): void {
  const boss = state.boss ?? null;
  if (boss === null || boss.maxHp <= 0) return;

  const left = WAVE_LABEL_WIDTH;
  const right = Math.max(0, layout.width - GAUGE_WIDTH - GAUGE_RIGHT_PADDING * 2);
  const available = right - left;
  if (available < BOSS_BAR_MIN_WIDTH) return;

  const width = Math.min(BOSS_BAR_MAX_WIDTH, available);
  const x = left + (available - width) / 2;
  const midY = layout.hudHeight / 2;
  const y = midY - BOSS_BAR_HEIGHT / 2;
  const ratio = Math.max(0, Math.min(1, boss.hp / boss.maxHp));
  const phase2 = bossPhaseOf(boss) === 2;

  ctx.save();
  ctx.fillStyle = rgba(palette.MUTED, CHARGING_ALPHA);
  ctx.fillRect(x, y, width, BOSS_BAR_HEIGHT);
  // 2페이즈는 경고색(하락/적 색)으로 넘어간다 — 1페이즈는 같은 계열의 낮은 채도.
  ctx.fillStyle = phase2 ? palette.ENEMY_DOWN : rgba(palette.ENEMY_DOWN, 0.65);
  ctx.fillRect(x, y, width * ratio, BOSS_BAR_HEIGHT);

  ctx.font = HUD_FONT;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  ctx.fillStyle = phase2 ? palette.ENEMY_DOWN : palette.MUTED;
  ctx.fillText(BOSS_IDENTITY.displayName, x - BOSS_LABEL_GAP, midY);
  ctx.restore();
}

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

  drawBossBar(ctx, palette, layout, state);

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
