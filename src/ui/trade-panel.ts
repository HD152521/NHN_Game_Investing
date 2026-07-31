/**
 * 매매 패널 DOM 컴포넌트 — 프레임워크 없이 순수 DOM으로 구현한다 (신규 의존성 금지).
 *
 * 성능 요구(타협 불가): `update()`는 초당 60회 호출된다. 마크업은 `createTradePanel`
 * 호출 시 1회만 짓고(innerHTML 1회), 이후 `update()`에서는 textContent와 classList만
 * 갱신한다 — 매 프레임 `innerHTML`을 다시 쓰지 않는다.
 *
 * 문자열 포맷팅·클래스 계산·아나운스 문구 판단은 전부 `trade-panel-logic.ts`의
 * 순수 함수에 위임한다. 이 파일은 DOM 배선만 담당한다.
 */

import {
  formatAmount,
  formatDistance,
  formatPnl,
  formatStakeRatioLabel,
  resolveAnnouncement,
  resolveDirectionLabel,
  resolveStateClasses,
  STAKE_RATIOS,
} from './trade-panel-logic';
import type {
  StakeRatio,
  TradePanelHandlers,
  TradePanelViewModel,
} from './trade-panel-logic';

export type {
  Direction,
  StakeRatio,
  TradePanelHandlers,
  TradePanelViewModel,
} from './trade-panel-logic';
export {
  formatAmount,
  formatDistance,
  formatPnl,
  formatStakeRatioLabel,
  resolveAnnouncement,
  resolveDirectionLabel,
  resolvePnlTone,
  resolveStateClasses,
  STAKE_RATIOS,
} from './trade-panel-logic';

/** 매매 패널 공개 API. */
export interface TradePanel {
  readonly element: HTMLElement;
  update(vm: TradePanelViewModel): void;
  destroy(): void;
}

interface PanelRefs {
  readonly idle: HTMLElement;
  readonly holding: HTMLElement;
  readonly longButton: HTMLButtonElement;
  readonly shortButton: HTMLButtonElement;
  readonly closeButton: HTMLButtonElement;
  readonly stakeButtons: readonly HTMLButtonElement[];
  readonly direction: HTMLElement;
  readonly stakeAmount: HTMLElement;
  readonly pnl: HTMLElement;
  readonly distance: HTMLElement;
  readonly positions: HTMLElement;
  readonly aum: HTMLElement;
  readonly gold: HTMLElement;
  readonly announce: HTMLElement;
}

function buildMarkup(): string {
  const stakeButtons = STAKE_RATIOS.map(
    (ratio) =>
      `<button class="trade-panel__stake" type="button" data-ratio="${ratio}">${formatStakeRatioLabel(ratio)}</button>`,
  ).join('');

  return `
    <div class="trade-panel__idle" data-ref="idle">
      <div class="trade-panel__actions">
        <button class="trade-panel__btn trade-panel__btn--long" type="button" data-action="open-long">LONG ▲</button>
        <button class="trade-panel__btn trade-panel__btn--short" type="button" data-action="open-short">SHORT ▼</button>
      </div>
      <div class="trade-panel__stakes">
        <span class="trade-panel__stakes-label">투입</span>
        ${stakeButtons}
      </div>
    </div>
    <div class="trade-panel__holding" data-ref="holding" hidden>
      <span class="trade-panel__field">
        <span class="trade-panel__direction" data-ref="direction">—</span>
        <span class="trade-panel__stake-amount" data-ref="stake-amount">0</span>
      </span>
      <span class="trade-panel__field">
        <span class="trade-panel__label">평가손익</span>
        <span class="trade-panel__pnl" data-ref="pnl">0 G</span>
      </span>
      <span class="trade-panel__field">
        <span class="trade-panel__label">청산선까지</span>
        <span class="trade-panel__distance" data-ref="distance">0.00σ</span>
      </span>
      <button class="trade-panel__btn trade-panel__btn--close" type="button" data-action="close">청산</button>
    </div>
    <div class="trade-panel__meta">
      <span data-ref="positions">0/0</span>
      <span data-ref="aum">0 AUM</span>
      <span data-ref="gold">0 G</span>
    </div>
    <span class="sr-only" role="status" aria-live="polite" data-ref="announce"></span>
  `;
}

function requireElement<T extends Element>(root: Element, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) {
    throw new Error(`trade-panel: 마크업에서 "${selector}" 를 찾지 못했습니다.`);
  }
  return found;
}

function collectRefs(root: HTMLElement): PanelRefs {
  return {
    idle: requireElement<HTMLElement>(root, '[data-ref="idle"]'),
    holding: requireElement<HTMLElement>(root, '[data-ref="holding"]'),
    longButton: requireElement<HTMLButtonElement>(root, '[data-action="open-long"]'),
    shortButton: requireElement<HTMLButtonElement>(root, '[data-action="open-short"]'),
    closeButton: requireElement<HTMLButtonElement>(root, '[data-action="close"]'),
    stakeButtons: Array.from(root.querySelectorAll<HTMLButtonElement>('[data-ratio]')),
    direction: requireElement<HTMLElement>(root, '[data-ref="direction"]'),
    stakeAmount: requireElement<HTMLElement>(root, '[data-ref="stake-amount"]'),
    pnl: requireElement<HTMLElement>(root, '[data-ref="pnl"]'),
    distance: requireElement<HTMLElement>(root, '[data-ref="distance"]'),
    positions: requireElement<HTMLElement>(root, '[data-ref="positions"]'),
    aum: requireElement<HTMLElement>(root, '[data-ref="aum"]'),
    gold: requireElement<HTMLElement>(root, '[data-ref="gold"]'),
    announce: requireElement<HTMLElement>(root, '[data-ref="announce"]'),
  };
}

/** `data-ratio` 문자열 속성 → `StakeRatio` 숫자. 알 수 없는 값이면 `null`. */
function parseStakeRatio(raw: string | undefined): StakeRatio | null {
  if (raw === undefined) {
    return null;
  }
  const parsed = Number(raw);
  const match = STAKE_RATIOS.find((ratio) => ratio === parsed);
  return match ?? null;
}

/**
 * 매매 패널을 만든다. 마크업은 이 호출 시 1회만 구축되고,
 * 이후 `update()`는 텍스트·클래스만 갱신한다.
 */
export function createTradePanel(handlers: TradePanelHandlers): TradePanel {
  const element = document.createElement('section');
  element.className = 'trade-panel trade-panel--idle';
  element.innerHTML = buildMarkup();

  const refs = collectRefs(element);

  refs.longButton.addEventListener('click', () => handlers.onOpen('long'));
  refs.shortButton.addEventListener('click', () => handlers.onOpen('short'));
  refs.closeButton.addEventListener('click', () => handlers.onClose());

  const stakeButtonRatios = new Map<HTMLButtonElement, StakeRatio>();
  for (const button of refs.stakeButtons) {
    const ratio = parseStakeRatio(button.dataset['ratio']);
    if (ratio === null) {
      continue;
    }
    stakeButtonRatios.set(button, ratio);
    button.addEventListener('click', () => handlers.onStakeRatioChange(ratio));
  }

  let previous: TradePanelViewModel | null = null;

  function update(vm: TradePanelViewModel): void {
    element.className = ['trade-panel', ...resolveStateClasses(vm)].join(' ');

    refs.idle.hidden = vm.holding;
    refs.holding.hidden = !vm.holding;

    refs.longButton.disabled = vm.holding || !vm.canOpen;
    refs.shortButton.disabled = vm.holding || !vm.canOpen;
    refs.closeButton.disabled = !vm.holding || !vm.canClose;

    for (const [button, ratio] of stakeButtonRatios) {
      button.classList.toggle('trade-panel__stake--active', ratio === vm.stakeRatio);
      button.disabled = vm.holding;
    }

    refs.direction.textContent = resolveDirectionLabel(vm.direction);
    refs.stakeAmount.textContent = formatAmount(vm.stake);
    refs.pnl.textContent = formatPnl(vm.pnl);
    refs.distance.textContent = formatDistance(vm.distanceToLiquidation);

    refs.positions.textContent = `${vm.positionsUsed}/${vm.positionsMax}`;
    refs.aum.textContent = `${formatAmount(vm.aum)} AUM`;
    refs.gold.textContent = `${formatAmount(vm.gold)} G`;

    const announcement = resolveAnnouncement(previous, vm);
    if (announcement !== null) {
      refs.announce.textContent = announcement;
    }
    previous = vm;
  }

  function destroy(): void {
    element.remove();
  }

  return { element, update, destroy };
}
