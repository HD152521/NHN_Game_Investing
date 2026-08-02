/**
 * 스킬 툴팁 DOM 배선 — hover **와 focus** 양쪽에서 뜬다.
 *
 * 판단·문자열 생성은 전부 `skill-tooltip-logic.ts`(순수)에 있다. 이 파일은 jsdom이 없는
 * 이 프로젝트의 테스트 대상이 아니므로, 규칙을 여기 두지 마라 —
 * `roster.ts`의 `createRosterFlavorTip`과 같은 분리다.
 *
 * ★ 왜 마우스만으로는 안 되는가 ★
 * 스킬 설명은 장식이 아니라 **규칙**이다(무엇을 태우는지, 지상만 맞는지). 마우스 전용으로
 * 만들면 키보드·스크린리더 사용자에게는 그 규칙이 존재하지 않는 것과 같다. 그래서
 * `focusin`/`focusout`을 함께 걸고, 툴팁을 `aria-describedby`로 버튼에 묶는다.
 */

import { skillIdFor } from './skill-bar-logic';
import { buildSkillTooltipMarkup, clampTooltipLeft, resolveTooltipTop, skillTooltipContent } from './skill-tooltip-logic';

/** 툴팁과 버튼 사이 간격(px). */
const TOOLTIP_GAP_PX = 10;
/** 뷰포트 가장자리 최소 여백(px). */
const TOOLTIP_MARGIN_PX = 8;

/** 툴팁 요소의 id — `aria-describedby`가 가리키는 값이다. */
export const SKILL_TOOLTIP_ID = 'skill-tooltip';

export interface SkillTooltip {
  destroy(): void;
}

export interface SkillTooltipOptions {
  /** 스킬 버튼들을 감싸는 요소. 이벤트는 여기서 위임 처리한다. */
  readonly root: HTMLElement;
  /** 툴팁을 붙일 곳. 생략하면 `document.body`. */
  readonly layer?: HTMLElement;
}

function skillButtonOf(node: EventTarget | null): HTMLElement | null {
  if (!(node instanceof Element)) {
    return null;
  }
  const button = node.closest<HTMLElement>('[data-skill]');
  return button ?? null;
}

/**
 * 스킬 버튼에 hover/focus 하면 상세 설명 툴팁을 띄운다.
 *
 * 버튼의 네이티브 `title`은 마운트 시 걷어낸다 — 브라우저 기본 툴팁이 같은 자리에 겹쳐
 * 뜨면 어느 쪽이 진짜 설명인지 알 수 없다. 걷어낸 문구는 이 툴팁의 플레이버 줄에
 * 그대로 들어 있으므로 정보가 사라지지는 않는다.
 */
export function createSkillTooltip(options: SkillTooltipOptions): SkillTooltip {
  const { root } = options;
  const layer = options.layer ?? document.body;

  const tip = document.createElement('div');
  tip.className = 'skilltip';
  tip.id = SKILL_TOOLTIP_ID;
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  layer.appendChild(tip);

  const buttons = Array.from(root.querySelectorAll<HTMLElement>('[data-skill]'));
  const strippedTitles = new Map<HTMLElement, string>();
  for (const button of buttons) {
    const title = button.getAttribute('title');
    if (title !== null) {
      strippedTitles.set(button, title);
      button.removeAttribute('title');
    }
  }

  function place(button: HTMLElement): void {
    const anchor = button.getBoundingClientRect();
    const box = tip.getBoundingClientRect();
    tip.style.left = `${clampTooltipLeft(anchor.left, anchor.width, box.width, window.innerWidth, TOOLTIP_MARGIN_PX)}px`;
    tip.style.top = `${resolveTooltipTop(anchor.top, anchor.height, box.height, TOOLTIP_GAP_PX, TOOLTIP_MARGIN_PX)}px`;
  }

  let current: HTMLElement | null = null;

  const show = (event: Event): void => {
    const button = skillButtonOf(event.target);
    if (button === null) {
      return;
    }
    const id = skillIdFor(button.dataset['skill']);
    if (id === null) {
      return;
    }

    current = button;
    tip.innerHTML = buildSkillTooltipMarkup(skillTooltipContent(id));
    tip.hidden = false;
    button.setAttribute('aria-describedby', SKILL_TOOLTIP_ID);
    // 내용을 넣은 뒤에 재야 실제 크기로 접힌다(빈 요소의 크기로 재면 항상 중앙에 붙는다).
    place(button);
  };

  const hide = (): void => {
    if (current === null) {
      return;
    }
    current.removeAttribute('aria-describedby');
    current = null;
    tip.hidden = true;
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    // Esc로 닫을 수 있어야 한다 — 툴팁이 아래 내용을 가릴 때의 탈출구(WCAG 1.4.13).
    if (event.key === 'Escape') {
      hide();
    }
  };

  root.addEventListener('pointerover', show);
  root.addEventListener('focusin', show);
  root.addEventListener('pointerout', hide);
  root.addEventListener('focusout', hide);
  window.addEventListener('keydown', onKeyDown);
  // 스크롤·리사이즈로 버튼이 움직이면 툴팁이 허공에 남는다. 다시 재기보다 닫는 쪽이 안전하다.
  window.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);

  return {
    destroy(): void {
      root.removeEventListener('pointerover', show);
      root.removeEventListener('focusin', show);
      root.removeEventListener('pointerout', hide);
      root.removeEventListener('focusout', hide);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
      for (const [button, title] of strippedTitles) {
        button.setAttribute('title', title);
      }
      hide();
      tip.remove();
    },
  };
}
