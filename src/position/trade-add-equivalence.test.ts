/**
 * `addToPosition`의 평균 단가 "주식 수 가중" 등가성 수용 기준 전용 테스트.
 *
 * `trade-add.test.ts`가 400줄에 근접해 이 파일을 분리한다(프로젝트 관례상 테스트 파일
 * 간 작은 픽스처 헬퍼 중복은 허용한다 — `trade-add.test.ts` 헤더 참고).
 *
 * 검증 대상: 로트를 합쳐서(`addToPosition`) 들고 있는 것과 로트를 따로 들고 있는 것이
 * 손익 관점에서 동일해야 한다 — 이것이 이 버그 수정의 핵심 근거다(trade.ts JSDoc 참고).
 *
 * ★ 오차 허용치 = 1 (골드 정수 단위), 근거 ★
 * `evaluatePosition`은 손익을 `Math.round`로 정수 반올림한다. 두 로트를 각각 따로
 * 평가하면 반올림이 두 번(각 로트마다) 일어나고, 합쳐서 평가하면 반올림이 한 번만
 * 일어난다. 수학적으로 `round(a) + round(b)`와 `round(a + b)`는 완전히 같은 실수
 * 연산의 결과라도 최대 1(골드) 차이가 날 수 있다(예: a=b=0.4 → round(a)+round(b)=0,
 * round(a+b)=round(0.8)=1). 이 오차는 반올림 위치의 차이에서만 나오는 것이라
 * 상한이 정확히 1이며, 이보다 큰 오차가 나오면 그건 반올림 문제가 아니라 평균 단가
 * 공식 자체가 등가성을 깨고 있다는 뜻이다. 그러므로 허용치를 1보다 넉넉하게 잡지 않는다.
 *
 * ★ 테스트 가격 범위를 좁게 잡은 이유 ★
 * `evaluatePosition`은 zMax 클램프와 `-stake` 손실 하한(원금 초과 손실 없음, FR-5.6)이라는
 * 두 가지 비선형 보정을 갖고 있다. 두 로트를 합친 포지션과 각 로트를 따로 평가한 것이
 * "선형적으로" 같아지는 등가성 증명은 그 어느 쪽도 이 두 보정에 걸리지 않을 때만 성립한다
 * (클램프나 하한에 걸리면 애초에 서로 다른 비선형 함수를 통과하므로 같을 이유가 없다).
 * 그래서 아래 각 테스트는 모든 로트·합산 포지션의 z가 클램프(±3)와 손실 하한에
 * 걸리지 않는 가격대만 골라 검증한다 — 이는 "봐줄 만한 근사"가 아니라 애초에
 * 등가성이 수학적으로 성립하는 유일한 영역이다.
 */
import { describe, expect, test } from 'vitest';

import { DEFAULT_POSITION_PARAMS } from './constants';
import { evaluatePosition } from './evaluate';
import { addToPosition, openPosition } from './trade';
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

describe('addToPosition — 평균 단가 등가성(주식 수 가중) 검증', () => {
  test('여러 가격 지점에서, 합친 포지션의 pnl이 두 로트를 따로 평가한 pnl의 합과 일치한다(오차<=1)', () => {
    const params = fixtureParams();
    const wallet = fixtureWallet();
    const opened = openFixturePosition(params, wallet); // lot1: stake=500, fee=5, openPrice=100

    const added = addToPosition({
      wallet: opened.wallet,
      position: opened.position,
      openCount: 1,
      stakeRatio: 0.5, // AUM(1500)의 50% = 750
      price: 90,
      atMs: 5000,
      params,
    });
    if (!added.ok) {
      throw new Error(`fixture 추가 매수 실패: ${added.error}`);
    }

    // lot2는 실제로 청구된 addStake=750, addFee=8, price=90을 그대로 반영한 "따로 든" 로트다.
    const lot1 = opened.position;
    const lot2: OpenPosition = { ...opened.position, stake: 750, fee: 8, openPrice: 90 };
    const combined = added.position;

    // 안전 가격대: lot1(open=100)·lot2(open=90)·combined(open=93.75) 모두 클램프·손실
    // 하한에 걸리지 않는 범위(대략 90~117) 안에서 몇 지점을 고른다.
    const safePrices = [90, 95, 100, 105, 110, 115];

    for (const price of safePrices) {
      const combinedPnl = evaluatePosition(combined, price, params).pnl;
      const lot1Pnl = evaluatePosition(lot1, price, params).pnl;
      const lot2Pnl = evaluatePosition(lot2, price, params).pnl;

      expect(Math.abs(combinedPnl - (lot1Pnl + lot2Pnl))).toBeLessThanOrEqual(1);
    }
  });

  test('3회 이상 연속 추가 매수해도 등가성이 유지된다(누적된 평균 단가가 어긋나지 않는다)', () => {
    const params = fixtureParams();
    const wallet = fixtureWallet();
    const opened = openFixturePosition(params, wallet); // lot1: stake=500, fee=5, openPrice=100

    const add1 = addToPosition({
      wallet: opened.wallet,
      position: opened.position,
      openCount: 1,
      stakeRatio: 0.2, // AUM(1500)의 20% = 300
      price: 95,
      atMs: 1000,
      params,
    });
    if (!add1.ok) throw new Error(`fixture add1 실패: ${add1.error}`);

    const add2 = addToPosition({
      wallet: add1.wallet,
      position: add1.position,
      openCount: 2,
      stakeRatio: 0.25, // AUM(1200)의 25% = 300
      price: 105,
      atMs: 2000,
      params,
    });
    if (!add2.ok) throw new Error(`fixture add2 실패: ${add2.error}`);

    const add3 = addToPosition({
      wallet: add2.wallet,
      position: add2.position,
      openCount: 3,
      stakeRatio: 0.3, // AUM(900)의 30% = 270
      price: 110,
      atMs: 3000,
      params,
    });
    if (!add3.ok) throw new Error(`fixture add3 실패: ${add3.error}`);

    // 실제로 청구된 4개 로트를 그대로 재현한다: (stake, fee, openPrice)
    const lots: readonly OpenPosition[] = [
      opened.position,
      { ...opened.position, stake: 300, fee: 3, openPrice: 95 },
      { ...opened.position, stake: 300, fee: 3, openPrice: 105 },
      { ...opened.position, stake: 270, fee: 3, openPrice: 110 },
    ];
    const combined = add3.position;

    expect(combined.stake).toBe(1370);
    expect(combined.fee).toBe(14);

    // 안전 가격대: 4개 로트(100/95/105/110)와 합산 포지션 모두 클램프·손실 하한에
    // 걸리지 않는 좁은 범위(대략 98~110)에서 검증한다.
    const safePrices = [100, 102, 105, 108, 110];

    for (const price of safePrices) {
      const combinedPnl = evaluatePosition(combined, price, params).pnl;
      const sumOfLotsPnl = lots.reduce((sum, lot) => sum + evaluatePosition(lot, price, params).pnl, 0);

      expect(Math.abs(combinedPnl - sumOfLotsPnl)).toBeLessThanOrEqual(1);
    }
  });

  test('추가 가격이 진입가와 같으면 평균 단가가 변하지 않는다', () => {
    const params = fixtureParams();
    const wallet = fixtureWallet();
    const opened = openFixturePosition(params, wallet); // openPrice=100

    const added = addToPosition({
      wallet: opened.wallet,
      position: opened.position,
      openCount: 1,
      stakeRatio: 0.4, // AUM(1500)의 40% = 600
      price: 100, // 진입가와 동일한 가격에서 추가 매수
      atMs: 5000,
      params,
    });

    expect(added.ok).toBe(true);
    if (!added.ok) return;
    // shares=addShares 계산 경로를 거쳐도 부동소수점 오차는 무시할 수 있는 수준이다.
    expect(added.position.openPrice).toBeCloseTo(100, 9);
  });
});
