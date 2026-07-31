/**
 * HP 바 하나만 담당하는 작은 그리기 유틸.
 *
 * 사옥·본진·유닛·적 전부 같은 모양(배경 + 비율 채움)을 공유하므로 여기 한 곳에 몰아둔다.
 */

import type { HexColor } from '../design/index.js';
import type { Palette } from '../design/index.js';
import type { BattleCtx } from './surface.js';
import { hpRatio } from './style.js';

export interface HpBarOptions {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly hp: number;
  readonly maxHp: number;
  /** 채움 색(진영 색). */
  readonly color: HexColor;
  readonly palette: Palette;
}

/** 배경(어두운 트랙) + 비율만큼 채운 막대. hp가 0이어도 트랙은 그려진다. */
export function drawHpBar(ctx: BattleCtx, opts: HpBarOptions): void {
  const { x, y, w, h, hp, maxHp, color, palette } = opts;
  if (w <= 0 || h <= 0) return;

  ctx.fillStyle = palette.LINE;
  ctx.fillRect(x, y, w, h);

  const ratio = hpRatio(hp, maxHp);
  if (ratio <= 0) return;

  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * ratio, h);
}
