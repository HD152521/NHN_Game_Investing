/**
 * 색 모드(기본 / 색약)와 그에 따라 해석된 팔레트.
 * PRD FR-13.1 색약 모드 · 아트가이드 §1.3.
 *
 * 테마 값은 전부 불변입니다. 모드를 바꾸면 새 테마 객체가 반환됩니다.
 */

import { BASE_PALETTE, COLORBLIND_OVERRIDES } from './palette';
import type { HexColor, PaletteToken } from './palette';

export const COLOR_MODES = ['default', 'colorblind'] as const;

export type ColorMode = (typeof COLOR_MODES)[number];

export type Palette = Readonly<Record<PaletteToken, HexColor>>;

export interface ColorTheme {
  readonly mode: ColorMode;
  readonly palette: Palette;
}

const PALETTE_BY_MODE: Readonly<Record<ColorMode, Palette>> = {
  default: Object.freeze({ ...BASE_PALETTE }),
  colorblind: Object.freeze({ ...BASE_PALETTE, ...COLORBLIND_OVERRIDES }),
};

export function resolvePalette(mode: ColorMode): Palette {
  return PALETTE_BY_MODE[mode];
}

export function createTheme(mode: ColorMode = 'default'): ColorTheme {
  return Object.freeze({ mode, palette: resolvePalette(mode) });
}

/** 모드를 바꾼 새 테마를 반환합니다 (원본 불변). */
export function withMode(theme: ColorTheme, mode: ColorMode): ColorTheme {
  return theme.mode === mode ? theme : createTheme(mode);
}

/** 기본 ↔ 색약 모드 왕복 토글. */
export function toggleColorblind(theme: ColorTheme): ColorTheme {
  return withMode(theme, theme.mode === 'colorblind' ? 'default' : 'colorblind');
}

/** 토큰 하나를 현재 모드 기준으로 해석합니다. */
export function colorOf(theme: ColorTheme, token: PaletteToken): HexColor {
  return theme.palette[token];
}
