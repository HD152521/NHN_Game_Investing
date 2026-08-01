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
/**
 * 아군 사옥 영역이 전체 폭에서 차지하는 비율(좌측).
 *
 * ★ 2026-08-01: 0.12 → 0.18 (플레이 피드백 "우리 기지 크기가 너무 작아") ★
 * 사옥 스프라이트(`tf-base-ally`)는 원본 76×40으로 **가로가 긴** 그림이라, 배율을 결정하는
 * 것은 높이가 아니라 **사옥 영역의 폭**이다(`drawSpriteStanding`의 정수 배율 =
 * `min(⌊w/76⌋, ⌊h/40⌋)`). 0.12일 때 폭이 122.9 px라 `⌊122.9/76⌋ = 1×`, 즉 사옥이 76×40 —
 * 유닛(26×34)보다 겨우 6 px 큰 "본진 같지 않은" 크기로 나왔다.
 *
 * 2×(152×80)를 담으려면 사옥 그림이 **첫 타워 슬롯 앞에서 멈춰야** 하므로
 * (`hqSpriteRect` 참조) `laneLeft ≥ 152 + 슬롯폭/2 + 여백 = 152 + 22 + 6 = 180 px`가 필요하다.
 * 1024 px 캔버스에서 0.18 → 184.3 px 로 이 하한을 넘는다.
 *
 * 더 키우지 않는 이유: 슬롯 x는 `progressToX(towerX(slot))`이라 이 비율만큼 같이 오른쪽으로
 * 밀린다. 0.18에서 슬롯 뭉치 우측 끝이 331.8 px(캔버스의 32.4 %)로 "좌측 1/3 이내"라는
 * 배치 규약(`layout.test.ts`) 안에 겨우 남는다 — 3×(228 px)를 노려 0.25까지 올리면 슬롯이
 * 391 px(38 %)까지 밀려 전장 중앙을 침범한다.
 */
const HQ_ZONE_RATIO = 0.18;
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
/**
 * 사옥 그림과 **첫 타워 슬롯** 사이에 반드시 남기는 가로 여백(px).
 *
 * 기지가 슬롯을 덮으면 그림이 클릭 타겟을 가려 "여기를 누르면 지어진다"가 안 읽힌다
 * (판정 자체는 `slotRect`가 하므로 클릭은 되지만, 보이지 않는 버튼은 없는 버튼이다).
 */
const HQ_SLOT_CLEARANCE = 6;

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

/**
 * 기지 스프라이트가 **실제로 서는** 사각형 — 배치용 `hqRect`/`baseRect`와 구분한다.
 *
 * ★ 왜 영역 사각형을 그대로 쓰지 않는가 ★
 * `drawSpriteStanding`은 받은 사각형 안에 들어가는 **최대 정수 배율**로 그린다. 즉 이 사각형이
 * 곧 배율이다. 영역 사각형(`hqRect`·`baseRect`)은 HUD 아래 전장 전체 높이를 담고 있어
 * (1024×360에서 332 px) 세로가 사실상 무제한이라, 기지가 공중 레인 위까지 자라도 막을 수단이
 * 없었다 — 실제로 베어 요새가 4×(30×44 → 120×176)로 커져 천장이 공중 레인(y 134.2)보다
 * 16.6 px 위인 117.6 px까지 올라가 있었다.
 *
 * 그래서 그리기용 사각형은 두 방향을 모두 잘라 준다:
 * - **천장 = 공중 레인 y**: 기지가 유닛이 날아다니는 높이를 넘지 않는다.
 * - **바닥 = 지면선**: `drawSpriteStanding(…, layout.groundY)`와 같은 선이라 발밑이 정확히 얹힌다.
 *
 * 가로 상한(`maxWidth`)은 호출부가 정한다(사옥은 첫 슬롯 앞에서 멈춘다).
 */
function structureStandRect(zone: Rect, layout: BattleLayout, maxWidth: number): Rect {
  // 극소 캔버스에서 airY > groundY 가 되는 일은 없지만(비율 0.32 < 0.8), 0 크기 캔버스에서는
  // 둘이 같아진다 — 그때 h는 0이 되고 `drawSpriteStanding`이 최소 배율 1×로 떨어진다.
  const ceiling = Math.max(layout.battlefieldTop, Math.min(layout.airY, layout.groundY));

  return {
    x: zone.x,
    y: ceiling,
    w: nonNegative(Math.min(zone.w, maxWidth)),
    h: nonNegative(layout.groundY - ceiling),
  };
}

/**
 * 아군 사옥 그림이 서는 사각형. 폭은 **첫 타워 슬롯 왼쪽 끝 - `HQ_SLOT_CLEARANCE`** 에서
 * 멈춘다 — 사옥을 키우면서 슬롯 6개를 덮지 않게 하는 유일한 장치다.
 */
export function hqSpriteRect(layout: BattleLayout, towerSlots: number): Rect {
  const firstSlot = slotRect(0, layout, towerSlots);
  const limit = firstSlot.x - HQ_SLOT_CLEARANCE - layout.hqRect.x;

  return structureStandRect(layout.hqRect, layout, limit);
}

/**
 * 베어 요새·보스가 서는 사각형. 오른쪽에는 슬롯이 없으므로 가로는 영역 폭 그대로고,
 * 세로만 공중 레인에서 잘린다(그 결과 요새가 4× → 3×로 내려온다 — `structureStandRect` 참조).
 */
export function enemyBaseSpriteRect(layout: BattleLayout): Rect {
  return structureStandRect(layout.baseRect, layout, layout.baseRect.w);
}
