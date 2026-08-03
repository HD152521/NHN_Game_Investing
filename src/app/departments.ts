/**
 * 부서 업그레이드 5종 (PRD FR-11) — 마지막으로 남아 있던 P0.
 *
 * ★ 왜 지금까지 비어 있었나 ★
 * 부서는 **판을 넘어 쌓이는 것**이라 진행도 저장 없이는 존재할 수 없었다. 그래서
 * `GameProgress.carriedCapital`이 "지금은 항상 0이다. 자리만 잡아 둔다"는 주석과 함께
 * 먼저 들어와 있었고, `actions.ts`의 `summonUnit`에는 "이후 부서 업그레이드(FR-11)로
 * 상수가 바뀌어도 이미 소환된 유닛의 스탯은 소급되지 않아야 하므로, 조회가 아니라
 * 복사다"라는 주석이 먼저 들어와 있었다. 이 파일이 그 두 자리를 잇는다.
 *
 * ★ 효과는 전부 합연산이다 (FR-11.3 "곱연산 금지") ★
 * 배수를 곱해 쌓으면 레벨이 늘 때마다 실효 증가폭이 커져 밸런스가 위로 휜다.
 * 그래서 이 파일이 내보내는 것은 **완성된 최종 값**이지 "곱할 배수"가 아니다 —
 * 호출부가 곱셈을 조립할 여지를 주지 않는다.
 *
 * ★ 구조 ★
 * 순수 함수만 있다. 저장은 `progress.ts`, 화면은 `company.ts`가 맡는다.
 */

import { DEFAULT_POSITION_PARAMS } from '../position';
import { STAGES } from '../combat';
import type { StageId } from '../combat';

export type DepartmentId = 'desk' | 'rnd' | 'hr' | 'legal' | 'ir';

/** 부서 레벨. **1이 기본이고 0은 없다** — 부서 자체는 처음부터 존재한다. */
export type DepartmentLevel = 1 | 2 | 3;

export const MAX_DEPARTMENT_LEVEL: DepartmentLevel = 3;

/** 다섯 부서의 레벨. 화면·전투·정산이 전부 이 하나를 읽는다. */
export type DepartmentLevels = Readonly<Record<DepartmentId, DepartmentLevel>>;

/** 아무것도 올리지 않은 상태. */
export function baseDepartments(): DepartmentLevels {
  return { desk: 1, rnd: 1, hr: 1, legal: 1, ir: 1 };
}

interface DepartmentSpec {
  readonly id: DepartmentId;
  readonly name: string;
  /** 무엇이 좋아지는가 — 화면에 그대로 나간다. */
  readonly effect: string;
  /**
   * 레벨을 **올리는 데** 드는 자본금. 인덱스 0 = Lv1→Lv2, 인덱스 1 = Lv2→Lv3.
   * PRD FR-11.2 표의 "/ 뒤 숫자"가 이 값이다.
   */
  readonly costs: readonly [number, number];
  /** 레벨별 효과를 사람이 읽는 문자열로. 인덱스 0 = Lv1. */
  readonly display: readonly [string, string, string];
}

/**
 * FR-11.2 부서 표. **숫자의 단일 출처다.**
 *
 * 효과 값 자체(2000/2400/2800 …)는 아래 파생 함수가 들고 있고, 여기 `display`는 표시용
 * 문자열이다. 둘이 어긋날 수 있다는 점이 이 구조의 유일한 약점이라, 테스트가 둘을 대조한다.
 */
export const DEPARTMENTS: readonly DepartmentSpec[] = [
  {
    id: 'desk',
    name: '트레이딩 데스크',
    effect: '스테이지 시작 AUM',
    costs: [1200, 3000],
    display: ['기본', '+400', '+800'],
  },
  {
    id: 'rnd',
    name: 'R&D',
    effect: '타워 기본 피해',
    costs: [800, 2000],
    display: ['+0%', '+8%', '+16%'],
  },
  {
    id: 'hr',
    name: '인사팀',
    effect: '유닛 HP',
    costs: [800, 2000],
    display: ['+0%', '+10%', '+20%'],
  },
  {
    id: 'legal',
    name: '법무팀',
    effect: '강제 청산선 완화',
    costs: [1500, 3500],
    display: ['1.00', '1.15', '1.30'],
  },
  {
    id: 'ir',
    name: 'IR팀',
    effect: '정산 보너스',
    costs: [1000, 2500],
    display: ['+0%', '+5%', '+10%'],
  },
];

export const DEPARTMENT_ORDER: readonly DepartmentId[] = DEPARTMENTS.map((dept) => dept.id);

export function departmentSpec(id: DepartmentId): DepartmentSpec {
  const found = DEPARTMENTS.find((dept) => dept.id === id);
  // `DepartmentId`가 리터럴 유니온이라 실제로는 도달할 수 없다. 타입을 좁히기 위한 가드다.
  if (!found) throw new Error(`알 수 없는 부서: ${id}`);
  return found;
}

// ── 효과 — 전부 합연산, 전부 최종값 ─────────────────────────

/**
 * 트레이딩 데스크 — 스테이지 시작 AUM 가산분.
 *
 * PRD 표는 2000 / 2400 / 2800이지만, **기준값은 지역마다 다르다**(`STAGES[id].startingAum`).
 * 그래서 절대값이 아니라 **가산분**(+0 / +400 / +800)으로 둔다 — 지역 밸런스를 고쳐도
 * 부서 효과가 그 위에 그대로 얹힌다. 절대값으로 두면 R2·R3의 시작 AUM이 부서 표에
 * 덮여 지역 난이도가 사라진다.
 */
const DESK_AUM_BONUS: readonly [number, number, number] = [0, 400, 800];

export function startingAumFor(stageId: StageId, levels: DepartmentLevels): number {
  return STAGES[stageId].startingAum + DESK_AUM_BONUS[levels.desk - 1]!;
}

/** R&D — 타워 피해 배수. `buildTower`가 개체에 스냅샷한다. */
const RND_DAMAGE_BONUS: readonly [number, number, number] = [0, 0.08, 0.16];

export function towerDamageMultiplier(levels: DepartmentLevels): number {
  return 1 + RND_DAMAGE_BONUS[levels.rnd - 1]!;
}

/** 인사팀 — 유닛 HP 배수. `summonUnit`이 개체에 스냅샷한다. */
const HR_HP_BONUS: readonly [number, number, number] = [0, 0.1, 0.2];

export function unitHpMultiplier(levels: DepartmentLevels): number {
  return 1 + HR_HP_BONUS[levels.hr - 1]!;
}

/**
 * 법무팀 — 강제 청산선 (FR-11.2 · O-8).
 *
 * 기본값을 `DEFAULT_POSITION_PARAMS`에서 읽는다 — 표에 1.00이라 적혀 있어도 그 상수가
 * 바뀌면 Lv1이 따라가야 한다. 완화분만 여기서 더한다(합연산).
 */
const LEGAL_LINE_BONUS: readonly [number, number, number] = [0, 0.15, 0.3];

export function liquidationLineFor(levels: DepartmentLevels): number {
  return DEFAULT_POSITION_PARAMS.liquidationLine + LEGAL_LINE_BONUS[levels.legal - 1]!;
}

/**
 * IR팀 — 정산 보너스 **가산분**.
 *
 * `computeSettlement`의 `bonusMultiplier`는 이미 `1 + 무피해 + 적중률`로 조립된 합이다.
 * 여기서 배수를 돌려주면 호출부가 곱하게 되어 FR-11.3(곱연산 금지)을 어긴다 —
 * 그래서 **더할 값**을 준다.
 */
const IR_BONUS: readonly [number, number, number] = [0, 0.05, 0.1];

export function settlementBonusFor(levels: DepartmentLevels): number {
  return IR_BONUS[levels.ir - 1]!;
}

// ── 업그레이드 ───────────────────────────────────────────────

/**
 * 다음 레벨로 올리는 데 드는 자본금. **최대 레벨이면 `null`.**
 *
 * `null`은 "0원"과 전혀 다르다 — 0을 돌려주면 화면이 "0 자본금으로 업그레이드"라는
 * 눌리는 버튼을 그린다. 더 살 것이 없다는 사실은 타입에 남겨야 한다.
 */
export function upgradeCost(id: DepartmentId, levels: DepartmentLevels): number | null {
  const level = levels[id];
  if (level >= MAX_DEPARTMENT_LEVEL) return null;
  return departmentSpec(id).costs[level - 1] ?? null;
}

/** 지금 자본금으로 이 부서를 올릴 수 있는가 (FR-11.4). */
export function canUpgrade(
  id: DepartmentId,
  levels: DepartmentLevels,
  capital: number,
): boolean {
  const cost = upgradeCost(id, levels);
  return cost !== null && capital >= cost;
}

/** 모자란 자본금. 살 수 있거나 최대 레벨이면 0 (FR-11.4 "부족액을 표시한다"). */
export function shortfall(id: DepartmentId, levels: DepartmentLevels, capital: number): number {
  const cost = upgradeCost(id, levels);
  if (cost === null || capital >= cost) return 0;
  return cost - capital;
}

export interface UpgradeResult {
  readonly levels: DepartmentLevels;
  readonly capital: number;
  /** 실제로 올랐는가. 실패해도 값은 그대로 돌아온다(호출부가 분기하지 않아도 안전하다). */
  readonly ok: boolean;
}

/**
 * 업그레이드 1회 (불변). **환불은 없다** (FR-11.5).
 *
 * 자본금이 모자라거나 이미 최대면 아무것도 바꾸지 않고 `ok: false`를 돌려준다 —
 * 조용히 실패하고 성공 로그를 찍는 사고(CLICK-PATH-003)를 여기서부터 막는다.
 */
export function applyUpgrade(
  id: DepartmentId,
  levels: DepartmentLevels,
  capital: number,
): UpgradeResult {
  const cost = upgradeCost(id, levels);
  if (cost === null || capital < cost) {
    return { levels, capital, ok: false };
  }
  const next = (levels[id] + 1) as DepartmentLevel;
  return {
    levels: { ...levels, [id]: next },
    capital: capital - cost,
    ok: true,
  };
}

// ── 회사 등급 (FR-11.1) ──────────────────────────────────────

/** 부서 레벨 총합. 5(전부 Lv1) ~ 15(전부 Lv3). */
export function totalLevels(levels: DepartmentLevels): number {
  return DEPARTMENT_ORDER.reduce((sum, id) => sum + levels[id], 0);
}

/**
 * 회사 등급 — 부서 레벨 총합에서만 파생한다.
 *
 * 별도 상태로 두지 않는 이유는 이중 출처를 만들지 않기 위해서다. 등급은 요약이지
 * 사실이 아니다.
 */
export function companyRank(levels: DepartmentLevels): string {
  const total = totalLevels(levels);
  if (total >= 14) return 'S';
  if (total >= 11) return 'A';
  if (total >= 8) return 'B';
  return 'C';
}

// ── 손상 입력 방어 ───────────────────────────────────────────

function isLevel(value: unknown): value is DepartmentLevel {
  return value === 1 || value === 2 || value === 3;
}

/**
 * 저장에서 읽은 값을 부서 레벨로 정규화한다.
 *
 * 모르는 값·범위 밖·소수는 **해당 부서만** 1로 떨어진다. 전체를 버리지 않는 이유는
 * 부서 다섯 개가 서로 독립이기 때문이다 — 하나가 깨졌다고 나머지 넷을 잃을 이유가 없다.
 */
export function normalizeDepartments(value: unknown): DepartmentLevels {
  const base = baseDepartments();
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return base;
  const record = value as Record<string, unknown>;

  const out: Record<DepartmentId, DepartmentLevel> = { ...base };
  for (const id of DEPARTMENT_ORDER) {
    const level = record[id];
    if (isLevel(level)) out[id] = level;
  }
  return out;
}
