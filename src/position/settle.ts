/**
 * FR-8.1 정산 — 잔여 AUM의 자본금 환산 (`aumGate` 포함).
 *
 * ⚠️ 스테이지 정산 **전체**(잔여골드율·보너스 배수·등급 배수)는 아직 코드에 없다.
 * 이 파일은 그중 **AUM 크레딧 한 조각만** 순수 함수로 확정해 둔 것이다 — 이 조각이
 * 경제 익스플로잇의 진원지였기 때문이다. 정산 화면을 구현하는 쪽은
 * `기본 자본금 = 잔여 골드 × 1.0 + aumCapitalCredit(...)` 형태로 이 함수를 불러 쓰면 된다.
 *
 * ★ 왜 게이트가 "진입 횟수"가 아니라 "이익 청산 횟수"인가 ★
 * v1.2 사양은 `총 진입 횟수 ≥ MIN_POSITIONS_FOR_AUM_CREDIT(4)`였다. 그런데 진입은
 * 아무 판단 없이도 채울 수 있어서, z≈0 왕복을 4번 하면 게이트가 그대로 열렸다.
 * AUM 파밍을 막으려던 장치가 **"4번만 왕복하면 됩니다"라는 익스플로잇 안내문**이 된 셈이다.
 * 조건을 `pnl > 0` 청산 횟수로 바꾸면 왕복으로는 절대 충족되지 않는다 — 게이트를 열려면
 * 실제로 차트를 읽어 이익을 내야 하고, 그게 이 게이트가 원래 요구하려던 바다.
 */

import { AUM_SETTLEMENT_RATIO, MIN_PROFIT_CLOSES_FOR_AUM_CREDIT } from './constants';

export interface AumCreditInput {
  /** 스테이지 종료 시점의 잔여 AUM(모든 포지션 청산 후). */
  readonly remainingAum: number;
  /** 이번 스테이지에서 `pnl > 0`으로 청산한 횟수. */
  readonly profitCloseCount: number;
}

/**
 * 잔여 AUM을 자본금으로 환산한다 (FR-8.1).
 *
 * ```
 * aumGate = (이익 청산 수 >= MIN_PROFIT_CLOSES_FOR_AUM_CREDIT) ? 1 : 0
 * credit  = floor(잔여 AUM × AUM_SETTLEMENT_RATIO × aumGate)
 * ```
 * 자본금은 정수 재화이므로 내림한다. 음수 AUM은 입력 자체가 비정상이므로 0으로 자른다.
 */
export function aumCapitalCredit(input: AumCreditInput): number {
  if (input.profitCloseCount < MIN_PROFIT_CLOSES_FOR_AUM_CREDIT) {
    return 0;
  }
  return Math.floor(Math.max(input.remainingAum, 0) * AUM_SETTLEMENT_RATIO);
}
