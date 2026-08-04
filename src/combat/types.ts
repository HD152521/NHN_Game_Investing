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

/**
 * 악당 5종 (아트 프로덕션 시트 §05).
 *
 * ★ 왜 이 타입이 `identity.ts`가 아니라 계약 파일에 있는가 ★
 * 예전에는 종류가 **표현 계층의 구분**이었다 — 시뮬레이션은 레인과 스탯만으로 돌고 렌더러가
 * 개체 id에서 결정적으로 스프라이트를 골랐다. 그 결과 `identity.ts`가 정의한 역할
 * (속공/방패/탱커/정찰/광역)이 **플레이에 한 번도 반영되지 않았다**: 같은 레인의 적은 속도도
 * 피해량도 HP도 전부 같아서, 타워 종류를 무엇으로 고르든 결과가 같았다.
 *
 * 이제 종류가 스폰 시점에 **개체 스탯을 결정**하므로(`waves.ts` `spawnPlanFor`) 종류는
 * 시뮬레이션과 렌더러가 **함께 보는 사실**이 됐다. 그래서 계약 파일이 소유한다.
 * 정체성 데이터(`ENEMY_IDENTITY`)는 여전히 `identity.ts`이며 이 타입을 재수출한다.
 */
export type EnemyKind =
  | 'gapScout'
  | 'marginEnforcer'
  | 'liquidationDigger'
  | 'rumorKite'
  | 'panicSiren';

/** 타워 3종 (FR-6.4). */
export type TowerKind = 'basic' | 'antiair' | 'splash';

/** 유닛 3종 (FR-6.5). */
export type UnitKind = 'intern' | 'analyst' | 'trader';

/**
 * 스킬 3종 (FR-6.6, 아트 프로덕션 시트 §08).
 *
 * ★ 문자열이 시트의 이펙트 ID(`src/fx/types.ts` `SkillEffectId`)와 **의도적으로 같다** ★
 * 로직과 이펙트가 1:1이라 매핑 테이블이 필요 없다. 두 모듈이 서로를 import하지 않으므로
 * 계층(전투 ↔ 렌더)은 그대로 분리돼 있고, 두 유니온이 어긋나지 않는지는 테스트가 고정한다.
 */
export type SkillId = 'S-01' | 'S-02' | 'S-03';

/**
 * 스킬이 소모하는 재화.
 *
 * `aum`은 **매매 원금**이다(`src/position`). 전장에서 AUM을 태우는 경로는 `S-03` 하나뿐이며,
 * 이것이 "자금을 태워 시간을 산다"는 설계 의도의 유일한 구현이다 — 실드를 쓰면 그만큼
 * 투입 원금이 줄고, 줄어든 원금은 곧 벌 수 있는 골드가 준다는 뜻이다.
 */
export type SkillCurrency = 'gold' | 'aum';

/** 스킬 1종의 비용·쿨다운 정의. 효과량은 종류마다 단위가 달라 별도 상수로 둔다. */
export interface SkillSpec {
  readonly id: SkillId;
  readonly displayName: string;
  /** 한 줄 설명 — 버튼 title·정체 노출에 그대로 쓴다. */
  readonly flavor: string;
  readonly currency: SkillCurrency;
  readonly cost: number;
  readonly cooldownMs: number;
}

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
  /**
   * 악당 5종 중 무엇인가.
   *
   * ★ 이 필드는 **정체 표시**이지 스탯 조회 키가 아니다 ★ `isBoss`와 같은 성격이다.
   * 스탯(hp/speed/damage/range/leakDamage)은 이미 위 `Combatant`에 개체 값으로 실려 있고,
   * 시뮬레이션은 그 필드만 읽는다 — **런타임에 `kind`로 상수 테이블을 조회하는 코드를 쓰지
   * 마라.** 종류가 스탯을 정하는 지점은 스폰 시점(`waves.ts spawnPlanFor`) 한 곳뿐이며,
   * 그래야 부서 업그레이드(FR-11)처럼 "같은 종류인데 스탯이 다른 개체"가 표현된다.
   *
   * 이 필드가 실제로 하는 일은 렌더러가 스프라이트·공격 애니메이션을 고르는 것이다
   * (`src/battle/entity-sprites.ts` `enemyKindOf`).
   *
   * **선택 필드인 이유**는 `CombatState.skillCooldowns`와 같다: 시뮬레이션 밖에서 `Enemy`
   * 리터럴을 만드는 곳이 있다(`src/battle/combat-fixtures.ts`). 생략되면 렌더러가 id 기반
   * 폴백(`enemyKindForId`)으로 떨어진다.
   */
  readonly kind?: EnemyKind | undefined;
  /** 1(적 본진)에서 0(아군 사옥) 쪽으로 감소한다. */
  readonly x: number;
  /**
   * 보스(B-03 마진콜 심판관)인가.
   *
   * ★ 왜 `Enemy`를 재사용하는가 ★ 보스는 걷고·교전하고·죽는다 — `mechanics.ts`의 이동·
   * 교전·처치 판정이 전부 그대로 맞는다. 별도 타입을 만들면 그 세 함수를 보스용으로 한 번
   * 더 써야 하고, 두 구현이 조용히 갈라진다. 스탯은 이미 개체에 실려 있으므로(위 `Combatant`
   * 주석) 보스는 "스탯이 큰 적"으로 완전히 표현된다. 이 플래그가 하는 일은 **정체 표시**뿐이다:
   * 렌더러가 보스 스프라이트를 고르고, HUD가 HP 바를 띄우고, 사망 연출이 종류를 가른다.
   */
  readonly isBoss?: boolean | undefined;
  /**
   * 본진(x<=0)에 도달했을 때 입히는 피해. 생략하면 `BASE_DAMAGE_PER_LEAK`.
   *
   * 종류로 상수 테이블을 조회하지 않기 위해(위 `Combatant` 주석의 원칙) 누출 피해도 개체에
   * 싣는다. 보스만 다른 값을 갖는다 — `mechanics.ts collectLeaks`가 이 필드만 읽는다.
   */
  readonly leakDamage?: number | undefined;
}

/** 사망 연출이 구분해야 하는 개체 종류. 아군/악당은 시트가 다르고(`tf-death-*`) 보스는 크기가 다르다. */
export type DeathKind = 'unit' | 'enemy' | 'boss';

/**
 * 이번 틱에 **죽은** 개체 하나. 누출(본진 도달)은 여기 포함되지 않는다 — 그건 죽은 게 아니라
 * 통과한 것이다.
 *
 * ★ 왜 이벤트인가 (개체에 `dyingMs`를 넣지 않은 이유) ★
 * `dyingMs`를 개체에 넣으면 죽은 개체가 배열에 계속 남아 `applyTowerFire`/`applyEngagement`의
 * 표적 후보에 섞인다 — "시체를 때린다"를 막으려고 모든 판정에 `hp > 0` 가드를 흩뿌려야 하고,
 * 하나라도 빠지면 조용히 밸런스가 틀어진다. 사망은 **한 프레임짜리 사실**이므로 이벤트로
 * 내보내고, "죽는 중"이라는 시간 축은 그것을 소비하는 렌더러가 소유한다(`src/battle`).
 */
export interface DeathEvent {
  readonly id: number;
  readonly kind: DeathKind;
  /** 유닛은 항상 `'ground'`. */
  readonly lane: Lane;
  /** 죽은 자리(진행도). 연출은 여기에 그린다. */
  readonly x: number;
}

/**
 * 화면에 노출되는 보스 체력. `enemies` 안의 보스 개체에서 매 틱 파생된다 — 보스가 없거나
 * 죽었으면 `null`이다. 별도 저장소가 아니라 **투영(projection)**이므로 개체와 어긋날 수 없다.
 */
export interface BossState {
  readonly hp: number;
  readonly maxHp: number;
}

export interface Tower {
  /** 0-based 슬롯 인덱스. */
  readonly slot: number;
  readonly kind: TowerKind;
  /** 1 = 기본, 2 = 업그레이드됨. */
  readonly level: 1 | 2;
  /** 남은 재장전 시간(ms). */
  readonly cooldownMs: number;
  /**
   * 건설 시점에 스냅샷된 피해 배수 (FR-11 R&D). 생략하면 1.
   *
   * ★ 왜 개체 필드인가 ★ `kind`+`level`로 표를 조회하면 같은 종류의 타워가 전부 같은
   * 값을 갖게 되어, "진행 중 부서 업그레이드가 이미 지어진 타워에 소급되지 않는다"는
   * 요구(§FR-11 · types.ts 머리말)를 표현할 수 없다. 유닛의 `hp` 스냅샷과 같은 이유다.
   */
  readonly damageMultiplier?: number;
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
  /**
   * 이번 틱에 죽은 개체 목록(유닛 + 적 + 보스). 아무도 안 죽었으면 **항상 같은 빈 배열
   * 참조**다 — 프레임당 할당 0(PRD §11)을 지키기 위해 시뮬레이션이 상수를 돌려준다.
   */
  readonly deaths: readonly DeathEvent[];
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
  /**
   * 적 본진 체력 (FR-8.2). 0이 되면 **즉시 승리**다 — 13웨이브를 기다리지 않는다.
   *
   * 아군 유닛이 x=1까지 밀고 올라가 사거리 안에 들면 때린다(`applyEngagement`).
   * 지상 적이 사거리에 있으면 그쪽이 우선이므로, 전선을 뚫어야만 닿는다.
   */
  readonly enemyBaseHp: number;
  readonly maxEnemyBaseHp: number;
  readonly towerSlots: number;
  /**
   * `S-01`(공시 폭탄) 남은 쿨다운(ms) — **`skillCooldowns['S-01']`의 별칭**이다.
   *
   * 스킬이 3종으로 늘어난 뒤에도 이 필드를 남긴 이유는 하나뿐이다: 전장 HUD
   * (`src/battle/draw-hud.ts`)가 이미 이 이름을 읽고 있고, `CombatState`는 시뮬레이션과
   * 렌더러가 공유하는 계약이라 필드를 **지우면 렌더러가 깨진다**. 값의 단일 출처는
   * 아래 `skillCooldowns`이며, 상태를 만드는 쪽(`createCombat`/`step`/`castSkill`)이
   * 항상 둘을 같이 갱신한다.
   */
  readonly skillCooldownMs: number;
  /**
   * 스킬별 남은 쿨다운(ms).
   *
   * **선택 필드인 이유**: `CombatState` 리터럴을 직접 만드는 곳이 시뮬레이션 밖에 있다
   * (`src/battle/combat-fixtures.ts`). 필수 필드를 늘리면 그 파일이 타입 에러로 깨지는데,
   * 렌더러 쪽 파일은 이 작업의 소유 범위가 아니다. `createCombat`/`step`/`castSkill`이
   * 만든 상태에는 **항상 3종이 전부 들어 있다** — 읽는 쪽은 `skillCooldownOf()`를 써라.
   */
  readonly skillCooldowns?: Readonly<Record<SkillId, number>>;
  /**
   * 서킷브레이커 실드(`S-03`) 잔여 지속시간(ms). 0이거나 생략이면 비활성이다.
   * 활성 동안 본진에 도달한 적은 **피해를 주지 못하고 소멸한다**(FR-6.6).
   */
  readonly shieldRemainingMs?: number;
  /**
   * 살아 있는 보스의 체력. 없으면 `null`/생략.
   *
   * `enemies` 안의 보스 개체에서 매 틱 파생되는 **투영값**이다(단일 출처는 개체). 렌더러가
   * 이 값 하나로 ① 보스 HP 바(HUD) ② 페이즈 전환(`tf-boss-p1` → `tf-boss-p2`)을 모두
   * 결정한다 — `draw-structures.ts`가 요구했던 필드가 정확히 이것이다.
   *
   * 선택 필드인 이유는 `skillCooldowns`와 같다(위 주석): 시뮬레이션 밖에서 `CombatState`
   * 리터럴을 만드는 곳이 있다. 읽는 쪽은 `?? null`로 받아라.
   */
  readonly boss?: BossState | null;
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
  /** 적 본진 체력. 생략하면 `ENEMY_BASE_HP`. */
  readonly maxEnemyBaseHp?: number;
}
