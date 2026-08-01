/**
 * 포지션(매매 판정) 공개 API — PRD FR-5 자유 매매제.
 *
 * 서버로 그대로 이관될 순수 판정 코어. DOM·타이머·전역 상태를 만지지 않으며,
 * 재생 경과 ms·가격 등은 전부 호출자가 주입한다.
 *
 * 사용 예:
 * ```ts
 * const params = { ...DEFAULT_POSITION_PARAMS, sigma: chartSet.sigma30 };
 * const opened = openPosition({ wallet, existingPosition: null, openCount: 0, ... });
 * if (opened.ok) {
 *   const evalNow = evaluatePosition(opened.position, currentPrice, params);
 *   if (evalNow.liquidated) {
 *     closePosition({ wallet: opened.wallet, position: opened.position, closePrice, closeAtMs, reason: 'liquidated', params });
 *   }
 * }
 * ```
 */

export type { CloseReason, Direction, OpenPosition, PositionEval, PositionParams, Wallet } from './types';

export {
  AUM_SETTLEMENT_RATIO,
  DEFAULT_POSITION_PARAMS,
  GOLD_CONVERSION,
  LIQ_WARN_RATIO,
  MIN_PROFIT_CLOSES_FOR_AUM_CREDIT,
  STAKE_PRESETS,
} from './constants';

export { evaluatePosition } from './evaluate';

export type { AumCreditInput } from './settle';
export { aumCapitalCredit } from './settle';

export type {
  AddError,
  AddToPositionInput,
  AddToPositionResult,
  CloseError,
  ClosePositionInput,
  ClosePositionResult,
  CloseResult,
  ClosedPosition,
  OpenError,
  OpenPositionInput,
  OpenPositionResult,
} from './trade';
export { addToPosition, closePosition, openPosition } from './trade';
