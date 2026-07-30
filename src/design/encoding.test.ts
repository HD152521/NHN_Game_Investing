import { describe, expect, test } from 'vitest';

import { parseHex, toGrayscale } from './color';
import {
  candleFillFor,
  directionSymbol,
  encodeDirection,
  encodeFaction,
  factionForDirection,
  silhouetteShapeFor,
} from './encoding';
import { createTheme } from './theme';

/** 그레이스케일 후 두 색이 "사실상 같다"고 볼 채널 차이 상한 */
const GRAYSCALE_INDISTINGUISHABLE_DELTA = 12;

describe('색과 무관한 이중 인코딩 (아트가이드 §1.3)', () => {
  test('상승/하락에 ▲ ▼ 기호가 병기된다', () => {
    expect(directionSymbol('up')).toBe('▲');
    expect(directionSymbol('down')).toBe('▼');
  });

  test('캔들 채움/빈칸이 방향마다 다르다', () => {
    expect(candleFillFor('up')).not.toBe(candleFillFor('down'));
  });

  test('아군은 원형, 적군은 각진 실루엣이다', () => {
    expect(silhouetteShapeFor('ally')).toBe('rounded');
    expect(silhouetteShapeFor('enemy')).toBe('angular');
  });

  test('방향 → 진영 매핑이 §1.3 결정과 일치한다 (상승=아군, 하락=적군)', () => {
    expect(factionForDirection('up')).toBe('ally');
    expect(factionForDirection('down')).toBe('enemy');
  });

  test('기호·채움·형태는 테마 없이 조회할 수 있다 (색과 독립)', () => {
    // 테마 인자를 요구하지 않는 것 자체가 색 독립성의 증거다.
    expect(directionSymbol('up')).toBeTypeOf('string');
    expect(candleFillFor('down')).toBeTypeOf('string');
    expect(silhouetteShapeFor('enemy')).toBeTypeOf('string');
  });
});

describe('encodeDirection / encodeFaction (일관된 단일 조회)', () => {
  test('방향 하나로 색·기호·채움·형태가 한 번에 나온다', () => {
    const up = encodeDirection('up', createTheme('default'));
    expect(up).toMatchObject({
      direction: 'up',
      faction: 'ally',
      token: 'UP_ALLY',
      symbol: '▲',
      shape: 'rounded',
    });
    expect(up.color).toBeTypeOf('string');
    expect(up.candleFill).toBeTypeOf('string');
  });

  test('진영으로 조회해도 방향으로 조회한 것과 완전히 동일한 인코딩이 나온다', () => {
    const theme = createTheme('colorblind');
    expect(encodeFaction('ally', theme)).toEqual(encodeDirection('up', theme));
    expect(encodeFaction('enemy', theme)).toEqual(encodeDirection('down', theme));
  });

  test('상승과 하락은 모든 비색상 채널에서 서로 다르다', () => {
    const theme = createTheme('default');
    const up = encodeDirection('up', theme);
    const down = encodeDirection('down', theme);
    expect(up.symbol).not.toBe(down.symbol);
    expect(up.candleFill).not.toBe(down.candleFill);
    expect(up.shape).not.toBe(down.shape);
    expect(up.token).not.toBe(down.token);
  });
});

/**
 * PLAN STEP 9 수용 기준: "색을 완전히 제거(그레이스케일)해도 플레이 가능".
 */
describe('그레이스케일 생존성', () => {
  test('기본 모드 상승/하락은 그레이스케일에서 사실상 구분되지 않는다 (이중 인코딩이 필수인 이유)', () => {
    const theme = createTheme('default');
    const upGray = parseHex(toGrayscale(encodeDirection('up', theme).color));
    const downGray = parseHex(toGrayscale(encodeDirection('down', theme).color));
    expect(Math.abs(upGray.r - downGray.r)).toBeLessThan(GRAYSCALE_INDISTINGUISHABLE_DELTA);
  });

  test('그레이스케일 후에도 기호와 채움으로 상승/하락이 구분된다', () => {
    for (const mode of ['default', 'colorblind'] as const) {
      const theme = createTheme(mode);
      const up = encodeDirection('up', theme);
      const down = encodeDirection('down', theme);

      // 색을 전부 같은 회색으로 만들어도
      const grayUp = { ...up, color: toGrayscale(up.color), deepColor: toGrayscale(up.deepColor) };
      const grayDown = {
        ...down,
        color: toGrayscale(down.color),
        deepColor: toGrayscale(down.deepColor),
      };

      // 기호·채움·형태는 그대로 살아남는다
      expect(grayUp.symbol).not.toBe(grayDown.symbol);
      expect(grayUp.candleFill).not.toBe(grayDown.candleFill);
      expect(grayUp.shape).not.toBe(grayDown.shape);
    }
  });

  test('그레이스케일 후에도 아군/적군이 실루엣 형태로 구분된다', () => {
    const theme = createTheme('default');
    expect(encodeFaction('ally', theme).shape).not.toBe(encodeFaction('enemy', theme).shape);
  });
});
