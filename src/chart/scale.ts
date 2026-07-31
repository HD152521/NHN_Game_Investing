/**
 * 캔들 차트 좌표 변환 — 순수 함수 모음.
 *
 * 상태를 갖지 않고 입력만으로 결과가 결정되므로, 캔버스 없이도(헤드리스) 경계값을
 * 정확히 검증할 수 있다. 렌더러(`chart.ts`)는 이 함수들의 결과만 그린다.
 */

import type { Bar } from '../market/types.js';

/** 가격 범위(최저~최고). */
export interface PriceRange {
  readonly min: number;
  readonly max: number;
}

/** 세로 방향 픽셀 구간. */
export interface VerticalBand {
  readonly top: number;
  readonly bottom: number;
}

/** 가로 방향 픽셀 구간. */
export interface HorizontalBand {
  readonly left: number;
  readonly right: number;
}

/** 가격 범위 상하 여백 비율 기본값 — 캔들이 캔버스 가장자리에 붙지 않도록 10% 남긴다. */
export const DEFAULT_PRICE_PADDING_RATIO = 0.1;

/** 변동폭이 0(모든 가격이 동일)일 때 대체로 쓰는 스프레드 비율(가격 대비). */
const FLAT_SPREAD_RATIO = 0.01;
/** 가격 자체가 0인 극단적 케이스까지 커버하는 절대 최소 스프레드. */
const MIN_SPREAD_ABSOLUTE = 1e-6;

/**
 * 봉 목록에서 가격 범위(고가 최댓값 · 저가 최솟값)를 계산한다.
 *
 * 빈 배열이면 임의의 비퇴화(non-degenerate) 범위 `{min:0,max:1}`을 반환해, 호출부가
 * "혹시 몰라서" 매번 길이 체크를 하지 않아도 나눗셈이 안전하게 유지되도록 한다.
 */
export function computePriceRange(bars: readonly Bar[]): PriceRange {
  if (bars.length === 0) {
    return { min: 0, max: 1 };
  }

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const bar of bars) {
    if (bar.l < min) min = bar.l;
    if (bar.h > max) max = bar.h;
  }
  return { min, max };
}

/**
 * 변동 0(min === max) 케이스에서도 0으로 나누지 않도록 유효 스프레드를 계산한다.
 * 가격이 0인 경우까지 대비해 절대 최소값으로 한 번 더 바닥을 깐다.
 */
function effectiveSpread(range: PriceRange): number {
  const raw = range.max - range.min;
  if (raw > 0) return raw;

  const relative = Math.abs(range.min) * FLAT_SPREAD_RATIO;
  return relative > 0 ? relative : MIN_SPREAD_ABSOLUTE;
}

/**
 * 가격 → y 픽셀.
 *
 * 캔버스 좌표계는 아래로 갈수록 값이 커지므로, 고가가 위(작은 y) · 저가가 아래(큰 y)에
 * 오도록 뒤집는다. `paddingRatio`만큼 위아래 여백을 남긴 뒤 그 안에 선형 매핑한다.
 * `range.min === range.max`인 평탄 구간에서는 값을 세로 중앙에 배치한다.
 */
export function priceToY(
  price: number,
  range: PriceRange,
  band: VerticalBand,
  paddingRatio: number = DEFAULT_PRICE_PADDING_RATIO,
): number {
  const spread = effectiveSpread(range);
  const isFlat = range.max - range.min <= 0;
  // 평탄 구간에서는 실제 가격 대신 중앙값 기준 가상 스프레드로 매핑해 항상 중앙에 온다.
  const baseMin = isFlat ? range.min - spread / 2 : range.min;

  const bandHeight = band.bottom - band.top;
  const padding = bandHeight * paddingRatio;
  const plotTop = band.top + padding;
  const plotBottom = band.bottom - padding;

  const t = (price - baseMin) / spread;
  return plotBottom - t * (plotBottom - plotTop);
}

/** 전체 봉 개수 대비 봉 하나가 차지하는 x축 슬롯 폭(px). `totalBars <= 0`이면 0. */
export function barSlotWidth(totalBars: number, band: HorizontalBand): number {
  if (totalBars <= 0) return 0;
  return (band.right - band.left) / totalBars;
}

/** 봉 인덱스 → 슬롯 왼쪽 끝 x 픽셀. */
export function indexToX(index: number, totalBars: number, band: HorizontalBand): number {
  return band.left + index * barSlotWidth(totalBars, band);
}

/** 봉 인덱스 → 슬롯 중앙 x 픽셀(캔들 몸통을 중앙 정렬해 그릴 때 사용). */
export function indexToCenterX(index: number, totalBars: number, band: HorizontalBand): number {
  return indexToX(index, totalBars, band) + barSlotWidth(totalBars, band) / 2;
}
