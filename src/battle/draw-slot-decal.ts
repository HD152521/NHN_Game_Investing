/**
 * 타워 슬롯 3상태 데칼 — 클로드 디자인 스프라이트 `tf-gnd-slot` 으로 그린다 (PLAN Step 4).
 *
 * ★ 판정은 여기 없다. `src/ground`의 `classifySlotDecal`(순수 함수)이 골드·점유로 상태를
 *   정하고, 이 파일은 그 상태를 스프라이트 한 칸으로 옮기기만 한다.
 *
 * ★ 원본이 3상태를 어떻게 담고 있는가 (근거)
 *   `groundSlot()` 은 60×20 한 장에 `box()` 를 **세 번** 호출해 3상태를 가로로 나란히 넣는다:
 *
 *       box( 4, 'm', 'dot')     → 점선 사각      (x  4..17)
 *       box(24, 'r', 'bracket') → 실선 + 브래킷  (x 23..38, 'r' = UP_ALLY 적색)
 *       box(44, 'm', 'hatch')   → 사선 해칭      (x 44..57)
 *
 *   시트 §02 가 정의한 비활성 / 배치 가능 / 배치 불가와 **형태·색·순서가 그대로 일치**한다.
 *   그래서 시트를 20px 씩 3칸으로 잘라 상태별로 쓴다. 픽셀은 자르기만 하고 고치지 않는다.
 *
 * ★ 세로 자르기 위치
 *   시트는 데칼을 지면 위에 세워 보여준다 — 행 12 가 `'m'` 지면 모서리이고 그 아래가 발판
 *   단면(`'3'` = BG_2, 전장 지면 바탕과 같은 색)이다. 그래서 **행 12 를 지면선에 맞춰** 놓으면
 *   시트의 지면과 전장의 지면이 정확히 겹쳐 이질감이 없다.
 *
 * ★ 폴백: 캔버스를 못 만드는 환경에서는 예전 벡터 데칼(점선/브래킷/해칭)을 그린다.
 */

import { TOWER_BUILD_COST } from '../combat/index.js';
import type { CombatState, TowerKind } from '../combat/types.js';
import type { ColorMode, Palette } from '../design/index.js';
import { classifySlotDecal } from '../ground/index.js';
import type { SlotDecalState } from '../ground/index.js';
import { groundSlot } from '../sprites/index.js';
import type { SpriteGrid } from '../sprites/index.js';
import { drawSprite, snapScale, spriteRasters } from '../sprites/render/index.js';
import type { SpriteRaster, SpriteRasterCache } from '../sprites/render/index.js';
import { groundSurfaceY, spriteCtxOf } from './draw-background.js';
import type { BattleLayout, Rect } from './layout.js';
import { slotRect } from './layout.js';
import type { BattleCtx } from './surface.js';

/** 시트 한 칸의 폭(px, 1×). 60 ÷ 3 상태. */
export const CELL_WIDTH = 20;
/** 잘라 쓰는 첫 행 — 브래킷 상태의 위쪽 뿔(`x-1, 5`)이 여기서 시작한다. */
export const CELL_TOP = 5;
/** 잘라 쓰는 행 수 — 브래킷 아래쪽 뿔(행 16)까지 포함한다. */
export const CELL_HEIGHT = 12;
/** 잘라낸 칸 안에서 지면 모서리(`'m'`, 시트 행 12)가 놓인 행. */
export const CELL_RIM_ROW = 12 - CELL_TOP;

/** 상태 → 시트에서 잘라낼 칸의 좌측 x(1× 픽셀). 위 주석의 `box()` 호출 순서 그대로다. */
export const CELL_X = {
  inactive: 0,
  placeable: CELL_WIDTH,
  blocked: CELL_WIDTH * 2,
} as const satisfies Record<SlotDecalState, number>;

const CELL_IDS = {
  inactive: 'gnd-slot:inactive',
  placeable: 'gnd-slot:placeable',
  blocked: 'gnd-slot:blocked',
} as const satisfies Record<SlotDecalState, string>;

/** 시트에서 한 칸을 잘라낸다. 원본 행을 복사만 하고 문자는 바꾸지 않는다. */
function sliceCell(sheet: SpriteGrid, x: number): SpriteGrid {
  const cell: SpriteGrid = [];
  for (let row = CELL_TOP; row < CELL_TOP + CELL_HEIGHT; row += 1) {
    const source = sheet[row];
    if (source === undefined) continue;
    cell.push(source.slice(x, x + CELL_WIDTH));
  }
  return cell;
}

/** 3칸은 굽기 실패 시에만 다시 만들면 되므로 최초 요청 때 한 번만 자른다. */
let cells: Record<SlotDecalState, SpriteGrid> | null = null;

function cellGrid(state: SlotDecalState): SpriteGrid {
  if (cells === null) {
    const sheet = groundSlot();
    cells = {
      inactive: sliceCell(sheet, CELL_X.inactive),
      placeable: sliceCell(sheet, CELL_X.placeable),
      blocked: sliceCell(sheet, CELL_X.blocked),
    };
  }
  return cells[state];
}

/**
 * 잘라낸 칸은 43키가 아니라 파라메트릭 그리드다 — `raster()` 가 그리드를 인자로 받으므로
 * 캐시 앞에 메모를 한 겹 둬야 프레임당 자르기가 사라진다. 색약 토글은 `mode` 로 감지한다.
 */
interface RasterMemo {
  mode: ColorMode;
  readonly byId: Map<string, SpriteRaster | null>;
}

const decalMemos = new WeakMap<SpriteRasterCache, RasterMemo>();

function memoOf(cache: SpriteRasterCache): RasterMemo {
  const hit = decalMemos.get(cache);
  if (hit === undefined) {
    const created: RasterMemo = { mode: cache.mode, byId: new Map() };
    decalMemos.set(cache, created);
    return created;
  }
  if (hit.mode !== cache.mode) {
    hit.byId.clear();
    hit.mode = cache.mode;
  }
  return hit;
}

/** 상태 한 칸의 래스터. 상태당 1회만 굽는다. */
export function decalRaster(cache: SpriteRasterCache, state: SlotDecalState): SpriteRaster | null {
  const memo = memoOf(cache);
  const id = CELL_IDS[state];
  const hit = memo.byId.get(id);
  if (hit !== undefined) return hit;

  const built = cache.raster({ id, grid: cellGrid(state), composite: 'opaque' });
  memo.byId.set(id, built);
  return built;
}

/**
 * 슬롯 인덱스 → 데칼 사각형.
 *
 * 가로는 슬롯 열 중심에 맞추고, 세로는 시트의 지면 모서리 행이 전장 지면선에 오도록 올린다.
 * 배율은 슬롯 폭에서 뽑는 **정수 배율**이라 픽셀이 흐려지지 않는다.
 */
export function slotDecalRect(slot: number, layout: BattleLayout, towerSlots: number): Rect {
  const column = slotRect(slot, layout, towerSlots);
  const scale = snapScale(column.w / CELL_WIDTH);
  const w = CELL_WIDTH * scale;
  const h = CELL_HEIGHT * scale;

  return {
    x: column.x + (column.w - w) / 2,
    y: groundSurfaceY(layout) - CELL_RIM_ROW * scale,
    w,
    h,
  };
}

// ---------------------------------------------------------------------------
// 폴백 (캔버스 미지원) — 예전 벡터 데칼. 스프라이트를 구울 수 있으면 실행되지 않는다.
// ---------------------------------------------------------------------------

const INACTIVE_DASH: readonly number[] = [5, 4];
const INACTIVE_LINE_WIDTH = 1.5;
const PLACEABLE_LINE_WIDTH = 2;
/** 코너 브래킷 한 변의 길이 — 데칼 짧은 변 대비 비율. */
const BRACKET_RATIO = 0.34;
const BRACKET_LINE_WIDTH = 3;
/** 사선 해칭 간격(px). */
const HATCH_STEP = 8;
const HATCH_LINE_WIDTH = 1.5;

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

/** 배치 불가 — 회색 45° 사선 해칭. 선분을 사각형 경계에 직접 잘라 넣는다(`clip()` 없음). */
function drawBlocked(ctx: BattleCtx, palette: Palette, rect: Rect): void {
  if (rect.w <= 0 || rect.h <= 0) return;

  ctx.strokeStyle = palette.MUTED;
  ctx.lineWidth = HATCH_LINE_WIDTH;
  ctx.setLineDash([]);

  const right = rect.x + rect.w;

  for (let start = rect.x - rect.h; start < right; start += HATCH_STEP) {
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

function drawDecalFallback(ctx: BattleCtx, palette: Palette, rect: Rect, state: SlotDecalState): void {
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

export interface SlotDecalOptions {
  /** 래스터 캐시 주입구(테스트용). */
  readonly rasters?: SpriteRasterCache;
}

const NO_OPTIONS: SlotDecalOptions = {};

/** 데칼 하나를 그린다. 상태별 분기는 스프라이트 칸 선택(`CELL_X`) 한 곳에만 있다. */
export function drawSlotDecal(
  ctx: BattleCtx,
  palette: Palette,
  rect: Rect,
  state: SlotDecalState,
  options: SlotDecalOptions = NO_OPTIONS,
): void {
  if (rect.w <= 0 || rect.h <= 0) return;

  const spriteCtx = spriteCtxOf(ctx);
  if (spriteCtx !== null) {
    const raster = decalRaster(options.rasters ?? spriteRasters, state);
    if (raster !== null) {
      drawSprite(spriteCtx, raster, rect.x, rect.y, rect.w / CELL_WIDTH);
      return;
    }
  }

  drawDecalFallback(ctx, palette, rect, state);
}

/**
 * 슬롯 전체의 데칼을 그린다. 배경·발판 직후, 타워보다 먼저 호출한다(발판 위에 서는 층).
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
  options: SlotDecalOptions = NO_OPTIONS,
): void {
  const towerSlots = state.towerSlots;
  if (towerSlots <= 0) return;

  const buildCost = selectedTowerKind === null ? null : TOWER_BUILD_COST[selectedTowerKind];

  for (let slot = 0; slot < towerSlots; slot += 1) {
    const isOccupied = state.towers.some((tower) => tower.slot === slot);
    const decalState = classifySlotDecal({ isOccupied, gold, buildCost });
    drawSlotDecal(ctx, palette, slotDecalRect(slot, layout, towerSlots), decalState, options);
  }
}
