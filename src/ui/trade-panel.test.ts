import { describe, expect, test } from 'vitest';

/**
 * DOM(jsdom) 없이 검증한다 — 이 프로젝트 vitest는 기본 node 환경이고 jsdom
 * 의존성이 없다. 그래서 DOM 조작(trade-panel.ts)과 순수 표시 로직
 * (trade-panel-logic.ts)을 분리했고, 여기서는 순수 로직만 테스트한다.
 */
import {
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
import type { StakeRatio, TradePanelViewModel } from './trade-panel-logic';

/** 테스트용 기본 뷰모델. 각 테스트는 필요한 필드만 덮어써 의도를 드러낸다. */
function baseVm(overrides: Partial<TradePanelViewModel> = {}): TradePanelViewModel {
  return {
    holding: false,
    direction: null,
    stake: 0,
    stakeRatio: 0.25,
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

describe('resolveStateClasses', () => {
  test('미보유 상태는 idle 클래스만 붙는다', () => {
    const classes = resolveStateClasses(baseVm());
    expect(classes).toEqual(['trade-panel--idle']);
  });

  test('보유 상태(LONG, 이익)는 holding·long·profit 클래스를 붙인다', () => {
    const classes = resolveStateClasses(
      baseVm({ holding: true, direction: 'long', pnl: 100 }),
    );
    expect(classes).toEqual(['trade-panel--holding', 'trade-panel--long', 'trade-panel--profit']);
  });

  test('보유 상태(SHORT, 손실)는 holding·short·loss 클래스를 붙인다', () => {
    const classes = resolveStateClasses(
      baseVm({ holding: true, direction: 'short', pnl: -50 }),
    );
    expect(classes).toEqual(['trade-panel--holding', 'trade-panel--short', 'trade-panel--loss']);
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
      baseVm({ holding: true, direction: 'short', pnl: -900, warning: true }),
    );
    expect(classes).toEqual([
      'trade-panel--holding',
      'trade-panel--warning',
      'trade-panel--short',
      'trade-panel--loss',
    ]);
  });

  test('direction이 null인 채로 holding=true(비정상 입력)여도 방향 클래스 없이 안전하게 처리한다', () => {
    const classes = resolveStateClasses(baseVm({ holding: true, direction: null, pnl: 0 }));
    expect(classes).toEqual(['trade-panel--holding', 'trade-panel--flat']);
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
