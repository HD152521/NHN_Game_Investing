/**
 * 소환·건설 로스터의 순수 표시 로직 (아트 시트 §09 "프레임은 비우고 글자는 코드에서 얹는다").
 *
 * 이름·정체 한 줄은 `src/combat/identity.ts`에서, 비용은 `src/combat/constants.ts`에서만
 * 읽는다. **이 파일에는 엔티티 이름 문자열도 비용 숫자도 직접 적지 않는다** — 두 곳에
 * 적히는 순간 UI와 밸런스가 조용히 어긋난다.
 *
 * DOM 조작은 `roster.ts`에 따로 둔다(이 프로젝트 vitest는 jsdom이 없어, 검증 가능한
 * 문자열 생성과 배선을 분리해야 테스트가 붙는다 — trade-panel과 같은 구조).
 */

import {
  ALLY_IDENTITY,
  TOWER_BUILD_COST,
  TOWER_IDENTITY,
  UNIT_COST,
} from '../combat';
import type { TowerKind, UnitKind } from '../combat';
import type { SilhouetteShape } from '../design';

/** 골드 단위 표기. */
const GOLD_UNIT = 'G';

/** 정체 한 줄을 싣는 속성 이름 — 마크업 생성과 DOM 배선이 같은 상수를 본다. */
export const ROSTER_FLAVOR_ATTR = 'data-flavor';

/** 로스터 버튼 하나가 화면에 내보내는 값 전부. */
export interface RosterEntry<K extends string = string> {
  /** `data-tower` / `data-unit` 값으로 나가는 기능 키. 화면 글자로는 쓰지 않는다. */
  readonly kind: K;
  readonly codeId: string;
  readonly displayName: string;
  /** 이름 아래 보조 한 단어 — 타워는 담당 레인, 유닛은 역할. */
  readonly subLabel: string;
  readonly flavor: string;
  readonly silhouette: SilhouetteShape;
  readonly cost: number;
}

const TOWER_KINDS: readonly TowerKind[] = ['basic', 'antiair', 'splash'];
const UNIT_KINDS: readonly UnitKind[] = ['intern', 'analyst', 'trader'];

export const TOWER_ROSTER: readonly RosterEntry<TowerKind>[] = TOWER_KINDS.map((kind) => {
  const identity = TOWER_IDENTITY[kind];
  return {
    kind,
    codeId: identity.codeId,
    displayName: identity.displayName,
    subLabel: identity.laneLabel,
    flavor: identity.flavor,
    silhouette: identity.silhouette,
    cost: TOWER_BUILD_COST[kind],
  };
});

export const UNIT_ROSTER: readonly RosterEntry<UnitKind>[] = UNIT_KINDS.map((kind) => {
  const identity = ALLY_IDENTITY[kind];
  return {
    kind,
    codeId: identity.codeId,
    displayName: identity.displayName,
    subLabel: identity.role,
    flavor: identity.flavor,
    silhouette: identity.silhouette,
    cost: UNIT_COST[kind],
  };
});

/** 종류 키(타워·유닛 공통) → 로스터 항목. 알 수 없는 키면 null. */
export function rosterEntryFor(kind: string): RosterEntry | null {
  const all: readonly RosterEntry[] = [...TOWER_ROSTER, ...UNIT_ROSTER];
  return all.find((entry) => entry.kind === kind) ?? null;
}

export function formatCostLabel(cost: number): string {
  return `${cost} ${GOLD_UNIT}`;
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** 로스터 버튼 하나의 마크업. 이름 / 보조 라벨 / 비용 3단은 기존 빌드바 CSS 계약이다. */
export function buildRosterButton(
  entry: RosterEntry,
  attrName: string,
  className: string,
): string {
  const flavor = escapeAttr(entry.flavor);
  return (
    `<button class="btn ${className}" type="button"` +
    ` data-${attrName}="${escapeAttr(entry.kind)}"` +
    ` data-code="${escapeAttr(entry.codeId)}"` +
    ` data-silhouette="${entry.silhouette}"` +
    ` ${ROSTER_FLAVOR_ATTR}="${flavor}" title="${flavor}">` +
    `${entry.displayName}<small>${entry.subLabel}</small>` +
    `<em>${formatCostLabel(entry.cost)}</em></button>`
  );
}

export function buildRosterMarkup(
  entries: readonly RosterEntry[],
  attrName: string,
  className: string,
): string {
  return entries.map((entry) => buildRosterButton(entry, attrName, className)).join('');
}

/** 로스터 버튼 하나의 현재 표시 상태 (`SkillButtonState`와 같은 계약). */
export interface RosterButtonState {
  readonly disabled: boolean;
  /** 골드가 모자라서 못 쓰는 상태인가 — 세션 부재와 다른 이유이므로 따로 알린다. */
  readonly unaffordable: boolean;
}

export interface RosterButtonInput {
  readonly cost: number;
  readonly gold: number;
  /** 스테이지가 굴러가고 있는가. 세션이 없으면 누를 대상 자체가 없다. */
  readonly hasSession: boolean;
}

/**
 * 로스터 버튼 활성 판정.
 *
 * ★ 소환 버튼은 **항상 활성**이었다 ★ 골드가 모자라면 `summonUnit`이 조용히 거부하는데
 * 화면에는 아무 표시도 변화도 없어서 "눌리는데 아무 일도 안 일어나는 버튼"이 됐다
 * (CLICK-PATH-004). 스킬 쪽 `resolveSkillButtonState`와 같은 규칙으로 맞춘다 —
 * 판정 기준은 소환 판정(`summonUnit`)의 거부 조건과 같아야 한다.
 */
export function resolveRosterButtonState(input: RosterButtonInput): RosterButtonState {
  if (!input.hasSession) {
    return { disabled: true, unaffordable: false };
  }
  const unaffordable = input.gold < input.cost;
  return { disabled: unaffordable, unaffordable };
}

/** 골드 부족으로 눌리지 않는 버튼을 눌렀을 때 화면에 남길 한 줄. */
export function formatUnaffordableNotice(displayName: string, cost: number): string {
  return `골드 부족 — ${displayName} 소환에 ${cost}G 필요`;
}

/** hover/focus 대상이 없을 때는 기본 안내 문구로 되돌린다. */
export function resolveFlavorText(flavor: string | null, fallback: string): string {
  return flavor !== null && flavor.length > 0 ? flavor : fallback;
}
