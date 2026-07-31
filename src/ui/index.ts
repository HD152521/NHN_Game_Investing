/**
 * `src/ui` 공개 API 배럴.
 */

export { createTradePanel } from './trade-panel';
export type { TradePanel } from './trade-panel';

export {
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
export type {
  Direction,
  PnlTone,
  StakeRatio,
  TradePanelHandlers,
  TradePanelViewModel,
} from './trade-panel-logic';
