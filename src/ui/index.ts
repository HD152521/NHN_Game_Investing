/**
 * `src/ui` 공개 API 배럴.
 */

export { createTradePanel } from './trade-panel';
export type { TradePanel } from './trade-panel';

export {
  ROSTER_FLAVOR_ATTR,
  TOWER_ROSTER,
  UNIT_ROSTER,
  buildRosterButton,
  buildRosterMarkup,
  buildTowerRosterMarkup,
  buildUnitRosterMarkup,
  createRosterFlavorTip,
  formatCostLabel,
  resolveFlavorText,
  rosterEntryFor,
} from './roster';
export type { RosterEntry, RosterFlavorTip, RosterFlavorTipOptions } from './roster';

export { createGoldMeter, prefersReducedMotion } from './gold-flight';
export type {
  FlightScheduler,
  GoldFlightRequest,
  GoldMeter,
  GoldMeterOptions,
} from './gold-flight';

export {
  GOLD_FLIGHT_MAX_MS,
  GOLD_FLIGHT_TOTAL_MS,
  countUpTo,
  formatGoldFlightLabel,
  goldFlightToneClass,
  resolveGoldFlightAnnouncement,
  resolveGoldFlightPlan,
  resolveGoldFlightTone,
  sampleGoldFlight,
} from './gold-flight-logic';
export type {
  CloseReason,
  FlightFrame,
  FlightPath,
  GoldFlightPhase,
  GoldFlightPlan,
  GoldFlightTone,
} from './gold-flight-logic';

export {
  formatAmount,
  formatDistance,
  formatPnl,
  formatPrice,
  formatStakeRatioLabel,
  resolveAddButtonLabel,
  resolveAddCountLabel,
  resolveAnnouncement,
  resolveDirectionLabel,
  resolvePnlTone,
  resolvePriceTone,
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
