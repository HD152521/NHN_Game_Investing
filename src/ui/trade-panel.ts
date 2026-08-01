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
  canAffordStakeRatio,
  formatAddStakePreview,
  formatAmount,
  formatDistance,
  formatPnl,
  formatPrice,
  formatStakeRatioLabel,
  resolveAddButtonLabel,
  resolveAddCountLabel,
  resolveAnnouncement,
  resolveDirectionLabel,
  resolveEntriesLeftLabel,
  resolvePriceTone,
  resolveStateClasses,
  STAKE_RATIOS,
} from './trade-panel-logic';
import type {
  StakeRatio,
  TradePanelHandlers,
  TradePanelViewModel,
} from './trade-panel-logic';
import { mountPredictionButtonArt } from './sprite-buttons';
import type { PredictionArtOptions } from './sprite-buttons';

export type {
  Direction,
  StakeRatio,
  TradePanelHandlers,
  TradePanelViewModel,
} from './trade-panel-logic';
export {
  canAffordStakeRatio,
  formatAddStakePreview,
  formatAmount,
  formatDistance,
  formatPnl,
  formatPrice,
  formatStakeRatioLabel,
  resolveAddButtonLabel,
  resolveAddCountLabel,
  resolveAnnouncement,
  resolveDirectionLabel,
  resolveEntriesLeftLabel,
  resolvePnlTone,
  resolvePriceTone,
  resolveStakeAmount,
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
  readonly addButton: HTMLButtonElement;
  readonly closeButton: HTMLButtonElement;
  readonly stakeButtons: readonly HTMLButtonElement[];
  readonly direction: HTMLElement;
  readonly stakeAmount: HTMLElement;
  readonly avgPrice: HTMLElement;
  readonly currentPrice: HTMLElement;
  readonly addCountField: HTMLElement;
  readonly addCount: HTMLElement;
  readonly addPreview: HTMLElement;
  readonly entriesLeft: HTMLElement;
  readonly pnl: HTMLElement;
  readonly distance: HTMLElement;
  readonly positions: HTMLElement;
  readonly aum: HTMLElement;
  readonly gold: HTMLElement;
  readonly announce: HTMLElement;
}

/**
 * 투입 비율 선택기는 **두 벌** 존재한다 — 신규 진입용(`open`)과 추가 매수용(`add`).
 * 같은 `stakeRatio` 상태를 공유하지만(어느 쪽을 눌러도 `onStakeRatioChange` 하나로
 * 모인다) 붙는 자리가 달라서, 보유 중에도 비율을 그 자리에서 고를 수 있다.
 * 라벨을 "투입"/"추가 투입"으로 나눠 두 선택기가 서로 다른 행동을 준비한다는 걸 알린다.
 */
type StakeVariant = 'open' | 'add';

function buildStakeButtons(variant: StakeVariant): string {
  return STAKE_RATIOS.map(
    (ratio) =>
      `<button class="trade-panel__stake" type="button" data-ratio="${ratio}" data-stake-variant="${variant}">${formatStakeRatioLabel(ratio)}</button>`,
  ).join('');
}

function buildMarkup(): string {
  return `
    <div class="trade-panel__idle" data-ref="idle">
      <!--
        예측 버튼 배경(tf-ui-btn)은 data-btn-art 자리에 마운트 시 1회 꽂힌다.
        라벨은 별도 레이어(__btn-label)로 배경 위에 남는다 — ▲/▼ 이중 인코딩
        (design/encoding.ts)이 스프라이트에 가려지면 색약 모드에서 방향을 잃기 때문이다.
      -->
      <div class="trade-panel__actions">
        <button class="trade-panel__btn trade-panel__btn--long trade-panel__btn--predict" type="button" data-action="open-long"><span class="trade-panel__btn-art" data-btn-art="long" aria-hidden="true"></span><span class="trade-panel__btn-label">LONG ▲</span></button>
        <button class="trade-panel__btn trade-panel__btn--short trade-panel__btn--predict" type="button" data-action="open-short"><span class="trade-panel__btn-art" data-btn-art="short" aria-hidden="true"></span><span class="trade-panel__btn-label">SHORT ▼</span></button>
      </div>
      <div class="trade-panel__stakes" role="group" aria-label="신규 진입 투입 비율">
        <span class="trade-panel__stakes-label">투입</span>
        ${buildStakeButtons('open')}
      </div>
    </div>
    <div class="trade-panel__holding" data-ref="holding" hidden>
      <span class="trade-panel__field">
        <span class="trade-panel__direction" data-ref="direction">—</span>
        <span class="trade-panel__stake-amount" data-ref="stake-amount">0</span>
      </span>
      <span class="trade-panel__field">
        <span class="trade-panel__label">평단가 / 현재가</span>
        <span class="trade-panel__price">
          <span class="trade-panel__avg-price" data-ref="avg-price">-</span>
          <span class="trade-panel__price-sep" aria-hidden="true">/</span>
          <span class="trade-panel__current-price" data-ref="current-price">-</span>
        </span>
      </span>
      <span class="trade-panel__field" data-ref="add-count-field" hidden>
        <span class="trade-panel__label">추가 매수</span>
        <span class="trade-panel__add-count" data-ref="add-count"></span>
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
      <!--
        추가 매수 행 — 비율 선택기를 보유 중에도 노출한다(플레이 피드백 ②).
        분모가 **현재 AUM**이라 신규 진입 때와 금액이 달라지므로, 비율 옆에
        "AUM 2,000 × 25% = 500" 미리보기를 붙여 계산 결과를 숫자로 못 박는다.
        추가 버튼을 같은 행에 둬서 "고른 비율 → 이 버튼" 연결이 눈으로 이어지게 한다.
      -->
      <div class="trade-panel__add-row">
        <div class="trade-panel__stakes trade-panel__stakes--add" role="group" aria-label="추가 매수 투입 비율">
          <span class="trade-panel__stakes-label">추가 투입</span>
          ${buildStakeButtons('add')}
        </div>
        <span class="trade-panel__stake-preview" data-ref="add-preview">-</span>
        <span class="trade-panel__entries-left" data-ref="entries-left">-</span>
        <button class="trade-panel__btn trade-panel__btn--add" type="button" data-action="add">추가</button>
      </div>
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
    addButton: requireElement<HTMLButtonElement>(root, '[data-action="add"]'),
    closeButton: requireElement<HTMLButtonElement>(root, '[data-action="close"]'),
    stakeButtons: Array.from(root.querySelectorAll<HTMLButtonElement>('[data-ratio]')),
    direction: requireElement<HTMLElement>(root, '[data-ref="direction"]'),
    stakeAmount: requireElement<HTMLElement>(root, '[data-ref="stake-amount"]'),
    avgPrice: requireElement<HTMLElement>(root, '[data-ref="avg-price"]'),
    currentPrice: requireElement<HTMLElement>(root, '[data-ref="current-price"]'),
    addCountField: requireElement<HTMLElement>(root, '[data-ref="add-count-field"]'),
    addCount: requireElement<HTMLElement>(root, '[data-ref="add-count"]'),
    addPreview: requireElement<HTMLElement>(root, '[data-ref="add-preview"]'),
    entriesLeft: requireElement<HTMLElement>(root, '[data-ref="entries-left"]'),
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
export function createTradePanel(
  handlers: TradePanelHandlers,
  artOptions: PredictionArtOptions = {},
): TradePanel {
  const element = document.createElement('section');
  element.className = 'trade-panel trade-panel--idle';
  element.innerHTML = buildMarkup();

  // 예측 버튼 배경은 여기서 1회만 굽는다. 실패해도(캔버스 없는 환경) CSS 배경으로 남는다.
  mountPredictionButtonArt(element, artOptions);

  const refs = collectRefs(element);

  refs.longButton.addEventListener('click', () => handlers.onOpen('long'));
  refs.shortButton.addEventListener('click', () => handlers.onOpen('short'));
  refs.closeButton.addEventListener('click', () => handlers.onClose());

  // 두 선택기(신규 진입 / 추가 매수)의 버튼이 한 맵에 모인다 — 어느 쪽을 눌러도
  // 같은 `stakeRatio` 하나를 갱신하므로 두 벌의 활성 표시가 항상 일치한다.
  const stakeButtonEntries = new Map<HTMLButtonElement, { ratio: StakeRatio; variant: string }>();
  for (const button of refs.stakeButtons) {
    const ratio = parseStakeRatio(button.dataset['ratio']);
    if (ratio === null) {
      continue;
    }
    stakeButtonEntries.set(button, {
      ratio,
      variant: button.dataset['stakeVariant'] ?? 'open',
    });
    button.addEventListener('click', () => handlers.onStakeRatioChange(ratio));
  }

  let latest: TradePanelViewModel | null = null;

  // 추가 매수는 "현재 선택된 투입 비율"로 실행된다 — 클릭 시점의 최신 뷰모델에서
  // stakeRatio를 읽는다 (update()가 매 프레임 latest를 갱신해두므로 항상 최신값).
  refs.addButton.addEventListener('click', () => {
    if (latest === null) {
      return;
    }
    handlers.onAdd(latest.stakeRatio);
  });

  function update(vm: TradePanelViewModel): void {
    element.className = ['trade-panel', ...resolveStateClasses(vm)].join(' ');

    refs.idle.hidden = vm.holding;
    refs.holding.hidden = !vm.holding;

    refs.longButton.disabled = vm.holding || !vm.canOpen;
    refs.shortButton.disabled = vm.holding || !vm.canOpen;
    // 고른 비율의 실제 금액이 0이면(AUM 부족) 눌러도 아무것도 사지 못한다 — 막는다.
    const affordable = canAffordStakeRatio(vm.aum, vm.stakeRatio);
    refs.addButton.disabled = !vm.holding || !vm.canAdd || !affordable;
    refs.closeButton.disabled = !vm.holding || !vm.canClose;

    for (const [button, entry] of stakeButtonEntries) {
      button.classList.toggle('trade-panel__stake--active', entry.ratio === vm.stakeRatio);
      // 신규 진입 선택기는 기존 동작 그대로 둔다(항상 선택 가능).
      // 추가 매수 선택기만 현재 AUM 기준으로 감당 못 하는 비율을 비활성화한다.
      if (entry.variant === 'add') {
        button.disabled = !vm.holding || !canAffordStakeRatio(vm.aum, entry.ratio);
      }
    }

    refs.direction.textContent = resolveDirectionLabel(vm.direction);
    refs.stakeAmount.textContent = formatAmount(vm.stake);

    refs.avgPrice.textContent = formatPrice(vm.avgEntryPrice);
    refs.currentPrice.textContent = formatPrice(vm.currentPrice);
    const priceTone = resolvePriceTone(vm.direction, vm.avgEntryPrice, vm.currentPrice);
    refs.currentPrice.classList.toggle('trade-panel__current-price--profit', priceTone === 'profit');
    refs.currentPrice.classList.toggle('trade-panel__current-price--loss', priceTone === 'loss');
    refs.currentPrice.classList.toggle('trade-panel__current-price--flat', priceTone === 'flat');

    const addCountLabel = resolveAddCountLabel(vm.addCount);
    refs.addCountField.hidden = addCountLabel === '';
    refs.addCount.textContent = addCountLabel;

    refs.addButton.textContent = resolveAddButtonLabel(vm.direction);
    refs.addPreview.textContent = formatAddStakePreview(vm.aum, vm.stakeRatio);
    refs.addPreview.classList.toggle('trade-panel__stake-preview--blocked', !affordable);
    refs.entriesLeft.textContent = resolveEntriesLeftLabel(vm.positionsUsed, vm.positionsMax);

    refs.pnl.textContent = formatPnl(vm.pnl);
    refs.distance.textContent = formatDistance(vm.distanceToLiquidation);

    refs.positions.textContent = `${vm.positionsUsed}/${vm.positionsMax}`;
    refs.aum.textContent = `${formatAmount(vm.aum)} AUM`;
    refs.gold.textContent = `${formatAmount(vm.gold)} G`;

    const announcement = resolveAnnouncement(latest, vm);
    if (announcement !== null) {
      refs.announce.textContent = announcement;
    }
    latest = vm;
  }

  function destroy(): void {
    element.remove();
  }

  return { element, update, destroy };
}
