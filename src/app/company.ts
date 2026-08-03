/**
 * 회사 화면 — 부서 업그레이드 UI (PRD FR-11.1).
 *
 * 판정은 전부 `departments.ts`에 있다. 이 파일은 **문자열만 만든다** —
 * `region-select.ts`·`codex.ts`와 같은 구조다.
 *
 * ★ 화면이 반드시 말해야 하는 것 ★
 * FR-11.4가 "자본금이 부족하면 버튼이 비활성이고 **부족액을 표시한다**"라고 못박는다.
 * 눌리지 않는 버튼만 두면 플레이어는 얼마가 모자란지 몰라 다음 행동을 정할 수 없다 —
 * 지역 잠금에서 `lockedNoticeFor`가 이유를 말하는 것과 같은 규칙이다.
 */

import type { DepartmentId, DepartmentLevels } from './departments';
import {
  DEPARTMENTS,
  MAX_DEPARTMENT_LEVEL,
  companyRank,
  departmentSpec,
  shortfall,
  upgradeCost,
} from './departments';

export const COMPANY_OPEN_ACTION = 'open-company';
export const COMPANY_BACK_ACTION = 'company-back';
export const COMPANY_UPGRADE_ACTION = 'company-upgrade';

export const COMPANY_TITLE = '회사 · 부서 편성';
export const COMPANY_BACK_LABEL = '← 타이틀로';
export const COMPANY_BUTTON_LABEL = '회사';

const TITLE_ID = 'company-title';

/** `1200` → `1,200`. 자본금은 네 자리를 넘으므로 구분자가 없으면 자릿수를 잘못 읽는다. */
export function formatCapital(value: number): string {
  return Math.max(0, Math.floor(value)).toLocaleString('en-US');
}

/** 레벨 표시 — 최대면 그 사실을 말한다. */
export function levelLabel(level: number): string {
  return level >= MAX_DEPARTMENT_LEVEL ? `Lv${level} · MAX` : `Lv${level}`;
}

/**
 * 업그레이드 버튼의 문구 한 줄.
 *
 * 세 상태를 **한 함수에서** 만든다 — 상태별로 문구를 흩어 놓으면 "비활성인데 살 수 있다고
 * 적힌" 조합이 생긴다(CLICK-PATH-003이 정확히 그 계열의 사고였다).
 */
export function upgradeLabel(
  id: DepartmentId,
  levels: DepartmentLevels,
  capital: number,
): string {
  const cost = upgradeCost(id, levels);
  if (cost === null) return '최대 레벨';
  const missing = shortfall(id, levels, capital);
  if (missing > 0) return `${formatCapital(missing)} 부족`;
  return `${formatCapital(cost)} 자본금`;
}

function departmentRow(
  id: DepartmentId,
  levels: DepartmentLevels,
  capital: number,
): string {
  const spec = departmentSpec(id);
  const level = levels[id];
  const cost = upgradeCost(id, levels);
  const affordable = cost !== null && shortfall(id, levels, capital) === 0;

  // 레벨 세 칸 — 지금 레벨까지 채워진다. 숫자만으로는 "얼마나 남았는지"가 안 읽힌다.
  const pips = [1, 2, 3]
    .map(
      (step) =>
        `<span class="dept__pip${step <= level ? ' dept__pip--on' : ''}" aria-hidden="true"></span>`,
    )
    .join('');

  return `
        <li class="dept">
          <div class="dept__head">
            <span class="dept__name">${spec.name}</span>
            <span class="dept__level">${levelLabel(level)}</span>
          </div>
          <p class="dept__effect">${spec.effect}</p>
          <div class="dept__pips">${pips}</div>
          <p class="dept__values">
            ${spec.display
              .map(
                (text, index) =>
                  `<span class="dept__value${index + 1 === level ? ' dept__value--on' : ''}">${text}</span>`,
              )
              .join('<span class="dept__arrow" aria-hidden="true">›</span>')}
          </p>
          <button class="dept__buy" type="button"
                  data-action="${COMPANY_UPGRADE_ACTION}" data-dept="${id}"
                  ${affordable ? '' : 'disabled aria-disabled="true"'}>
            ${upgradeLabel(id, levels, capital)}
          </button>
        </li>`;
}

/**
 * 회사 화면 본문. **열 때마다 다시 그린다** — 자본금과 레벨이 업그레이드 한 번에 둘 다
 * 바뀌므로 부분 갱신은 둘이 어긋날 여지만 만든다(도감·세계지도와 같은 판단).
 */
export function buildCompanyBodyMarkup(levels: DepartmentLevels, capital: number): string {
  const rows = DEPARTMENTS.map((dept) => departmentRow(dept.id, levels, capital)).join('');

  return `
      <div class="company__head">
        <div>
          <h2 class="company__title" id="${TITLE_ID}">${COMPANY_TITLE}</h2>
          <p class="company__eyebrow">COMPANY · RANK ${companyRank(levels)}</p>
        </div>
        <p class="company__capital">
          <span class="company__capital-label">자본금</span>
          <span class="company__capital-value">${formatCapital(capital)}</span>
        </p>
      </div>
      <p class="company__note">
        업그레이드는 되돌릴 수 없다 (FR-11.5). 효과는 <strong>다음 스테이지 진입부터</strong>
        적용되며, 이미 지어진 타워·소환된 유닛에는 소급되지 않는다.
      </p>
      <ul class="company__grid">${rows}</ul>`;
}

/** 회사 오버레이 껍데기. 본문은 열 때 채운다. */
export function buildCompanyMarkup(): string {
  return `
    <div class="company" data-ref="company" role="dialog" aria-modal="true"
         aria-labelledby="${TITLE_ID}" hidden>
      <div class="company__panel">
        <div data-ref="company-body"></div>
        <button class="company__back" type="button" data-action="${COMPANY_BACK_ACTION}">
          ${COMPANY_BACK_LABEL}
        </button>
      </div>
    </div>
  `;
}

/** 문자열이 실제 부서 ID인지 (버튼 `dataset` 값 검증용). */
export function departmentIdFor(value: string | undefined): DepartmentId | null {
  if (value === undefined) return null;
  return DEPARTMENTS.some((dept) => dept.id === value) ? (value as DepartmentId) : null;
}
