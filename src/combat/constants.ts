/**
 * 전투 시스템 밸런스 상수 (PRD FR-6, §9.2, §9.4).
 *
 * PRD에 값이 명시된 항목(§9.2 경제 파라미터, §9.4 웨이브 테이블)은 그 값을 그대로 옮긴다.
 * PRD에 수치가 없는 항목(타워 사거리·DPS, 유닛 HP·DPS, 적 이동속도·근접공격력 등)은
 * 여기서 직접 정하되 근거를 주석으로 남긴다. 목표는 "13웨이브를 적당히 잘하면 깰 수 있다"
 * 수준의 체감이며, 정밀 밸런싱은 봇 시뮬레이터·플레이테스트(§9.3, §10)에서 재조정한다.
 */

import type { TowerKind, UnitKind } from './types';

// ── §9.2 경제 파라미터 (PRD 명시값) ─────────────────────────────
export const WAVE_COUNT = 13;
export const WAVE_DURATION_MS = 30_000;
export const BASE_HP = 100;
export const TOWER_SLOTS = 6;
export const AUM_DROP_PER_WAVE = 150;
export const BASE_INCOME_PER_WAVE = 25;
export const SKILL_COST = 200;
export const SKILL_COOLDOWN_MS = 45_000;
/** 스테이지 시작 지급 골드(FR-6.8-b). 전투 시뮬 자체는 사용하지 않으나 §9.2 상수로 문서화해 둔다. */
export const STARTING_GOLD = 200;
/** 경계도 계수 증가분(지역 1점령당). heat = 1 + 점령수 × HEAT_PER_TERRITORY (FR-6.7). */
export const HEAT_PER_TERRITORY = 0.02;

// ── 타워 3종 (FR-6.4, PRD 명시값: 건설/업그레이드 비용) ──────────
export const TOWER_BUILD_COST: Record<TowerKind, number> = {
  basic: 120,
  antiair: 120,
  splash: 160,
};

export const TOWER_UPGRADE_COST: Record<TowerKind, number> = {
  basic: 180,
  antiair: 180,
  splash: 220,
};

/**
 * 타워 사거리(진행도 0~1 단위, x=0 아군 사옥 기준 — 이 값 이하 x를 가진 적을 사격 가능).
 * PRD는 사거리를 정하지 않아 여기서 정한다.
 * - basic: 단일 표적 중간 사거리.
 * - antiair: 공중 적(§ENEMY_SPEED_AIR)이 지상보다 빠르게 접근하므로 대응 시간을 더 주기 위해
 *   가장 길게 잡는다.
 * - splash: "범위 피해로 낮은 DPS를 상쇄"하는 설계 의도상 사거리를 짧게 잡아 트레이드오프를 준다.
 */
export const TOWER_RANGE: Record<TowerKind, number> = {
  basic: 0.42,
  antiair: 0.5,
  splash: 0.3,
};

/** 타워 공격 주기(ms). 낮을수록 자주 쏜다. */
export const TOWER_COOLDOWN_MS: Record<TowerKind, number> = {
  basic: 800,
  antiair: 600,
  splash: 1400,
};

/**
 * 타워 레벨별 타격 1회 피해량. DPS = damage / (cooldownMs / 1000).
 * - basic Lv1: 20 / 0.8s = 25 DPS → "단일 표적, 중간 DPS" 반영.
 * - antiair Lv1: 34 / 0.6s ≈ 56.7 DPS → "공중 전용, 고 DPS" 반영(지상 타워의 2배 이상).
 * - splash Lv1: 10 / 1.4s ≈ 7.1 DPS지만 사거리 내 전원에게 동시 적용 → "낮은 DPS, 범위 피해".
 * - Lv2(업그레이드)는 대략 1.6~1.7배로 잡아 "업그레이드가 체감되는" 수준으로 설계했다.
 */
export const TOWER_DAMAGE: Record<TowerKind, Record<1 | 2, number>> = {
  basic: { 1: 20, 2: 34 },
  antiair: { 1: 34, 2: 56 },
  splash: { 1: 10, 2: 16 },
};

// ── 유닛 3종 (FR-6.5, PRD 명시값: 소환 비용) ─────────────────────
export const UNIT_COST: Record<UnitKind, number> = {
  intern: 30,
  analyst: 60,
  trader: 90,
};

/** 유닛 HP. 비용 대비 대략 2배 스케일(30G→60HP, 60G→120HP, 90G→220HP은 살짝 우대)로 정했다. */
export const UNIT_HP: Record<UnitKind, number> = {
  intern: 60,
  analyst: 120,
  trader: 220,
};

/** 유닛 공격 1회 피해량. 공격 주기(UNIT_COOLDOWN_MS)는 종류 무관 동일하게 두고 피해량만 차등화한다. */
export const UNIT_DAMAGE: Record<UnitKind, number> = {
  intern: 6,
  analyst: 12,
  trader: 22,
};

/** 유닛 공격 주기(ms). 타워와 동일하게 "쿨다운 후 발사" 모델을 쓴다(Unit.cooldownMs 필드). */
export const UNIT_COOLDOWN_MS = 700;

/** 유닛 전진 속도(초당 진행도). 라인 전체(0→1)를 약 20초에 주파하는 값으로 잡았다. */
export const UNIT_SPEED = 0.05;

// ── 적 (FR-6.7) ───────────────────────────────────────────────
/**
 * 적 이동 속도(초당 진행도 감소량). PRD §9.4는 "baseSpeed[w]는 지역별 데이터 테이블로
 * 관리"라고만 명시하고 구체값을 주지 않아 여기서 웨이브 공통 상수로 단순화한다 — 난이도
 * 상승은 적 수·HP 증가(heat)만으로 충분히 표현되므로 속도까지 웨이브별로 올리지 않는다.
 * 공중 적은 유닛으로 저지할 수 없는 대신(대공 타워만 유효) 지상보다 빠르게 잡아 위협을 표현한다.
 */
export const ENEMY_SPEED_GROUND = 1 / 22; // 라인(x:1→0) 완주 약 22초
export const ENEMY_SPEED_AIR = 1 / 16; // 완주 약 16초

/**
 * 적 근접 공격력(유닛과 교전 시 초당 피해). `Enemy` 타입(types.ts, 수정 금지)에는 쿨다운
 * 필드가 없어 이산 발사 대신 연속 DPS로 단순화했다. 웨이브 무관 고정값 — 후반 웨이브의
 * 난이도는 (baseHP × heat)로 오래 버티는 데서 나오게 하고, 공격력까지 올리면 조합 폭발적으로
 * 어려워진다.
 */
export const ENEMY_MELEE_DPS = 9;

/**
 * 적 1체가 본진(x<=0)에 도달했을 때 입히는 고정 피해. BASE_HP=100 기준으로, 마지막 웨이브
 * (14체, heat=1)를 전부 흘려보내도 즉사하지 않도록(14×6=84<100) 여유를 뒀다 — 몇 마리를
 * 놓쳐도 만회할 수 있어야 "13웨이브를 적당히 잘하면 깰 수 있다"는 목표에 맞는다.
 */
export const BASE_DAMAGE_PER_LEAK = 6;

/**
 * 공중 웨이브에서 전체 스폰 수 중 공중 레인에 배치할 비율. PRD §9.4는 "해당 웨이브에 공중
 * 적이 있는지(✓/−)"만 표기하고 지상/공중 분배 비율은 정하지 않아 여기서 고정값으로 정한다.
 * 1/3 정도로 잡아 대공 타워 투자 유인을 주되, 지상 방어가 무의미해지지 않게 한다.
 */
export const AIR_ENEMY_SHARE = 1 / 3;

/** 스킬(공시 폭탄) 즉시 피해량. 초반 웨이브 HP(50~90대)는 즉사시키고 후반(200대)은 크게 깎는 수준. */
export const SKILL_DAMAGE = 90;

// ── R1 웨이브 테이블 (§9.4, PRD 명시값) ──────────────────────────
/** 웨이브 1~13의 기본 적 수(heat 적용 전). 배열 인덱스 0 = 웨이브 1. */
export const WAVE_BASE_COUNT: readonly number[] = [3, 4, 5, 5, 6, 7, 7, 8, 9, 10, 11, 12, 14];
/** 웨이브 1~13의 기본 HP(heat 적용 전). 배열 인덱스 0 = 웨이브 1. */
export const WAVE_BASE_HP: readonly number[] = [50, 55, 60, 70, 80, 90, 105, 120, 140, 160, 185, 215, 260];
/** 공중 적이 포함되는 웨이브 번호(1-based) 집합. */
export const AIR_WAVE_NUMBERS: ReadonlySet<number> = new Set([3, 5, 7, 8, 10, 11, 12, 13]);

// ── 시뮬레이션 타임스텝 ───────────────────────────────────────────
/**
 * 내부 고정 서브스텝 상한(ms). `step()`에 큰 `dtMs`가 들어와도 이 크기로 잘게 쪼개 순차
 * 적용한다 — 적 최고 속도(ENEMY_SPEED_AIR ≈ 0.0625/s) 기준 250ms 동안 이동하는 진행도는
 * 약 0.016으로 라인 전체(1.0)에 비해 충분히 작아 "적이 사거리·본진을 건너뛰는" 터널링이
 * 일어나지 않는다.
 */
export const MAX_SUBSTEP_MS = 250;
/** 한 번의 `step()` 호출에서 처리할 dtMs 총합 상한. 탭 비활성 복귀 등 극단값 방어용. */
export const MAX_TOTAL_DT_MS = 10_000;
