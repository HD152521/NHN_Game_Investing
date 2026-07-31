/**
 * 타워 슬롯 그리기 — 빈 슬롯(점선 윤곽) · 종류별 실루엣(단일표적/대공/광역) ·
 * 업그레이드(level 2) 강조 · 선택된 슬롯 하이라이트 · 레인 조준 표시 · 빈 슬롯 미리보기.
 *
 * 종류별 실루엣은 스프라이트가 없는 상태에서도 성격이 드러나도록 모양을 다르게 한다:
 *   - basic  : 사각 몸통 + 포신 하나(단일표적)
 *   - antiair: 위로 솟은 뾰족한 스파이크(하늘을 노림)
 *   - splash : 넓게 퍼진 사다리꼴 포신(광역)
 *
 * ★ 레인 조준 표시(FR-6.2 UX 보완): 대공 포대만 공중을 잡고 나머지는 지상만 잡는데
 *   화면에 이 사실이 드러나지 않아 "공중 적을 못 잡는" 사고가 반복됐다. 지어진 타워마다
 *   담당 레인(공중/지상) 쪽으로 조준선 + 마커를 그려 한눈에 알 수 있게 한다.
 */

import type { CombatState, Tower, TowerKind } from '../combat/types.js';
import type { Palette } from '../design/index.js';
import type { BattleLayout, Rect } from './layout.js';
import { slotRect } from './layout.js';
import { rgba } from './style.js';
import type { BattleCtx } from './surface.js';

const EMPTY_SLOT_DASH: readonly number[] = [4, 4];
const SELECTED_DASH: readonly number[] = [3, 2];
const EMPTY_SLOT_LINE_WIDTH = 1;
const SELECTED_LINE_WIDTH = 2;
const UPGRADE_OUTLINE_LINE_WIDTH = 2;
/** 업그레이드 강조 점(원) 반지름(px). */
const UPGRADE_DOT_RADIUS = 3;
const FULL_CIRCLE_START = 0;
const FULL_CIRCLE_END = Math.PI * 2;
/** basic 포신(터렛) 반지름 — 슬롯 폭 대비 비율. */
const TURRET_RADIUS_RATIO = 0.22;
/** 조준선 굵기(px). */
const AIM_LINE_WIDTH = 1.5;
/** 조준선 끝 마커(원) 반지름(px). */
const AIM_MARKER_RADIUS = 2.5;
/** 빈 슬롯 미리보기 실루엣 투명도. */
const PREVIEW_ALPHA = 0.35;

function drawEmptySlot(ctx: BattleCtx, palette: Palette, rect: Rect, isSelected: boolean): void {
  ctx.save();
  ctx.strokeStyle = isSelected ? palette.GOLD : palette.MUTED;
  ctx.lineWidth = isSelected ? SELECTED_LINE_WIDTH : EMPTY_SLOT_LINE_WIDTH;
  ctx.setLineDash([...(isSelected ? SELECTED_DASH : EMPTY_SLOT_DASH)]);
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
}

/** 타워 실루엣 그리기 함수 시그니처 — 미리보기(반투명)와 실제 타워가 같은 모양 로직을 공유한다. */
type ShapeDrawer = (ctx: BattleCtx, rect: Rect, bodyColor: string, accentColor: string) => void;

/** 단일표적 타워 — 사각 몸통 + 중앙 포신(원). */
function drawBasicShape(ctx: BattleCtx, rect: Rect, bodyColor: string, accentColor: string): void {
  ctx.fillStyle = bodyColor;
  ctx.fillRect(rect.x, rect.y + rect.h * 0.35, rect.w, rect.h * 0.65);

  const turretRadius = Math.max(1, rect.w * TURRET_RADIUS_RATIO);
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h * 0.35;
  ctx.fillStyle = accentColor;
  ctx.beginPath();
  ctx.arc(cx, cy, turretRadius, FULL_CIRCLE_START, FULL_CIRCLE_END);
  ctx.fill();
}

/** 대공 타워 — 위로 솟은 스파이크(삼각형). */
function drawAntiairShape(ctx: BattleCtx, rect: Rect, bodyColor: string, accentColor: string): void {
  ctx.fillStyle = bodyColor;
  ctx.fillRect(rect.x, rect.y + rect.h * 0.55, rect.w, rect.h * 0.45);

  ctx.fillStyle = accentColor;
  ctx.beginPath();
  ctx.moveTo(rect.x + rect.w / 2, rect.y);
  ctx.lineTo(rect.x + rect.w * 0.8, rect.y + rect.h * 0.55);
  ctx.lineTo(rect.x + rect.w * 0.2, rect.y + rect.h * 0.55);
  ctx.closePath();
  ctx.fill();
}

/** 광역 타워 — 넓게 퍼진 사다리꼴 포신. */
function drawSplashShape(ctx: BattleCtx, rect: Rect, bodyColor: string, accentColor: string): void {
  ctx.fillStyle = bodyColor;
  ctx.fillRect(rect.x, rect.y + rect.h * 0.5, rect.w, rect.h * 0.5);

  ctx.fillStyle = accentColor;
  ctx.beginPath();
  ctx.moveTo(rect.x + rect.w * 0.1, rect.y + rect.h * 0.5);
  ctx.lineTo(rect.x + rect.w * 0.9, rect.y + rect.h * 0.5);
  ctx.lineTo(rect.x + rect.w, rect.y + rect.h * 0.1);
  ctx.lineTo(rect.x, rect.y + rect.h * 0.1);
  ctx.closePath();
  ctx.fill();
}

const SHAPE_BY_KIND: Readonly<Record<TowerKind, ShapeDrawer>> = {
  basic: drawBasicShape,
  antiair: drawAntiairShape,
  splash: drawSplashShape,
};

/** 업그레이드(level 2) 강조 — GOLD 외곽선 + 우상단 점. 재화 색과 진영 색을 혼동하지 않도록 GOLD만 사용. */
function drawUpgradeAccent(ctx: BattleCtx, palette: Palette, rect: Rect): void {
  ctx.save();
  ctx.strokeStyle = palette.GOLD;
  ctx.lineWidth = UPGRADE_OUTLINE_LINE_WIDTH;
  ctx.setLineDash([]);
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

  ctx.fillStyle = palette.GOLD;
  ctx.beginPath();
  ctx.arc(rect.x + rect.w - UPGRADE_DOT_RADIUS, rect.y + UPGRADE_DOT_RADIUS, UPGRADE_DOT_RADIUS, FULL_CIRCLE_START, FULL_CIRCLE_END);
  ctx.fill();
  ctx.restore();
}

function drawSelectionHighlight(ctx: BattleCtx, palette: Palette, rect: Rect): void {
  ctx.save();
  ctx.strokeStyle = palette.GOLD;
  ctx.lineWidth = SELECTED_LINE_WIDTH;
  ctx.setLineDash([...SELECTED_DASH]);
  ctx.strokeRect(rect.x - 2, rect.y - 2, rect.w + 4, rect.h + 4);
  ctx.restore();
}

/**
 * 타워가 담당하는 레인(대공은 공중, 나머지는 지상 — FR-6.2)을 향해 조준선 + 마커를 그린다.
 * 슬롯 줄(towerRowY)은 공중과 지상 사이에 있으므로, 선이 위/아래 어느 쪽으로 뻗는지만으로도
 * "이 타워가 뭘 잡는지"가 드러난다.
 */
function drawLaneAimIndicator(ctx: BattleCtx, palette: Palette, layout: BattleLayout, rect: Rect, kind: TowerKind): void {
  const isAirDefender = kind === 'antiair';
  const targetY = isAirDefender ? layout.airY : layout.groundY;
  const cx = rect.x + rect.w / 2;
  const startY = isAirDefender ? rect.y : rect.y + rect.h;

  ctx.save();
  ctx.strokeStyle = palette.UP_DEEP;
  ctx.lineWidth = AIM_LINE_WIDTH;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(cx, startY);
  ctx.lineTo(cx, targetY);
  ctx.stroke();

  ctx.fillStyle = palette.UP_DEEP;
  ctx.beginPath();
  ctx.arc(cx, targetY, AIM_MARKER_RADIUS, FULL_CIRCLE_START, FULL_CIRCLE_END);
  ctx.fill();
  ctx.restore();
}

function drawTowerAt(ctx: BattleCtx, palette: Palette, layout: BattleLayout, rect: Rect, tower: Tower): void {
  const draw = SHAPE_BY_KIND[tower.kind];
  draw(ctx, rect, palette.UP_ALLY, palette.UP_DEEP);
  if (tower.level === 2) {
    drawUpgradeAccent(ctx, palette, rect);
  }
  drawLaneAimIndicator(ctx, palette, layout, rect, tower.kind);
}

/** 빈 슬롯 미리보기 — 툴바에서 고른 타워 종류를 반투명 실루엣으로 먼저 보여준다. */
function drawEmptySlotPreview(ctx: BattleCtx, palette: Palette, rect: Rect, kind: TowerKind): void {
  const draw = SHAPE_BY_KIND[kind];
  draw(ctx, rect, rgba(palette.UP_ALLY, PREVIEW_ALPHA), rgba(palette.UP_DEEP, PREVIEW_ALPHA));
}

export function drawTowers(
  ctx: BattleCtx,
  palette: Palette,
  layout: BattleLayout,
  state: CombatState,
  selectedSlot: number | null,
  selectedTowerKind: TowerKind | null,
): void {
  const towerSlots = state.towerSlots;
  if (towerSlots <= 0) return;

  for (let slot = 0; slot < towerSlots; slot += 1) {
    const rect = slotRect(slot, layout, towerSlots);
    const tower = state.towers.find((t) => t.slot === slot);
    const isSelected = selectedSlot === slot;

    if (!tower) {
      drawEmptySlot(ctx, palette, rect, isSelected);
      if (isSelected && selectedTowerKind !== null) {
        drawEmptySlotPreview(ctx, palette, rect, selectedTowerKind);
      }
      continue;
    }

    drawTowerAt(ctx, palette, layout, rect, tower);
    if (isSelected) {
      drawSelectionHighlight(ctx, palette, rect);
    }
  }
}
