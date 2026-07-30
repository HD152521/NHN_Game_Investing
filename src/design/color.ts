/**
 * 색 계산 유틸 — WCAG 2.x 상대 휘도·대비비, 그레이스케일 변환.
 * 의존성 없이 직접 구현합니다 (프로젝트 정책: 신규 의존성 금지).
 *
 * 참고: https://www.w3.org/TR/WCAG22/#dfn-relative-luminance
 */

import type { HexColor } from './palette';

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;
const HEX_RADIX = 16;
const CHANNEL_MAX = 255;
const CHANNEL_MIN = 0;
const HEX_PAIR_LENGTH = 2;

/** sRGB → 선형 RGB 변환 상수 (WCAG 정의) */
const SRGB_LINEAR_THRESHOLD = 0.03928;
const SRGB_LINEAR_DIVISOR = 12.92;
const SRGB_GAMMA_OFFSET = 0.055;
const SRGB_GAMMA_SCALE = 1.055;
const SRGB_GAMMA_EXPONENT = 2.4;
/** 선형 → sRGB 역변환 임계값 */
const LINEAR_SRGB_THRESHOLD = 0.0031308;

/** 상대 휘도 채널 가중치 (WCAG) */
const LUMA_WEIGHT_R = 0.2126;
const LUMA_WEIGHT_G = 0.7152;
const LUMA_WEIGHT_B = 0.0722;

/** 대비비 공식의 보정항 */
const CONTRAST_OFFSET = 0.05;

function assertChannelInRange(value: number, channel: string): void {
  if (!Number.isInteger(value) || value < CHANNEL_MIN || value > CHANNEL_MAX) {
    throw new RangeError(
      `Channel "${channel}" out of range: expected integer ${CHANNEL_MIN}-${CHANNEL_MAX}, got ${value}`,
    );
  }
}

export function parseHex(hex: string): Rgb {
  if (!HEX_PATTERN.test(hex)) {
    throw new TypeError(`Invalid hex color: "${hex}". Expected 6-digit "#RRGGBB" form.`);
  }
  const digits = hex.slice(1);
  return {
    r: Number.parseInt(digits.slice(0, HEX_PAIR_LENGTH), HEX_RADIX),
    g: Number.parseInt(digits.slice(HEX_PAIR_LENGTH, HEX_PAIR_LENGTH * 2), HEX_RADIX),
    b: Number.parseInt(digits.slice(HEX_PAIR_LENGTH * 2), HEX_RADIX),
  };
}

export function toHex({ r, g, b }: Rgb): HexColor {
  assertChannelInRange(r, 'r');
  assertChannelInRange(g, 'g');
  assertChannelInRange(b, 'b');
  const encode = (channel: number): string =>
    channel.toString(HEX_RADIX).toUpperCase().padStart(HEX_PAIR_LENGTH, '0');
  return `#${encode(r)}${encode(g)}${encode(b)}`;
}

/** sRGB 채널(0-255) → 선형 채널(0-1) */
function toLinearChannel(channel: number): number {
  const normalized = channel / CHANNEL_MAX;
  return normalized <= SRGB_LINEAR_THRESHOLD
    ? normalized / SRGB_LINEAR_DIVISOR
    : ((normalized + SRGB_GAMMA_OFFSET) / SRGB_GAMMA_SCALE) ** SRGB_GAMMA_EXPONENT;
}

/** 선형 채널(0-1) → sRGB 채널(0-255) */
function toSrgbChannel(linear: number): number {
  const encoded =
    linear <= LINEAR_SRGB_THRESHOLD
      ? linear * SRGB_LINEAR_DIVISOR
      : SRGB_GAMMA_SCALE * linear ** (1 / SRGB_GAMMA_EXPONENT) - SRGB_GAMMA_OFFSET;
  return Math.round(encoded * CHANNEL_MAX);
}

/** WCAG 상대 휘도 (0 = 검정, 1 = 흰색) */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  return (
    LUMA_WEIGHT_R * toLinearChannel(r) +
    LUMA_WEIGHT_G * toLinearChannel(g) +
    LUMA_WEIGHT_B * toLinearChannel(b)
  );
}

/** WCAG 대비비 (1:1 ~ 21:1). 인자 순서 무관. */
export function contrastRatio(a: string, b: string): number {
  const luminanceA = relativeLuminance(a);
  const luminanceB = relativeLuminance(b);
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + CONTRAST_OFFSET) / (darker + CONTRAST_OFFSET);
}

/**
 * 휘도를 보존하는 그레이스케일 변환.
 * "색을 완전히 제거해도 플레이 가능한가"(PLAN STEP 9 수용 기준) 검증용입니다.
 */
export function toGrayscale(hex: string): HexColor {
  const gray = toSrgbChannel(relativeLuminance(hex));
  return toHex({ r: gray, g: gray, b: gray });
}
