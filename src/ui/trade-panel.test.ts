import { describe, expect, test } from 'vitest';

/**
 * 순수 표시 로직(`trade-panel-logic.ts`)만 검증한다 — DOM 없이 돈다.
 *
 * vitest 기본 환경은 여전히 node다(전역 전환은 하지 않았다). 다만 이제 jsdom이
 * 설치돼 있어, DOM 배선이 필요한 검증은 파일 최상단 `// @vitest-environment jsdom`
 * docblock으로 옵트인한다 — `trade-panel-dom.test.ts`가 그 예다.
 * 계산과 배선을 나눠 두는 이 구조 자체는 그대로 유지한다.
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
  resolvePnlTone,
  resolvePriceTone,
  resolveStakeAmount,
  resolveStateClasses,
  STAKE_RATIOS,
} from './trade-panel-logic';
import type { StakeRatio, TradePanelViewModel } from './trade-panel-logic';

/** 테스트용 기본 뷰모델. 각 테스트는 필요한 필드만 덮어써 의도를 드러낸다. */
function baseVm(overrides: Partial<TradePanelViewModel> = {}): TradePanelViewModel {
  return {
    holding: false,
    direction: null,
    stake: 0,
    stakeRatio: 0.25,
    avgEntryPrice: 0,
    currentPrice: 0,
    addCount: 0,
    canAdd: true,
    aum: 2000,
    gold: 200,
    pnl: 0,
    distanceToLiquidation: 1,
    warning: false,
    canOpen: true,
    canClose: false,
    positionsUsed: 0,
    positionsMax: 24,
    ...overrides,
  };
}

describe('formatAmount', () => {
  test('정수를 천 단위 구분자로 표기한다', () => {
    expect(formatAmount(12000)).toBe('12,000');
  });

  test('0은 "0"으로 표기한다', () => {
    expect(formatAmount(0)).toBe('0');
  });

  test('소수는 반올림한다', () => {
    expect(formatAmount(199.6)).toBe('200');
  });

  test('음수도 부호를 유지한다', () => {
    expect(formatAmount(-500)).toBe('-500');
  });
});

describe('formatPnl', () => {
  test('이익은 + 부호를 붙인다', () => {
    // Arrange & Act
    const result = formatPnl(445);
    // Assert
    expect(result).toBe('+445 G');
  });

  test('손실은 네이티브 마이너스 부호만 붙는다 (이중 부호 없음)', () => {
    expect(formatPnl(-230)).toBe('-230 G');
  });

  test('0은 부호 없이 표기한다', () => {
    expect(formatPnl(0)).toBe('0 G');
  });

  test('소수 손익은 반올림한다', () => {
    expect(formatPnl(444.6)).toBe('+445 G');
  });

  test('큰 금액도 천 단위 구분자를 유지한다', () => {
    expect(formatPnl(12345)).toBe('+12,345 G');
  });
});

describe('formatDistance', () => {
  test('양수 σ 거리를 소수 둘째 자리까지 표기한다', () => {
    expect(formatDistance(0.42)).toBe('0.42σ');
  });

  test('0 거리는 "0.00σ"다 (강제 청산 임계)', () => {
    expect(formatDistance(0)).toBe('0.00σ');
  });

  test('음수가 들어와도 방어적으로 절대값을 취한다', () => {
    expect(formatDistance(-0.42)).toBe('0.42σ');
  });

  test('경계값(1.0σ)을 정확히 표기한다', () => {
    expect(formatDistance(1)).toBe('1.00σ');
  });
});

describe('formatStakeRatioLabel', () => {
  test('10% → "10%"', () => {
    expect(formatStakeRatioLabel(0.1)).toBe('10%');
  });

  test('25% → "25%"', () => {
    expect(formatStakeRatioLabel(0.25)).toBe('25%');
  });

  test('50% → "50%"', () => {
    expect(formatStakeRatioLabel(0.5)).toBe('50%');
  });

  test('100%는 숫자 대신 "ALL"로 표기한다', () => {
    expect(formatStakeRatioLabel(1)).toBe('ALL');
  });

  test('STAKE_RATIOS 상수의 모든 항목이 라벨을 갖는다', () => {
    for (const ratio of STAKE_RATIOS) {
      expect(formatStakeRatioLabel(ratio)).not.toBe('');
    }
  });
});

describe('resolveStakeAmount', () => {
  test('FR-5.2-a 식대로 현재 AUM에 비율을 곱하고 내림한다', () => {
    // Arrange & Act
    const amount = resolveStakeAmount(2000, 0.25);
    // Assert
    expect(amount).toBe(500);
  });

  test('나누어떨어지지 않으면 내림한다 (올림이면 AUM을 초과할 수 있다)', () => {
    expect(resolveStakeAmount(999, 0.1)).toBe(99);
  });

  test('ALL은 AUM 전액이다', () => {
    expect(resolveStakeAmount(1234, 1)).toBe(1234);
  });

  test('AUM이 0이면 어떤 비율도 0이다', () => {
    expect(resolveStakeAmount(0, 0.5)).toBe(0);
  });

  test('AUM이 음수여도(비정상 입력) 0으로 방어한다', () => {
    expect(resolveStakeAmount(-100, 0.5)).toBe(0);
  });

  test('AUM이 NaN이어도 0으로 방어한다', () => {
    expect(resolveStakeAmount(Number.NaN, 0.5)).toBe(0);
  });

  test('추가 매수의 분모는 진입 당시가 아니라 현재 AUM이다 — 같은 25%라도 금액이 다르다', () => {
    const atEntry = resolveStakeAmount(2000, 0.25);
    const afterEntry = resolveStakeAmount(1500, 0.25);
    expect(atEntry).toBe(500);
    expect(afterEntry).toBe(375);
  });
});

describe('canAffordStakeRatio', () => {
  test('실제 투입 금액이 1 이상이면 선택 가능하다', () => {
    expect(canAffordStakeRatio(2000, 0.1)).toBe(true);
  });

  test('AUM이 부족해 내림 결과가 0이면 선택 불가다', () => {
    // AUM 5 × 10% = 0.5 → floor 0
    expect(canAffordStakeRatio(5, 0.1)).toBe(false);
  });

  test('경계 — 정확히 1이 나오면 선택 가능하다', () => {
    expect(canAffordStakeRatio(10, 0.1)).toBe(true);
  });

  test('AUM이 0이면 모든 비율이 선택 불가다', () => {
    for (const ratio of STAKE_RATIOS) {
      expect(canAffordStakeRatio(0, ratio)).toBe(false);
    }
  });

  test('AUM이 적어도 큰 비율은 여전히 선택 가능할 수 있다 (비율별 독립 판정)', () => {
    expect(canAffordStakeRatio(5, 0.1)).toBe(false);
    expect(canAffordStakeRatio(5, 1)).toBe(true);
  });
});

describe('formatAddStakePreview', () => {
  test('분모(AUM)·비율·결과 금액을 한 줄에 전부 드러낸다', () => {
    expect(formatAddStakePreview(2000, 0.25)).toBe('AUM 2,000 × 25% = 500');
  });

  test('ALL도 라벨과 금액이 함께 나온다', () => {
    expect(formatAddStakePreview(1500, 1)).toBe('AUM 1,500 × ALL = 1,500');
  });

  test('AUM이 부족하면 금액 대신 불가 문구를 낸다', () => {
    expect(formatAddStakePreview(5, 0.1)).toBe('AUM 5 — 투입 불가');
  });

  test('AUM이 음수여도(비정상 입력) 0으로 표기한다', () => {
    expect(formatAddStakePreview(-10, 0.5)).toBe('AUM 0 — 투입 불가');
  });
});

describe('resolveEntriesLeftLabel', () => {
  test('남은 진입 횟수를 계산한다 (추가 매수도 횟수를 소모한다)', () => {
    expect(resolveEntriesLeftLabel(2, 24)).toBe('남은 진입 22회');
  });

  test('전부 소진하면 0회로 표기한다', () => {
    expect(resolveEntriesLeftLabel(24, 24)).toBe('남은 진입 0회');
  });

  test('사용 횟수가 최대치를 넘어도(비정상 입력) 음수를 내지 않는다', () => {
    expect(resolveEntriesLeftLabel(30, 24)).toBe('남은 진입 0회');
  });
});

describe('formatPrice', () => {
  test('0은 대시로 표기한다 (미보유 상태 — "0원"과 구분)', () => {
    expect(formatPrice(0)).toBe('-');
  });

  test('양수는 천 단위 구분자로 표기한다', () => {
    expect(formatPrice(128300)).toBe('128,300');
  });

  test('소수는 반올림한다', () => {
    expect(formatPrice(128300.6)).toBe('128,301');
  });

  test('음수도 방어적으로 대시로 표기한다', () => {
    expect(formatPrice(-5)).toBe('-');
  });
});

describe('resolveDirectionLabel', () => {
  test('long → "LONG ▲"', () => {
    expect(resolveDirectionLabel('long')).toBe('LONG ▲');
  });

  test('short → "SHORT ▼"', () => {
    expect(resolveDirectionLabel('short')).toBe('SHORT ▼');
  });

  test('null(미보유) → 대시', () => {
    expect(resolveDirectionLabel(null)).toBe('—');
  });
});

describe('resolveAddButtonLabel', () => {
  test('long → "LONG 추가" (방향이 라벨에 드러난다)', () => {
    expect(resolveAddButtonLabel('long')).toBe('LONG 추가');
  });

  test('short → "SHORT 추가"', () => {
    expect(resolveAddButtonLabel('short')).toBe('SHORT 추가');
  });

  test('null(미보유)은 방향 없이 "추가"', () => {
    expect(resolveAddButtonLabel(null)).toBe('추가');
  });
});

describe('resolveAddCountLabel', () => {
  test('0회는 빈 문자열이다 (화면에서 굳이 안 보여줘도 됨)', () => {
    expect(resolveAddCountLabel(0)).toBe('');
  });

  test('1회는 "추가 1회"', () => {
    expect(resolveAddCountLabel(1)).toBe('추가 1회');
  });

  test('여러 회는 숫자가 그대로 반영된다', () => {
    expect(resolveAddCountLabel(5)).toBe('추가 5회');
  });

  test('음수(비정상 입력)도 방어적으로 빈 문자열을 돌려준다', () => {
    expect(resolveAddCountLabel(-1)).toBe('');
  });
});

describe('resolvePnlTone', () => {
  test('양수는 profit', () => {
    expect(resolvePnlTone(1)).toBe('profit');
  });

  test('음수는 loss', () => {
    expect(resolvePnlTone(-1)).toBe('loss');
  });

  test('정확히 0은 flat', () => {
    expect(resolvePnlTone(0)).toBe('flat');
  });
});

describe('resolvePriceTone', () => {
  test('LONG — 현재가가 평단가보다 높으면 유리(profit)', () => {
    expect(resolvePriceTone('long', 100, 110)).toBe('profit');
  });

  test('LONG — 현재가가 평단가보다 낮으면 불리(loss)', () => {
    expect(resolvePriceTone('long', 100, 90)).toBe('loss');
  });

  test('LONG — 현재가와 평단가가 정확히 같으면 flat', () => {
    expect(resolvePriceTone('long', 100, 100)).toBe('flat');
  });

  test('SHORT — 현재가가 평단가보다 낮으면 유리(profit)', () => {
    expect(resolvePriceTone('short', 100, 90)).toBe('profit');
  });

  test('SHORT — 현재가가 평단가보다 높으면 불리(loss)', () => {
    expect(resolvePriceTone('short', 100, 110)).toBe('loss');
  });

  test('SHORT — 현재가와 평단가가 정확히 같으면 flat', () => {
    expect(resolvePriceTone('short', 100, 100)).toBe('flat');
  });

  test('방향이 없으면(미보유) 항상 flat', () => {
    expect(resolvePriceTone(null, 100, 110)).toBe('flat');
  });
});

describe('resolveStateClasses', () => {
  test('미보유 상태는 idle 클래스만 붙는다', () => {
    const classes = resolveStateClasses(baseVm());
    expect(classes).toEqual(['trade-panel--idle']);
  });

  test('보유 상태(LONG, 이익)는 holding·long·profit·add-ready 클래스를 붙인다', () => {
    const classes = resolveStateClasses(
      baseVm({ holding: true, direction: 'long', pnl: 100, canAdd: true }),
    );
    expect(classes).toEqual([
      'trade-panel--holding',
      'trade-panel--long',
      'trade-panel--profit',
      'trade-panel--add-ready',
    ]);
  });

  test('보유 상태(SHORT, 손실)는 holding·short·loss·add-ready 클래스를 붙인다', () => {
    const classes = resolveStateClasses(
      baseVm({ holding: true, direction: 'short', pnl: -50, canAdd: true }),
    );
    expect(classes).toEqual([
      'trade-panel--holding',
      'trade-panel--short',
      'trade-panel--loss',
      'trade-panel--add-ready',
    ]);
  });

  test('보유 상태에서 손익이 정확히 0이면 flat 클래스가 붙는다', () => {
    const classes = resolveStateClasses(
      baseVm({ holding: true, direction: 'long', pnl: 0 }),
    );
    expect(classes).toContain('trade-panel--flat');
  });

  test('경고 상태는 holding/idle 여부와 무관하게 warning 클래스가 추가된다', () => {
    const idleWarning = resolveStateClasses(baseVm({ warning: true }));
    expect(idleWarning).toEqual(['trade-panel--idle', 'trade-panel--warning']);
  });

  test('경고 + 보유 상태는 모든 클래스가 함께 붙는다', () => {
    const classes = resolveStateClasses(
      baseVm({ holding: true, direction: 'short', pnl: -900, warning: true, canAdd: true }),
    );
    expect(classes).toEqual([
      'trade-panel--holding',
      'trade-panel--warning',
      'trade-panel--short',
      'trade-panel--loss',
      'trade-panel--add-ready',
    ]);
  });

  test('direction이 null인 채로 holding=true(비정상 입력)여도 방향 클래스 없이 안전하게 처리한다', () => {
    const classes = resolveStateClasses(
      baseVm({ holding: true, direction: null, pnl: 0, canAdd: true }),
    );
    expect(classes).toEqual(['trade-panel--holding', 'trade-panel--flat', 'trade-panel--add-ready']);
  });

  test('추가 매수 가능(canAdd=true)이면 add-ready 클래스가 붙는다', () => {
    const classes = resolveStateClasses(
      baseVm({ holding: true, direction: 'long', pnl: 0, canAdd: true }),
    );
    expect(classes).toContain('trade-panel--add-ready');
    expect(classes).not.toContain('trade-panel--add-blocked');
  });

  test('추가 매수 불가(canAdd=false)이면 add-blocked 클래스가 붙는다', () => {
    const classes = resolveStateClasses(
      baseVm({ holding: true, direction: 'long', pnl: 0, canAdd: false }),
    );
    expect(classes).toContain('trade-panel--add-blocked');
    expect(classes).not.toContain('trade-panel--add-ready');
  });

  test('미보유 상태에서는 canAdd 값과 무관하게 add-ready/add-blocked 클래스가 붙지 않는다', () => {
    const classes = resolveStateClasses(baseVm({ holding: false, canAdd: false }));
    expect(classes).not.toContain('trade-panel--add-ready');
    expect(classes).not.toContain('trade-panel--add-blocked');
  });
});

describe('resolveAnnouncement', () => {
  test('최초 렌더(previous=null)는 항상 알리지 않는다', () => {
    expect(resolveAnnouncement(null, baseVm())).toBeNull();
  });

  test('미보유 → 보유 전환 시 진입 문구를 낸다', () => {
    const previous = baseVm();
    const next = baseVm({ holding: true, direction: 'long', stake: 500 });
    expect(resolveAnnouncement(previous, next)).toBe('포지션 진입 — 롱 500 투입');
  });

  test('SHORT 진입도 방향 라벨이 정확하다', () => {
    const previous = baseVm();
    const next = baseVm({ holding: true, direction: 'short', stake: 250 });
    expect(resolveAnnouncement(previous, next)).toBe('포지션 진입 — 숏 250 투입');
  });

  test('보유 → 미보유 전환 시 청산 완료를 알린다', () => {
    const previous = baseVm({ holding: true, direction: 'long', stake: 500 });
    const next = baseVm();
    expect(resolveAnnouncement(previous, next)).toBe('청산 완료');
  });

  test('보유 중 추가 매수로 addCount가 늘면 평균단가와 함께 알린다', () => {
    const previous = baseVm({ holding: true, direction: 'long', addCount: 1, avgEntryPrice: 100 });
    const next = baseVm({ holding: true, direction: 'long', addCount: 2, avgEntryPrice: 105 });
    expect(resolveAnnouncement(previous, next)).toBe('추가 매수 — 평균단가 105');
  });

  test('addCount가 그대로면 추가 매수 문구를 내지 않는다 (매 프레임 스팸 방지)', () => {
    const vm = baseVm({ holding: true, direction: 'long', addCount: 1, pnl: 10 });
    const nextFrame = baseVm({ holding: true, direction: 'long', addCount: 1, pnl: 20 });
    expect(resolveAnnouncement(vm, nextFrame)).toBeNull();
  });

  test('경고 진입 시 경고 문구를 낸다', () => {
    const previous = baseVm({ holding: true, direction: 'long', warning: false });
    const next = baseVm({ holding: true, direction: 'long', warning: true });
    expect(resolveAnnouncement(previous, next)).toBe('경고 — 강제 청산 임박');
  });

  test('경고가 해제되고 여전히 보유 중이면 해제 문구를 낸다', () => {
    const previous = baseVm({ holding: true, direction: 'long', warning: true });
    const next = baseVm({ holding: true, direction: 'long', warning: false });
    expect(resolveAnnouncement(previous, next)).toBe('경고 해제');
  });

  test('변화가 없는 매 프레임 갱신은 null을 돌려준다 (60fps 스팸 낭독 방지)', () => {
    const vm = baseVm({ holding: true, direction: 'long', pnl: 10 });
    const nextFrame = baseVm({ holding: true, direction: 'long', pnl: 11 });
    expect(resolveAnnouncement(vm, nextFrame)).toBeNull();
  });

  test('청산과 동시에 경고가 꺼져도 청산 완료만 알린다 (우선순위 검증)', () => {
    const previous = baseVm({ holding: true, direction: 'long', warning: true });
    const next = baseVm({ warning: false });
    expect(resolveAnnouncement(previous, next)).toBe('청산 완료');
  });
});

describe('STAKE_RATIOS', () => {
  test('PRD FR-5.1 순서(10/25/50/ALL)를 그대로 유지한다', () => {
    const expected: readonly StakeRatio[] = [0.1, 0.25, 0.5, 1];
    expect(STAKE_RATIOS).toEqual(expected);
  });
});
