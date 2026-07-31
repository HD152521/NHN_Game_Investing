import { describe, expect, test } from 'vitest';

import { DEFAULT_POSITION_PARAMS } from './constants';
import { closePosition, openPosition } from './trade';
import type { OpenPosition, PositionParams, Wallet } from './types';

/** PRD FR-5.7 수용 기준 그대로: AUM 2000, sigma=10(%)으로 z를 손으로 검산하기 쉽게 고정. */
function fixtureParams(overrides?: Partial<PositionParams>): PositionParams {
  return {
    ...DEFAULT_POSITION_PARAMS,
    sigma: 10,
    ...overrides,
  };
}

function fixtureWallet(overrides?: Partial<Wallet>): Wallet {
  return { gold: 0, aum: 2000, ...overrides };
}

/** stake 500(25%), fee 5로 진입한 LONG 포지션을 만든다. openAtMs=0. */
function openFixturePosition(params: PositionParams, wallet: Wallet) {
  const opened = openPosition({
    wallet,
    existingPosition: null,
    openCount: 0,
    direction: 'long',
    stakeRatio: 0.25,
    openPrice: 100,
    openAtMs: 0,
    seq: 1,
    params,
  });
  if (!opened.ok) {
    throw new Error(`fixture 진입 실패: ${opened.error}`);
  }
  return opened;
}

describe('openPosition', () => {
  test('AUM 2000에 25% 투입하면 stake=500, fee=5, AUM=1500이 된다', () => {
    const params = fixtureParams();
    const wallet = fixtureWallet();
    const opened = openFixturePosition(params, wallet);

    expect(opened.position.stake).toBe(500);
    expect(opened.position.fee).toBe(5);
    expect(opened.wallet.aum).toBe(1500);
    expect(opened.wallet.gold).toBe(0);
  });

  test('이미 보유 중인 포지션이 있으면 ALREADY_OPEN', () => {
    const params = fixtureParams();
    const wallet = fixtureWallet();
    const existing = openFixturePosition(params, wallet).position;

    const result = openPosition({
      wallet,
      existingPosition: existing,
      openCount: 1,
      direction: 'long',
      stakeRatio: 0.25,
      openPrice: 100,
      openAtMs: 100,
      seq: 2,
      params,
    });

    expect(result).toEqual({ ok: false, error: 'ALREADY_OPEN' });
  });

  test('openCount가 maxPositions 이상이면 MAX_POSITIONS', () => {
    const params = fixtureParams({ maxPositions: 1 });
    const wallet = fixtureWallet();

    const result = openPosition({
      wallet,
      existingPosition: null,
      openCount: 1,
      direction: 'long',
      stakeRatio: 0.25,
      openPrice: 100,
      openAtMs: 0,
      seq: 2,
      params,
    });

    expect(result).toEqual({ ok: false, error: 'MAX_POSITIONS' });
  });

  test('stakeRatio가 0 이하이거나 1을 초과하면 INVALID_STAKE', () => {
    const params = fixtureParams();
    const wallet = fixtureWallet();

    const zero = openPosition({
      wallet,
      existingPosition: null,
      openCount: 0,
      direction: 'long',
      stakeRatio: 0,
      openPrice: 100,
      openAtMs: 0,
      seq: 1,
      params,
    });
    const overOne = openPosition({
      wallet,
      existingPosition: null,
      openCount: 0,
      direction: 'long',
      stakeRatio: 1.5,
      openPrice: 100,
      openAtMs: 0,
      seq: 1,
      params,
    });

    expect(zero).toEqual({ ok: false, error: 'INVALID_STAKE' });
    expect(overOne).toEqual({ ok: false, error: 'INVALID_STAKE' });
  });

  test('AUM이 0이면 stake도 0이 되어 INSUFFICIENT_AUM', () => {
    const params = fixtureParams();
    const wallet = fixtureWallet({ aum: 0 });

    const result = openPosition({
      wallet,
      existingPosition: null,
      openCount: 0,
      direction: 'long',
      stakeRatio: 0.5,
      openPrice: 100,
      openAtMs: 0,
      seq: 1,
      params,
    });

    expect(result).toEqual({ ok: false, error: 'INSUFFICIENT_AUM' });
  });

  test('지갑 객체는 변형되지 않고 새 객체가 반환된다 (불변성)', () => {
    const params = fixtureParams();
    const wallet = fixtureWallet();
    const walletSnapshot = { ...wallet };

    const opened = openFixturePosition(params, wallet);

    expect(wallet).toEqual(walletSnapshot);
    expect(opened.wallet).not.toBe(wallet);
    expect(opened.wallet.aum).not.toBe(wallet.aum);
  });
});

describe('closePosition — AUM→골드 일방통행 정산 수용 기준', () => {
  test('1) z=+1.0 청산 → r=0.90, pnl=445, 골드 +945(=stake+pnl), AUM은 1500 그대로', () => {
    const params = fixtureParams();
    const wallet = fixtureWallet();
    const opened = openFixturePosition(params, wallet);

    const closed = closePosition({
      wallet: opened.wallet,
      position: opened.position,
      closePrice: 110, // deltaPct=+10 → z=+1.0
      closeAtMs: 3000,
      reason: 'manual',
      params,
    });

    expect(closed.ok).toBe(true);
    if (!closed.ok) return;
    expect(closed.result.evaluation.r).toBeCloseTo(0.9, 10);
    expect(closed.result.evaluation.pnl).toBe(445);
    expect(closed.result.goldGained).toBe(945);
    expect(closed.result.wallet.gold).toBe(945);
    expect(closed.result.wallet.aum).toBe(1500);
  });

  test('2) z=−0.5 청산 → r=−0.45, pnl=−230, 골드 +270(=stake+pnl), AUM은 1500 그대로', () => {
    const params = fixtureParams();
    const wallet = fixtureWallet();
    const opened = openFixturePosition(params, wallet);

    const closed = closePosition({
      wallet: opened.wallet,
      position: opened.position,
      closePrice: 95, // deltaPct=-5 → z=-0.5
      closeAtMs: 3000,
      reason: 'manual',
      params,
    });

    expect(closed.ok).toBe(true);
    if (!closed.ok) return;
    expect(closed.result.evaluation.r).toBeCloseTo(-0.45, 10);
    expect(closed.result.evaluation.pnl).toBe(-230);
    expect(closed.result.goldGained).toBe(270);
    expect(closed.result.wallet.gold).toBe(270);
    expect(closed.result.wallet.aum).toBe(1500);
  });

  test('3) z=−1.2까지 하락 → 강제 청산, pnl=−500(전액 소실), 골드 증가 0, AUM 1500 그대로', () => {
    const params = fixtureParams();
    const wallet = fixtureWallet();
    const opened = openFixturePosition(params, wallet);

    // deltaPct=-12 → z=-1.2 → r=-1.08 ≤ -1.0. minHoldMs(2000ms) 이내여도
    // reason='liquidated'는 서버 강제 청산이므로 검사를 건너뛴다.
    const closed = closePosition({
      wallet: opened.wallet,
      position: opened.position,
      closePrice: 88,
      closeAtMs: 500,
      reason: 'liquidated',
      params,
    });

    expect(closed.ok).toBe(true);
    if (!closed.ok) return;
    expect(closed.result.evaluation.r).toBeCloseTo(-1.08, 10);
    expect(closed.result.evaluation.liquidated).toBe(true);
    expect(closed.result.evaluation.pnl).toBe(-500);
    expect(closed.result.goldGained).toBe(0);
    expect(closed.result.wallet.gold).toBe(0);
    expect(closed.result.wallet.aum).toBe(1500);
  });

  test('4) 진입 직후 z≈0에서 즉시 청산 → 수수료만큼만 손해 보고 원금이 골드로 넘어간다', () => {
    const params = fixtureParams();
    const wallet = fixtureWallet();
    const opened = openFixturePosition(params, wallet);

    const closed = closePosition({
      wallet: opened.wallet,
      position: opened.position,
      closePrice: 100, // deltaPct=0 → z=0 → r=0 → pnl=-fee
      closeAtMs: 3000,
      reason: 'manual',
      params,
    });

    expect(closed.ok).toBe(true);
    if (!closed.ok) return;
    expect(closed.result.evaluation.pnl).toBe(-5);
    // 골드 += stake - fee = 500 - 5 = 495. AUM은 진입 때 이미 500만큼 줄어든 채(1500)
    // 유지되고, 청산으로 다시 늘지 않는다 — 원금은 AUM으로 복귀하지 않는다.
    expect(closed.result.goldGained).toBe(495);
    expect(closed.result.wallet.gold).toBe(495);
    expect(closed.result.wallet.aum).toBe(1500);
  });

  test('5) 극단적 손실(z=-3)에서도 pnl은 −stake 아래로 내려가지 않고, 골드 증가는 0이다', () => {
    const params = fixtureParams();
    const wallet = fixtureWallet();
    const opened = openFixturePosition(params, wallet);

    const closed = closePosition({
      wallet: opened.wallet,
      position: opened.position,
      closePrice: 70, // deltaPct=-30 → z=-3.0(zMax 경계) → r=-2.7
      closeAtMs: 500,
      reason: 'liquidated',
      params,
    });

    expect(closed.ok).toBe(true);
    if (!closed.ok) return;
    expect(closed.result.evaluation.pnl).toBe(-500);
    expect(closed.result.wallet.aum).toBe(1500); // 청산은 AUM을 늘리지 않는다
    expect(closed.result.goldGained).toBe(0);
  });

  test('6) 보유 중인 포지션이 없으면 NO_OPEN_POSITION', () => {
    const params = fixtureParams();
    const wallet = fixtureWallet();

    const closed = closePosition({
      wallet,
      position: null,
      closePrice: 100,
      closeAtMs: 3000,
      reason: 'manual',
      params,
    });

    expect(closed).toEqual({ ok: false, error: 'NO_OPEN_POSITION' });
  });

  test('7) minHoldMs 미달 수동 청산은 MIN_HOLD_NOT_MET, liquidated/stage_end는 통과한다', () => {
    const params = fixtureParams();
    const wallet = fixtureWallet();
    const opened = openFixturePosition(params, wallet);

    const manualTooEarly = closePosition({
      wallet: opened.wallet,
      position: opened.position,
      closePrice: 105,
      closeAtMs: 1000, // openAtMs=0, minHoldMs=2000 → 미달
      reason: 'manual',
      params,
    });
    expect(manualTooEarly).toEqual({ ok: false, error: 'MIN_HOLD_NOT_MET' });

    const liquidatedEarly = closePosition({
      wallet: opened.wallet,
      position: opened.position,
      closePrice: 105,
      closeAtMs: 1000,
      reason: 'liquidated',
      params,
    });
    expect(liquidatedEarly.ok).toBe(true);

    const stageEndEarly = closePosition({
      wallet: opened.wallet,
      position: opened.position,
      closePrice: 105,
      closeAtMs: 1000,
      reason: 'stage_end',
      params,
    });
    expect(stageEndEarly.ok).toBe(true);
  });

  test('8) SHORT 방향에서 가격 하락이 이익이 된다', () => {
    const params = fixtureParams();
    const wallet = fixtureWallet();
    const opened = openPosition({
      wallet,
      existingPosition: null,
      openCount: 0,
      direction: 'short',
      stakeRatio: 0.25,
      openPrice: 100,
      openAtMs: 0,
      seq: 1,
      params,
    });
    if (!opened.ok) throw new Error('fixture 진입 실패');

    const closed = closePosition({
      wallet: opened.wallet,
      position: opened.position,
      closePrice: 90, // 가격 하락 10% → SHORT엔 이익
      closeAtMs: 3000,
      reason: 'manual',
      params,
    });

    expect(closed.ok).toBe(true);
    if (!closed.ok) return;
    expect(closed.result.evaluation.pnl).toBeGreaterThan(0);
    expect(closed.result.goldGained).toBe(opened.position.stake + closed.result.evaluation.pnl);
  });

  test('9) 지갑 객체는 변형되지 않고 새 객체로 반환된다 (불변성)', () => {
    const params = fixtureParams();
    const wallet = fixtureWallet();
    const opened = openFixturePosition(params, wallet);
    const walletBeforeClose = { ...opened.wallet };
    const positionBeforeClose = { ...opened.position };

    const closed = closePosition({
      wallet: opened.wallet,
      position: opened.position,
      closePrice: 110,
      closeAtMs: 3000,
      reason: 'manual',
      params,
    });

    expect(opened.wallet).toEqual(walletBeforeClose);
    expect(opened.position).toEqual(positionBeforeClose);
    expect(closed.ok).toBe(true);
    if (!closed.ok) return;
    expect(closed.result.wallet).not.toBe(opened.wallet);
  });

  test('10) 클라이언트가 어떤 pnl을 주장하든 서버 계산값(closePrice 기반)만 권위를 갖는다', () => {
    const params = fixtureParams();
    const wallet = fixtureWallet();
    const opened = openFixturePosition(params, wallet);

    // ClosePositionInput에는애당초 클라이언트발 pnl을 받는 필드가 없다 —
    // 오직 서버가 계산한 closePrice로만 손익이 결정된다는 것을 구조적으로 보증한다.
    const closed = closePosition({
      wallet: opened.wallet,
      position: opened.position,
      closePrice: 110,
      closeAtMs: 3000,
      reason: 'manual',
      params,
    });

    expect(closed.ok).toBe(true);
    if (!closed.ok) return;
    expect(closed.result.evaluation.pnl).toBe(445);
  });
});

describe('closePosition — AUM 불변·골드 비음수 불변식', () => {
  test('어떤 z(가격 변동)에서도 청산은 AUM을 늘리지 않는다', () => {
    const params = fixtureParams();
    const closePrices = [130, 110, 105, 100, 95, 90, 70, 50]; // 큰 이익 ~ 전액 소실까지 훑는다

    for (const closePrice of closePrices) {
      const wallet = fixtureWallet();
      const opened = openFixturePosition(params, wallet);
      const aumAfterOpen = opened.wallet.aum;

      const closed = closePosition({
        wallet: opened.wallet,
        position: opened.position,
        closePrice,
        closeAtMs: 3000,
        reason: 'manual',
        params,
      });

      expect(closed.ok).toBe(true);
      if (!closed.ok) continue;
      expect(closed.result.wallet.aum).toBe(aumAfterOpen);
      expect(closed.result.wallet.aum).toBeLessThanOrEqual(wallet.aum);
    }
  });

  test('극단적인 z에서도 골드 증가액(goldGained)은 항상 0 이상이다', () => {
    const params = fixtureParams();
    // zMax=3 밖으로도 밀어붙여 클램프·−stake 하한이 goldGained를 음수로 만들지 않는지 검증한다.
    const closePrices = [1000, 200, 100, 50, 1, 0.01];

    for (const closePrice of closePrices) {
      const wallet = fixtureWallet();
      const opened = openFixturePosition(params, wallet);

      const closed = closePosition({
        wallet: opened.wallet,
        position: opened.position,
        closePrice,
        closeAtMs: 3000,
        reason: 'liquidated', // minHoldMs 검사를 피해 임의의 closePrice로 자유롭게 테스트한다
        params,
      });

      expect(closed.ok).toBe(true);
      if (!closed.ok) continue;
      expect(closed.result.goldGained).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('closePosition — ClosedPosition 필드', () => {
  test('ClosedPosition은 OpenPosition 필드를 보존하고 청산 정보를 덧붙인다', () => {
    const params = fixtureParams();
    const wallet = fixtureWallet();
    const opened = openFixturePosition(params, wallet);

    const closed = closePosition({
      wallet: opened.wallet,
      position: opened.position,
      closePrice: 110,
      closeAtMs: 3000,
      reason: 'manual',
      params,
    });

    expect(closed.ok).toBe(true);
    if (!closed.ok) return;
    const expected: OpenPosition & { closePrice: number; closeAtMs: number } = {
      ...opened.position,
      closePrice: 110,
      closeAtMs: 3000,
    };
    expect(closed.result.position).toMatchObject(expected);
    expect(closed.result.position.reason).toBe('manual');
    expect(closed.result.position.pnl).toBe(445);
  });
});

