/**
 * 시장 지표 → 날씨 판정. **이 파일이 이 기능의 핵심 산출물이다.**
 *
 * 전부 순수 함수이고 **스칼라만 반환**한다 (객체를 만들지 않으므로 프레임당 할당 0).
 * Canvas·DOM·타이머를 일절 모르므로 헤드리스로 전부 검증된다.
 */

import {
  DIRECTIONAL_FULL_Z,
  DIRECTIONAL_MIN_Z,
  EVENT_INTENSITY_FLOOR,
  FOG_FULL_SIGMA_PCT,
  FOG_MAX_ABS_CHANGE_PCT,
  FOG_MAX_SIGMA_PCT,
  Z_SIGMA_FLOOR_PCT,
  RECENT_WINDOW_SIGMA_SCALE,
} from './constants.js';
import type { MarketConditions, WeatherKind } from './types.js';

/** 0~1로 자른다. */
function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * 등락률을 σ로 나눈 정규화 값.
 *
 * 왜 raw %가 아니라 z인가: 같은 −3%도 조용한 차트에서는 사건이고 요동치는 차트에서는
 * 평시다. z를 쓰면 어떤 차트에서든 "얼마나 이례적인가"가 같은 눈금으로 읽힌다.
 *
 * ★★ 분모를 측정 윈도에 맞춘다 — 여기가 실제 버그였다 ★★
 * 분자 `recentChangePct`는 **10봉(10분)** 변화인데 `sigma30`은 **30분** 수익률의
 * 표준편차다. 그대로 나누면 10분 움직임을 30분 눈금으로 재는 셈이라 |z|가 구조적으로
 * 작아진다(√t 스케일링으로 약 0.58배).
 *
 * 그 결과 **변동성이 큰 차트에서는 날씨가 한 번도 뜨지 않았다.** 실측(합성기):
 *
 * | 시드 | sigma30 | 고치기 전 \|z\|≥1 | 고친 뒤 |
 * |---|---|---|---|
 * | 1 | 2.834 | **0.0%** (최대 0.83) | 7.9% |
 * | 2 | 2.919 | **0.0%** (최대 0.68) | 3.8% |
 * | 3 | 2.483 | **0.0%** (최대 0.87) | 11.8% |
 * | 20260803 | 0.795 | 19.2% | 44.6% |
 *
 * 기본 시드가 1이라 자유 플레이에서는 390봉 내내 `clear`였다("날씨가 변하지 않는다"는
 * 플레이 피드백이 이것이다). 임계값을 낮추는 대신 **분모의 단위를 맞췄다** — 임계값
 * `DIRECTIONAL_MIN_Z = 1`("1σ 이상이면 이례적")의 의미를 지키려면 이쪽이 맞다.
 */
export function marketZ(recentChangePct: number, sigma30: number): number {
  const scaled = Math.max(sigma30, Z_SIGMA_FLOOR_PCT) * RECENT_WINDOW_SIGMA_SCALE;
  const z = recentChangePct / scaled;
  return Number.isFinite(z) ? z : 0;
}

/** `minZ`에서 0, `fullZ`에서 1로 선형 상승하는 연속 램프. */
function ramp(value: number, min: number, full: number): number {
  const span = full - min;
  if (span <= 0) return value >= full ? 1 : 0;
  return clamp01((value - min) / span);
}

/** 변동성이 죽었는가 (WX-03 조건). σ가 낮고 실제 움직임도 작아야 한다. */
function isVolatilityDead(conditions: MarketConditions): boolean {
  return (
    conditions.sigma30 <= FOG_MAX_SIGMA_PCT &&
    Math.abs(conditions.recentChangePct) <= FOG_MAX_ABS_CHANGE_PCT
  );
}

/** 시장 이벤트가 지시하는 날씨. 이벤트가 없으면 `null`. */
function kindForEvent(conditions: MarketConditions): WeatherKind | null {
  if (conditions.event === 'panic_sell') return 'panic_rain';
  if (conditions.event === 'fomo_rally') return 'fomo_updraft';
  return null;
}

/**
 * 시장 지표 → 날씨 종류.
 *
 * 우선순위(위가 강함):
 *   1. 거래 정지        → `blackout` (WX-04)
 *   2. 활성 시장 이벤트 → `panic_rain` / `fomo_updraft` (FR-7을 전장에 잇는 지점)
 *   3. 변동성 사망      → `range_fog` (WX-03)
 *   4. |z| ≥ 임계       → `panic_rain` / `fomo_updraft`
 *   5. 그 외            → `clear`
 *
 * ★ 3번이 4번보다 위인 이유: σ 하한 때문에 무변동 구간에서 z가 쉽게 커진다.
 *   안개를 먼저 걸러내지 않으면 횡보장에 폭우가 내린다.
 */
export function classifyWeatherKind(conditions: MarketConditions): WeatherKind {
  if (conditions.halted) return 'blackout';

  const eventKind = kindForEvent(conditions);
  if (eventKind !== null) return eventKind;

  if (isVolatilityDead(conditions)) return 'range_fog';

  const z = marketZ(conditions.recentChangePct, conditions.sigma30);
  if (z <= -DIRECTIONAL_MIN_Z) return 'panic_rain';
  if (z >= DIRECTIONAL_MIN_Z) return 'fomo_updraft';

  return 'clear';
}

/** 방향성 날씨(폭우·상승기류)의 강도. |z|에 대해 단조 증가한다. */
function directionalIntensity(conditions: MarketConditions, kind: WeatherKind): number {
  const z = marketZ(conditions.recentChangePct, conditions.sigma30);
  const fromMarket = ramp(Math.abs(z), DIRECTIONAL_MIN_Z, DIRECTIONAL_FULL_Z);
  const hasMatchingEvent = kindForEvent(conditions) === kind;
  return hasMatchingEvent ? Math.max(fromMarket, EVENT_INTENSITY_FLOOR) : fromMarket;
}

/** 안개 강도 — σ가 낮을수록(변동성이 죽을수록) 짙어진다. */
function fogIntensity(conditions: MarketConditions): number {
  return ramp(-conditions.sigma30, -FOG_MAX_SIGMA_PCT, -FOG_FULL_SIGMA_PCT);
}

/**
 * 날씨 강도(0~1 연속값).
 *
 * ★ 절대로 단계형으로 양자화하지 마라. 급락이 심할수록 폭우가 **연속적으로** 굵어져야
 *   플레이어가 화면만 보고 시장의 정도를 읽을 수 있다.
 */
export function weatherIntensity(conditions: MarketConditions, kind: WeatherKind): number {
  switch (kind) {
    case 'blackout':
      return 1;
    case 'panic_rain':
    case 'fomo_updraft':
      return directionalIntensity(conditions, kind);
    case 'range_fog':
      return fogIntensity(conditions);
    case 'clear':
      return 0;
  }
}
