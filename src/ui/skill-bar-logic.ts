/**
 * 스킬 바의 순수 표시 로직 (FR-6.6, 아트 시트 §08).
 *
 * `roster-logic.ts`와 같은 구조다: 이름·비용·쿨다운 값은 전부 `src/combat`이 단일 출처이며
 * 여기서는 **문자열로 옮기기만** 한다. DOM 배선은 `src/app/stage.ts`가 한다(이 프로젝트
 * vitest에는 jsdom이 없어, 검증 가능한 문자열 생성과 배선을 분리해야 테스트가 붙는다).
 *
 * ★ 재화가 갈린다는 사실이 버튼만 보고 읽혀야 한다 ★
 * 스킬 3종 중 `S-03`만 AUM(매매 원금)을 태운다. 시트 §08이 이 스킬만 보라(`AUM` 토큰)로
 * 지정한 이유가 "자금을 태워 시간을 사는 스킬임을 색으로 알린다"이므로, 색 구분은 장식이
 * 아니라 **정보**다 — 클래스를 비용 문자열과 같은 곳(`SKILL_SPECS.currency`)에서 파생시켜
 * 둘이 어긋날 수 없게 한다.
 */

import { SKILL_IDS, SKILL_SPECS } from '../combat';
import type { SkillCurrency, SkillId, SkillSpec } from '../combat';

/** 재화별 단위 표기. */
const CURRENCY_UNIT: Readonly<Record<SkillCurrency, string>> = {
  gold: 'G',
  aum: 'AUM',
};

/** AUM 스킬에만 붙는 수식 클래스. 골드 스킬과 테두리·강조색이 갈린다(shell.css). */
export const SKILL_AUM_CLASS = 'btn--skill-aum';

/** 쿨다운이 끝난 상태의 표기. */
export const SKILL_READY_LABEL = 'READY';

const MS_PER_SECOND = 1000;

/** 화면 순서대로 정렬된 스킬 정의. */
export const SKILL_BAR_ENTRIES: readonly SkillSpec[] = SKILL_IDS.map((id) => SKILL_SPECS[id]);

/** `200 G` / `150 AUM`. 재화 단위를 반드시 함께 낸다 — 숫자만 보면 골드로 오해한다. */
export function formatSkillCost(spec: SkillSpec): string {
  return `${spec.cost} ${CURRENCY_UNIT[spec.currency]}`;
}

/** 버튼 클래스. AUM 스킬이면 수식 클래스가 하나 더 붙는다. */
export function skillButtonClass(spec: SkillSpec): string {
  return spec.currency === 'aum' ? `btn--skill ${SKILL_AUM_CLASS}` : 'btn--skill';
}

/**
 * 쿨다운 표기. 준비됐으면 `READY`, 아니면 남은 초를 **올림**해서 보여준다.
 *
 * 올림인 이유: 내림이면 0.4초 남았을 때 `0s`가 떠서 눌러도 안 눌리는 상태가 된다.
 */
export function formatSkillCooldown(remainingMs: number): string {
  if (remainingMs <= 0) {
    return SKILL_READY_LABEL;
  }
  return `${Math.ceil(remainingMs / MS_PER_SECOND)}s`;
}

/** 버튼 하나의 현재 표시 상태. */
export interface SkillButtonState {
  readonly cooldownLabel: string;
  readonly disabled: boolean;
  /** 재화가 모자라서 못 쓰는 상태인가 — 쿨다운과 다른 이유이므로 따로 알린다. */
  readonly unaffordable: boolean;
}

export interface SkillButtonInput {
  readonly spec: SkillSpec;
  readonly remainingMs: number;
  readonly gold: number;
  readonly aum: number;
}

/**
 * 버튼 활성 판정. **`castSkill`의 거부 조건과 같은 규칙**이어야 한다 — 눌리는데 아무 일도
 * 일어나지 않는 버튼은 재화 규칙을 화면에서 지워 버린다.
 */
export function resolveSkillButtonState(input: SkillButtonInput): SkillButtonState {
  const balance = input.spec.currency === 'gold' ? input.gold : input.aum;
  const unaffordable = balance < input.spec.cost;
  return {
    cooldownLabel: formatSkillCooldown(input.remainingMs),
    disabled: unaffordable || input.remainingMs > 0,
    unaffordable,
  };
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** `data-skill` 값으로 나가는 스킬 ID를 되읽는다. 알 수 없는 값이면 null. */
export function skillIdFor(value: string | undefined): SkillId | null {
  return SKILL_IDS.find((id) => id === value) ?? null;
}

/** 스킬 버튼 하나의 마크업. 쿨다운 칸(`small`)은 매 프레임 셸이 덮어쓴다. */
export function buildSkillButton(spec: SkillSpec): string {
  const flavor = escapeAttr(spec.flavor);
  return (
    `<button class="btn ${skillButtonClass(spec)}" type="button"` +
    ` data-skill="${escapeAttr(spec.id)}"` +
    ` data-currency="${spec.currency}"` +
    ` data-flavor="${flavor}" title="${flavor}">` +
    `${escapeAttr(spec.displayName)}<small>${SKILL_READY_LABEL}</small>` +
    `<em>${formatSkillCost(spec)}</em></button>`
  );
}

export function buildSkillBarMarkup(): string {
  return SKILL_BAR_ENTRIES.map(buildSkillButton).join('');
}
