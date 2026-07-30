import { describe, expect, test } from 'vitest';

import { BASE_PALETTE, COLORBLIND_OVERRIDES, PALETTE_TOKENS } from './palette';
import { createTheme, resolvePalette, toggleColorblind, withMode } from './theme';
import { encodeDirection, encodeFaction } from './encoding';

describe('resolvePalette', () => {
  test('기본 모드는 BASE_PALETTE 그대로다', () => {
    expect(resolvePalette('default')).toEqual(BASE_PALETTE);
  });

  test('색약 모드는 오버라이드된 토큰만 바꾸고 나머지는 유지한다', () => {
    const colorblind = resolvePalette('colorblind');
    expect(colorblind.UP_ALLY).toBe(COLORBLIND_OVERRIDES.UP_ALLY);
    expect(colorblind.ENEMY_DOWN).toBe(COLORBLIND_OVERRIDES.ENEMY_DOWN);
    expect(colorblind.BG_0).toBe(BASE_PALETTE.BG_0);
    expect(colorblind.GOLD).toBe(BASE_PALETTE.GOLD);
    expect(colorblind.TEXT).toBe(BASE_PALETTE.TEXT);
  });

  test('두 모드 모두 12토큰을 빠짐없이 제공한다', () => {
    for (const mode of ['default', 'colorblind'] as const) {
      const palette = resolvePalette(mode);
      expect(Object.keys(palette).sort()).toEqual([...PALETTE_TOKENS].sort());
    }
  });
});

describe('theme 토글 (불변)', () => {
  test('기본 테마는 default 모드다', () => {
    expect(createTheme().mode).toBe('default');
  });

  test('withMode 는 원본을 변경하지 않고 새 테마를 반환한다', () => {
    const original = createTheme('default');
    const next = withMode(original, 'colorblind');
    expect(next).not.toBe(original);
    expect(original.mode).toBe('default');
    expect(original.palette.UP_ALLY).toBe(BASE_PALETTE.UP_ALLY);
    expect(next.mode).toBe('colorblind');
  });

  test('toggleColorblind 는 두 모드를 왕복한다', () => {
    const base = createTheme('default');
    const toggled = toggleColorblind(base);
    expect(toggled.mode).toBe('colorblind');
    expect(toggleColorblind(toggled).mode).toBe('default');
  });
});

/**
 * ★ 아트가이드 §1.3 의 핵심 설계 의도를 지키는 테스트.
 *   차트 색과 진영 색이 같은 토큰이므로, 색약 모드를 켜면 반드시 함께 바뀐다.
 *   차트/진영을 별도 색으로 쪼개면 이 테스트가 깨진다.
 */
describe('설계 의도: 차트 색 == 진영 색 (같은 토큰)', () => {
  test('기본 모드에서 상승 차트색과 아군색이 같다', () => {
    const theme = createTheme('default');
    expect(encodeDirection('up', theme).color).toBe(encodeFaction('ally', theme).color);
    expect(encodeDirection('down', theme).color).toBe(encodeFaction('enemy', theme).color);
  });

  test('색약 모드 토글 시 상승 차트색과 아군색이 함께 바뀐다', () => {
    const before = createTheme('default');
    const after = toggleColorblind(before);

    const upBefore = encodeDirection('up', before).color;
    const allyBefore = encodeFaction('ally', before).color;
    const upAfter = encodeDirection('up', after).color;
    const allyAfter = encodeFaction('ally', after).color;

    expect(upAfter).not.toBe(upBefore);
    expect(allyAfter).not.toBe(allyBefore);
    expect(upAfter).toBe(allyAfter);
  });

  test('색약 모드 토글 시 하락 차트색과 적군색이 함께 바뀐다', () => {
    const before = createTheme('default');
    const after = toggleColorblind(before);

    const downAfter = encodeDirection('down', after).color;
    const enemyAfter = encodeFaction('enemy', after).color;

    expect(downAfter).not.toBe(encodeDirection('down', before).color);
    expect(enemyAfter).not.toBe(encodeFaction('enemy', before).color);
    expect(downAfter).toBe(enemyAfter);
  });

  test('음영색도 차트/진영이 같은 토큰을 공유한다', () => {
    for (const mode of ['default', 'colorblind'] as const) {
      const theme = createTheme(mode);
      expect(encodeDirection('up', theme).deepColor).toBe(encodeFaction('ally', theme).deepColor);
      expect(encodeDirection('down', theme).deepColor).toBe(
        encodeFaction('enemy', theme).deepColor,
      );
    }
  });
});
