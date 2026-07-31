/**
 * 오버레이 배치 규칙 — "중앙은 비운다" (아트-프로덕션시트 §03).
 *
 * 날씨는 시장 상태 표시이지 방해물이 아니다. 유닛·타워가 붙는 화면 중앙에 파티클이
 * 겹치면 전투 판독이 무너지므로, 모든 상시 오버레이는 이 공백을 침범하지 않는다.
 *
 * 전부 스칼라를 반환한다 — 사각형 객체를 만들면 프레임당 할당이 생긴다.
 */

import type { WeatherViewport } from './types.js';

/** 중앙 공백의 가로 비율 (화면 폭 대비). 시트 §09 `U-04`의 "중앙 1/3 비움"과 같은 결. */
export const CENTER_CLEAR_WIDTH_RATIO = 0.34;

/** 중앙 공백의 세로 비율 (화면 높이 대비). */
export const CENTER_CLEAR_HEIGHT_RATIO = 0.52;

export function centerClearLeft(viewport: WeatherViewport): number {
  return (viewport.width * (1 - CENTER_CLEAR_WIDTH_RATIO)) / 2;
}

export function centerClearRight(viewport: WeatherViewport): number {
  return (viewport.width * (1 + CENTER_CLEAR_WIDTH_RATIO)) / 2;
}

export function centerClearTop(viewport: WeatherViewport): number {
  return (viewport.height * (1 - CENTER_CLEAR_HEIGHT_RATIO)) / 2;
}

export function centerClearBottom(viewport: WeatherViewport): number {
  return (viewport.height * (1 + CENTER_CLEAR_HEIGHT_RATIO)) / 2;
}

/** 점이 중앙 공백 **안쪽**인가 (경계선은 밖으로 본다). */
export function isInsideCenterClear(x: number, y: number, viewport: WeatherViewport): boolean {
  return (
    x > centerClearLeft(viewport) &&
    x < centerClearRight(viewport) &&
    y > centerClearTop(viewport) &&
    y < centerClearBottom(viewport)
  );
}

/**
 * 선분(또는 그 AABB)이 중앙 공백과 겹치는가.
 *
 * 점 단위가 아니라 **AABB로 걸러내는 게 핵심**이다. 끝점만 검사하면 공백을 가로지르는
 * 긴 광선이 통과해 버린다. 겹치면 그 광선 자체를 그리지 않는다.
 */
export function overlapsCenterClear(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  viewport: WeatherViewport,
): boolean {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);

  return (
    maxX > centerClearLeft(viewport) &&
    minX < centerClearRight(viewport) &&
    maxY > centerClearTop(viewport) &&
    minY < centerClearBottom(viewport)
  );
}
