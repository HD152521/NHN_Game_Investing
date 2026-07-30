import {
  DEFAULT_FRINGE_MIN_SPILL,
  DEFAULT_FRINGE_RADIUS,
  DEFAULT_KEY_TOLERANCE,
  PIXEL_STRIDE,
} from './constants.js';
import { magentaDistance, spillRatio, subjectSpillBias, unmixFromMagenta } from './color.js';
import type { Rgb } from './color.js';
import { AssetPipelineError } from './errors.js';
import { ImageBuilder, getPixel } from './image.js';
import type { RgbaImage } from './types.js';

const CLASS_CORE = 0;
const CLASS_BACKGROUND = 1;
const CLASS_FRINGE = 2;

const NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];

export interface KeyOptions {
  /** #FF00FF 로부터 이 채널 편차 이내면 배경으로 봅니다. */
  readonly tolerance?: number;
  /** 배경으로부터 몇 픽셀까지를 프린지로 볼지. */
  readonly fringeRadius?: number;
  /** 이 값 이하의 초과 마젠타 성분은 피사체 고유색으로 보고 건드리지 않습니다. */
  readonly minSpill?: number;
  /** 키잉된 픽셀이 하나도 없으면 예외를 던집니다. */
  readonly requireMagenta?: boolean;
}

export interface KeyResult {
  readonly image: RgbaImage;
  /** 완전히 투명해진 픽셀 수. */
  readonly keyedPixels: number;
  /** 부분 알파 + 디스필 처리된 경계 픽셀 수. */
  readonly fringePixels: number;
}

function classAt(classes: Uint8Array, index: number): number {
  const value = classes[index];
  if (value === undefined) {
    throw new AssetPipelineError('픽셀 분류 배열 인덱스가 범위를 벗어났습니다.', `index=${index}`);
  }
  return value;
}

/** 배경 픽셀에서 radius 만큼 팽창시켜 프린지 후보를 표시합니다. */
function markFringe(width: number, height: number, classes: Uint8Array, radius: number): void {
  let frontier: number[] = [];
  for (let i = 0; i < classes.length; i += 1) {
    if (classAt(classes, i) === CLASS_BACKGROUND) frontier.push(i);
  }

  for (let step = 0; step < radius && frontier.length > 0; step += 1) {
    const next: number[] = [];
    for (const index of frontier) {
      const x = index % width;
      const y = (index - x) / width;
      for (const [dx, dy] of NEIGHBOR_OFFSETS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const neighbor = ny * width + nx;
        if (classAt(classes, neighbor) !== CLASS_CORE) continue;
        classes[neighbor] = CLASS_FRINGE;
        next.push(neighbor);
      }
    }
    frontier = next;
  }
}

function classifyPixels(image: RgbaImage, tolerance: number, fringeRadius: number): Uint8Array {
  const classes = new Uint8Array(image.width * image.height);
  for (let i = 0; i < classes.length; i += 1) {
    const offset = i * PIXEL_STRIDE;
    const color: Rgb = {
      r: image.data[offset] ?? 0,
      g: image.data[offset + 1] ?? 0,
      b: image.data[offset + 2] ?? 0,
    };
    if (magentaDistance(color) <= tolerance) classes[i] = CLASS_BACKGROUND;
  }
  markFringe(image.width, image.height, classes, fringeRadius);
  return classes;
}

/** 프린지 픽셀 주변의 온전한 피사체 색 평균. 없으면 null. */
function coreReference(
  image: RgbaImage,
  classes: Uint8Array,
  x: number,
  y: number,
  radius: number,
): Rgb | null {
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let count = 0;

  for (let dy = -radius; dy <= radius; dy += 1) {
    const ny = y + dy;
    if (ny < 0 || ny >= image.height) continue;
    for (let dx = -radius; dx <= radius; dx += 1) {
      const nx = x + dx;
      if (nx < 0 || nx >= image.width) continue;
      if (classAt(classes, ny * image.width + nx) !== CLASS_CORE) continue;
      const p = getPixel(image, nx, ny);
      sumR += p.r;
      sumG += p.g;
      sumB += p.b;
      count += 1;
    }
  }

  if (count === 0) return null;
  return { r: sumR / count, g: sumG / count, b: sumB / count };
}

/** 프린지 픽셀의 피사체 커버리지(0~1)를 추정합니다. */
function estimateCoverage(pixel: Rgb, bias: number, minSpill: number): number {
  const spill = spillRatio(pixel);
  if (spill <= bias + minSpill) return 1;
  const headroom = 1 - bias;
  if (headroom <= 0) return 1;
  const coverage = (1 - spill) / headroom;
  if (coverage < 0) return 0;
  if (coverage > 1) return 1;
  return coverage;
}

/**
 * 마젠타 배경을 알파로 바꾸고 경계 프린지를 제거합니다.
 * 원본 이미지는 변경하지 않고 새 이미지를 돌려줍니다.
 */
export function keyMagenta(image: RgbaImage, options: KeyOptions = {}): KeyResult {
  const tolerance = options.tolerance ?? DEFAULT_KEY_TOLERANCE;
  const fringeRadius = options.fringeRadius ?? DEFAULT_FRINGE_RADIUS;
  const minSpill = options.minSpill ?? DEFAULT_FRINGE_MIN_SPILL;

  const classes = classifyPixels(image, tolerance, fringeRadius);
  const builder = ImageBuilder.from(image);
  let keyedPixels = 0;
  let fringePixels = 0;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const kind = classAt(classes, y * image.width + x);
      if (kind === CLASS_BACKGROUND) {
        builder.setPixel(x, y, { r: 0, g: 0, b: 0, a: 0 });
        keyedPixels += 1;
        continue;
      }
      if (kind !== CLASS_FRINGE) continue;

      const pixel = getPixel(image, x, y);
      const reference = coreReference(image, classes, x, y, fringeRadius + 1);
      const bias = reference === null ? 0 : subjectSpillBias(reference);
      const coverage = estimateCoverage(pixel, bias, minSpill);
      if (coverage >= 1) continue;

      const recovered = unmixFromMagenta(pixel, coverage);
      const alpha = Math.round(coverage * 255);
      builder.setPixel(x, y, { ...recovered, a: alpha });
      if (alpha === 0) keyedPixels += 1;
      else fringePixels += 1;
    }
  }

  if (options.requireMagenta === true && keyedPixels === 0) {
    throw new AssetPipelineError(
      '마젠타 배경을 찾지 못했습니다.',
      `허용 오차 ${tolerance} 안에 #FF00FF 픽셀이 0개입니다. 아트가이드 R2대로 마젠타 배경으로 다시 뽑으세요.`,
    );
  }

  return { image: builder.toImage(), keyedPixels, fringePixels };
}
