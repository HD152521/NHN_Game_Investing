/**
 * 로스터 DOM 배선 — 마크업 삽입과 hover/focus 정체 노출만 담당한다.
 *
 * 문자열 생성·조회는 전부 `roster-logic.ts`(순수)에 있다. 이 파일은 jsdom이 없는
 * 이 프로젝트의 테스트 대상이 아니므로, 판단 로직을 여기 두지 마라.
 */

import {
  ROSTER_FLAVOR_ATTR,
  TOWER_ROSTER,
  UNIT_ROSTER,
  buildRosterMarkup,
  resolveFlavorText,
} from './roster-logic';

export type { RosterButtonInput, RosterButtonState, RosterEntry } from './roster-logic';
export {
  ROSTER_FLAVOR_ATTR,
  TOWER_ROSTER,
  UNIT_ROSTER,
  buildRosterButton,
  buildRosterMarkup,
  formatCostLabel,
  formatUnaffordableNotice,
  resolveFlavorText,
  resolveRosterButtonState,
  rosterEntryFor,
} from './roster-logic';

/** 빌드바 타워 그룹 마크업(기존 `btn--build` 계약 유지). */
export function buildTowerRosterMarkup(): string {
  return buildRosterMarkup(TOWER_ROSTER, 'tower', 'btn--build');
}

/** 빌드바 유닛 그룹 마크업(기존 `btn--summon` 계약 유지). */
export function buildUnitRosterMarkup(): string {
  return buildRosterMarkup(UNIT_ROSTER, 'unit', 'btn--summon');
}

export interface RosterFlavorTip {
  destroy(): void;
}

export interface RosterFlavorTipOptions {
  /** 로스터 버튼들을 감싸는 요소. 이벤트는 여기서 위임 처리한다. */
  readonly root: HTMLElement;
  /** 정체 한 줄을 표시할 요소(예: 컨트롤 바의 안내 문구). */
  readonly target: HTMLElement;
  /**
   * hover/focus가 풀렸을 때 되돌릴 문구. 생략하면 **표시 직전의 문구를 스냅샷했다가
   * 되돌린다** — 안내 문구가 상황에 따라 바뀌는 곳(선택 로그 등)에 그대로 붙일 수 있다.
   */
  readonly fallbackText?: string;
}

function flavorOf(node: EventTarget | null): string | null {
  if (!(node instanceof Element)) {
    return null;
  }
  return node.closest(`[${ROSTER_FLAVOR_ATTR}]`)?.getAttribute(ROSTER_FLAVOR_ATTR) ?? null;
}

/**
 * 로스터 버튼에 hover/focus하면 정체 한 줄을 `target`에 띄운다.
 * 정체성이 플레이어에게 실제로 닿는 경로이므로 마우스(pointer)와 키보드(focus)를 모두 건다.
 */
export function createRosterFlavorTip(options: RosterFlavorTipOptions): RosterFlavorTip {
  const { root, target, fallbackText } = options;
  let restoreText: string | null = null;

  const show = (event: Event): void => {
    const flavor = flavorOf(event.target);
    if (flavor === null) {
      return;
    }
    if (restoreText === null) {
      restoreText = fallbackText ?? target.textContent ?? '';
    }
    target.textContent = resolveFlavorText(flavor, restoreText);
  };

  const clear = (): void => {
    if (restoreText === null) {
      return;
    }
    target.textContent = fallbackText ?? restoreText;
    restoreText = null;
  };

  root.addEventListener('pointerover', show);
  root.addEventListener('focusin', show);
  root.addEventListener('pointerout', clear);
  root.addEventListener('focusout', clear);

  return {
    destroy(): void {
      root.removeEventListener('pointerover', show);
      root.removeEventListener('focusin', show);
      root.removeEventListener('pointerout', clear);
      root.removeEventListener('focusout', clear);
    },
  };
}
