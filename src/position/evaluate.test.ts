import { describe, expect, test } from 'vitest';

import { DEFAULT_POSITION_PARAMS, LIQ_WARN_RATIO } from './constants';
import { evaluatePosition } from './evaluate';
import type { OpenPosition, PositionParams } from './types';

/** 테스트 공통 파라미터. sigma=10(%)으로 고정해 z를 손으로 검산하기 쉽게 한다. */
function fixtureParams(overrides?: Partial<PositionParams>): PositionParams {
  return {
    ...DEFAULT_POSITION_PARAMS,
    sigma: 10,
    ...overrides,
  };
}

function fixturePosition(overrides?: Partial<OpenPosition>): OpenPosition {
  return {
    seq: 1,
    direction: 'long',
    stake: 500,
    fee: 5,
    openPrice: 100,
    openAtMs: 0,
    liqLine: 1.0,
    ...overrides,
  };
}

describe('evaluatePosition — 방향부호 · z-score', () => {
  test('LONG은 가격 상승이 이익이다 (deltaPct 부호 +1)', () => {
    const position = fixturePosition({ direction: 'long' });
    const result = evaluatePosition(position, 110, fixtureParams());
    expect(result.deltaPct).toBeCloseTo(10, 10);
    expect(result.z).toBeCloseTo(1.0, 10);
  });

  test('SHORT은 가격 하락이 이익이 된다 (deltaPct 부호 반전)', () => {
    const position = fixturePosition({ direction: 'short' });
    const result = evaluatePosition(position, 90, fixtureParams());
    expect(result.deltaPct).toBeCloseTo(10, 10);
    expect(result.z).toBeCloseTo(1.0, 10);
    expect(result.pnl).toBeGreaterThan(0);
  });

  test('SHORT은 가격 상승이 손실이 된다', () => {
    const position = fixturePosition({ direction: 'short' });
    const result = evaluatePosition(position, 110, fixtureParams());
    expect(result.deltaPct).toBeCloseTo(-10, 10);
    expect(result.z).toBeCloseTo(-1.0, 10);
    expect(result.pnl).toBeLessThan(0);
  });
});

describe('evaluatePosition — r 클램프 · pnl 하한', () => {
  test('z가 zMax를 넘으면 r은 payoutBase × zMax로 클램프된다', () => {
    const position = fixturePosition();
    // deltaPct = 50% → z = 5.0, zMax=3.0으로 클램프되어야 한다.
    const result = evaluatePosition(position, 150, fixtureParams());
    expect(result.z).toBeCloseTo(5.0, 10);
    expect(result.r).toBeCloseTo(0.9 * 3.0, 10);
  });

  test('pnl은 극단적인 손실에서도 −stake 아래로 내려가지 않는다', () => {
    const position = fixturePosition({ stake: 500, fee: 5 });
    // z = -3(zMax 클램프 경계) → r = -2.7 → rawPnl = 500*-2.7-5 = -1355, but floor at -500.
    const result = evaluatePosition(position, 70, fixtureParams());
    expect(result.pnl).toBe(-500);
  });

  test('평가손익은 정수로 반올림된다', () => {
    const position = fixturePosition({ stake: 333, fee: 3 });
    const result = evaluatePosition(position, 107, fixtureParams());
    expect(Number.isInteger(result.pnl)).toBe(true);
  });
});

describe('evaluatePosition — 강제 청산 · 경고 판정', () => {
  test('r이 −liqLine 이하이면 liquidated=true', () => {
    const position = fixturePosition({ liqLine: 1.0 });
    // deltaPct = -12 → z = -1.2 → r = -1.08 ≤ -1.0
    const result = evaluatePosition(position, 88, fixtureParams());
    expect(result.r).toBeLessThanOrEqual(-1.0);
    expect(result.liquidated).toBe(true);
  });

  test('r이 −liqLine보다 크면 liquidated=false', () => {
    const position = fixturePosition({ liqLine: 1.0 });
    const result = evaluatePosition(position, 95, fixtureParams());
    expect(result.liquidated).toBe(false);
  });

  test('r이 −liqLine × LIQ_WARN_RATIO 이하이면 warning=true', () => {
    const position = fixturePosition({ liqLine: 1.0 });
    // deltaPct=-10 → z=-1.0 → r=-0.9. LIQ_WARN_RATIO(0.8) 경계인 -0.8보다 더 아래이므로
    // warning=true이면서도 아직 liquidated 발동선(-1.0)에는 못 미친 상태를 검증한다.
    const result = evaluatePosition(position, 90, fixtureParams());
    expect(result.r).toBeCloseTo(-0.9, 10);
    expect(result.r).toBeLessThanOrEqual(-1.0 * LIQ_WARN_RATIO);
    expect(result.warning).toBe(true);
    expect(result.liquidated).toBe(false);
  });

  test('경고선에 도달하지 않았으면 warning=false', () => {
    const position = fixturePosition({ liqLine: 1.0 });
    const result = evaluatePosition(position, 99, fixtureParams());
    expect(result.warning).toBe(false);
  });
});

describe('evaluatePosition — 방어적 가드', () => {
  test('sigma가 0이면 z가 NaN/Infinity로 새지 않고 0으로 방어된다', () => {
    const position = fixturePosition();
    const result = evaluatePosition(position, 110, fixtureParams({ sigma: 0 }));
    expect(Number.isFinite(result.z)).toBe(true);
    expect(result.z).toBe(0);
  });

  test('openPrice가 0이면 deltaPct가 NaN/Infinity로 새지 않고 0으로 방어된다', () => {
    const position = fixturePosition({ openPrice: 0 });
    const result = evaluatePosition(position, 110, fixtureParams());
    expect(Number.isFinite(result.deltaPct)).toBe(true);
    expect(result.deltaPct).toBe(0);
  });
});
