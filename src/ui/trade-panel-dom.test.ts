// @vitest-environment jsdom

import { describe, expect, test, vi } from 'vitest';

/**
 * ★ 이 프로젝트 최초의 DOM 배선 테스트 ★
 *
 * 지금까지 vitest가 node 환경으로만 돌아 "버튼을 누르면 실제로 무슨 일이 일어나는가"가
 * CI에서 검증된 적이 없었다(GAME.md §19-7). click-path 감사가 찾은 결함 5건이 전부
 * 그 사각에 살아남았고, 그중 LOW-2가 여기서 고쳐진다.
 *
 * 순수 함수 테스트로는 이 결함을 잡을 수 없다. 결함이 **핸들러들 사이의 시간차**에 있지
 * 어느 한 함수의 계산에 있지 않기 때문이다 — 그래서 실제 DOM 이벤트로 검증한다.
 * 파일 최상단 docblock으로 이 파일만 jsdom을 쓴다(전역 기본값은 node 그대로).
 */
import { createTradePanel } from './trade-panel';
import type { StakeRatio, TradePanelViewModel } from './trade-panel-logic';

function viewModel(overrides: Partial<TradePanelViewModel> = {}): TradePanelViewModel {
  return {
    holding: true,
    direction: 'long',
    stake: 500,
    stakeRatio: 0.25,
    avgEntryPrice: 100,
    currentPrice: 102,
    addCount: 0,
    canAdd: true,
    aum: 2000,
    gold: 120,
    pnl: 30,
    distanceToLiquidation: 2.4,
    warning: false,
    canOpen: false,
    canClose: true,
    positionsUsed: 1,
    positionsMax: 24,
    ...overrides,
  };
}

function stakeButton(element: HTMLElement, variant: string, ratio: StakeRatio): HTMLButtonElement {
  const button = element.querySelector<HTMLButtonElement>(
    `button[data-stake-variant="${variant}"][data-ratio="${ratio}"]`,
  );
  if (!button) {
    throw new Error(`투입 비율 버튼을 찾지 못했다: variant=${variant} ratio=${ratio}`);
  }
  return button;
}

function addButton(element: HTMLElement): HTMLButtonElement {
  const button = element.querySelector<HTMLButtonElement>('[data-action="add"]');
  if (!button) {
    throw new Error('추가 매수 버튼을 찾지 못했다');
  }
  return button;
}

function handlers() {
  return {
    onOpen: vi.fn(),
    onClose: vi.fn(),
    onAdd: vi.fn(),
    onStakeRatioChange: vi.fn(),
  };
}

describe('추가 매수 버튼이 쓰는 투입 비율 (CLICK-PATH LOW-2)', () => {
  test('★ 비율을 바꾼 직후 같은 프레임에 [추가]를 누르면 방금 고른 비율로 매수한다', () => {
    const h = handlers();
    const panel = createTradePanel(h);
    // 뷰모델은 25%로 그려져 있다.
    panel.update(viewModel({ stakeRatio: 0.25 }));

    // 사용자가 50%를 고른다 — 세션에는 전달되지만 update()는 아직 오지 않았다.
    stakeButton(panel.element, 'add', 0.5).click();
    expect(h.onStakeRatioChange).toHaveBeenCalledWith(0.5);

    // update() 없이(= 같은 프레임에) 곧바로 [추가].
    addButton(panel.element).click();

    // 고친 뒤: 50%. 고치기 전에는 직전 값 0.25가 넘어가 실제 돈이 의도와 다르게 집행됐다.
    expect(h.onAdd).toHaveBeenCalledWith(0.5);
  });

  test('비율을 바꾸지 않았으면 뷰모델의 비율을 그대로 쓴다', () => {
    const h = handlers();
    const panel = createTradePanel(h);
    panel.update(viewModel({ stakeRatio: 0.5 }));

    addButton(panel.element).click();

    expect(h.onAdd).toHaveBeenCalledWith(0.5);
  });

  test('세션이 최종 진실이다 — 다음 update()의 비율이 로컬 낙관값을 덮는다', () => {
    const h = handlers();
    const panel = createTradePanel(h);
    panel.update(viewModel({ stakeRatio: 0.25 }));

    stakeButton(panel.element, 'add', 1).click();
    // 세션이 전액 요청을 반영하지 않고 25%를 유지한 채 다음 프레임을 그렸다.
    panel.update(viewModel({ stakeRatio: 0.25 }));
    addButton(panel.element).click();

    expect(h.onAdd).toHaveBeenCalledWith(0.25);
  });

  test('감당 못 하는 비율로 바꾼 직후의 클릭은 통과시키지 않는다', () => {
    const h = handlers();
    const panel = createTradePanel(h);
    // AUM이 4밖에 없다 — 10%면 floor(0.4)=0이라 최소 금액(1)에 못 미친다.
    panel.update(viewModel({ aum: 4, stakeRatio: 1 }));

    // ★ 반드시 'open' 변형을 눌러야 재현된다 ★
    // 'add' 변형은 감당 못 하는 비율이 매 프레임 비활성이라 클릭 자체가 먹지 않는다.
    // 반면 'open'(신규 진입) 선택기는 "항상 선택 가능"으로 두는데, 두 선택기가 **같은
    // `stakeRatio` 하나를 공유**한다. 그래서 보유 중에 open 쪽을 누르면 추가 매수가
    // 감당 못 하는 비율을 들고 있는 상태가 실제로 만들어진다 — 비활성 표시만으로는
    // 막히지 않는 경로다.
    stakeButton(panel.element, 'open', 0.1).click();
    addButton(panel.element).click();

    expect(h.onAdd).not.toHaveBeenCalled();
  });

  test("'open' 선택기는 비활성화되지 않는다 — 위 테스트가 재현하는 경로의 전제", () => {
    const h = handlers();
    const panel = createTradePanel(h);
    panel.update(viewModel({ aum: 4, stakeRatio: 1 }));

    expect(stakeButton(panel.element, 'open', 0.1).disabled).toBe(false);
    expect(stakeButton(panel.element, 'add', 0.1).disabled).toBe(true);
  });

  test('뷰모델이 아직 없으면(첫 update 전) 아무 일도 하지 않는다', () => {
    const h = handlers();
    const panel = createTradePanel(h);

    addButton(panel.element).click();

    expect(h.onAdd).not.toHaveBeenCalled();
  });
});
