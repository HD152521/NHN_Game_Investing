/**
 * 전장 캔버스 픽셀 좌표 계산 — 순수 함수 모음.
 *
 * `src/chart/layout.ts` · `src/chart/scale.ts`와 같은 패턴이다: 상태를 갖지 않고
 * 입력(캔버스 크기, 정규화 진행도)만으로 결과가 결정되므로 헤드리스로 검증하기 쉽다.
 * 그리기(`draw-*.ts`)는 이 함수들의 결과만 사용한다.
 *
 * 좌표계 규약(★ `src/combat/types.ts`와 반드시 일치): `x` 0 = 아군 사옥(좌측),
 * 1 = 적 본진(우측). 화면 y는 아래로 갈수록 커지므로, 공중 레인이 지상 레인보다
 * 항상 작은 y(위쪽)를 가진다.
 */

import type { Lane } from '../combat/types.js';

/** 픽셀 사각형. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** 상단 HUD(웨이브 표시·스킬 게이지) 높이(px). 캔버스가 작으면 그만큼 줄어든다. */
const HUD_HEIGHT_MAX = 28;
/** 아군 사옥 영역이 전체 폭에서 차지하는 비율(좌측). */
const HQ_ZONE_RATIO = 0.12;
/** 적 본진 영역이 전체 폭에서 차지하는 비율(우측). */
const BASE_ZONE_RATIO = 0.12;
/** 공중 레인 중심 y — 전장 영역(HUD 제외) 높이 대비 비율. */
const AIR_Y_RATIO = 0.32;
/** 지상 레인 중심 y — 전장 영역 높이 대비 비율. */
const GROUND_Y_RATIO = 0.8;
/** 타워 슬롯 줄 중심 y — 공중과 지상 사이(양쪽 레인을 모두 방어하는 위치). */
const TOWER_ROW_Y_RATIO = 0.56;

/** 슬롯 하나의 최대 폭/높이(px) — 슬롯이 아무리 넓어도 이 이상 커지지 않는다. */
const SLOT_WIDTH_MAX = 56;
const SLOT_HEIGHT_MAX = 44;
/** 슬롯 칸(cell) 폭 대비 실제 그려질 슬롯 폭 비율 — 나머지는 슬롯 사이 여백이 된다. */
const SLOT_WIDTH_CELL_RATIO = 0.72;
/** 슬롯 높이 — 전장 영역 높이 대비 비율. */
const SLOT_HEIGHT_RATIO = 0.22;

export interface BattleLayout {
  readonly width: number;
  readonly height: number;
  /** 상단 HUD(웨이브·스킬 게이지) 높이. */
  readonly hudHeight: number;
  /** HUD 아래 실제 전장이 시작되는 y. */
  readonly battlefieldTop: number;
  readonly battlefieldBottom: number;
  /** 타워를 지을 수 있는 레인 구간의 좌우 x. `progressToX(0)==laneLeft`, `progressToX(1)==laneRight`. */
  readonly laneLeft: number;
  readonly laneRight: number;
  readonly airY: number;
  readonly groundY: number;
  /** 타워 슬롯 줄의 중심 y. */
  readonly towerRowY: number;
  /** 아군 사옥(좌) 영역. */
  readonly hqRect: Rect;
  /** 적 본진(우) 영역. */
  readonly baseRect: Rect;
}

/** 0 이상 값을 보장한다 (음수 폭/높이로 인한 크래시 방지). */
function nonNegative(value: number): number {
  return value > 0 ? value : 0;
}

/**
 * 캔버스 크기를 전장 레이아웃으로 변환한다.
 *
 * 너비/높이가 0이거나 극단적으로 작아도 NaN이나 음수 크기가 나오지 않도록
 * `Math.min`/`Math.max`로 매 구간을 방어한다 — 그려질 내용이 찌그러질 수는 있어도
 * 좌표 계산 자체는 항상 유효해야 한다.
 */
export function computeBattleLayout(width: number, height: number): BattleLayout {
  const safeWidth = nonNegative(width);
  const safeHeight = nonNegative(height);

  const hudHeight = Math.min(HUD_HEIGHT_MAX, safeHeight);
  const battlefieldTop = hudHeight;
  const battlefieldBottom = Math.max(battlefieldTop, safeHeight);
  const battlefieldHeight = battlefieldBottom - battlefieldTop;

  const hqZoneWidth = safeWidth * HQ_ZONE_RATIO;
  const baseZoneWidth = safeWidth * BASE_ZONE_RATIO;
  const laneLeft = Math.min(hqZoneWidth, safeWidth);
  const laneRight = Math.max(laneLeft, Math.min(safeWidth - baseZoneWidth, safeWidth));

  const airY = battlefieldTop + battlefieldHeight * AIR_Y_RATIO;
  const groundY = battlefieldTop + battlefieldHeight * GROUND_Y_RATIO;
  const towerRowY = battlefieldTop + battlefieldHeight * TOWER_ROW_Y_RATIO;

  const hqRect: Rect = {
    x: 0,
    y: battlefieldTop,
    w: nonNegative(laneLeft),
    h: nonNegative(battlefieldHeight),
  };
  const baseRect: Rect = {
    x: laneRight,
    y: battlefieldTop,
    w: nonNegative(safeWidth - laneRight),
    h: nonNegative(battlefieldHeight),
  };

  return {
    width: safeWidth,
    height: safeHeight,
    hudHeight,
    battlefieldTop,
    battlefieldBottom,
    laneLeft,
    laneRight,
    airY,
    groundY,
    towerRowY,
    hqRect,
    baseRect,
  };
}

/** 레인 → y 픽셀. 공중이 지상보다 항상 위(작은 y)다. */
export function laneY(lane: Lane, layout: BattleLayout): number {
  return lane === 'air' ? layout.airY : layout.groundY;
}

/**
 * 정규화 진행도(0~1) → 픽셀 x.
 *
 * ★ 0은 좌측(아군 사옥), 1은 우측(적 본진)이다. 이 방향이 뒤집히면 게임 전체가
 * 좌우 반전되어 보이므로 반드시 `layout.test.ts`에서 고정 검증한다.
 * 범위를 벗어난 입력은 0~1로 잘라(clamp) 화면 밖으로 튀지 않게 한다.
 */
export function progressToX(x: number, layout: BattleLayout): number {
  const clamped = Math.min(1, Math.max(0, x));
  const span = layout.laneRight - layout.laneLeft;
  if (span <= 0) return layout.laneLeft;
  return layout.laneLeft + clamped * span;
}

/**
 * 타워 슬롯 인덱스 → 클릭 판정 및 그리기에 쓰는 사각형.
 *
 * `towerSlots`(전체 슬롯 수)를 함께 받아야 한다 — 레이아웃 자체는 슬롯 개수를 모르므로
 * (전투 상태에 따라 달라질 수 있음), 호출부가 `CombatState.towerSlots`를 넘겨준다.
 * `hit-test.ts`의 `slotAt`도 동일한 함수를 사용해 판정 사각형이 항상 그리기와 일치하게 한다.
 */
export function slotRect(slot: number, layout: BattleLayout, towerSlots: number): Rect {
  const count = Math.max(1, towerSlots);
  const span = nonNegative(layout.laneRight - layout.laneLeft);
  const cellWidth = span / count;
  const battlefieldHeight = nonNegative(layout.battlefieldBottom - layout.battlefieldTop);

  const width = Math.min(SLOT_WIDTH_MAX, nonNegative(cellWidth * SLOT_WIDTH_CELL_RATIO));
  const height = Math.min(SLOT_HEIGHT_MAX, nonNegative(battlefieldHeight * SLOT_HEIGHT_RATIO));

  const centerX = layout.laneLeft + cellWidth * (slot + 0.5);
  const centerY = layout.towerRowY;

  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    w: width,
    h: height,
  };
}
