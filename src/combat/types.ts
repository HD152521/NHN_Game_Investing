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

/**
 * 전투에 참여하는 개체가 공통으로 갖는 스탯.
 *
 * ★ 스탯은 **개체에 실린다.** 종류(kind)로 전역 상수 테이블을 찾아 쓰지 마라.
 *   상수 테이블은 개체를 만들 때의 **기본값 출처**일 뿐이다.
 *
 *   이유: 부서 업그레이드(FR-11)가 R&D +피해 / 인사팀 +HP처럼 **개체마다 다른 스탯**을
 *   요구한다. 스탯을 kind로 조회하면 같은 종류의 유닛이 전부 같은 값을 가질 수밖에 없어
 *   이 기능을 표현할 수 없다. 소환 시점의 부서 레벨이 스냅샷되어야 하는 요구사항
 *   (진행 중 업그레이드가 기존 유닛에 소급되지 않음)도 개체 스탯이라야 성립한다.
 */
export interface Combatant {
  readonly hp: number;
  readonly maxHp: number;
  /** 초당 진행도 이동량. */
  readonly speed: number;
  /** 공격 1회 피해량. */
  readonly damage: number;
  /** 공격 사거리(진행도 단위). 이 거리 안에 표적이 들어오면 멈추고 공격한다. */
  readonly range: number;
  /** 공격 주기(ms). 이 값이 곧 재장전 시간이다. */
  readonly attackCooldownMs: number;
  /** 남은 재장전 시간(ms). 0이면 발사 가능. */
  readonly cooldownMs: number;
}

export interface Enemy extends Combatant {
  readonly id: number;
  readonly lane: Lane;
  /** 1(적 본진)에서 0(아군 사옥) 쪽으로 감소한다. */
  readonly x: number;
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

export interface Unit extends Combatant {
  readonly id: number;
  readonly kind: UnitKind;
  /** 0(아군 사옥)에서 1(적 본진) 쪽으로 증가한다. */
  readonly x: number;
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
  /** 현재 웨이브의 **교전 구간** 경과(ms). 준비 구간은 여기 포함되지 않는다. */
  readonly waveElapsedMs: number;
  /**
   * 다음 웨이브 시작까지 남은 준비 시간(ms). `0`이면 교전 중이다.
   *
   * 준비 구간에는 적이 스폰되지 않는다 — 플레이어가 타워를 세울 시간이다. 차트 재생과
   * 매매는 전투와 다른 시계를 쓰므로(셸이 `Replay`를 따로 굴린다) 준비 중에도 계속 흐른다.
   */
  readonly prepRemainingMs: number;
  readonly enemies: readonly Enemy[];
  readonly units: readonly Unit[];
  readonly towers: readonly Tower[];
  readonly baseHp: number;
  readonly maxBaseHp: number;
  readonly towerSlots: number;
  /** 공시 폭탄 남은 쿨다운(ms). */
  readonly skillCooldownMs: number;
}

/**
 * 한 지역(스테이지)의 웨이브 구성 — **지역마다 다른 값이 들어갈 자리**다.
 *
 * ★ 왜 모듈 전역 배열이 아니라 구조체인가 ★
 * R2/R3 계수는 기획 결정 대기 중이다. 웨이브 테이블을 전역 상수로 하드코딩해 두면 지역이
 * 늘어날 때마다 `waves.ts`가 전역을 직접 읽는 구조를 뜯어야 한다. 구조를 먼저 열어두면
 * R2/R3는 `CombatParams.waveTable`로 주입하는 것으로 끝난다.
 * 확정값은 R1뿐이며 `constants.ts`의 `R1_WAVE_TABLE`에 있다.
 */
export interface StageWaveTable {
  /** 웨이브 1~N의 기본 적 수(heat 적용 전). 인덱스 0 = 웨이브 1. */
  readonly baseCount: readonly number[];
  /** 웨이브 1~N의 기본 HP(heat 적용 전). 인덱스 0 = 웨이브 1. */
  readonly baseHp: readonly number[];
  /** 공중 적이 포함되는 웨이브 번호(1-based) 집합. */
  readonly airWaves: ReadonlySet<number>;
}

/** 스테이지 진입 시 확정되는 전투 파라미터 스냅샷. */
export interface CombatParams {
  /**
   * 이 스테이지의 웨이브 테이블. 생략하면 `DEFAULT_WAVE_TABLE`(=R1)을 쓴다.
   * R2/R3 계수가 확정되면 여기에 주입한다 — `constants.ts`를 고칠 필요가 없다.
   */
  readonly waveTable?: StageWaveTable;
  readonly waveCount: number;
  /** 웨이브 1주기(준비 + 교전) 길이. */
  readonly waveDurationMs: number;
  /**
   * 웨이브 1주기 중 준비 구간이 차지하는 길이. 생략하면 `WAVE_PREP_MS`(5초)를 쓴다.
   * 교전 구간 = `waveDurationMs - wavePrepMs` — 주기에 더해지는 값이 아니다.
   */
  readonly wavePrepMs?: number;
  readonly towerSlots: number;
  readonly maxBaseHp: number;
  /** 경계도 계수 `1 + 점령수 × 0.02` (FR-6.7). */
  readonly heat: number;
  /** 웨이브당 AUM 드롭 총량 (FR-6.8-a). */
  readonly aumDropPerWave: number;
  /** 스테이지 전체 기본 수입 총액 (FR-6.8). */
  readonly totalBaseIncome: number;
}
