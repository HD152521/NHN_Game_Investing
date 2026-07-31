import { describe, expect, test } from 'vitest';

import { BLACKOUT_MAX_FRAMES } from './constants.js';
import { isBlackoutVisible, resolveWeatherKind } from './resolve.js';
import type { MarketConditions, WeatherKind } from './types.js';

function conditions(overrides: Partial<MarketConditions> = {}): MarketConditions {
  return { recentChangePct: 0, sigma30: 1, halted: false, event: null, ...overrides };
}

describe('isBlackoutVisible — WX-04는 3프레임 이내로 끝난다', () => {
  test('시작 프레임부터 3프레임까지만 보인다', () => {
    expect(isBlackoutVisible(0)).toBe(true);
    expect(isBlackoutVisible(BLACKOUT_MAX_FRAMES - 1)).toBe(true);
  });

  test('3프레임째부터는 더 이상 보이지 않는다', () => {
    expect(isBlackoutVisible(BLACKOUT_MAX_FRAMES)).toBe(false);
    expect(isBlackoutVisible(BLACKOUT_MAX_FRAMES + 50)).toBe(false);
  });

  test('상한이 3프레임이다 (시트 03 명시값)', () => {
    expect(BLACKOUT_MAX_FRAMES).toBe(3);
  });
});

describe('resolveWeatherKind — 정전 지속 상한을 적용한 최종 판정', () => {
  test('거래 정지가 시작되면 정전이다', () => {
    expect(resolveWeatherKind(conditions({ halted: true }), 'clear', 0)).toBe('blackout');
  });

  test('거래 정지가 계속돼도 3프레임을 넘기면 정전이 풀린다', () => {
    const halted = conditions({ halted: true, sigma30: 0.2, recentChangePct: 0 });
    expect(resolveWeatherKind(halted, 'blackout', BLACKOUT_MAX_FRAMES - 1)).toBe('blackout');
    expect(resolveWeatherKind(halted, 'blackout', BLACKOUT_MAX_FRAMES)).not.toBe('blackout');
  });

  test('정전이 풀린 뒤에는 정전을 뺀 나머지 판정이 그대로 적용된다', () => {
    const halted = conditions({ halted: true, sigma30: 0.2, recentChangePct: 0 });
    expect(resolveWeatherKind(halted, 'blackout', BLACKOUT_MAX_FRAMES)).toBe('range_fog');
  });

  test('정지 구간이 새로 시작되면(카운터 0) 정전이 번쩍인다', () => {
    const halted = conditions({ halted: true });
    expect(resolveWeatherKind(halted, 'panic_rain', 0)).toBe('blackout');
  });

  /**
   * 회귀 방지. 이 단언이 뒤집히면 정지가 이어지는 내내 3프레임마다 정전이 재점멸한다.
   *
   * 정전이 만료되어 안개로 넘어간 뒤에는 직전 종류가 `blackout`이 아니게 되는데,
   * 그때 "직전이 정전이 아니면 새 정전"이라고 판정하면 무한 재점멸이 된다.
   * 같은 정지 구간 안에서는 카운터가 계속 증가하므로 다시 켜지지 않아야 한다.
   */
  test('같은 정지 구간이 이어지는 동안에는 정전이 다시 켜지지 않는다', () => {
    const halted = conditions({ halted: true, sigma30: 0.2, recentChangePct: 0 });
    expect(resolveWeatherKind(halted, 'range_fog', BLACKOUT_MAX_FRAMES)).toBe('range_fog');
    expect(resolveWeatherKind(halted, 'range_fog', 999)).toBe('range_fog');
  });

  test('거래 정지가 아니면 정전 프레임 수와 무관하다', () => {
    const c = conditions({ recentChangePct: -5, sigma30: 1 });
    expect(resolveWeatherKind(c, 'clear', 0)).toBe('panic_rain');
  });
});

/**
 * 호출부(세션)가 프레임 카운터를 어떻게 굴려야 하는지 고정하는 계약 테스트.
 *
 * 이 루프를 그대로 복사해 배선하지 않으면 정전이 4프레임 이상 이어진다 —
 * 시트 03의 "3프레임 이내로 짧게"가 깨지는 지점이라 여기서 못 박아 둔다.
 */
describe('프레임 루프 계약 — 정전은 정확히 3프레임만 보인다', () => {
  function runFrames(frameCount: number, halted: boolean): readonly WeatherKind[] {
    const c = conditions({ halted, sigma30: 0.2, recentChangePct: 0 });
    const rendered: WeatherKind[] = [];
    let previousKind: WeatherKind = 'clear';
    // ★ 카운터는 "정전이 보이는 동안"이 아니라 "정지가 이어지는 동안" 센다.
    //   정전 프레임만 세면 3프레임 뒤 리셋되어 정지 내내 재점멸한다.
    let haltedFrames = 0;

    for (let frame = 0; frame < frameCount; frame += 1) {
      const kind = resolveWeatherKind(c, previousKind, haltedFrames);
      haltedFrames = c.halted ? haltedFrames + 1 : 0;
      previousKind = kind;
      rendered.push(kind);
    }
    return rendered;
  }

  test('거래 정지가 10프레임 이어져도 정전은 앞 3프레임뿐이다', () => {
    const frames = runFrames(10, true);
    expect(frames.filter((kind) => kind === 'blackout')).toHaveLength(BLACKOUT_MAX_FRAMES);
    expect(frames.slice(0, BLACKOUT_MAX_FRAMES).every((kind) => kind === 'blackout')).toBe(true);
    expect(frames.slice(BLACKOUT_MAX_FRAMES).every((kind) => kind === 'range_fog')).toBe(true);
  });

  test('거래 정지가 없으면 정전은 한 프레임도 없다', () => {
    expect(runFrames(10, false).some((kind) => kind === 'blackout')).toBe(false);
  });
});
