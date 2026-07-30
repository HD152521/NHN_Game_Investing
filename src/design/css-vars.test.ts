import { describe, expect, test } from 'vitest';

import { CSS_VAR_PREFIX, applyPalette, cssVarName, cssVarRef, serializeCssVars } from './css-vars';
import { PALETTE_TOKENS } from './palette';
import { createTheme, resolvePalette, toggleColorblind } from './theme';

describe('cssVarName', () => {
  test('토큰을 kebab-case CSS 변수명으로 바꾼다', () => {
    expect(cssVarName('BG_0')).toBe(`${CSS_VAR_PREFIX}-bg-0`);
    expect(cssVarName('UP_ALLY')).toBe(`${CSS_VAR_PREFIX}-up-ally`);
    expect(cssVarName('ENEMY_DOWN')).toBe(`${CSS_VAR_PREFIX}-enemy-down`);
    expect(cssVarName('MUTED')).toBe(`${CSS_VAR_PREFIX}-muted`);
  });

  test('cssVarRef 는 var() 참조 문자열을 만든다', () => {
    expect(cssVarRef('GOLD')).toBe(`var(${CSS_VAR_PREFIX}-gold)`);
  });

  test('12토큰의 변수명이 모두 유일하다', () => {
    const names = PALETTE_TOKENS.map(cssVarName);
    expect(new Set(names).size).toBe(PALETTE_TOKENS.length);
  });
});

describe('serializeCssVars', () => {
  test('12토큰 전부를 커스텀 프로퍼티로 출력한다', () => {
    const css = serializeCssVars(resolvePalette('default'));
    for (const token of PALETTE_TOKENS) {
      expect(css).toContain(cssVarName(token));
    }
  });

  test('HEX 값이 TS 팔레트에서 그대로 나온다 (단일 소스)', () => {
    const palette = resolvePalette('default');
    const css = serializeCssVars(palette);
    expect(css).toContain(`${cssVarName('UP_ALLY')}: ${palette.UP_ALLY};`);
  });

  test('셀렉터를 지정할 수 있고 기본값은 :root 다', () => {
    expect(serializeCssVars(resolvePalette('default'))).toContain(':root {');
    expect(serializeCssVars(resolvePalette('default'), '.tf-theme')).toContain('.tf-theme {');
  });

  test('색약 모드 출력은 기본 모드와 다르다', () => {
    expect(serializeCssVars(resolvePalette('colorblind'))).not.toBe(
      serializeCssVars(resolvePalette('default')),
    );
  });
});

describe('applyPalette', () => {
  function createStubTarget(): {
    readonly style: { setProperty(name: string, value: string): void };
    readonly applied: Map<string, string>;
  } {
    const applied = new Map<string, string>();
    return {
      applied,
      style: {
        setProperty(name: string, value: string): void {
          applied.set(name, value);
        },
      },
    };
  }

  test('대상 엘리먼트에 12개 커스텀 프로퍼티를 세팅한다', () => {
    const target = createStubTarget();
    applyPalette(target, resolvePalette('default'));
    expect(target.applied.size).toBe(PALETTE_TOKENS.length);
    expect(target.applied.get(cssVarName('BG_0'))).toBe(resolvePalette('default').BG_0);
  });

  test('색약 토글 후 다시 적용하면 상승색과 아군색이 같은 변수로 함께 바뀐다', () => {
    const target = createStubTarget();
    const theme = createTheme('default');

    applyPalette(target, theme.palette);
    const before = target.applied.get(cssVarName('UP_ALLY'));

    applyPalette(target, toggleColorblind(theme).palette);
    const after = target.applied.get(cssVarName('UP_ALLY'));

    expect(after).not.toBe(before);
    // 차트와 진영이 같은 변수를 쓰므로 CSS 쪽에서도 갈라질 수 없다.
    expect(new Set(PALETTE_TOKENS.map(cssVarName)).has(cssVarName('UP_ALLY'))).toBe(true);
  });
});
