/**
 * 배경 레이어 — BG_0(원경) · BG_1(중경 스카이라인) · BG_2(지면)로 층을 나눠 그린다.
 *
 * 평평한 단색 배경을 피하기 위해, 결정적(deterministic)인 수식으로 중경 건물
 * 실루엣 높이를 계산한다 — 매 프레임 같은 모양이 나오되(랜덤 아님), 밋밋하지 않다.
 */

import type { Palette } from '../design/index.js';
import type { BattleLayout } from './layout.js';
import type { BattleCtx } from './surface.js';

/** 중경 스카이라인 건물 개수. */
const SKYLINE_COUNT = 7;
/** 건물 높이 변화 폭 — 전장 높이 대비 비율. */
const SKYLINE_HEIGHT_RATIO = 0.22;
/** 건물 최소 높이 — 전장 높이 대비 비율(변화 폭과 더해져 실제 높이가 된다). */
const SKYLINE_BASE_RATIO = 0.08;
/** 지면(BG_2) 층이 지상 레인 위로 얼마나 올라오는지(px). */
const GROUND_BAND_RISE = 18;

/** 건물 인덱스로부터 결정적 높이 비율(0~1)을 뽑아낸다 — 시드 랜덤 대신 사인 곡선. */
function skylineHeightRatio(index: number): number {
  return Math.abs(Math.sin(index * 1.9 + 0.5));
}

export function drawBackground(ctx: BattleCtx, palette: Palette, layout: BattleLayout): void {
  // 원경(하늘) — 캔버스 전체.
  ctx.fillStyle = palette.BG_0;
  ctx.fillRect(0, 0, layout.width, layout.height);

  // 중경 스카이라인 — 전장 영역 하단에 걸쳐진 건물 실루엣.
  const bandTop = layout.battlefieldTop;
  const bandBottom = layout.groundY;
  const bandHeight = Math.max(0, bandBottom - bandTop);
  if (bandHeight > 0 && layout.width > 0) {
    ctx.fillStyle = palette.BG_1;
    const buildingWidth = layout.width / SKYLINE_COUNT;
    for (let i = 0; i < SKYLINE_COUNT; i += 1) {
      const heightRatio = SKYLINE_BASE_RATIO + skylineHeightRatio(i) * SKYLINE_HEIGHT_RATIO;
      const buildingHeight = bandHeight * heightRatio;
      const x = i * buildingWidth;
      const y = bandBottom - buildingHeight;
      ctx.fillRect(x, y, buildingWidth, buildingHeight);
    }
  }

  // 지면 — 지상 레인부터 캔버스 하단까지.
  const groundTop = Math.max(layout.battlefieldTop, layout.groundY - GROUND_BAND_RISE);
  const groundHeight = Math.max(0, layout.height - groundTop);
  if (groundHeight > 0) {
    ctx.fillStyle = palette.BG_2;
    ctx.fillRect(0, groundTop, layout.width, groundHeight);
  }
}
