/**
 * 스킬 상세 설명 툴팁의 **순수 내용 생성** (FR-6.6).
 *
 * ★ 왜 필요한가 ★
 * 플레이 피드백: "스킬별 설명 줘. 솔직히 잘 모르겠음." 버튼에는 이름·쿨다운·비용밖에 없어서
 * **무엇을 하는 스킬인지** 화면 어디에도 없었다. 플레이버 한 줄(`title`)은 분위기지 규칙이
 * 아니다 — 지상만 맞는지, 얼마나 아픈지, 무엇을 태우는지를 말해 주지 않는다.
 *
 * ★ 수치는 전부 `src/combat` 상수에서 파생시킨다 ★
 * 이 파일에 숫자를 적으면 밸런스를 고칠 때마다 설명이 조용히 거짓이 된다. 문자열 안의
 * 숫자는 반드시 템플릿 리터럴로 상수를 끼워 넣어라 — `skill-tooltip-logic.test.ts`가
 * "설명에 나오는 수치가 상수와 일치하는가"를 고정한다.
 *
 * DOM 배선은 `skill-tooltip.ts`가 한다(이 프로젝트 vitest에는 jsdom이 없다).
 */

import {
  SKILL_DAMAGE,
  SKILL_HEAL,
  SKILL_IDS,
  SKILL_SHIELD_DURATION_MS,
  SKILL_SPECS,
} from '../combat';
import type { SkillId, SkillSpec } from '../combat';
import { formatSkillCost } from './skill-bar-logic';

const MS_PER_SECOND = 1000;

/** 툴팁 한 줄 — 항목명과 값. */
export interface SkillTooltipRow {
  readonly label: string;
  readonly value: string;
}

export interface SkillTooltipContent {
  readonly id: SkillId;
  readonly title: string;
  /** 시트 §08의 플레이버. 규칙이 아니라 분위기이므로 표 아래 별도 줄로 둔다. */
  readonly flavor: string;
  readonly rows: readonly SkillTooltipRow[];
  /**
   * 강조가 필요한 경고 한 줄. `S-03`만 값이 있다 — AUM(매매 원금)을 태우는 유일한 스킬이라
   * "실드를 쓰면 그만큼 매매할 돈이 줄어든다"는 트레이드오프를 반드시 말해야 한다.
   */
  readonly caution: string | null;
}

/** `45000` → `45초`. 소수점이 필요 없는 값만 들어오므로 반올림한다. */
export function formatSeconds(ms: number): string {
  return `${Math.round(ms / MS_PER_SECOND)}초`;
}

/**
 * 스킬이 **무엇을 하는가** — 한 문장.
 *
 * 범위를 문장에 반드시 넣는다. `src/fx/skill-scope.ts`가 연출로 말하는 것과 같은 내용을
 * 글로도 말해야 "화면에서 본 것"과 "읽은 것"이 어긋나지 않는다.
 */
const EFFECT_TEXT: Readonly<Record<SkillId, string>> = {
  'S-01': '맵 전체의 지상 적에게 즉시 피해. 공중 적에게는 통하지 않는다',
  'S-02': '맵 전체의 아군 유닛을 즉시 회복. 유닛이 어디 있든 걸린다',
  'S-03': '본진이 받는 피해를 일정 시간 완전히 막는다',
};

/** 효과 범위 한 줄. 연출과 같은 말을 한다. */
const SCOPE_TEXT: Readonly<Record<SkillId, string>> = {
  'S-01': '맵 전체 · 지상 레인만',
  'S-02': '맵 전체 · 아군 유닛 전원',
  'S-03': '아군 사옥(본진) 한 지점',
};

/** 언제 쓰나 — 한 줄. */
const TIMING_TEXT: Readonly<Record<SkillId, string>> = {
  'S-01': '지상 무리가 뭉쳐서 밀려올 때. 공중 웨이브에는 아끼는 게 낫다',
  'S-02': '유닛이 반쯤 깎였을 때. 멀쩡한 부대에 쓰면 회복량이 그대로 버려진다',
  'S-03': '막지 못한 적이 본진에 동시에 닿기 직전. 지속시간이 짧아 미리 켜면 낭비다',
};

/** 수치 한 줄. **여기서만 숫자를 만든다** — 전부 `src/combat` 상수에서 온다. */
function amountText(id: SkillId): string {
  if (id === 'S-01') {
    return `피해 ${SKILL_DAMAGE} (적 1체당)`;
  }
  if (id === 'S-02') {
    return `회복 ${SKILL_HEAL} (유닛 1체당 · 최대 HP 초과분은 버려짐)`;
  }
  return `지속 ${formatSeconds(SKILL_SHIELD_DURATION_MS)} 동안 본진 피해 0`;
}

/**
 * `S-03` 전용 경고. AUM은 매매 원금이므로 실드를 쓰면 **그만큼 굴릴 돈이 줄어든다** —
 * 골드를 쓰는 다른 둘과 재화가 다르다는 사실이 툴팁에서 분명해야 한다(시트 §08이 이
 * 스킬만 보라로 지정한 이유).
 */
function cautionText(spec: SkillSpec): string | null {
  if (spec.currency !== 'aum') {
    return null;
  }
  return (
    `⚠ 골드가 아니라 AUM(매매 원금) ${spec.cost}을 태운다 — ` +
    '그만큼 이번 스테이지에 굴릴 돈이 줄어들고, 줄어든 원금은 골드 수입으로 돌아오지 않는다.'
  );
}

/** 스킬 하나의 툴팁 내용. */
export function skillTooltipContent(id: SkillId): SkillTooltipContent {
  const spec = SKILL_SPECS[id];
  return {
    id,
    title: spec.displayName,
    flavor: spec.flavor,
    rows: [
      { label: '효과', value: EFFECT_TEXT[id] },
      { label: '수치', value: amountText(id) },
      { label: '범위', value: SCOPE_TEXT[id] },
      { label: '비용', value: formatSkillCost(spec) },
      { label: '쿨다운', value: formatSeconds(spec.cooldownMs) },
      { label: '쓸 때', value: TIMING_TEXT[id] },
    ],
    caution: cautionText(spec),
  };
}

/** 3종 전부. 화면 순서와 같다. */
export const SKILL_TOOLTIPS: readonly SkillTooltipContent[] = SKILL_IDS.map(skillTooltipContent);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 툴팁 본문 마크업. `<dl>`을 쓰는 이유는 항목명–값 쌍이라는 구조가 스크린리더에도
 * 그대로 전달되기 때문이다 — 시각적 표와 낭독 순서가 같아진다.
 */
export function buildSkillTooltipMarkup(content: SkillTooltipContent): string {
  const rows = content.rows
    .map(
      (row) =>
        `<dt>${escapeHtml(row.label)}</dt><dd>${escapeHtml(row.value)}</dd>`,
    )
    .join('');

  const caution =
    content.caution === null
      ? ''
      : `<p class="skilltip__caution">${escapeHtml(content.caution)}</p>`;

  return (
    `<strong class="skilltip__title">${escapeHtml(content.title)}</strong>` +
    `<dl class="skilltip__rows">${rows}</dl>` +
    caution +
    `<p class="skilltip__flavor">${escapeHtml(content.flavor)}</p>`
  );
}

/**
 * 툴팁 좌측 x(px) — 버튼 중앙에 맞추되 **화면 밖으로 나가지 않게** 접는다.
 *
 * 툴팁은 위치 고정(fixed) 요소라 뷰포트 좌표를 그대로 쓴다. 툴팁이 뷰포트보다 넓으면
 * 접을 자리가 없으므로 왼쪽 여백에 붙인다(오른쪽이 잘리는 편이 왼쪽이 잘리는 것보다 낫다 —
 * 제목이 왼쪽에 있다).
 */
export function clampTooltipLeft(
  buttonLeft: number,
  buttonWidth: number,
  tipWidth: number,
  viewportWidth: number,
  margin: number,
): number {
  const centered = buttonLeft + buttonWidth / 2 - tipWidth / 2;
  const maxLeft = viewportWidth - margin - tipWidth;
  if (maxLeft <= margin) {
    return margin;
  }
  return Math.min(maxLeft, Math.max(margin, centered));
}

/** 툴팁 상단 y(px) — 기본은 버튼 위. 위 공간이 모자라면 버튼 아래로 뒤집는다. */
export function resolveTooltipTop(
  buttonTop: number,
  buttonHeight: number,
  tipHeight: number,
  gap: number,
  margin: number,
): number {
  const above = buttonTop - gap - tipHeight;
  if (above >= margin) {
    return above;
  }
  return buttonTop + buttonHeight + gap;
}
