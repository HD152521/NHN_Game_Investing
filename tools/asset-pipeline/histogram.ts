import { OPAQUE_ALPHA_THRESHOLD, PIXEL_STRIDE } from './constants.js';
import { AssetPipelineError } from './errors.js';
import type { Segment } from './types.js';
import type { RgbaImage } from './types.js';

export interface SegmentOptions {
  /** 이만큼 연속으로 빈 칸이 나와야 피사체가 끊긴 것으로 봅니다. */
  readonly minGap: number;
  /** 이보다 짧은 구간은 노이즈로 버립니다. */
  readonly minSize: number;
}

function alphaAt(image: RgbaImage, x: number, y: number): number {
  return image.data[(y * image.width + x) * PIXEL_STRIDE + 3] ?? 0;
}

/** 열별 불투명 픽셀 수. 라인업 시트의 세로 경계를 찾는 데 씁니다. */
export function columnAlphaHistogram(
  image: RgbaImage,
  threshold: number = OPAQUE_ALPHA_THRESHOLD,
): number[] {
  const histogram = new Array<number>(image.width).fill(0);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (alphaAt(image, x, y) >= threshold) histogram[x] = (histogram[x] ?? 0) + 1;
    }
  }
  return histogram;
}

/** 행별 불투명 픽셀 수. 그리드 시트의 가로 경계를 찾는 데 씁니다. */
export function rowAlphaHistogram(
  image: RgbaImage,
  threshold: number = OPAQUE_ALPHA_THRESHOLD,
): number[] {
  const histogram = new Array<number>(image.height).fill(0);
  for (let y = 0; y < image.height; y += 1) {
    let count = 0;
    for (let x = 0; x < image.width; x += 1) {
      if (alphaAt(image, x, y) >= threshold) count += 1;
    }
    histogram[y] = count;
  }
  return histogram;
}

/** 히스토그램에서 minGap 이상 비어 있는 곳을 경계로 삼아 구간을 나눕니다. */
export function findSegments(histogram: readonly number[], options: SegmentOptions): Segment[] {
  if (!Number.isInteger(options.minGap) || options.minGap < 1) {
    throw new AssetPipelineError('minGap 은 1 이상의 정수여야 합니다.', `받은 값=${options.minGap}`);
  }

  const segments: Segment[] = [];
  let start = -1;
  let lastFilled = -1;

  for (let i = 0; i < histogram.length; i += 1) {
    const isFilled = (histogram[i] ?? 0) > 0;
    if (isFilled) {
      if (start < 0) start = i;
      else if (i - lastFilled - 1 >= options.minGap) {
        segments.push({ start, end: lastFilled });
        start = i;
      }
      lastFilled = i;
    }
  }
  if (start >= 0) segments.push({ start, end: lastFilled });

  return segments.filter((s) => s.end - s.start + 1 >= options.minSize);
}

/**
 * 구간이 기대보다 많을 때 가장 좁은 틈부터 붙여서 개수를 맞춥니다.
 * (무기·소품이 몸에서 떨어져 나온 피사체를 다시 하나로 묶는 용도)
 */
export function mergeToCount(segments: readonly Segment[], target: number): Segment[] {
  if (!Number.isInteger(target) || target < 1) {
    throw new AssetPipelineError('목표 구간 수는 1 이상의 정수여야 합니다.', `받은 값=${target}`);
  }
  if (segments.length < target) {
    throw new AssetPipelineError(
      '구간이 기대보다 적습니다. 없는 피사체를 만들어낼 수는 없습니다.',
      `검출 ${segments.length}개, 기대 ${target}개 — 피사체 간격이 너무 좁거나 시트가 잘못되었습니다.`,
    );
  }

  const merged = segments.map((s) => ({ ...s }));
  while (merged.length > target) {
    let bestIndex = 0;
    let bestGap = Number.POSITIVE_INFINITY;
    for (let i = 0; i < merged.length - 1; i += 1) {
      const left = merged[i];
      const right = merged[i + 1];
      if (left === undefined || right === undefined) continue;
      const gap = right.start - left.end - 1;
      if (gap < bestGap) {
        bestGap = gap;
        bestIndex = i;
      }
    }
    const left = merged[bestIndex];
    const right = merged[bestIndex + 1];
    if (left === undefined || right === undefined) break;
    merged.splice(bestIndex, 2, { start: left.start, end: right.end });
  }

  return merged;
}
