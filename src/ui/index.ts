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
  formatUnaffordableNotice,
  resolveFlavorText,
  resolveRosterButtonState,
  rosterEntryFor,
} from './roster';
export type {
  RosterButtonInput,
  RosterButtonState,
  RosterEntry,
  RosterFlavorTip,
  RosterFlavorTipOptions,
} from './roster';

export {
  SKILL_AUM_CLASS,
  SKILL_BAR_ENTRIES,
  SKILL_READY_LABEL,
  buildSkillBarMarkup,
  buildSkillButton,
  formatSkillCooldown,
  formatSkillCost,
  resolveSkillButtonState,
  skillButtonClass,
  skillIdFor,
} from './skill-bar-logic';
export type { SkillButtonInput, SkillButtonState } from './skill-bar-logic';

export {
  SKILL_TOOLTIPS,
  buildSkillTooltipMarkup,
  clampTooltipLeft,
  formatSeconds,
  resolveTooltipTop,
  skillTooltipContent,
} from './skill-tooltip-logic';
export type { SkillTooltipContent, SkillTooltipRow } from './skill-tooltip-logic';

export { SKILL_TOOLTIP_ID, createSkillTooltip } from './skill-tooltip';
export type { SkillTooltip, SkillTooltipOptions } from './skill-tooltip';

export {
  HUD_ICON_ATTR,
  UI_ICON_COLUMNS,
  UI_ICON_HEIGHT,
  UI_ICON_NAMES,
  UI_ICON_ROWS,
  UI_ICON_SCALE,
  UI_ICON_SHEET_HEIGHT,
  UI_ICON_SHEET_WIDTH,
  UI_ICON_WIDTH,
  mountHudIcons,
  renderUiIcon,
  uiIconGrid,
  uiIconRaster,
  uiIconRect,
} from './sprite-icons';
export type { UiIconMountOptions, UiIconName } from './sprite-icons';

export {
  PREDICTION_ART_ATTR,
  PREDICTION_BUTTON_HEIGHT,
  PREDICTION_BUTTON_SCALE,
  PREDICTION_BUTTON_WIDTH,
  PREDICTION_SHEET_HEIGHT,
  PREDICTION_SHEET_WIDTH,
  mountPredictionButtonArt,
  predictionButtonGrid,
  predictionButtonRaster,
  predictionButtonRect,
  renderPredictionButton,
} from './sprite-buttons';
export type { PredictionArtOptions } from './sprite-buttons';

export {
  REVEAL_CONTENT_HEIGHT,
  REVEAL_CONTENT_WIDTH,
  REVEAL_CONTENT_X,
  REVEAL_CONTENT_Y,
  REVEAL_HEIGHT,
  REVEAL_WIDTH,
  drawRevealBackdrop,
  revealContentRect,
  revealCoverScale,
  revealRaster,
} from './reveal-backdrop';
export type { RevealBackdropOptions } from './reveal-backdrop';

export { paintRasterToCanvas, rasterCtxOf, sliceGrid, sliceRaster, sliceSource } from './sprite-slice';
export type { GridRect } from './sprite-slice';

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
  canAffordStakeRatio,
  formatAddStakePreview,
  formatAmount,
  formatDistance,
  formatPnl,
  formatPrice,
  formatStakeRatioLabel,
  resolveAddButtonLabel,
  resolveAddCountLabel,
  resolveAnnouncement,
  resolveDirectionLabel,
  resolveEntriesLeftLabel,
  resolvePnlTone,
  resolvePriceTone,
  resolveStakeAmount,
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
