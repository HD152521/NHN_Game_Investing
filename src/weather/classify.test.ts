import { describe, expect, test } from 'vitest';

import {
  DIRECTIONAL_FULL_Z,
  DIRECTIONAL_MIN_Z,
  EVENT_INTENSITY_FLOOR,
  FOG_FULL_SIGMA_PCT,
  FOG_MAX_ABS_CHANGE_PCT,
  FOG_MAX_SIGMA_PCT,
  RECENT_WINDOW_SIGMA_SCALE,
} from './constants.js';
import { classifyWeatherKind, marketZ, weatherIntensity } from './classify.js';
import type { MarketConditions } from './types.js';

function conditions(overrides: Partial<MarketConditions> = {}): MarketConditions {
  return {
    recentChangePct: 0,
    sigma30: 1,
    halted: false,
    event: null,
    ...overrides,
  };
}

/** 종류 판정 + 강도를 한 번에 뽑는 테스트 헬퍼. */
function read(c: MarketConditions): { kind: string; intensity: number } {
  const kind = classifyWeatherKind(c);
  return { kind, intensity: weatherIntensity(c, kind) };
}

describe('marketZ — σ 대비 정규화', () => {
  test('★ 분모는 sigma30이 아니라 측정 윈도로 환산한 σ다', () => {
    // 분자는 10분 변화, sigma30은 30분 σ다. √t 스케일링으로 맞춘 뒤 나눈다 —
    // 이 계수를 빼면 |z|가 항상 작아져 변동성 큰 차트에서 날씨가 아예 안 뜬다.
    expect(marketZ(-3, 1.5)).toBeCloseTo(-3 / (1.5 * RECENT_WINDOW_SIGMA_SCALE), 10);
  });

  test('환산 계수는 √(10/30) — 윈도가 짧을수록 같은 %가 더 이례적이다', () => {
    expect(RECENT_WINDOW_SIGMA_SCALE).toBeCloseTo(Math.sqrt(1 / 3), 10);
    // 같은 -3%가 30분 눈금(-2σ)보다 10분 눈금에서 더 크게 읽힌다.
    expect(Math.abs(marketZ(-3, 1.5))).toBeGreaterThan(2);
  });

  test('σ가 0이어도 폭주하지 않는다 (하한 적용)', () => {
    expect(Number.isFinite(marketZ(-1, 0))).toBe(true);
  });
});

describe('classifyWeatherKind — 시장 지표 → 날씨 종류', () => {
  test('거래 정지는 무엇보다 우선해 WX-04 정전이다', () => {
    expect(classifyWeatherKind(conditions({ halted: true, recentChangePct: -50 }))).toBe('blackout');
  });

  test('패닉셀 이벤트가 활성이면 WX-01 폭우다', () => {
    expect(classifyWeatherKind(conditions({ event: 'panic_sell' }))).toBe('panic_rain');
  });

  test('FOMO 랠리 이벤트가 활성이면 WX-02 상승기류다', () => {
    expect(classifyWeatherKind(conditions({ event: 'fomo_rally' }))).toBe('fomo_updraft');
  });

  test('변동성이 죽고 방향성도 없으면 WX-03 안개다', () => {
    const c = conditions({ sigma30: FOG_MAX_SIGMA_PCT - 0.1, recentChangePct: 0 });
    expect(classifyWeatherKind(c)).toBe('range_fog');
  });

  test('σ가 안개 임계를 넘으면 안개가 아니다 (경계값)', () => {
    const inside = conditions({ sigma30: FOG_MAX_SIGMA_PCT, recentChangePct: 0 });
    const outside = conditions({ sigma30: FOG_MAX_SIGMA_PCT + 0.001, recentChangePct: 0 });
    expect(classifyWeatherKind(inside)).toBe('range_fog');
    expect(classifyWeatherKind(outside)).not.toBe('range_fog');
  });

  test('σ가 죽었어도 실제로 크게 움직였으면 안개가 아니다', () => {
    const c = conditions({
      sigma30: FOG_FULL_SIGMA_PCT,
      recentChangePct: -(FOG_MAX_ABS_CHANGE_PCT + 1),
    });
    expect(classifyWeatherKind(c)).toBe('panic_rain');
  });

  /**
   * ⚠️ 분모는 `sigma30`이 아니라 **측정 윈도로 환산한 σ**다.
   * `RECENT_WINDOW_SIGMA_SCALE`(√(10/30))을 빼먹으면 10분 움직임을 30분 눈금으로 재게 되어
   * 변동성이 큰 차트에서 날씨가 아예 안 뜬다(`marketZ` 주석의 실측표). 아래 헬퍼가 그
   * 관계를 한 곳에 고정한다 — 테스트가 스케일을 손으로 적으면 같은 버그를 놓친다.
   */
  const changeForZ = (z: number, sigma30 = 1): number =>
    z * sigma30 * RECENT_WINDOW_SIGMA_SCALE;

  test('|z|가 임계 미만이면 아무 날씨도 아니다', () => {
    const c = conditions({ sigma30: 1, recentChangePct: changeForZ(-(DIRECTIONAL_MIN_Z - 0.01)) });
    expect(classifyWeatherKind(c)).toBe('clear');
  });

  test('z 임계 경계 바로 위에서 폭우/상승기류가 시작된다', () => {
    expect(
      classifyWeatherKind(conditions({ sigma30: 1, recentChangePct: changeForZ(-DIRECTIONAL_MIN_Z) })),
    ).toBe('panic_rain');
    expect(
      classifyWeatherKind(conditions({ sigma30: 1, recentChangePct: changeForZ(DIRECTIONAL_MIN_Z) })),
    ).toBe('fomo_updraft');
  });

  /**
   * ★ 회귀 방어선 — "변동성이 큰 차트에서 날씨가 한 번도 안 뜨던" 버그 ★
   * 고치기 전에는 sigma30 ≈ 2.8인 차트에서 |z| 최대가 0.83이라 방향성 날씨가 0회였다.
   */
  test('변동성이 큰 차트(σ≈2.8)에서도 1σ 움직임이면 날씨가 뜬다', () => {
    const sigma = 2.834; // 기본 시드 1의 실측값
    const c = conditions({ sigma30: sigma, recentChangePct: changeForZ(-DIRECTIONAL_MIN_Z, sigma) });
    expect(classifyWeatherKind(c)).toBe('panic_rain');
  });
});

describe('weatherIntensity — 연속 강도', () => {
  test('강도는 항상 0~1이다', () => {
    for (let pct = -20; pct <= 20; pct += 0.5) {
      const c = conditions({ recentChangePct: pct, sigma30: 1 });
      const intensity = weatherIntensity(c, classifyWeatherKind(c));
      expect(intensity).toBeGreaterThanOrEqual(0);
      expect(intensity).toBeLessThanOrEqual(1);
    }
  });

  test('급락이 심할수록 폭우 강도가 단조 증가한다', () => {
    let previous = -1;
    for (let drop = 0; drop <= 12; drop += 0.25) {
      const { intensity } = read(conditions({ recentChangePct: -drop, sigma30: 1 }));
      expect(intensity).toBeGreaterThanOrEqual(previous);
      previous = intensity;
    }
  });

  test('강도는 단계형이 아니라 연속값이다 (같은 구간에서 서로 다른 값이 나온다)', () => {
    const a = read(conditions({ recentChangePct: -2, sigma30: 1 })).intensity;
    const b = read(conditions({ recentChangePct: -2.3, sigma30: 1 })).intensity;
    const c = read(conditions({ recentChangePct: -2.6, sigma30: 1 })).intensity;
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
    expect(new Set([a, b, c]).size).toBe(3);
  });

  test('z가 최대 임계에 도달하면 강도가 1로 포화한다', () => {
    const c = conditions({ recentChangePct: -DIRECTIONAL_FULL_Z, sigma30: 1 });
    expect(weatherIntensity(c, 'panic_rain')).toBeCloseTo(1, 10);
    const harder = conditions({ recentChangePct: -DIRECTIONAL_FULL_Z * 3, sigma30: 1 });
    expect(weatherIntensity(harder, 'panic_rain')).toBeCloseTo(1, 10);
  });

  test('상승도 대칭으로 단조 증가한다', () => {
    let previous = -1;
    for (let rise = 0; rise <= 12; rise += 0.25) {
      const { intensity } = read(conditions({ recentChangePct: rise, sigma30: 1 }));
      expect(intensity).toBeGreaterThanOrEqual(previous);
      previous = intensity;
    }
  });

  test('시장 이벤트가 활성이면 최소 강도가 보장된다', () => {
    const c = conditions({ event: 'panic_sell', recentChangePct: 0, sigma30: 1 });
    expect(weatherIntensity(c, 'panic_rain')).toBeGreaterThanOrEqual(EVENT_INTENSITY_FLOOR);
  });

  test('이벤트 중이라도 실제 급락이 더 심하면 그 강도를 쓴다', () => {
    const c = conditions({ event: 'panic_sell', recentChangePct: -DIRECTIONAL_FULL_Z, sigma30: 1 });
    expect(weatherIntensity(c, 'panic_rain')).toBeCloseTo(1, 10);
  });

  test('안개는 σ가 낮을수록 강도가 커진다', () => {
    const light = weatherIntensity(conditions({ sigma30: FOG_MAX_SIGMA_PCT * 0.9 }), 'range_fog');
    const heavy = weatherIntensity(conditions({ sigma30: FOG_FULL_SIGMA_PCT }), 'range_fog');
    expect(heavy).toBeGreaterThan(light);
    expect(heavy).toBeCloseTo(1, 10);
  });

  test('정전 강도는 1이고, 맑음 강도는 0이다', () => {
    expect(weatherIntensity(conditions({ halted: true }), 'blackout')).toBe(1);
    expect(weatherIntensity(conditions(), 'clear')).toBe(0);
  });
});
