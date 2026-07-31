/**
 * 전장 렌더러 진입점. `drawBattle` 하나가 배경 · 사옥/본진 · 타워 슬롯 · 적 · 아군 유닛 ·
 * HUD(웨이브·스킬 게이지)를 순서대로 그린다.
 *
 * `src/chart/chart.ts`의 `drawChart`와 같은 패턴이다: "무엇을 어떤 순서로 그리는가"만
 * 안다. 좌표 계산(`layout.ts`)과 개별 그리기(`draw-*.ts`)는 전부 위임한다.
 */

import type { CombatState } from '../combat/types.js';
import type { Palette } from '../design/index.js';
import { drawBackground } from './draw-background.js';
import { drawHud } from './draw-hud.js';
import { drawEnemyBase, drawHq } from './draw-structures.js';
import { drawTowers } from './draw-towers.js';
import { drawAllies, drawEnemies } from './draw-units.js';
import { computeBattleLayout } from './layout.js';
import type { BattleCtx } from './surface.js';

export interface DrawBattleOptions {
  readonly state: CombatState;
  readonly palette: Palette;
  readonly width: number;
  readonly height: number;
  /** 호버/선택된 타워 슬롯 인덱스. 없으면 강조 없음. */
  readonly selectedSlot?: number | null;
}

/** 전장 한 프레임을 그린다. 적/유닛 0명, 캔버스 극소 크기에서도 크래시하지 않아야 한다. */
export function drawBattle(ctx: BattleCtx, opts: DrawBattleOptions): void {
  const { state, palette, width, height } = opts;
  const selectedSlot = opts.selectedSlot ?? null;
  const layout = computeBattleLayout(width, height);

  drawBackground(ctx, palette, layout);
  drawHq(ctx, palette, layout, state);
  drawEnemyBase(ctx, palette, layout);
  drawTowers(ctx, palette, layout, state, selectedSlot);
  drawEnemies(ctx, palette, layout, state.enemies);
  drawAllies(ctx, palette, layout, state.units);
  drawHud(ctx, palette, layout, state);
}
