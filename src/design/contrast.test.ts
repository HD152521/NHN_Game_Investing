import { describe, expect, test } from 'vitest';

import { contrastRatio, relativeLuminance } from './color';
import { COLOR_MODES, createTheme, resolvePalette } from './theme';
import { encodeDirection } from './encoding';

/** WCAG 2.2 SC 1.4.11 — 비텍스트(그래픽·UI) 최소 대비 */
const WCAG_NON_TEXT_MIN_RATIO = 3;
/** WCAG 2.2 SC 1.4.3 — 본문 텍스트 최소 대비 */
const WCAG_TEXT_MIN_RATIO = 4.5;
/**
 * UP vs DOWN 쌍의 명도 분리 기준.
 *
 * ★ 기본 팔레트(#FF4D5A / #2E86FF)의 UP-DOWN 대비는 1.08:1 입니다.
 *   빨강과 파랑은 채도만 다르고 휘도가 거의 같아서, 명도만으로는 절대 구분되지 않습니다.
 *   그래서 색약 모드 팔레트가 필요하고, 그것만으로도 3:1 에 못 미치므로
 *   ▲▼ 기호 / 캔들 채움 / 실루엣 형태 이중 인코딩이 **선택이 아니라 필수**입니다.
 *   이 상수는 색약 모드가 최소한 여기까지는 개선해야 한다는 회귀 방지선입니다.
 */
const COLORBLIND_PAIR_MIN_RATIO = 2.5;

describe('배경 대비 (WCAG 2.2 SC 1.4.11)', () => {
  test.each(COLOR_MODES)('%s 모드: 상승/하락색이 배경 BG_1 대비 3:1 이상', (mode) => {
    const theme = createTheme(mode);
    const background = theme.palette.BG_1;

    expect(contrastRatio(encodeDirection('up', theme).color, background)).toBeGreaterThanOrEqual(
      WCAG_NON_TEXT_MIN_RATIO,
    );
    expect(contrastRatio(encodeDirection('down', theme).color, background)).toBeGreaterThanOrEqual(
      WCAG_NON_TEXT_MIN_RATIO,
    );
  });

  test.each(COLOR_MODES)('%s 모드: 상승/하락색이 3개 배경 레이어 모두에서 3:1 이상', (mode) => {
    const theme = createTheme(mode);
    const backgrounds = [theme.palette.BG_0, theme.palette.BG_1, theme.palette.BG_2];

    for (const background of backgrounds) {
      for (const direction of ['up', 'down'] as const) {
        expect(
          contrastRatio(encodeDirection(direction, theme).color, background),
        ).toBeGreaterThanOrEqual(WCAG_NON_TEXT_MIN_RATIO);
      }
    }
  });

  test('텍스트 토큰은 본문 대비 4.5:1 이상', () => {
    const { TEXT, MUTED, BG_1 } = resolvePalette('default');
    expect(contrastRatio(TEXT, BG_1)).toBeGreaterThanOrEqual(WCAG_TEXT_MIN_RATIO);
    expect(contrastRatio(MUTED, BG_1)).toBeGreaterThanOrEqual(WCAG_TEXT_MIN_RATIO);
  });
});

describe('UP vs DOWN 명도 분리', () => {
  test('색약 모드는 기본 모드보다 UP-DOWN 명도 분리가 확실히 낫다', () => {
    const defaultTheme = createTheme('default');
    const colorblindTheme = createTheme('colorblind');

    const defaultPair = contrastRatio(
      encodeDirection('up', defaultTheme).color,
      encodeDirection('down', defaultTheme).color,
    );
    const colorblindPair = contrastRatio(
      encodeDirection('up', colorblindTheme).color,
      encodeDirection('down', colorblindTheme).color,
    );

    expect(colorblindPair).toBeGreaterThan(defaultPair);
    expect(colorblindPair).toBeGreaterThanOrEqual(COLORBLIND_PAIR_MIN_RATIO);
  });

  test('기본 팔레트는 명도만으로 상승/하락을 구분할 수 없다 → 이중 인코딩이 필수', () => {
    const theme = createTheme('default');
    const pair = contrastRatio(
      encodeDirection('up', theme).color,
      encodeDirection('down', theme).color,
    );

    // 이 단언이 깨진다면 팔레트가 바뀐 것이므로 이중 인코딩 전제를 재검토해야 합니다.
    expect(pair).toBeLessThan(WCAG_NON_TEXT_MIN_RATIO);
  });
});

describe('음영 토큰', () => {
  test.each(COLOR_MODES)('%s 모드: 음영색이 본체색보다 항상 어둡다', (mode) => {
    const theme = createTheme(mode);
    for (const direction of ['up', 'down'] as const) {
      const encoding = encodeDirection(direction, theme);
      expect(relativeLuminance(encoding.deepColor)).toBeLessThan(
        relativeLuminance(encoding.color),
      );
    }
  });
});
