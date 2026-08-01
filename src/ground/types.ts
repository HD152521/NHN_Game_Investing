/**
 * 발판(GROUND) 시스템 공용 타입 — 아트-프로덕션시트 §02.
 *
 * ★ 이 파일은 **판정(순수 함수)** 과 **렌더(Canvas)** 사이의 인터페이스 계약이다.
 *   `src/weather/types.ts`와 같은 성격이다: 판정 쪽은 Canvas/DOM/타이머를 모르고,
 *   렌더 쪽(`src/battle/draw-ground*.ts`)은 전투 상태를 직접 읽지 않는다.
 *   구현 세부를 여기에 넣지 마라.
 */

/**
 * 발판 3단계 (시트 §02 `GND-STATE`).
 *
 * - `intact`    = 정상. 웨이브 시작 상태.
 * - `cracked`   = 균열. 적이 절반 이상 전진했을 때 덧깔기.
 * - `collapsed` = 함몰. 후반 웨이브. 균열에 **청색 잔광만** 스며든다.
 *
 * ★ 이건 장식이 아니라 **전황 표시**다. reduced-motion에서도 단계는 반드시 읽혀야 한다.
 */
export const GROUND_STATES = ['intact', 'cracked', 'collapsed'] as const;

export type GroundState = (typeof GROUND_STATES)[number];

/**
 * 전진율 계산에 필요한 적의 최소 정보.
 *
 * `src/combat`의 `Enemy`를 그대로 받지 않고 구조적으로 좁혀 받는다 — 이 방향이면
 * `src/ground`가 `src/combat`에 의존하지 않아 판정을 단독으로 테스트할 수 있다.
 */
export interface AdvancingEnemy {
  /** 1(적 본진) → 0(아군 사옥)으로 감소하는 정규화 진행도. */
  readonly x: number;
  readonly hp: number;
}

/** 발판 상태 판정 입력. 전부 스칼라라서 Canvas 없이 검증된다. */
export interface GroundConditions {
  /** 가장 전진한 적의 전진율(0~1). `maxEnemyAdvance`가 만든다. */
  readonly maxAdvance: number;
  /** 현재 웨이브(1-based). 시작 전이면 0. */
  readonly wave: number;
  readonly waveCount: number;
}

/**
 * 타워 슬롯 데칼 3상태 (시트 §02).
 *
 * - `inactive`  = 비활성. 점선 사각.
 * - `placeable` = 배치 가능. 적색 실선 + 코너 브래킷.
 * - `blocked`   = 배치 불가. 회색 사선 해칭.
 */
export const SLOT_DECAL_STATES = ['inactive', 'placeable', 'blocked'] as const;

export type SlotDecalState = (typeof SLOT_DECAL_STATES)[number];

/**
 * 슬롯 데칼 판정 입력.
 *
 * ★ `buildCost`가 `null`이면 "툴바에서 타워를 고르지 않았다"는 뜻이고 데칼은 비활성이다.
 *   골드 부족이 `blocked`로 나오는 것이 이 데칼의 핵심이다 — 지금 타워를 살 돈이 없다는
 *   사실을 화면이 먼저 말해줘야 "매매를 해야 방어가 선다"가 전달된다.
 */
export interface SlotConditions {
  readonly isOccupied: boolean;
  readonly gold: number;
  /** 선택된 타워의 건설 비용. 고른 타워가 없으면 `null`. */
  readonly buildCost: number | null;
}
