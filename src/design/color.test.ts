import { describe, expect, test } from 'vitest';

import { contrastRatio, parseHex, relativeLuminance, toGrayscale, toHex } from './color';

const FLOAT_PRECISION = 4;

describe('parseHex / toHex', () => {
  test('6자리 HEX를 RGB 채널로 분해한다', () => {
    expect(parseHex('#1A2236')).toEqual({ r: 26, g: 34, b: 54 });
  });

  test('대소문자를 가리지 않는다', () => {
    expect(parseHex('#1a2236')).toEqual(parseHex('#1A2236'));
  });

  test('toHex 는 parseHex 의 역함수다', () => {
    expect(toHex(parseHex('#9B6BFF'))).toBe('#9B6BFF');
  });

  test('잘못된 형식은 명시적으로 실패한다', () => {
    expect(() => parseHex('9B6BFF')).toThrow(/hex/i);
    expect(() => parseHex('#XYZXYZ')).toThrow(/hex/i);
    expect(() => parseHex('#FFF')).toThrow(/hex/i);
  });

  test('채널 범위를 벗어난 값은 거부한다', () => {
    expect(() => toHex({ r: -1, g: 0, b: 0 })).toThrow(/range/i);
    expect(() => toHex({ r: 0, g: 256, b: 0 })).toThrow(/range/i);
  });
});

describe('relativeLuminance (WCAG 2.x)', () => {
  test('검정은 0, 흰색은 1', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, FLOAT_PRECISION);
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, FLOAT_PRECISION);
  });

  test('저휘도 구간은 선형 분할(/12.92)을 사용한다', () => {
    // 8/255 = 0.03137 < 0.03928 이므로 선형 구간
    const linearChannel = 8 / 255 / 12.92;
    expect(relativeLuminance('#080808')).toBeCloseTo(linearChannel, FLOAT_PRECISION);
  });
});

describe('contrastRatio (WCAG 2.x)', () => {
  test('흑백 대비는 21:1', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 2);
  });

  test('같은 색끼리는 1:1', () => {
    expect(contrastRatio('#FF4D5A', '#FF4D5A')).toBeCloseTo(1, FLOAT_PRECISION);
  });

  test('인자 순서와 무관하다 (대칭)', () => {
    expect(contrastRatio('#0F1524', '#E8ECF4')).toBeCloseTo(
      contrastRatio('#E8ECF4', '#0F1524'),
      FLOAT_PRECISION,
    );
  });
});

describe('toGrayscale', () => {
  test('무채색은 그대로 유지된다', () => {
    expect(toGrayscale('#000000')).toBe('#000000');
    expect(toGrayscale('#FFFFFF')).toBe('#FFFFFF');
  });

  test('결과는 R=G=B 인 무채색이다', () => {
    const gray = parseHex(toGrayscale('#2E86FF'));
    expect(gray.g).toBe(gray.r);
    expect(gray.b).toBe(gray.r);
  });

  test('그레이스케일은 원본의 상대 휘도를 보존한다', () => {
    const source = '#9B6BFF';
    expect(relativeLuminance(toGrayscale(source))).toBeCloseTo(relativeLuminance(source), 2);
  });
});
