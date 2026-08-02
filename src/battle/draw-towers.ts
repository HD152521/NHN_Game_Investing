/**
 * 타워 슬롯 그리기 — 받침(플랫폼) · 빈 슬롯(굵은 점선 윤곽 + 슬롯 번호) · 종류별 실루엣
 * (단일표적/대공/광역) · 업그레이드(level 2) 강조 · 선택된 슬롯 하이라이트 · 레인 조준 표시 ·
 * 빈 슬롯 미리보기.
 *
 * ★ 가시성 수정(플레이테스트: "포탑 슬롯도 안 보임"): 기존에는 1px 얇은 점선(MUTED, 배경과
 *   대비 5:1 남짓)만으로 슬롯을 표시해, 하늘/스카이라인 배경 위에서 쉽게 묻혔고 "여기를
 *   클릭하면 짓는다"는 정보(슬롯 번호)가 아예 없었다. 이제:
 *   굵고 밝은(TEXT) 점선 윤곽 + 슬롯 번호를 그려 "빈 슬롯 = 클릭 가능한 건설 자리"라는
 *   정보를 명확히 전달한다.
 *
 * ★ 받침(불투명 LINE 판) 제거: 배경이 무엇이든 일정한 바탕을 만들려고 슬롯마다 어두운
 *   판을 깔았었는데, 타워 스프라이트가 37~47% 투명이라 배경이 비쳐야 할 자리를 그 판이
 *   전부 덮었다("포탑 뒤가 너무 검어서 안 보인다"). 슬롯 위치 표시는 `drawSlotDecals`
 *   (디자인 원본 `tf-gnd-slot` 3상태)가 맡는다.
 *
 * 종류별 그림은 디자인 원본의 `towerBasic` / `towerAA` / `towerSplash` 스프라이트를
 * 그대로 쓴다(`src/sprites/tower.ts`, 매핑은 `entity-sprites.ts`). 예전에는 시트의 *글로 된
 * 묘사*만 보고 `src/battle/shapes/tower-shapes.ts`에서 도형을 새로 발명했는데, 그래서 화면이
 * 디자인과 달랐다(PLAN Step 3). 이 파일은 배치·상태 표시만 담당한다.
 * 외곽선(LINE 토큰)은 스프라이트 그리드가 `outline('0')`으로 이미 갖고 있다 — 배경과의
 * 분리는 원본 픽셀 안에서 해결된다.
 *
 * ★ 레인 조준 표시(FR-6.2 UX 보완): 대공 포대만 공중을 잡고 나머지는 지상만 잡는데
 *   화면에 이 사실이 드러나지 않아 "공중 적을 못 잡는" 사고가 반복됐다. 지어진 타워마다
 *   담당 레인(공중/지상) 쪽으로 조준선 + 마커를 그려 한눈에 알 수 있게 한다.
 */

import { TOWER_COOLDOWN_MS } from '../combat/index.js';
import type { CombatState, Tower, TowerKind } from '../combat/types.js';
import type { Palette } from '../design/index.js';
import { TOWER_FIRE_BODY_ORIGIN } from '../sprites/tower-anim';
import { entityAnimFrameAt, entityAnimFrameRaster, spriteRasters } from '../sprites/render/index.js';
import type { EntityAnimId, SpriteRaster } from '../sprites/render/index.js';
import { drawSpriteStanding, drawSpriteStandingFrame, syncSpriteColorMode } from './draw-sprite.js';
import { TOWER_SPRITES } from './entity-sprites.js';
import type { BattleLayout, Rect } from './layout.js';
import { slotRect } from './layout.js';
import { rgba } from './style.js';
import type { BattleCtx } from './surface.js';

const EMPTY_SLOT_DASH: readonly number[] = [7, 4];
const SELECTED_DASH: readonly number[] = [6, 3];
/** 굵은 점선 윤곽 — 기존 1px에서 대폭 굵혀 배경 위에서도 확실히 읽히게 한다. */
const EMPTY_SLOT_LINE_WIDTH = 2.5;
const SELECTED_LINE_WIDTH = 3;
const UPGRADE_OUTLINE_LINE_WIDTH = 2;
/** 업그레이드 강조 점(원) 반지름(px). */
const UPGRADE_DOT_RADIUS = 3;
const FULL_CIRCLE_START = 0;
const FULL_CIRCLE_END = Math.PI * 2;
/** 조준선 굵기(px). */
const AIM_LINE_WIDTH = 1.5;
/** 조준선 끝 마커(원) 반지름(px). */
const AIM_MARKER_RADIUS = 2.5;
/**
 * 빈 슬롯 미리보기를 "아직 없는 것"으로 읽히게 하는 어둡게 덮기(불투명도).
 *
 * 스프라이트는 굽는 시점에 알파가 정해지므로 예전처럼 `rgba(...)` 반투명 채움으로 실루엣을
 * 그릴 수 없다. 대신 **실제 타워 그림을 그대로 그린 뒤 슬롯 위에 어두운 반투명 판을 덮어**
 * 흐리게 만든다 — 어떤 타워가 지어질지(종류 정보)는 그대로 남고, 지어진 타워와는 확실히
 * 구분된다.
 */
const PREVIEW_DIM_ALPHA = 0.55;
/** 받침(플랫폼)이 슬롯 사각형보다 사방으로 얼마나 더 넓게 깔리는지(px). */
const PLATFORM_PADDING = 6;
const SLOT_NUMBER_FONT = 'bold 12px monospace';
/** 슬롯 번호 텍스트를 슬롯 하단에서 얼마나 띄우는지(px). */
const SLOT_NUMBER_BOTTOM_PADDING = 4;

/** 빈 슬롯 굵은 점선 윤곽 — 기본은 TEXT(밝은 중립색), 선택 시 GOLD로 확실히 구분한다. */
function drawEmptySlotOutline(ctx: BattleCtx, palette: Palette, rect: Rect, isSelected: boolean): void {
  ctx.save();
  ctx.strokeStyle = isSelected ? palette.GOLD : palette.TEXT;
  ctx.lineWidth = isSelected ? SELECTED_LINE_WIDTH : EMPTY_SLOT_LINE_WIDTH;
  ctx.setLineDash([...(isSelected ? SELECTED_DASH : EMPTY_SLOT_DASH)]);
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
}

/** 빈 슬롯 한가운데에 1-based 슬롯 번호를 표시해 "여기 클릭하면 지어진다"를 명확히 한다. */
function drawSlotNumber(ctx: BattleCtx, palette: Palette, rect: Rect, slot: number): void {
  ctx.save();
  ctx.font = SLOT_NUMBER_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = palette.TEXT;
  ctx.fillText(String(slot + 1), rect.x + rect.w / 2, rect.y + rect.h - SLOT_NUMBER_BOTTOM_PADDING);
  ctx.restore();
}

/**
 * 종류별 스프라이트를 슬롯 받침 위에 세운다. 배율·좌표는 전부 인자로 받은 슬롯 사각형에서
 * 나온다(`drawSpriteStanding`) — 여기서 좌표를 새로 만들지 않는다.
 */
function drawTowerSprite(ctx: BattleCtx, rect: Rect, kind: TowerKind): void {
  drawSpriteStanding(ctx, TOWER_SPRITES[kind].key, rect, rect.y + rect.h);
}

/* ------------------------------------------------------------------ *
 * 발사 모션 · 티어2 (원본 갱신분 `tf-tfire-01~03` / `tf-t2-01~03`)
 *
 * ★ 상태를 새로 만들지 않는다 ★ 예광선(`draw-tracers.ts`)과 **완전히 같은 역산**을 쓴다:
 *   `Tower.cooldownMs` 가 막 `TOWER_COOLDOWN_MS[kind]` 로 리셋된 직후가 발사 구간이다.
 *   두 계층이 같은 창(70~100%)을 쓰므로 포신 반동과 탄이 어긋나지 않는다.
 *
 * ★ 티어2 는 `tower.level === 2` 로 **바로** 판별된다(역산 불필요).
 *   원본 `towerFire(kind, f, t2)` 가 파라메트릭이라, 레벨 2 는 같은 4프레임 위에 금색 장식이
 *   얹힌 조합이다 — 원본 키 `tf-t2-*` 는 그중 f 0 한 장이다. 지어져 있기만 하면 늘 장식이
 *   보이고, 쏠 때는 장식을 유지한 채 포신이 움직인다.
 * ------------------------------------------------------------------ */

/** 쿨다운이 최댓값의 이 비율을 넘으면 "막 발사함" — `draw-tracers.ts` 와 같은 값이라야 그림이 맞는다. */
const FIRE_ANIM_COOLDOWN_RATIO = 0.7;

/** 타워 종류 → 발사 모션 id. 레벨 1/2 는 같은 프레임 세트의 장식 유무 차이다. */
const TOWER_FIRE_ANIM: Readonly<Record<TowerKind, readonly [EntityAnimId, EntityAnimId]>> = {
  /** T-01 지지선 앵커포 — 원본 `towerFire(1, …)`. */
  basic: ['tfire-01-l1', 'tfire-01-l2'],
  /** T-02 공시 리피터 — 원본 `towerFire(2, …)`. 유일하게 위로 쏘므로 반동이 없다. */
  antiair: ['tfire-02-l1', 'tfire-02-l2'],
  /** T-03 물타기 살포기 — 원본 `towerFire(3, …)`. */
  splash: ['tfire-03-l1', 'tfire-03-l2'],
};

function towerFireAnim(tower: Tower): EntityAnimId {
  const pair = TOWER_FIRE_ANIM[tower.kind];
  return tower.level === 2 ? pair[1] : pair[0];
}

/**
 * 발사 재생 진행도(0~1). 재생 구간이 아니면 `null`.
 * `cooldownMs` 는 발사 직후 최댓값으로 리셋되고 0 을 향해 줄어든다 —
 * 경과 = `max - cooldownMs` 이고 창 길이는 `max × (1 - 비율)` 이다.
 */
export function towerFireProgress(tower: Tower): number | null {
  const max = TOWER_COOLDOWN_MS[tower.kind];
  const window = max * (1 - FIRE_ANIM_COOLDOWN_RATIO);
  if (window <= 0) return null;
  const elapsed = max - tower.cooldownMs;
  if (elapsed < 0 || elapsed >= window) return null;
  return elapsed / window;
}

/**
 * 지금 이 타워가 보여야 할 프레임.
 *
 * 레벨 2 는 **쉬는 동안에도** 프레임 0(= 원본 `tf-t2-*`)을 보여야 장식이 계속 보인다.
 * 레벨 1 은 쉬는 동안 정지 스프라이트를 그대로 쓴다(`null`).
 */
function towerFrameRaster(tower: Tower): SpriteRaster | null {
  const progress = towerFireProgress(tower);
  if (progress === null && tower.level !== 2) return null;
  const anim = towerFireAnim(tower);
  const index = progress === null ? 0 : entityAnimFrameAt(anim, progress);
  return entityAnimFrameRaster(spriteRasters, anim, index);
}

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
  drawSpriteStandingFrame(
    ctx,
    TOWER_SPRITES[tower.kind].key,
    towerFrameRaster(tower),
    rect,
    rect.y + rect.h,
    TOWER_FIRE_BODY_ORIGIN.x,
    TOWER_FIRE_BODY_ORIGIN.y,
  );
  if (tower.level === 2) {
    drawUpgradeAccent(ctx, palette, rect);
  }
  drawLaneAimIndicator(ctx, palette, layout, rect, tower.kind);
}

/** 빈 슬롯 미리보기 — 툴바에서 고른 타워를 그린 뒤 어둡게 덮어 "예정"으로 읽히게 한다. */
function drawEmptySlotPreview(ctx: BattleCtx, palette: Palette, rect: Rect, kind: TowerKind): void {
  drawTowerSprite(ctx, rect, kind);

  ctx.save();
  ctx.fillStyle = rgba(palette.BG_0, PREVIEW_DIM_ALPHA);
  ctx.fillRect(rect.x - PLATFORM_PADDING, rect.y - PLATFORM_PADDING, rect.w + PLATFORM_PADDING * 2, rect.h + PLATFORM_PADDING * 2);
  ctx.restore();
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

  syncSpriteColorMode(palette);

  for (let slot = 0; slot < towerSlots; slot += 1) {
    const rect = slotRect(slot, layout, towerSlots);
    const tower = state.towers.find((t) => t.slot === slot);
    const isSelected = selectedSlot === slot;

    if (!tower) {
      // 미리보기는 윤곽선·슬롯 번호보다 **먼저** — 어둡게 덮는 판이 그 둘을 흐리지 않게 한다.
      if (isSelected && selectedTowerKind !== null) {
        drawEmptySlotPreview(ctx, palette, rect, selectedTowerKind);
      }
      drawEmptySlotOutline(ctx, palette, rect, isSelected);
      drawSlotNumber(ctx, palette, rect, slot);
      continue;
    }

    drawTowerAt(ctx, palette, layout, rect, tower);
    if (isSelected) {
      drawSelectionHighlight(ctx, palette, rect);
    }
  }
}
