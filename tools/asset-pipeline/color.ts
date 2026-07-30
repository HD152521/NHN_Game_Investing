import { MAGENTA } from './constants.js';

/** 알파를 뺀 RGB 삼원색. 색 계산 함수들의 입력. */
export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

const CHANNEL_MAX = 255;

function clampChannel(value: number): number {
  if (value < 0) return 0;
  if (value > CHANNEL_MAX) return CHANNEL_MAX;
  return Math.round(value);
}

/** #FF00FF 로부터의 채널별 최대 편차(Chebyshev). 흰색은 G 채널 때문에 255가 나옵니다. */
export function magentaDistance(color: Rgb): number {
  return Math.max(
    Math.abs(color.r - MAGENTA.r),
    Math.abs(color.g - MAGENTA.g),
    Math.abs(color.b - MAGENTA.b),
  );
}

/**
 * 마젠타 성분 비율(0~1).
 * 마젠타는 R·B 가 높고 G 가 0인 색이므로 min(R,B) - G 가 그대로 혼합 비율이 됩니다.
 */
export function spillRatio(color: Rgb): number {
  const raw = (Math.min(color.r, color.b) - color.g) / CHANNEL_MAX;
  if (raw < 0) return 0;
  if (raw > 1) return 1;
  return raw;
}

/**
 * 피사체 고유색이 이미 갖고 있는 마젠타 성분.
 * 보라 계열(#9B6BFF 등)은 이 값이 커서, 보정하지 않으면 경계 알파가 과하게 깎입니다.
 */
export function subjectSpillBias(color: Rgb): number {
  return spillRatio(color);
}

/**
 * 마젠타와 섞인 색에서 피사체 원색을 복원합니다(언프리멀티플라이).
 * composite = coverage * subject + (1 - coverage) * MAGENTA 의 역연산.
 */
export function unmixFromMagenta(mixed: Rgb, coverage: number): Rgb {
  if (coverage <= 0) return { r: 0, g: 0, b: 0 };
  if (coverage >= 1) return { r: mixed.r, g: mixed.g, b: mixed.b };

  const rest = 1 - coverage;
  return {
    r: clampChannel((mixed.r - MAGENTA.r * rest) / coverage),
    g: clampChannel((mixed.g - MAGENTA.g * rest) / coverage),
    b: clampChannel((mixed.b - MAGENTA.b * rest) / coverage),
  };
}
