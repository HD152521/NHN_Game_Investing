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

import { TOWER_SLOT_SPACING, towerX } from '../combat/index.js';
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

/**
 * 타워 슬롯 줄 수 — **기지 옆에 2줄로 쌓는다** (전쟁시대 참고).
 *
 * ★ 왜 2줄인가 ★ 슬롯 픽셀 x는 `progressToX(towerX(slot))`으로 전투 좌표를 그대로 따르므로
 *   같은 줄 이웃 사이 픽셀 간격은 `줄수 × TOWER_SLOT_SPACING × 레인폭`이다. 1줄이면 6칸을
 *   44 px 터치 타겟으로 늘어놓기 위해 간격이 0.07까지 벌어져 슬롯이 전장 절반을 차지한다
 *   (= 옮기기 전과 똑같이 산만해진다). 2줄로 쌓으면 같은 터치 타겟을 절반 폭에 담을 수 있어
 *   슬롯 뭉치가 사옥 근처(캔버스 좌측 약 1/4)에 머문다.
 */
const SLOT_ROWS = 2;
/**
 * 슬롯 최소 변(px) — **PRD §11 모바일 터치 타겟 44 px 하한**. 슬롯을 "작게" 만들라는
 * 요구가 있어도 이 아래로는 절대 내려가지 않는다.
 * (캔버스는 논리 1024 px 고정 후 CSS로 축소되므로, 물리 CSS 픽셀은 축소 비율만큼 더 작아진다 —
 *  이건 캔버스 폭 자체의 문제라 레이아웃에서 해결할 수 없다.)
 */
const SLOT_SIZE_MIN = 44;
/** 슬롯 최대 변(px). "기지에 작게 얹는다"는 요구상 예전 96×68보다 훨씬 작게 상한을 둔다. */
const SLOT_SIZE_MAX = 52;
/** 같은 줄 이웃 간 픽셀 간격 대비 슬롯 변 길이 비율 — 나머지가 슬롯 사이 여백이 된다. */
const SLOT_SIZE_PITCH_RATIO = 0.85;
/** 위/아래 줄 사이 세로 여백(px). 줄 간 클릭 판정이 겹치지 않게 하는 최소 간격이다. */
const SLOT_ROW_GAP = 8;

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

/** 슬롯 한 변의 길이(px). 줄 간격·터치 타겟 하한·전장 높이를 동시에 만족시킨다. */
function slotSize(layout: BattleLayout, rows: number): number {
  const span = nonNegative(layout.laneRight - layout.laneLeft);
  const battlefieldHeight = nonNegative(layout.battlefieldBottom - layout.battlefieldTop);

  // 같은 줄 이웃 사이 픽셀 간격 = 줄 수 × 슬롯 간격(진행도) × 레인 폭.
  const pitch = rows * TOWER_SLOT_SPACING * span;
  const byPitch = Math.min(SLOT_SIZE_MAX, Math.max(SLOT_SIZE_MIN, pitch * SLOT_SIZE_PITCH_RATIO));
  // 줄을 전부 쌓아도 전장 높이를 넘지 않아야 한다(극소 캔버스 방어).
  const byHeight = battlefieldHeight / rows - SLOT_ROW_GAP;

  return nonNegative(Math.min(byPitch, byHeight));
}

/**
 * 타워 슬롯 인덱스 → 클릭 판정 및 그리기에 쓰는 사각형.
 *
 * ★ 슬롯은 **아군 사옥 쪽에 모여 있다** ★ (플레이테스트: "포탑을 전장 중간에 설치하면
 * 보기 힘드니까 내 기지에 작게 설치하는 형태가 좋겠다 — 전쟁시대 참고")
 *
 * x는 전투 좌표를 그대로 따른다: `progressToX(towerX(slot))`. 예전에는 화면이 슬롯을 레인
 * 전체에 균등 분배해 놓고 전투 판정은 `towerX(slot) = slot × 0.02`(전부 사옥 앞 10% 안)를
 * 썼다 — **보이는 위치와 실제 사거리 원점이 서로 다른 좌표계**였다. 이제 둘이 한 식을 쓰므로
 * 사거리 미리보기(`draw-tower-range.ts`)가 화면에서 곧이곧대로 읽힌다.
 *
 * y는 짝수 인덱스가 윗줄, 홀수 인덱스가 아랫줄이다(벽돌쌓기). 이웃한 두 슬롯은 x가
 * `TOWER_SLOT_SPACING`만큼만 떨어져 가로로 겹칠 수 있지만 줄이 달라 세로로 분리되므로
 * 클릭 판정은 모호해지지 않는다.
 *
 * `towerSlots`는 줄 수를 정하는 데 쓴다 — 슬롯이 1개뿐이면 2줄로 나눌 이유가 없다.
 */
export function slotRect(slot: number, layout: BattleLayout, towerSlots: number): Rect {
  const rows = towerSlots >= SLOT_ROWS ? SLOT_ROWS : 1;
  const size = slotSize(layout, rows);

  const centerX = progressToX(towerX(slot), layout);
  // 줄들을 towerRowY 기준으로 위아래 대칭 배치한다.
  const rowPitch = size + SLOT_ROW_GAP;
  const rowIndex = ((slot % rows) + rows) % rows;
  const centerY = layout.towerRowY + (rowIndex - (rows - 1) / 2) * rowPitch;

  return {
    x: centerX - size / 2,
    y: centerY - size / 2,
    w: size,
    h: size,
  };
}
