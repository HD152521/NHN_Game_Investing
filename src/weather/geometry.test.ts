import { describe, expect, test } from 'vitest';

import {
  CENTER_CLEAR_HEIGHT_RATIO,
  CENTER_CLEAR_WIDTH_RATIO,
  centerClearBottom,
  centerClearLeft,
  centerClearRight,
  centerClearTop,
  isInsideCenterClear,
  overlapsCenterClear,
} from './geometry.js';
import type { WeatherViewport } from './types.js';

const VIEWPORT: WeatherViewport = { width: 1000, height: 500, top: 28, groundY: 400 };

describe('centerClear* — 게임플레이를 가리지 않는 중앙 공백', () => {
  test('중앙 공백은 화면 중심에 대칭이다', () => {
    expect(centerClearLeft(VIEWPORT) + centerClearRight(VIEWPORT)).toBeCloseTo(VIEWPORT.width, 10);
    expect(centerClearTop(VIEWPORT) + centerClearBottom(VIEWPORT)).toBeCloseTo(VIEWPORT.height, 10);
  });

  test('공백 폭·높이가 비율 상수와 일치한다', () => {
    expect(centerClearRight(VIEWPORT) - centerClearLeft(VIEWPORT)).toBeCloseTo(
      VIEWPORT.width * CENTER_CLEAR_WIDTH_RATIO,
      10,
    );
    expect(centerClearBottom(VIEWPORT) - centerClearTop(VIEWPORT)).toBeCloseTo(
      VIEWPORT.height * CENTER_CLEAR_HEIGHT_RATIO,
      10,
    );
  });

  test('중심점은 공백 안이다', () => {
    expect(isInsideCenterClear(VIEWPORT.width / 2, VIEWPORT.height / 2, VIEWPORT)).toBe(true);
  });

  test('가장자리는 공백 밖이다', () => {
    expect(isInsideCenterClear(0, 0, VIEWPORT)).toBe(false);
    expect(isInsideCenterClear(VIEWPORT.width, VIEWPORT.height, VIEWPORT)).toBe(false);
  });

  test('공백을 가로지르는 선분은 겹침으로 판정된다', () => {
    expect(overlapsCenterClear(0, VIEWPORT.height / 2, VIEWPORT.width, VIEWPORT.height / 2, VIEWPORT)).toBe(
      true,
    );
  });

  test('공백 위쪽만 지나는 선분은 겹치지 않는다', () => {
    expect(overlapsCenterClear(0, 1, VIEWPORT.width, 1, VIEWPORT)).toBe(false);
  });

  test('공백 왼쪽만 지나는 선분은 겹치지 않는다', () => {
    expect(overlapsCenterClear(1, 0, 1, VIEWPORT.height, VIEWPORT)).toBe(false);
  });
});
