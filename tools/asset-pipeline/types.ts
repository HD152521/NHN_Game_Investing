/**
 * 에셋 후처리 파이프라인 공용 타입.
 * 이미지는 항상 8bit RGBA 논프리멀티플라이드(straight alpha)로 다룹니다.
 */

export interface Rgba {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  /** 길이 = width * height * PIXEL_STRIDE, 순서 = R,G,B,A */
  readonly data: Uint8ClampedArray;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** 알파 히스토그램에서 검출한 1차원 구간 (end는 포함). */
export interface Segment {
  readonly start: number;
  readonly end: number;
}
