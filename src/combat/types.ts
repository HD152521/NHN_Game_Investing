/**
 * 전투 시스템 공용 타입 (PRD FR-6).
 *
 * ★ 이 파일은 전투 시뮬레이션(`src/combat`)과 전장 렌더러(`src/battle`)가 공유하는
 *   **인터페이스 계약**이다. 양쪽이 이 파일만 보고 독립 구현할 수 있어야 하므로
 *   구현 세부를 여기에 넣지 마라.
 *
 * 좌표계: 전장은 좌우 1레인이다. `x`는 **0(아군 사옥) ~ 1(적 본진)** 로 정규화된
 * 진행도다. 픽셀은 렌더러가 정한다 — 시뮬레이션은 화면 크기를 몰라야 한다.
 */

/** 지상 / 공중 2레인 (FR-6.2). */
export type Lane = 'ground' | 'air';

/** 타워 3종 (FR-6.4). */
export type TowerKind = 'basic' | 'antiair' | 'splash';

/** 유닛 3종 (FR-6.5). */
export type UnitKind = 'intern' | 'analyst' | 'trader';

export interface Enemy {
  readonly id: number;
  readonly lane: Lane;
  /** 1(적 본진)에서 0(아군 사옥) 쪽으로 감소한다. */
  readonly x: number;
  readonly hp: number;
  readonly maxHp: number;
  /** 초당 진행도 감소량. */
  readonly speed: number;
}

export interface Tower {
  /** 0-based 슬롯 인덱스. */
  readonly slot: number;
  readonly kind: TowerKind;
  /** 1 = 기본, 2 = 업그레이드됨. */
  readonly level: 1 | 2;
  /** 남은 재장전 시간(ms). */
  readonly cooldownMs: number;
}

export interface Unit {
  readonly id: number;
  readonly kind: UnitKind;
  /** 0(아군 사옥)에서 1(적 본진) 쪽으로 증가한다. */
  readonly x: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly cooldownMs: number;
}

/** 이번 프레임에 일어난 일. 렌더러의 이펙트와 셸의 재화 반영에 쓴다. */
export interface CombatEvents {
  /** 이번 틱에 처치된 적 수. */
  readonly kills: number;
  /** 이번 틱에 지급해야 할 AUM 총량 (FR-6.8-a). */
  readonly aumDropped: number;
  /** 이번 틱에 지급해야 할 골드 (웨이브 기본 수입, FR-6.8). */
  readonly goldIncome: number;
  /** 본진이 받은 피해. */
  readonly baseDamage: number;
  /** 새 웨이브가 시작되었다면 그 번호(1-based), 아니면 null. */
  readonly waveStarted: number | null;
}

export type CombatPhase = 'running' | 'cleared' | 'defeated';

export interface CombatState {
  readonly phase: CombatPhase;
  /** 1-based. 아직 시작 전이면 0. */
  readonly wave: number;
  readonly waveCount: number;
  /** 현재 웨이브 경과(ms). */
  readonly waveElapsedMs: number;
  readonly enemies: readonly Enemy[];
  readonly units: readonly Unit[];
  readonly towers: readonly Tower[];
  readonly baseHp: number;
  readonly maxBaseHp: number;
  readonly towerSlots: number;
  /** 공시 폭탄 남은 쿨다운(ms). */
  readonly skillCooldownMs: number;
}

/** 스테이지 진입 시 확정되는 전투 파라미터 스냅샷. */
export interface CombatParams {
  readonly waveCount: number;
  readonly waveDurationMs: number;
  readonly towerSlots: number;
  readonly maxBaseHp: number;
  /** 경계도 계수 `1 + 점령수 × 0.02` (FR-6.7). */
  readonly heat: number;
  /** 웨이브당 AUM 드롭 총량 (FR-6.8-a). */
  readonly aumDropPerWave: number;
  /** 스테이지 전체 기본 수입 총액 (FR-6.8). */
  readonly totalBaseIncome: number;
}
