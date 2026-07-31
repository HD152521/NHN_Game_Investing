/**
 * 포지션 진입·청산 — 순수·불변 상태 전이 함수 (PRD FR-5).
 *
 * 입력으로 받은 `wallet`/`position` 객체는 절대 변형하지 않고, 항상 새 객체를 반환한다.
 * 이 파일이 이 게임의 경제 코어다 — AUM은 골드로만 흘러가는 일방통행 파이프다:
 * 진입 시 AUM에서 stake가 빠지고, 청산 시 원금+손익(`stake + pnl`, 최소 0)이
 * 통째로 골드로 넘어간다. 원금은 AUM으로 복귀하지 않는다. AUM을 다시 채우는
 * 유일한 경로는 적 처치 드롭(`src/combat`)이며, 이 파일은 그 경로를 다루지 않는다.
 */

import { evaluatePosition } from './evaluate';
import type { CloseReason, Direction, OpenPosition, PositionEval, PositionParams, Wallet } from './types';

/** 진입 실패 사유. PRD §7 에러 코드(`POSITION_ALREADY_OPEN` 등)에 대응한다. */
export type OpenError = 'ALREADY_OPEN' | 'MAX_POSITIONS' | 'INSUFFICIENT_AUM' | 'INVALID_STAKE';

/** 청산 실패 사유. */
export type CloseError = 'NO_OPEN_POSITION' | 'MIN_HOLD_NOT_MET';

/**
 * 추가 매수 실패 사유.
 * `INVALID_PRICE`: 평균 단가 계산(주식 수 가중)에 쓰이는 `openPrice`/`price` 중
 * 하나라도 0 이하면 나눗셈이 NaN/Infinity로 새는 것을 막기 위해 진입 자체를 거부한다.
 */
export type AddError =
  | 'NO_OPEN_POSITION'
  | 'MAX_POSITIONS'
  | 'INSUFFICIENT_AUM'
  | 'INVALID_STAKE'
  | 'INVALID_PRICE';

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
    addCount: 0,
  };

  return { ok: true, position, wallet };
}

export interface AddToPositionInput {
  readonly wallet: Wallet;
  /** 추가 매수 대상 포지션. 없으면(null) `NO_OPEN_POSITION`으로 거부한다. */
  readonly position: OpenPosition | null;
  /**
   * 이번 스테이지에서 지금까지 진입한 횟수. 추가 매수도 신규 진입과 마찬가지로
   * `MAX_POSITIONS` 카운트를 소모한다 — 물타기를 반복해서 진입 횟수 제한을 우회할 수 없다.
   */
  readonly openCount: number;
  /** 현재 AUM 대비 추가 투입 비율. `0 < stakeRatio <= 1`. */
  readonly stakeRatio: number;
  /** 서버가 자기 시계로 계산한 현재가. */
  readonly price: number;
  /** 재생 경과 ms 기준 추가 매수 시각. */
  readonly atMs: number;
  readonly params: PositionParams;
}

export type AddToPositionResult =
  | { readonly ok: true; readonly position: OpenPosition; readonly wallet: Wallet }
  | { readonly ok: false; readonly error: AddError };

/**
 * 보유 중인 포지션에 추가 매수(물타기/불타기)한다. 방향은 바꿀 수 없다 — 항상 기존
 * 포지션과 같은 방향으로만 더한다.
 *
 * ```
 * addStake  = floor(AUM × stakeRatio)
 * addFee    = round(addStake × feeRate)
 * newStake  = stake + addStake
 * newFee    = fee + addFee                (수수료는 누적, 진입 시 선차감 규칙과 동일)
 * shares    = stake / openPrice           (최초 진입분의 주식 수)
 * addShares = addStake / price            (추가분의 주식 수)
 * newPrice  = (stake + addStake) / (shares + addShares)   (주식 수 가중 평균 단가)
 * AUM      -= addStake
 * ```
 *
 * ★ 왜 "투입금액 가중"이 아니라 "주식 수 가중"인가 ★
 * 두 로트를 **합치지 않고 따로 들고 있다면** 손익 합은
 * `stake×(P−openPrice)/openPrice + addStake×(P−price)/price` 다.
 * 합친 포지션의 손익은 `newStake×(P−newPrice)/newPrice`로 계산되는데, 이 두 식이
 * 모든 가격 P에서 항등이 되는 newPrice는 오직 "주식 수 가중 평균"
 * `(stake+addStake)/(stake/openPrice + addStake/price)` 뿐이다. 즉 이 평균만이
 * "로트를 합쳐서 들고 있는 것"과 "따로 들고 있는 것"을 손익 관점에서 동일하게 만든다.
 * 투입금액 가중(`(stake×openPrice+addStake×price)/newStake`)은 이 항등식을 깨서
 * 없는 손익을 만들어내므로 틀린 공식이다 — 직관적으로 보인다고 되돌리지 말 것.
 *
 * `liqLine`(청산선 스냅샷)·`seq`·`openAtMs`는 **최초 진입 값을 그대로 유지**한다.
 * 특히 `openAtMs`를 갱신하면 안 된다 — 추가 매수 때마다 최소 보유 시간(`minHoldMs`)이
 * 리셋되어 청산을 무한정 지연시키는 우회로가 생긴다.
 *
 * ★ 왜 청산선이 밀리는가 (설계 목적, 버그 아님) ★
 * `evaluatePosition`은 `deltaPct`를 이 함수가 갱신하는 평균 단가(`openPrice`) 기준으로
 * 계산한다. 손실 중에 추가 매수하면 평균 단가가 현재가 쪽으로 당겨지므로(위 가중평균 공식)
 * `deltaPct`/`z`의 절대값이 줄어들고, 따라서 `r = payoutBase × clamp(z, ...)`이 청산선
 * (`-liqLine`)에서 멀어진다. **"물타기로 버티면 강제 청산까지의 여유가 늘어난다"는 이 게임의
 * 핵심 트레이드오프이며, 그 대가로 AUM(원래 골드로 바꿔 타워를 세울 돈)이 줄어든다.**
 * 이 부작용처럼 보이는 동작을 "고쳐서" `openPrice`를 그대로 두거나 별도 필드로 분리하면
 * 이 기능의 설계 의도 자체가 사라지므로 되돌리지 말 것.
 */
export function addToPosition(input: AddToPositionInput): AddToPositionResult {
  if (input.position === null) {
    return { ok: false, error: 'NO_OPEN_POSITION' };
  }
  if (input.openCount >= input.params.maxPositions) {
    return { ok: false, error: 'MAX_POSITIONS' };
  }
  if (!(input.stakeRatio > 0) || input.stakeRatio > 1) {
    return { ok: false, error: 'INVALID_STAKE' };
  }
  // 주식 수 가중 평균은 openPrice/price로 나눗셈을 하므로, 둘 중 하나라도 0 이하면
  // shares가 NaN/Infinity로 새서 평균 단가·이후의 청산 판정 전체가 오염된다.
  // openPosition은 openPrice 유효성을 검증하지 않으므로 여기서 다시 방어한다.
  if (!(input.position.openPrice > 0) || !(input.price > 0)) {
    return { ok: false, error: 'INVALID_PRICE' };
  }

  // stake는 정수 재화이므로 내림 처리한다 — openPosition과 동일한 이유(AUM 초과 방지).
  const addStake = Math.floor(input.wallet.aum * input.stakeRatio);
  if (addStake <= 0 || addStake > input.wallet.aum) {
    return { ok: false, error: 'INSUFFICIENT_AUM' };
  }

  const addFee = Math.round(addStake * input.params.feeRate);
  const newStake = input.position.stake + addStake;
  const newFee = input.position.fee + addFee;

  // 주식 수 가중 평균 단가 — 상세 근거는 위 함수 JSDoc의 등가성 논증 참고.
  const shares = input.position.stake / input.position.openPrice;
  const addShares = addStake / input.price;
  const newOpenPrice = newStake / (shares + addShares);

  const wallet: Wallet = {
    gold: input.wallet.gold,
    aum: input.wallet.aum - addStake,
  };

  const position: OpenPosition = {
    seq: input.position.seq,
    direction: input.position.direction,
    stake: newStake,
    fee: newFee,
    openPrice: newOpenPrice,
    openAtMs: input.position.openAtMs,
    liqLine: input.position.liqLine,
    addCount: input.position.addCount + 1,
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
  /**
   * 이번 청산으로 골드에 더해진 총액 — "순이익"이 아니라 `max(stake + pnl, 0)`,
   * 즉 원금과 손익을 합쳐 골드로 넘어간 금액 전체다. 강제 청산처럼 `pnl === -stake`인
   * 경우에만 0이 된다.
   */
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
 * AUM → 골드 일방통행 정산 — **원금은 AUM으로 복귀하지 않는다.**
 * ```
 * goldGained = max(stake + pnl, 0)
 * gold += goldGained
 * aum  += 0   (청산은 AUM을 절대 늘리지 않는다)
 * ```
 * 진입 시 이미 AUM에서 stake가 빠져나간 상태이므로, 청산은 그 stake와 손익을
 * 합산해 골드로 흘려보내는 것으로 끝난다. 강제 청산이면 `pnl === -stake`가 되어
 * `goldGained`가 정확히 0이 된다 — 원금을 전부 잃었으니 넘어갈 것이 없다는 뜻이다.
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

  const goldGained = Math.max(input.position.stake + evaluation.pnl, 0);

  const wallet: Wallet = {
    gold: input.wallet.gold + goldGained,
    aum: input.wallet.aum,
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
