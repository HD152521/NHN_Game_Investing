/**
 * `addToPosition`(추가 매수/물타기·불타기) 전용 테스트.
 *
 * `trade.test.ts`(진입·청산)와 파일을 분리해 400줄 내로 유지한다. 픽스처 헬퍼는
 * `trade.test.ts`/`evaluate.test.ts`와 동일한 관례로 이 파일 안에서 다시 정의한다
 * (프로젝트 관례상 테스트 파일 간 작은 픽스처 헬퍼 중복은 허용한다).
 */
import { describe, expect, test } from 'vitest';

import { DEFAULT_POSITION_PARAMS, GOLD_CONVERSION } from './constants';
import { evaluatePosition } from './evaluate';
import { addToPosition, closePosition, openPosition } from './trade';
import type { OpenPosition, PositionParams, Wallet } from './types';

/** sigma=10(%)으로 고정해 z를 손으로 검산하기 쉽게 한다. */
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

describe('addToPosition — 추가 매수(물타기/불타기)', () => {
  /**
   * 공통 시나리오: AUM 2000 → 25% 진입(stake 500, price 100, AUM 1500) →
   * 가격 90(손실 중)에서 AUM(1500)의 50% 추가 매수(addStake 750, addFee 8).
   * newStake=1250, newFee=13. 평균 단가는 "주식 수 가중"이다:
   * shares=500/100=5, addShares=750/90=8.3333..., newOpenPrice=1250/13.3333...=93.75.
   */
  function openAndAddFixture() {
    const params = fixtureParams();
    const wallet = fixtureWallet();
    const opened = openFixturePosition(params, wallet);

    const added = addToPosition({
      wallet: opened.wallet,
      position: opened.position,
      openCount: 1,
      stakeRatio: 0.5,
      price: 90,
      atMs: 5000,
      params,
    });
    if (!added.ok) {
      throw new Error(`fixture 추가 매수 실패: ${added.error}`);
    }
    return { params, opened, added };
  }

  test('1) 평균 단가가 주식 수 가중평균과 정확히 일치한다 (1250 / (5 + 8.3333...) → 93.75)', () => {
    const { added } = openAndAddFixture();

    expect(added.position.stake).toBe(1250);
    expect(added.position.fee).toBe(13);
    expect(added.position.openPrice).toBeCloseTo(93.75, 10);
  });

  test('2) 물타기로 청산선이 실제로 밀린다 — 추가 매수 후 r이 이전보다 덜 음수가 된다', () => {
    const { params, opened, added } = openAndAddFixture();

    // 추가 매수 전: openPrice=100 기준으로 현재가 90을 평가한다.
    const beforeEval = evaluatePosition(opened.position, 90, params);
    // 추가 매수 후: 평균 단가가 93.75로 당겨진 상태에서 같은 현재가 90을 평가한다.
    // deltaPct=(90-93.75)/93.75*100=-4, z=-0.4, r=0.9*-0.4=-0.36 (정확한 값, 반올림 없음).
    const afterEval = evaluatePosition(added.position, 90, params);

    expect(beforeEval.r).toBeCloseTo(-0.9, 10);
    expect(afterEval.r).toBeCloseTo(-0.36, 10);
    // 청산선(-liqLine=-1.0)까지 남은 거리가 늘어났다 — 절댓값이 작아졌다(덜 음수).
    expect(afterEval.r).toBeGreaterThan(beforeEval.r);
    expect(Math.abs(afterEval.r)).toBeLessThan(Math.abs(beforeEval.r));
  });

  test('3) 불타기(이익 중 추가 매수)는 평균 단가를 불리한 쪽으로 이동시킨다 (LONG → 상승)', () => {
    const params = fixtureParams();
    const wallet = fixtureWallet();
    const opened = openFixturePosition(params, wallet); // openPrice=100, stake=500

    const added = addToPosition({
      wallet: opened.wallet,
      position: opened.position,
      openCount: 1,
      stakeRatio: 0.5, // AUM 1500의 50% = 750
      price: 110, // 이미 이익 중인 가격에서 추가 매수(불타기)
      atMs: 5000,
      params,
    });

    expect(added.ok).toBe(true);
    if (!added.ok) return;
    // shares=500/100=5, addShares=750/110=75/11, newOpenPrice=1250/(5+75/11)=13750/130
    // = 105.7692307692... > 100 → LONG에서 평균 단가가 더 비싸진다(불리한 이동).
    expect(added.position.openPrice).toBeCloseTo(105.76923076923077, 10);
    expect(added.position.openPrice).toBeGreaterThan(opened.position.openPrice);
  });

  test('4) 수수료가 누적된다 (newFee = 기존 fee + addFee)', () => {
    const { opened, added } = openAndAddFixture();

    expect(added.position.fee).toBe(opened.position.fee + 8);
  });

  test('5) AUM이 addStake만큼 줄고 골드는 변하지 않는다', () => {
    const { opened, added } = openAndAddFixture();

    expect(added.wallet.aum).toBe(opened.wallet.aum - 750);
    expect(added.wallet.gold).toBe(opened.wallet.gold);
  });

  test('6) openAtMs·liqLine·seq·direction은 최초 진입 값 그대로다', () => {
    const { opened, added } = openAndAddFixture();

    expect(added.position.openAtMs).toBe(opened.position.openAtMs);
    expect(added.position.liqLine).toBe(opened.position.liqLine);
    expect(added.position.seq).toBe(opened.position.seq);
    expect(added.position.direction).toBe(opened.position.direction);
  });

  test('6-1) addCount는 0에서 1로 늘어난다', () => {
    const { opened, added } = openAndAddFixture();

    expect(opened.position.addCount).toBe(0);
    expect(added.position.addCount).toBe(1);
  });

  test('7) 포지션이 없으면 NO_OPEN_POSITION', () => {
    const params = fixtureParams();
    const wallet = fixtureWallet();

    const result = addToPosition({
      wallet,
      position: null,
      openCount: 0,
      stakeRatio: 0.5,
      price: 100,
      atMs: 1000,
      params,
    });

    expect(result).toEqual({ ok: false, error: 'NO_OPEN_POSITION' });
  });

  test('8) openCount >= maxPositions이면 MAX_POSITIONS이고 상태가 변하지 않는다', () => {
    const params = fixtureParams({ maxPositions: 1 });
    const wallet = fixtureWallet();
    const opened = openFixturePosition(params, wallet);
    const walletSnapshot = { ...opened.wallet };
    const positionSnapshot = { ...opened.position };

    const result = addToPosition({
      wallet: opened.wallet,
      position: opened.position,
      openCount: 1, // maxPositions(1)에 이미 도달
      stakeRatio: 0.5,
      price: 90,
      atMs: 5000,
      params,
    });

    expect(result).toEqual({ ok: false, error: 'MAX_POSITIONS' });
    expect(opened.wallet).toEqual(walletSnapshot);
    expect(opened.position).toEqual(positionSnapshot);
  });

  test('9) stakeRatio가 범위 밖이면 INVALID_STAKE이고 상태가 변하지 않는다', () => {
    const params = fixtureParams();
    const wallet = fixtureWallet();
    const opened = openFixturePosition(params, wallet);
    const walletSnapshot = { ...opened.wallet };
    const positionSnapshot = { ...opened.position };

    const zero = addToPosition({
      wallet: opened.wallet,
      position: opened.position,
      openCount: 1,
      stakeRatio: 0,
      price: 90,
      atMs: 5000,
      params,
    });
    const overOne = addToPosition({
      wallet: opened.wallet,
      position: opened.position,
      openCount: 1,
      stakeRatio: 1.5,
      price: 90,
      atMs: 5000,
      params,
    });

    expect(zero).toEqual({ ok: false, error: 'INVALID_STAKE' });
    expect(overOne).toEqual({ ok: false, error: 'INVALID_STAKE' });
    expect(opened.wallet).toEqual(walletSnapshot);
    expect(opened.position).toEqual(positionSnapshot);
  });

  test('AUM 부족(addStake<=0)이면 INSUFFICIENT_AUM이고 상태가 변하지 않는다', () => {
    const params = fixtureParams();
    const wallet = fixtureWallet({ aum: 0 });
    const position: OpenPosition = {
      seq: 1,
      direction: 'long',
      stake: 500,
      fee: 5,
      openPrice: 100,
      openAtMs: 0,
      liqLine: 1.0,
      addCount: 0,
    };
    const walletSnapshot = { ...wallet };
    const positionSnapshot = { ...position };

    const result = addToPosition({
      wallet,
      position,
      openCount: 1,
      stakeRatio: 0.5,
      price: 90,
      atMs: 5000,
      params,
    });

    expect(result).toEqual({ ok: false, error: 'INSUFFICIENT_AUM' });
    expect(wallet).toEqual(walletSnapshot);
    expect(position).toEqual(positionSnapshot);
  });

  test('10) 추가 매수 후 청산해도 대금 전액이 골드가 되고 AUM은 늘지 않는다', () => {
    const { params, added } = openAndAddFixture();

    const closed = closePosition({
      wallet: added.wallet,
      position: added.position,
      closePrice: 110,
      closeAtMs: 10000,
      reason: 'manual',
      params,
    });

    expect(closed.ok).toBe(true);
    if (!closed.ok) return;
    // openPrice=93.75, closePrice=110 → deltaPct=(110-93.75)/93.75*100=17.3333...%,
    // z=1.73333..., r=0.9*z=1.56(정확), pnl=1250*1.56-13=1937(반올림 불필요, 정수로 딱 떨어짐).
    expect(closed.result.evaluation.pnl).toBe(1937);
    // 대금 = 원금 1250 + 손익 1937 = 3187 → floor(3187 × 0.50) = 1593.
    expect(closed.result.goldGained).toBe(
      Math.floor((added.position.stake + closed.result.evaluation.pnl) * GOLD_CONVERSION),
    );
    expect(closed.result.goldGained).toBe(1593);
    // 물타기로 원금이 커져도 AUM으로 되돌아오는 것은 없다 — 버틴 대가는 그대로 남는다.
    expect(closed.result.wallet.aum).toBe(added.wallet.aum);
  });

  test('11) 추가 매수 후에도 손실은 newStake(원금)를 초과하지 않는다', () => {
    const { params, added } = openAndAddFixture();

    // 극단적 폭락으로 zMax 클램프 밖까지 밀어붙인다.
    const closed = closePosition({
      wallet: added.wallet,
      position: added.position,
      closePrice: 1,
      closeAtMs: 10000,
      reason: 'liquidated',
      params,
    });

    expect(closed.ok).toBe(true);
    if (!closed.ok) return;
    expect(closed.result.evaluation.pnl).toBeGreaterThanOrEqual(-added.position.stake);
    expect(closed.result.goldGained).toBeGreaterThanOrEqual(0);
  });

  test('12) 지갑·포지션 객체는 변형되지 않고 새 객체로 반환된다 (불변성)', () => {
    const params = fixtureParams();
    const wallet = fixtureWallet();
    const opened = openFixturePosition(params, wallet);
    const walletSnapshot = { ...opened.wallet };
    const positionSnapshot = { ...opened.position };

    const added = addToPosition({
      wallet: opened.wallet,
      position: opened.position,
      openCount: 1,
      stakeRatio: 0.5,
      price: 90,
      atMs: 5000,
      params,
    });

    expect(opened.wallet).toEqual(walletSnapshot);
    expect(opened.position).toEqual(positionSnapshot);
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.wallet).not.toBe(opened.wallet);
    expect(added.position).not.toBe(opened.position);
  });

  test('13) openPrice나 price가 0 이하이면 INVALID_PRICE이고 상태가 변하지 않는다 (0나눗셈 방어)', () => {
    const params = fixtureParams();
    const wallet = fixtureWallet();
    const opened = openFixturePosition(params, wallet);
    const walletSnapshot = { ...opened.wallet };
    const positionSnapshot = { ...opened.position };

    // (a) 추가 매수 가격 자체가 0 이하인 경우.
    const zeroPrice = addToPosition({
      wallet: opened.wallet,
      position: opened.position,
      openCount: 1,
      stakeRatio: 0.5,
      price: 0,
      atMs: 5000,
      params,
    });
    const negativePrice = addToPosition({
      wallet: opened.wallet,
      position: opened.position,
      openCount: 1,
      stakeRatio: 0.5,
      price: -10,
      atMs: 5000,
      params,
    });

    expect(zeroPrice).toEqual({ ok: false, error: 'INVALID_PRICE' });
    expect(negativePrice).toEqual({ ok: false, error: 'INVALID_PRICE' });
    expect(opened.wallet).toEqual(walletSnapshot);
    expect(opened.position).toEqual(positionSnapshot);

    // (b) 기존 포지션의 openPrice가 (비정상 경로로) 0 이하로 들어온 경우.
    const corruptedPosition: OpenPosition = { ...opened.position, openPrice: 0 };
    const corruptedResult = addToPosition({
      wallet: opened.wallet,
      position: corruptedPosition,
      openCount: 1,
      stakeRatio: 0.5,
      price: 90,
      atMs: 5000,
      params,
    });

    expect(corruptedResult).toEqual({ ok: false, error: 'INVALID_PRICE' });
  });
});
