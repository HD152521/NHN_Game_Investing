/**
 * 매매 패널 순수 표시 로직 — DOM에 전혀 의존하지 않는다.
 *
 * `trade-panel.ts`가 매 프레임(초당 60회) `update()`를 호출하므로, 문자열 포맷팅과
 * 클래스 계산은 DOM 조작과 분리해 여기서 순수 함수로 둔다. jsdom 없이도
 * `trade-panel.test.ts`가 이 파일만 임포트해 검증할 수 있다.
 *
 * 참고: docs/PRD_TICKER-FRONT_MVP.md FR-5.1 / FR-5.9 / FR-5.10.
 */

/** 진입 방향. 미보유 상태에서는 `null`. */
export type Direction = 'long' | 'short';

/** 투입 비율 — FR-5.1 "투입: 10% 25% 50% ALL". */
export type StakeRatio = 0.1 | 0.25 | 0.5 | 1;

/** 선택 가능한 투입 비율 전체 (버튼 순서와 동일). */
export const STAKE_RATIOS: readonly StakeRatio[] = [0.1, 0.25, 0.5, 1];

/** 매매 패널이 화면에 그려야 할 상태 전체. PM이 매 프레임 새로 구성해 넘긴다. */
export interface TradePanelViewModel {
  readonly holding: boolean;
  readonly direction: Direction | null;
  /** 보유 중일 때 원금. */
  readonly stake: number;
  /** 현재 선택된 투입 비율. */
  readonly stakeRatio: StakeRatio;
  /** 평균 단가. 미보유면 0. */
  readonly avgEntryPrice: number;
  /** 현재가. 미보유면 0. */
  readonly currentPrice: number;
  /** 추가 매수(물타기/불타기) 횟수. */
  readonly addCount: number;
  /** 추가 매수 가능 여부. */
  readonly canAdd: boolean;
  readonly aum: number;
  readonly gold: number;
  /** 평가손익 (골드 환산, 음수 가능). */
  readonly pnl: number;
  /** 청산선까지 남은 거리 (σ 단위, 양수). */
  readonly distanceToLiquidation: number;
  /** 청산 경고 상태 (FR-5.6 — 발동선의 80% 도달). */
  readonly warning: boolean;
  readonly canOpen: boolean;
  readonly canClose: boolean;
  /** 사용한 진입 횟수. */
  readonly positionsUsed: number;
  readonly positionsMax: number;
}

/** 매매 패널이 요구하는 사용자 액션 콜백. */
export interface TradePanelHandlers {
  readonly onOpen: (direction: Direction) => void;
  readonly onClose: () => void;
  /** 현재 선택된 투입 비율(`stakeRatio`)로 추가 매수한다. 방향은 기존 포지션 그대로. */
  readonly onAdd: (ratio: StakeRatio) => void;
  readonly onStakeRatioChange: (ratio: StakeRatio) => void;
}

/** 정수 금액 포맷. 천 단위 구분자만 붙인다 (예: 12000 → "12,000"). */
export function formatAmount(value: number): string {
  const rounded = Math.round(value);
  return rounded.toLocaleString('ko-KR');
}

/**
 * 평가손익 포맷 — 이익은 `+` 부호, 손실은 네이티브 마이너스 부호, 0은 부호 없음.
 * 예: 445 → "+445 G", -230 → "-230 G", 0 → "0 G".
 */
export function formatPnl(pnl: number): string {
  const rounded = Math.round(pnl);
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${formatAmount(rounded)} G`;
}

/**
 * 청산선까지 남은 거리 포맷. 개념상 항상 양수(σ 단위)이지만, 방어적으로
 * 절대값을 취해 음수가 들어와도 화면이 깨지지 않게 한다.
 * 예: 0.42 → "0.42σ", 0 → "0.00σ".
 */
export function formatDistance(distance: number): string {
  const magnitude = Math.abs(distance);
  return `${magnitude.toFixed(2)}σ`;
}

/** 투입 비율 버튼 라벨. 100%는 숫자 대신 "ALL"로 표기한다 (FR-5.1). */
export function formatStakeRatioLabel(ratio: StakeRatio): string {
  if (ratio === 1) {
    return 'ALL';
  }
  return `${Math.round(ratio * 100)}%`;
}

/**
 * 가격 포맷 — 평균 단가·현재가 표시에 쓴다. 미보유 상태(0 이하)는 값이 없다는
 * 뜻이므로 "0"이 아니라 대시로 표기해 "가격이 0원"과 구분한다.
 * 예: 128300.6 → "128,301", 0 → "-", -5 → "-"(방어적).
 */
export function formatPrice(price: number): string {
  if (price <= 0) {
    return '-';
  }
  return formatAmount(price);
}

/** 방향 표시 라벨. 미보유(`null`)는 대시로 표기한다. */
export function resolveDirectionLabel(direction: Direction | null): string {
  if (direction === 'long') {
    return 'LONG ▲';
  }
  if (direction === 'short') {
    return 'SHORT ▼';
  }
  return '—';
}

/**
 * 추가 매수 버튼 라벨. 방향은 바꿀 수 없으므로 어느 방향으로 추가되는지
 * 라벨에 그대로 드러낸다 (예: "LONG 추가").
 */
export function resolveAddButtonLabel(direction: Direction | null): string {
  if (direction === 'long') {
    return 'LONG 추가';
  }
  if (direction === 'short') {
    return 'SHORT 추가';
  }
  return '추가';
}

/**
 * 추가 매수 횟수 표시 문구. 0회면 굳이 보여줄 정보가 아니므로 빈 문자열을
 * 돌려준다 — 호출부가 이를 근거로 요소를 숨길 수 있다.
 * 예: 0 → "", 2 → "추가 2회".
 */
export function resolveAddCountLabel(addCount: number): string {
  if (addCount <= 0) {
    return '';
  }
  return `추가 ${addCount}회`;
}

/** 손익 부호에 따른 색 분류. */
export type PnlTone = 'profit' | 'loss' | 'flat';

export function resolvePnlTone(pnl: number): PnlTone {
  if (pnl > 0) {
    return 'profit';
  }
  if (pnl < 0) {
    return 'loss';
  }
  return 'flat';
}

/**
 * 평균 단가 대비 현재가가 유리한지 불리한지 판정한다 — 추가 매수("물타기/불타기")
 * 판단에 필요한 핵심 정보다.
 *
 * LONG은 현재가가 평균 단가보다 높으면 유리(profit), SHORT는 낮으면 유리하다.
 * 정확히 같으면 flat. 방향이 없으면(미보유) flat으로 방어 처리한다.
 */
export function resolvePriceTone(
  direction: Direction | null,
  avgEntryPrice: number,
  currentPrice: number,
): PnlTone {
  if (direction === null || currentPrice === avgEntryPrice) {
    return 'flat';
  }

  const isFavorable =
    direction === 'long' ? currentPrice > avgEntryPrice : currentPrice < avgEntryPrice;

  return isFavorable ? 'profit' : 'loss';
}

/**
 * 뷰모델 → 패널 루트에 적용할 CSS 클래스 목록.
 * 보유/미보유, 경고, 방향, 손익 색 분기를 전부 여기서 결정한다.
 * (`trade-panel` 기본 클래스는 포함하지 않는다 — 호출부가 덧붙인다.)
 */
export function resolveStateClasses(vm: TradePanelViewModel): readonly string[] {
  const classes: string[] = [];

  classes.push(vm.holding ? 'trade-panel--holding' : 'trade-panel--idle');

  if (vm.warning) {
    classes.push('trade-panel--warning');
  }

  if (vm.holding) {
    if (vm.direction === 'long') {
      classes.push('trade-panel--long');
    } else if (vm.direction === 'short') {
      classes.push('trade-panel--short');
    }
    classes.push(`trade-panel--${resolvePnlTone(vm.pnl)}`);
    classes.push(vm.canAdd ? 'trade-panel--add-ready' : 'trade-panel--add-blocked');
  }

  return classes;
}

/**
 * 상태 전환 시 `aria-live` 영역에 알릴 문구를 결정한다. 변화가 없으면 `null`을
 * 돌려줘 매 프레임 동일 문구를 반복 낭독하지 않게 한다.
 *
 * `previous`가 `null`이면(최초 렌더) 항상 `null` — 초기 상태는 알릴 "전환"이 아니다.
 */
export function resolveAnnouncement(
  previous: TradePanelViewModel | null,
  next: TradePanelViewModel,
): string | null {
  if (previous === null) {
    return null;
  }

  if (!previous.holding && next.holding) {
    const directionLabel = next.direction === 'long' ? '롱' : '숏';
    return `포지션 진입 — ${directionLabel} ${formatAmount(next.stake)} 투입`;
  }

  if (previous.holding && !next.holding) {
    return '청산 완료';
  }

  if (previous.holding && next.holding && next.addCount > previous.addCount) {
    return `추가 매수 — 평균단가 ${formatPrice(next.avgEntryPrice)}`;
  }

  if (!previous.warning && next.warning) {
    return '경고 — 강제 청산 임박';
  }

  if (previous.warning && !next.warning && next.holding) {
    return '경고 해제';
  }

  return null;
}
