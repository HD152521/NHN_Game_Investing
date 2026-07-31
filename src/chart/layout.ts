/**
 * 캔버스 픽셀 영역을 캔들 · 거래량 · 진행바 구간으로 나누는 순수 함수.
 *
 * 좌표 계산만 담당하고 그리기는 하지 않는다 — `scale.ts`와 마찬가지로 헤드리스로
 * 검증하기 쉬운 곳에 로직을 몰아둔다.
 */

import type { HorizontalBand, VerticalBand } from './scale.js';

/** 좌우 여백(px). 캔들이 캔버스 가로 끝에 붙지 않도록. */
const PADDING_X = 12;
/** 캔들 영역 상단 여백(px). */
const PADDING_TOP = 10;
/** 하단 진행 바 높이(px). */
const PROGRESS_BAND_HEIGHT = 16;
/** 거래량 영역이 전체 높이에서 차지하는 비율. */
const VOLUME_HEIGHT_RATIO = 0.16;
/** 구간 사이 여백(px). */
const SECTION_GAP = 6;

export interface ChartLayout {
  /** 캔들·거래량 공통 가로 구간. */
  readonly horizontal: HorizontalBand;
  /** 캔들스틱을 그리는 세로 구간. */
  readonly candles: VerticalBand;
  /** 거래량 바를 그리는 세로 구간. */
  readonly volume: VerticalBand;
  /** 진행 바 중심선의 y 픽셀. */
  readonly progressY: number;
}

/**
 * 주어진 캔버스 크기를 레이아웃으로 변환한다.
 *
 * 아주 작은 높이가 들어와도(예: 테스트 픽스처) 각 구간이 음수 높이가 되지 않도록
 * `Math.max`로 바닥을 깐다 — 그려질 내용이 찌그러질 수는 있어도 좌표 계산이 깨지진 않는다.
 */
export function computeLayout(width: number, height: number): ChartLayout {
  const left = PADDING_X;
  const right = Math.max(left, width - PADDING_X);

  const progressY = Math.max(0, height - PROGRESS_BAND_HEIGHT / 2);
  const volumeBottom = Math.max(0, height - PROGRESS_BAND_HEIGHT - SECTION_GAP);
  const volumeHeight = Math.max(0, height * VOLUME_HEIGHT_RATIO);
  const volumeTop = Math.max(PADDING_TOP, volumeBottom - volumeHeight);
  const candleTop = PADDING_TOP;
  const candleBottom = Math.max(candleTop, volumeTop - SECTION_GAP);

  return {
    horizontal: { left, right },
    candles: { top: candleTop, bottom: candleBottom },
    volume: { top: volumeTop, bottom: Math.max(volumeTop, volumeBottom) },
    progressY,
  };
}
