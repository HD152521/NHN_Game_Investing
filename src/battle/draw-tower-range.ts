/**
 * 선택/호버 중인 타워 슬롯의 사거리를 x=0(아군 사옥)부터 사거리 값까지의 띠로 보여준다.
 *
 * 타워마다 사거리가 다르고(§combat/constants TOWER_RANGE), 평소 화면에는 표시하지
 * 않다가 슬롯을 선택(호버)했을 때만 보여줘 화면이 복잡해지지 않게 한다.
 */

import { TOWER_RANGE, towerX } from '../combat/index.js';
import type { CombatState, Lane, TowerKind } from '../combat/types.js';
import type { Palette } from '../design/index.js';
import { laneY, progressToX } from './layout.js';
import type { BattleLayout } from './layout.js';
import { rgba } from './style.js';
import type { BattleCtx } from './surface.js';

const RANGE_FILL_ALPHA = 0.16;
const RANGE_BORDER_ALPHA = 0.7;
const RANGE_BORDER_WIDTH = 1;
/** 전장(HUD 제외) 높이 대비 사거리 띠 두께 비율. */
const RANGE_BAND_HEIGHT_RATIO = 0.18;
const RANGE_BAND_MIN_HEIGHT = 6;

/** 타워 종류가 담당하는 레인 — antiair만 공중, 나머지는 지상(FR-6.2). */
function laneForKind(kind: TowerKind): Lane {
  return kind === 'antiair' ? 'air' : 'ground';
}

/** 선택된 슬롯의 타워 종류를 정한다 — 이미 지어졌으면 그 종류, 빈 슬롯이면 미리보기 종류. */
function resolveKind(state: CombatState, selectedSlot: number, previewKind: TowerKind | null): TowerKind | null {
  const existing = state.towers.find((tower) => tower.slot === selectedSlot);
  if (existing) return existing.kind;
  return previewKind;
}

/**
 * 선택된 슬롯의 사거리 띠를 그린다. `selectedSlot`이 없거나, 빈 슬롯인데
 * `previewKind`도 없으면 아무것도 그리지 않는다.
 */
export function drawTowerRangePreview(
  ctx: BattleCtx,
  palette: Palette,
  layout: BattleLayout,
  state: CombatState,
  selectedSlot: number | null,
  previewKind: TowerKind | null,
): void {
  if (selectedSlot === null) return;

  const kind = resolveKind(state, selectedSlot, previewKind);
  if (kind === null) return;

  // 커버 상한은 **타워 자기 위치 기준**이다: `enemy.x - towerX(slot) <= range`
  // (`combat/mechanics.ts applyTowerFire`). 슬롯이 앞설수록 띠가 그만큼 길어진다 —
  // 예전에는 슬롯과 무관하게 항상 `[0, range]`를 그려, 어느 슬롯을 골라도 미리보기가
  // 똑같아 보였다(= 배치 결정이 화면에 드러나지 않았다).
  const reach = towerX(selectedSlot) + TOWER_RANGE[kind];
  const y = laneY(laneForKind(kind), layout);
  const bandHeight = Math.max(
    RANGE_BAND_MIN_HEIGHT,
    (layout.battlefieldBottom - layout.battlefieldTop) * RANGE_BAND_HEIGHT_RATIO,
  );
  // 시작점이 타워 위치가 아니라 0인 이유: 타워를 지나쳐 본진 쪽으로 간 적도 계속 표적이
  // 되므로(음수 거리도 `<= range`), 실제 커버 구간은 `[0, reach]`다.
  const xStart = progressToX(0, layout);
  const xEnd = progressToX(reach, layout);
  const width = Math.max(0, xEnd - xStart);
  if (width <= 0) return;

  ctx.save();
  ctx.setLineDash([]);
  ctx.fillStyle = rgba(palette.GOLD, RANGE_FILL_ALPHA);
  ctx.fillRect(xStart, y - bandHeight / 2, width, bandHeight);

  ctx.strokeStyle = rgba(palette.GOLD, RANGE_BORDER_ALPHA);
  ctx.lineWidth = RANGE_BORDER_WIDTH;
  ctx.strokeRect(xStart, y - bandHeight / 2, width, bandHeight);
  ctx.restore();
}
