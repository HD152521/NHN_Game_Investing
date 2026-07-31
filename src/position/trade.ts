/**
 * 포지션 진입·청산 — 순수·불변 상태 전이 함수 (PRD FR-5).
 *
 * 입력으로 받은 `wallet`/`position` 객체는 절대 변형하지 않고, 항상 새 객체를 반환한다.
 * 이 파일이 이 게임의 경제 코어다 — 특히 `closePosition`의 원금-이익 분리 정산(FR-5.7)은
 * 밸런싱 조절값이 아니라 AUM 세탁을 막는 구조적 안전장치이므로 절대 바꾸지 않는다.
 */

import { evaluatePosition } from './evaluate';
import type { CloseReason, Direction, OpenPosition, PositionEval, PositionParams, Wallet } from './types';

/** 진입 실패 사유. PRD §7 에러 코드(`POSITION_ALREADY_OPEN` 등)에 대응한다. */
export type OpenError = 'ALREADY_OPEN' | 'MAX_POSITIONS' | 'INSUFFICIENT_AUM' | 'INVALID_STAKE';

/** 청산 실패 사유. */
export type CloseError = 'NO_OPEN_POSITION' | 'MIN_HOLD_NOT_MET';

export interface OpenPositionInput {
  readonly wallet: Wallet;
  /** 이미 보유 중인 포지션. 있으면(null이 아니면) `ALREADY_OPEN`으로 거부한다 (FR-5.2). */
  readonly existingPosition: OpenPosition | null;
  /** 이번 스테이지에서 지금까지 진입한 횟수(청산은 미포함, FR-5.3). 호출자가 누적 관리한다. */
  readonly openCount: number;
  readonly direction: Direction;
  /** AUM 대비 투입 비율. `0 < stakeRatio <= 1` (10%/25%/50%/전액 프리셋, FR-5.1). */
  readonly stakeRatio: number;
  /** 서버가 자기 시계로 계산한 진입 시각의 가격 (FR-5.4). */
  readonly openPrice: number;
  /** 재생 경과 ms 기준 진입 시각. */
  readonly openAtMs: number;
  /** 이 포지션에 부여할 일련번호. 호출자가 발급한다(보통 `openCount + 1`). */
  readonly seq: number;
  readonly params: PositionParams;
}

export type OpenPositionResult =
  | { readonly ok: true; readonly position: OpenPosition; readonly wallet: Wallet }
  | { readonly ok: false; readonly error: OpenError };

/**
 * 포지션 진입. AUM에서 `stake` 전액을 차감하고 새 `OpenPosition`을 만든다.
 *
 * 수수료(`fee`)는 PRD FR-5.7 그대로 "stake에서 선차감"한다 — 즉 지갑에서는 `stake`만큼만
 * 빠지고, `fee`는 나중에 `evaluatePosition`이 손익을 셈할 때 차감되는 값으로 별도 보관한다.
 */
export function openPosition(input: OpenPositionInput): OpenPositionResult {
  if (input.existingPosition !== null) {
    return { ok: false, error: 'ALREADY_OPEN' };
  }
  if (input.openCount >= input.params.maxPositions) {
    return { ok: false, error: 'MAX_POSITIONS' };
  }
  if (!(input.stakeRatio > 0) || input.stakeRatio > 1) {
    return { ok: false, error: 'INVALID_STAKE' };
  }

  // stake는 정수 재화이므로 내림 처리한다 — 올림/반올림을 쓰면 AUM 보유량을 넘어설 수 있다.
  const stake = Math.floor(input.wallet.aum * input.stakeRatio);
  if (stake <= 0 || stake > input.wallet.aum) {
    return { ok: false, error: 'INSUFFICIENT_AUM' };
  }

  const fee = Math.round(stake * input.params.feeRate);

  const wallet: Wallet = {
    gold: input.wallet.gold,
    aum: input.wallet.aum - stake,
  };

  const position: OpenPosition = {
    seq: input.seq,
    direction: input.direction,
    stake,
    fee,
    openPrice: input.openPrice,
    openAtMs: input.openAtMs,
    liqLine: input.params.liquidationLine,
  };

  return { ok: true, position, wallet };
}

/** 청산 완료 후의 포지션 스냅샷. `OpenPosition`에 청산 정보를 덧붙인 불변 기록이다. */
export interface ClosedPosition extends OpenPosition {
  readonly closePrice: number;
  readonly closeAtMs: number;
  readonly pnl: number;
  readonly reason: CloseReason;
}

export interface CloseResult {
  readonly position: ClosedPosition;
  readonly wallet: Wallet;
  readonly evaluation: PositionEval;
  /** 이번 청산으로 골드에 실제로 더해진 양(순이익만, FR-5.7). 손실이면 항상 0이다. */
  readonly goldGained: number;
  readonly reason: CloseReason;
}

export interface ClosePositionInput {
  readonly wallet: Wallet;
  readonly position: OpenPosition | null;
  /** 서버가 자기 시계로 계산한 청산 시각의 가격 (FR-5.4). */
  readonly closePrice: number;
  /** 재생 경과 ms 기준 청산 시각. */
  readonly closeAtMs: number;
  readonly reason: CloseReason;
  readonly params: PositionParams;
}

export type ClosePositionResult =
  | { readonly ok: true; readonly result: CloseResult }
  | { readonly ok: false; readonly error: CloseError };

/**
 * 포지션 청산.
 *
 * FR-5.7 원금-이익 분리 정산 — **원금은 절대 골드가 되지 않는다.**
 * ```
 * pnl > 0  →  aum += stake,          gold += pnl
 * pnl <= 0 →  aum += (stake + pnl),  gold 증가 없음
 * ```
 * 이 분리가 없으면 "진입 직후 즉시 청산"만으로 AUM 전액을 골드로 세탁할 수 있다.
 *
 * `reason`이 `liquidated`/`stage_end`(서버 강제 청산)이면 `minHoldMs` 검사를 건너뛴다 —
 * 플레이어의 의사와 무관하게 서버가 즉시 정리해야 하는 상황이기 때문이다.
 */
export function closePosition(input: ClosePositionInput): ClosePositionResult {
  if (input.position === null) {
    return { ok: false, error: 'NO_OPEN_POSITION' };
  }

  const isForcedClose = input.reason === 'liquidated' || input.reason === 'stage_end';
  const heldMs = input.closeAtMs - input.position.openAtMs;
  if (!isForcedClose && heldMs < input.params.minHoldMs) {
    return { ok: false, error: 'MIN_HOLD_NOT_MET' };
  }

  const evaluation = evaluatePosition(input.position, input.closePrice, input.params);

  const goldGained = evaluation.pnl > 0 ? evaluation.pnl : 0;
  const aumReturned = evaluation.pnl > 0 ? input.position.stake : input.position.stake + evaluation.pnl;

  const wallet: Wallet = {
    gold: input.wallet.gold + goldGained,
    aum: input.wallet.aum + aumReturned,
  };

  const closedPosition: ClosedPosition = {
    ...input.position,
    closePrice: input.closePrice,
    closeAtMs: input.closeAtMs,
    pnl: evaluation.pnl,
    reason: input.reason,
  };

  return {
    ok: true,
    result: {
      position: closedPosition,
      wallet,
      evaluation,
      goldGained,
      reason: input.reason,
    },
  };
}
