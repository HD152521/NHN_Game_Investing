/**
 * 타워 슬롯 3상태 데칼 — 아트-프로덕션시트 §02.
 *
 * ★ 판정은 여기 없다. `src/ground`의 `classifySlotDecal`(순수 함수)이 골드·점유로 상태를
 *   정하고, 이 파일은 그 상태를 형태로 옮기기만 한다. `draw-weather.ts`와 같은 구조다.
 *
 * ★ `draw-towers.ts`의 빈 슬롯 윤곽선과 **다른 레이어**다. 저건 타워가 설 자리(공중과
 *   지상 사이 슬롯 줄)에 붙는 건설 어포던스이고, 이 데칼은 시트가 말하는 "발판 위에
 *   얹는 데칼" — 발판 평면에 눕는 **발자국(footprint)** 이다. 그래서 원근도 발판과 같게
 *   납작하고, 겹치지 않는다.
 *
 * 형태(시트 그대로, 글자 없음):
 *   - 비활성   → 점선 사각
 *   - 배치 가능 → 적색 실선 + 코너 브래킷
 *   - 배치 불가 → 회색 사선 해칭
 */

import { TOWER_BUILD_COST } from '../combat/index.js';
import type { CombatState, TowerKind } from '../combat/types.js';
import type { Palette } from '../design/index.js';
import { classifySlotDecal } from '../ground/index.js';
import type { SlotDecalState } from '../ground/index.js';
import { groundSurfaceY } from './draw-ground.js';
import type { BattleLayout, Rect } from './layout.js';
import { slotRect } from './layout.js';
import type { BattleCtx } from './surface.js';

/** 데칼 높이 — 발판 띠 높이 대비 비율. 발판과 같은 원근으로 눕히려면 납작해야 한다. */
const DECAL_HEIGHT_RATIO = 0.34;
/** 데칼 높이 상한(px) — 캔버스가 커져도 발자국이 세로로 커지지 않게 막는다. */
const DECAL_HEIGHT_MAX = 26;
/** 데칼을 발판 상단 모서리에서 얼마나 내려 놓는지(px) — 지면선을 가리지 않게 한다. */
const DECAL_SURFACE_INSET = 4;

const INACTIVE_DASH: readonly number[] = [5, 4];
const INACTIVE_LINE_WIDTH = 1.5;
const PLACEABLE_LINE_WIDTH = 2;
/** 코너 브래킷 한 변의 길이 — 데칼 짧은 변 대비 비율. */
const BRACKET_RATIO = 0.34;
const BRACKET_LINE_WIDTH = 3;
/** 사선 해칭 간격(px). */
const HATCH_STEP = 8;
const HATCH_LINE_WIDTH = 1.5;

/**
 * 슬롯 인덱스 → 발판 위 데칼 사각형.
 *
 * 가로는 슬롯과 같은 열에 정렬하고, 세로는 발판 상단 모서리 바로 아래에 납작하게 눕힌다.
 */
export function slotDecalRect(slot: number, layout: BattleLayout, towerSlots: number): Rect {
  const column = slotRect(slot, layout, towerSlots);
  const surfaceY = groundSurfaceY(layout);
  const bandHeight = Math.max(0, layout.height - surfaceY);
  const height = Math.min(DECAL_HEIGHT_MAX, Math.max(0, bandHeight * DECAL_HEIGHT_RATIO));

  return { x: column.x, y: surfaceY + DECAL_SURFACE_INSET, w: column.w, h: height };
}

/** 비활성 — 점선 사각. */
function drawInactive(ctx: BattleCtx, palette: Palette, rect: Rect): void {
  ctx.strokeStyle = palette.MUTED;
  ctx.lineWidth = INACTIVE_LINE_WIDTH;
  ctx.setLineDash([...INACTIVE_DASH]);
  ctx.beginPath();
  ctx.moveTo(rect.x, rect.y);
  ctx.lineTo(rect.x + rect.w, rect.y);
  ctx.lineTo(rect.x + rect.w, rect.y + rect.h);
  ctx.lineTo(rect.x, rect.y + rect.h);
  ctx.closePath();
  ctx.stroke();
}

/** 모서리 하나에 ㄱ자 브래킷을 긋는다. `dirX`/`dirY`는 안쪽 방향(±1). */
function drawBracket(ctx: BattleCtx, x: number, y: number, size: number, dirX: number, dirY: number): void {
  ctx.beginPath();
  ctx.moveTo(x + size * dirX, y);
  ctx.lineTo(x, y);
  ctx.lineTo(x, y + size * dirY);
  ctx.stroke();
}

/** 배치 가능 — 적색 실선 + 코너 브래킷 4개. */
function drawPlaceable(ctx: BattleCtx, palette: Palette, rect: Rect): void {
  ctx.strokeStyle = palette.UP_ALLY;
  ctx.setLineDash([]);

  ctx.lineWidth = PLACEABLE_LINE_WIDTH;
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

  const size = Math.min(rect.w, rect.h) * BRACKET_RATIO;
  ctx.lineWidth = BRACKET_LINE_WIDTH;
  const right = rect.x + rect.w;
  const bottom = rect.y + rect.h;
  drawBracket(ctx, rect.x, rect.y, size, 1, 1);
  drawBracket(ctx, right, rect.y, size, -1, 1);
  drawBracket(ctx, rect.x, bottom, size, 1, -1);
  drawBracket(ctx, right, bottom, size, -1, -1);
}

/**
 * 배치 불가 — 회색 45° 사선 해칭.
 *
 * `clip()`은 `BattleCtx`에 없으므로(테스트 가능한 최소 표면 유지) 선분을 사각형 경계에
 * 직접 잘라 넣는다. 45°라 x 이동량과 y 이동량이 같아 매개변수 t를 그대로 쓸 수 있다.
 */
function drawBlocked(ctx: BattleCtx, palette: Palette, rect: Rect): void {
  if (rect.w <= 0 || rect.h <= 0) return;

  ctx.strokeStyle = palette.MUTED;
  ctx.lineWidth = HATCH_LINE_WIDTH;
  ctx.setLineDash([]);

  const right = rect.x + rect.w;

  for (let start = rect.x - rect.h; start < right; start += HATCH_STEP) {
    // 선분: (start, rect.y) → (start + rect.h, bottom). x가 rect 밖인 구간을 잘라낸다.
    const fromX = Math.max(start, rect.x);
    const toX = Math.min(start + rect.h, right);
    if (toX <= fromX) continue;

    ctx.beginPath();
    ctx.moveTo(fromX, rect.y + (fromX - start));
    ctx.lineTo(toX, rect.y + (toX - start));
    ctx.stroke();
  }

  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
}

/** 데칼 하나를 그린다. 상태별 형태 분기는 여기 한 곳에만 있다. */
export function drawSlotDecal(ctx: BattleCtx, palette: Palette, rect: Rect, state: SlotDecalState): void {
  if (rect.w <= 0 || rect.h <= 0) return;

  ctx.save();
  switch (state) {
    case 'inactive':
      drawInactive(ctx, palette, rect);
      break;
    case 'placeable':
      drawPlaceable(ctx, palette, rect);
      break;
    case 'blocked':
      drawBlocked(ctx, palette, rect);
      break;
  }
  ctx.restore();
}

/**
 * 슬롯 전체의 데칼을 그린다. 배경·발판 직후, 타워보다 먼저 호출한다(발판 위에 눕는 층).
 *
 * @param gold              현재 보유 골드. 부족하면 슬롯이 '배치 불가'로 죽는다.
 * @param selectedTowerKind 툴바에서 고른 타워. `null`이면 전부 비활성.
 */
export function drawSlotDecals(
  ctx: BattleCtx,
  palette: Palette,
  layout: BattleLayout,
  state: CombatState,
  gold: number,
  selectedTowerKind: TowerKind | null,
): void {
  const towerSlots = state.towerSlots;
  if (towerSlots <= 0) return;

  const buildCost = selectedTowerKind === null ? null : TOWER_BUILD_COST[selectedTowerKind];

  for (let slot = 0; slot < towerSlots; slot += 1) {
    const isOccupied = state.towers.some((tower) => tower.slot === slot);
    const decalState = classifySlotDecal({ isOccupied, gold, buildCost });
    drawSlotDecal(ctx, palette, slotDecalRect(slot, layout, towerSlots), decalState);
  }
}
