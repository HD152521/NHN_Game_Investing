/**
 * TICKER FRONT 색 시스템 공개 API.
 *
 * 아트가이드 §1.3 / PRD FR-13.1 / PLAN STEP 9.
 *
 * 사용 예:
 * ```ts
 * let theme = createTheme();                 // 기본 모드
 * theme = toggleColorblind(theme);           // 색약 모드 (FR-13.1)
 * applyPalette(document.documentElement, theme.palette);
 *
 * const up = encodeDirection('up', theme);
 * // up.color(=아군색과 동일) / up.symbol '▲' / up.candleFill 'filled' / up.shape 'rounded'
 * ```
 */

export { BASE_PALETTE, COLORBLIND_OVERRIDES, PALETTE_TOKENS } from './palette';
export type { HexColor, PaletteToken } from './palette';

export { contrastRatio, parseHex, relativeLuminance, toGrayscale, toHex } from './color';
export type { Rgb } from './color';

export { COLOR_MODES, colorOf, createTheme, resolvePalette, toggleColorblind, withMode } from './theme';
export type { ColorMode, ColorTheme, Palette } from './theme';

export {
  candleFillFor,
  directionForFaction,
  directionSymbol,
  encodeDirection,
  encodeFaction,
  factionForDirection,
  silhouetteShapeFor,
} from './encoding';
export type {
  CandleFill,
  Direction,
  DirectionEncoding,
  Faction,
  SilhouetteShape,
} from './encoding';

export { CSS_VAR_PREFIX, applyPalette, cssVarName, cssVarRef, serializeCssVars } from './css-vars';
export type { CssVarTarget } from './css-vars';
