/**
 * 타워 3종 실루엣 (아트 프로덕션 시트 v1.1 §06) — 차콜 본체 + 적색 장갑 패널,
 * **조종사 없음**, 셋 다 동일한 정사각 베이스 플레이트 위에 선다.
 *
 * ★ 합격 조건: 세 실루엣이 한눈에 구분돼야 한다. 그래서 "장식이 다르다"가 아니라
 *   **바운딩 박스 비율 자체를 다르게** 설계했다(`tower-silhouette.test.ts`가 검증).
 *     앵커포   — 낮고 넓다(쐐기를 지면에 박는다)
 *     리피터   — 확실히 높고 얇다(수직 발사관이 베이스 위로 크게 솟는다)
 *     살포기   — 가장 뭉툭하다(나팔 총구가 좌우로 최대한 벌어진다)
 *
 * 타워는 진영이 아군(`rounded`)이므로 셋 다 원형 부품(앵커 릴 · 접시 · 탄통)을 하나씩
 * 가진다 — 이중 인코딩 규약(`primitives.ts`).
 *
 * 색을 인자로 받는 이유: 빈 슬롯 미리보기가 같은 모양을 반투명(rgba)으로 재사용한다.
 */

import type { Rect } from '../layout.js';
import type { BattleCtx } from '../surface.js';
import { DETAIL_LINE_WIDTH, fillCircle, fillQuad, fillRectPath, fillTriangle } from './primitives.js';

/**
 * 타워 한 종을 그리는 함수.
 * `chassis`=차콜 본체, `armor`=적색 장갑 패널, `accent`=음영, `line`=외곽선.
 */
export type TowerShapeDrawer = (
  ctx: BattleCtx,
  rect: Rect,
  chassis: string,
  armor: string,
  accent: string,
  line: string,
) => void;

/** 셋이 공유하는 정사각 베이스 플레이트 — 슬롯 크기와 무관하게 항상 정사각이다. */
const PLATE_SIDE_RATIO = 0.62;

function plateSide(rect: Rect): number {
  return Math.max(0, Math.min(rect.w, rect.h) * PLATE_SIDE_RATIO);
}

/** 세 타워가 공유하는 베이스 플레이트 사각형 — "동일한 베이스"를 테스트가 확인할 수 있게 연다. */
export function basePlateRect(rect: Rect): Rect {
  const side = plateSide(rect);
  return { x: rect.x + (rect.w - side) / 2, y: rect.y + rect.h - side, w: side, h: side };
}

function drawBasePlate(ctx: BattleCtx, rect: Rect, chassis: string, line: string): number {
  const plate = basePlateRect(rect);
  if (plate.w <= 0) return rect.y + rect.h;
  fillRectPath(ctx, plate.x, plate.y, plate.w, plate.h, chassis, line);
  return plate.y;
}

// ── T-01 지지선 앵커포 ────────────────────────────────────────────
const ANCHOR_BODY_LEFT = 0.2;
const ANCHOR_BODY_RIGHT = 0.62;
const ANCHOR_BODY_TOP = 0.44;
const ANCHOR_BARREL_TOP = 0.54;
const ANCHOR_BARREL_BOTTOM = 0.68;
const ANCHOR_BARREL_END = 0.98;
const ANCHOR_REEL_X = 0.4;
const ANCHOR_REEL_Y = 0.58;
const ANCHOR_REEL_RADIUS = 0.09;
const WEDGE_XS: readonly number[] = [0.2, 0.8];
const WEDGE_HALF_W = 0.07;
const WEDGE_DEPTH = 0.16;

/** 지면에 박은 쐐기 두 개 — 베이스 아래로 파고들어 "고정"을 알린다. */
function drawGroundWedges(ctx: BattleCtx, rect: Rect, armor: string, line: string, plateTop: number): void {
  const bottom = rect.y + rect.h;
  for (const ratio of WEDGE_XS) {
    const wedgeX = rect.x + rect.w * ratio;
    fillTriangle(
      ctx,
      wedgeX - rect.w * WEDGE_HALF_W, plateTop + (bottom - plateTop) * 0.5,
      wedgeX + rect.w * WEDGE_HALF_W, plateTop + (bottom - plateTop) * 0.5,
      wedgeX, bottom + rect.h * WEDGE_DEPTH,
      armor,
      line,
    );
  }
}

/** T-01 — 단발 앵커 발사기. 낮고 단정하며, 쐐기 두 개로 지면에 고정된다. */
export const drawAnchorTowerShape: TowerShapeDrawer = (ctx, rect, chassis, armor, accent, line) => {
  const plateTop = drawBasePlate(ctx, rect, chassis, line);
  drawGroundWedges(ctx, rect, armor, line, plateTop);

  const bodyX = rect.x + rect.w * ANCHOR_BODY_LEFT;
  const bodyW = rect.w * (ANCHOR_BODY_RIGHT - ANCHOR_BODY_LEFT);
  const bodyY = rect.y + rect.h * ANCHOR_BODY_TOP;
  fillRectPath(ctx, bodyX, bodyY, bodyW, Math.max(0, plateTop - bodyY), chassis, line);

  const barrelY = rect.y + rect.h * ANCHOR_BARREL_TOP;
  const barrelH = rect.h * (ANCHOR_BARREL_BOTTOM - ANCHOR_BARREL_TOP);
  fillRectPath(ctx, bodyX + bodyW * 0.5, barrelY, rect.w * ANCHOR_BARREL_END - (bodyX - rect.x) - bodyW * 0.5, barrelH, armor, line);

  fillCircle(ctx, rect.x + rect.w * ANCHOR_REEL_X, rect.y + rect.h * ANCHOR_REEL_Y, rect.w * ANCHOR_REEL_RADIUS, accent, line);
};

// ── T-02 공시 리피터 ──────────────────────────────────────────────
const TUBE_COUNT = 3;
const TUBE_BLOCK_LEFT = 0.32;
const TUBE_BLOCK_RIGHT = 0.68;
const TUBE_GAP_RATIO = 0.25;
/** 발사관이 슬롯 위로 솟는 높이(슬롯 높이 대비) — "확실히 높고 얇다"의 실체. */
const TUBE_RISE_RATIO = 0.5;
const COLLAR_TOP = 0.62;
const COLLAR_BOTTOM = 0.78;
const DISH_X = 0.78;
const DISH_Y = 0.42;
const DISH_RADIUS = 0.1;

/** 위로 세운 3연 수직 발사관. */
function drawVerticalTubes(ctx: BattleCtx, rect: Rect, chassis: string, line: string, plateTop: number): void {
  const blockW = rect.w * (TUBE_BLOCK_RIGHT - TUBE_BLOCK_LEFT);
  const tubeW = blockW / (TUBE_COUNT + (TUBE_COUNT - 1) * TUBE_GAP_RATIO);
  const step = tubeW * (1 + TUBE_GAP_RATIO);
  const top = rect.y - rect.h * TUBE_RISE_RATIO;
  for (let tube = 0; tube < TUBE_COUNT; tube += 1) {
    const tubeX = rect.x + rect.w * TUBE_BLOCK_LEFT + step * tube;
    fillRectPath(ctx, tubeX, top, tubeW, Math.max(0, plateTop - top), chassis, line);
  }
}

/** T-02 — 3연 수직 발사관 + 옆 작은 접시. 실루엣이 높고 얇아 대공임이 읽힌다. */
export const drawRepeaterTowerShape: TowerShapeDrawer = (ctx, rect, chassis, armor, accent, line) => {
  const plateTop = drawBasePlate(ctx, rect, chassis, line);
  drawVerticalTubes(ctx, rect, chassis, line, plateTop);

  const collarY = rect.y + rect.h * COLLAR_TOP;
  fillRectPath(
    ctx,
    rect.x + rect.w * (TUBE_BLOCK_LEFT - 0.04),
    collarY,
    rect.w * (TUBE_BLOCK_RIGHT - TUBE_BLOCK_LEFT + 0.08),
    rect.h * (COLLAR_BOTTOM - COLLAR_TOP),
    armor,
    line,
  );

  fillCircle(ctx, rect.x + rect.w * DISH_X, rect.y + rect.h * DISH_Y, rect.w * DISH_RADIUS, accent, line);
};

// ── T-03 물타기 살포기 ────────────────────────────────────────────
const SPRAY_BODY_LEFT = 0.02;
const SPRAY_BODY_RIGHT = 0.98;
const SPRAY_BODY_TOP = 0.6;
const MUZZLE_THROAT_X = 0.4;
const MUZZLE_THROAT_TOP = 0.56;
const MUZZLE_THROAT_BOTTOM = 0.74;
const MUZZLE_MOUTH_X = 0.98;
const MUZZLE_MOUTH_TOP = 0.42;
const MUZZLE_MOUTH_BOTTOM = 0.88;
const DRUM_X = 0.16;
const DRUM_Y = 0.62;
const DRUM_RADIUS = 0.11;

/** T-03 — 넓고 낮은 박격포. 나팔처럼 벌어진 총구 + 노출된 탄통. 셋 중 가장 뭉툭하다. */
export const drawSprayTowerShape: TowerShapeDrawer = (ctx, rect, chassis, armor, accent, line) => {
  const plateTop = drawBasePlate(ctx, rect, chassis, line);

  const bodyX = rect.x + rect.w * SPRAY_BODY_LEFT;
  const bodyW = rect.w * (SPRAY_BODY_RIGHT - SPRAY_BODY_LEFT);
  const bodyY = rect.y + rect.h * SPRAY_BODY_TOP;
  fillRectPath(ctx, bodyX, bodyY, bodyW, Math.max(0, plateTop - bodyY), chassis, line);

  fillQuad(
    ctx,
    rect.x + rect.w * MUZZLE_THROAT_X, rect.y + rect.h * MUZZLE_THROAT_TOP,
    rect.x + rect.w * MUZZLE_MOUTH_X, rect.y + rect.h * MUZZLE_MOUTH_TOP,
    rect.x + rect.w * MUZZLE_MOUTH_X, rect.y + rect.h * MUZZLE_MOUTH_BOTTOM,
    rect.x + rect.w * MUZZLE_THROAT_X, rect.y + rect.h * MUZZLE_THROAT_BOTTOM,
    armor,
    line,
  );

  fillCircle(ctx, rect.x + rect.w * DRUM_X, rect.y + rect.h * DRUM_Y, rect.w * DRUM_RADIUS, accent, line, DETAIL_LINE_WIDTH);
};
