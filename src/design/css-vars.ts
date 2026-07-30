/**
 * 팔레트 → CSS Custom Property 생성.
 *
 * CSS 쪽에 HEX 를 두 번 적지 않기 위해, 스타일시트는 `var(--tf-*)` 만 참조하고
 * 실제 값은 이 모듈이 TS 팔레트에서 만들어 주입합니다 (PLAN STEP 9 #1 단일 소스).
 */

import { PALETTE_TOKENS } from './palette';
import type { PaletteToken } from './palette';
import type { Palette } from './theme';

export const CSS_VAR_PREFIX = '--tf';

const DEFAULT_SELECTOR = ':root';
const INDENT = '  ';

/** `UP_ALLY` → `--tf-up-ally` */
export function cssVarName(token: PaletteToken): string {
  return `${CSS_VAR_PREFIX}-${token.toLowerCase().replace(/_/g, '-')}`;
}

/** `GOLD` → `var(--tf-gold)` */
export function cssVarRef(token: PaletteToken): string {
  return `var(${cssVarName(token)})`;
}

/** 스타일시트에 붙여 넣을 수 있는 `:root { ... }` 블록을 만듭니다. */
export function serializeCssVars(palette: Palette, selector: string = DEFAULT_SELECTOR): string {
  const declarations = PALETTE_TOKENS.map(
    (token) => `${INDENT}${cssVarName(token)}: ${palette[token]};`,
  ).join('\n');
  return `${selector} {\n${declarations}\n}\n`;
}

/**
 * 커스텀 프로퍼티를 세팅할 수 있는 최소 인터페이스.
 * DOM 타입에 묶지 않아 테스트에서 스텁을 넣을 수 있습니다.
 */
export interface CssVarTarget {
  readonly style: {
    setProperty(name: string, value: string): void;
  };
}

/** 런타임에 팔레트를 대상 엘리먼트로 반영합니다. 색약 토글 시 다시 호출하세요. */
export function applyPalette(target: CssVarTarget, palette: Palette): void {
  for (const token of PALETTE_TOKENS) {
    target.style.setProperty(cssVarName(token), palette[token]);
  }
}
