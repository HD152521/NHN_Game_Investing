import {
  DEFAULT_MIN_GAP,
  DEFAULT_MIN_SEGMENT_SIZE,
  OPAQUE_ALPHA_THRESHOLD,
} from './constants.js';
import { AssetPipelineError } from './errors.js';
import { columnAlphaHistogram, findSegments, mergeToCount, rowAlphaHistogram } from './histogram.js';
import { cropImage, opaqueBounds } from './image.js';
import type { Rect, RgbaImage, Segment } from './types.js';

export interface SliceTuning {
  readonly minGap?: number;
  readonly minSize?: number;
  readonly alphaThreshold?: number;
}

export interface LineupSliceOptions extends SliceTuning {
  /** 시트에 들어 있는 피사체 수 (E-01·F-01·D-01 은 3). */
  readonly count: number;
}

export interface GridSliceOptions extends SliceTuning {
  readonly columns: number;
  readonly rows: number;
}

interface ResolvedTuning {
  readonly minGap: number;
  readonly minSize: number;
  readonly alphaThreshold: number;
}

function resolveTuning(tuning: SliceTuning): ResolvedTuning {
  return {
    minGap: tuning.minGap ?? DEFAULT_MIN_GAP,
    minSize: tuning.minSize ?? DEFAULT_MIN_SEGMENT_SIZE,
    alphaThreshold: tuning.alphaThreshold ?? OPAQUE_ALPHA_THRESHOLD,
  };
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new AssetPipelineError(`${label} 은(는) 1 이상의 정수여야 합니다.`, `받은 값=${value}`);
  }
}

function assertHasContent(image: RgbaImage, threshold: number, context: string): Rect {
  const bounds = opaqueBounds(image, threshold);
  if (bounds === null) {
    throw new AssetPipelineError(
      '불투명 픽셀이 하나도 없어 피사체를 찾을 수 없습니다.',
      `${context} — 키잉이 피사체까지 지웠거나 시트가 비어 있습니다. 허용 오차(tolerance)를 낮춰보세요.`,
    );
  }
  return bounds;
}

/** 세로 밴드 안의 실제 내용에 맞춰 타이트하게 자른 사각형. */
function tightRectInBand(image: RgbaImage, band: Segment, tuning: ResolvedTuning): Rect {
  const x = band.start;
  const width = band.end - band.start + 1;
  const slice = cropImage(image, { x, y: 0, width, height: image.height });
  const local = assertHasContent(slice, tuning.alphaThreshold, `밴드 x=${x}..${band.end}`);
  return { x: x + local.x, y: local.y, width: local.width, height: local.height };
}

function columnSegments(
  image: RgbaImage,
  count: number,
  tuning: ResolvedTuning,
  context: string,
): Segment[] {
  const histogram = columnAlphaHistogram(image, tuning.alphaThreshold);
  const found = findSegments(histogram, { minGap: tuning.minGap, minSize: tuning.minSize });
  if (found.length === 0) {
    throw new AssetPipelineError(
      '불투명 픽셀이 하나도 없어 피사체를 찾을 수 없습니다.',
      `${context} — 열 히스토그램이 전부 0입니다.`,
    );
  }
  if (found.length < count) {
    throw new AssetPipelineError(
      '라인업 분할 결과가 기대 개수와 다릅니다.',
      `${context} — 검출 ${found.length}개, 기대 ${count}개. 피사체 간격이 minGap(${tuning.minGap})보다 좁습니다.`,
    );
  }
  return mergeToCount(found, count);
}

/**
 * 가로로 나열된 라인업 시트를 N등분합니다.
 * 각 사각형은 해당 피사체의 실제 내용에 맞춰 타이트하게 잘립니다
 * (세로 위치를 보존해야 baseline 정렬이 의미를 가집니다).
 */
export function sliceLineup(image: RgbaImage, options: LineupSliceOptions): Rect[] {
  assertPositiveInteger(options.count, 'count');
  const tuning = resolveTuning(options);
  const bands = columnSegments(image, options.count, tuning, '라인업 시트');
  return bands.map((band) => tightRectInBand(image, band, tuning));
}

/**
 * 격자로 배치된 시트를 행 우선(reading order)으로 분할합니다. (`G-03` 3x2 아이콘 시트)
 */
export function sliceGrid(image: RgbaImage, options: GridSliceOptions): Rect[] {
  assertPositiveInteger(options.columns, 'columns');
  assertPositiveInteger(options.rows, 'rows');
  const tuning = resolveTuning(options);

  const rowHistogram = rowAlphaHistogram(image, tuning.alphaThreshold);
  const rowRuns = findSegments(rowHistogram, { minGap: tuning.minGap, minSize: tuning.minSize });
  if (rowRuns.length < options.rows) {
    throw new AssetPipelineError(
      '그리드 행 분할 결과가 기대와 다릅니다.',
      `검출 행 ${rowRuns.length}개, 기대 ${options.rows}개.`,
    );
  }
  const rowBands = mergeToCount(rowRuns, options.rows);

  const rects: Rect[] = [];
  rowBands.forEach((rowBand, rowIndex) => {
    const y = rowBand.start;
    const height = rowBand.end - rowBand.start + 1;
    const strip = cropImage(image, { x: 0, y, width: image.width, height });
    const bands = columnSegments(strip, options.columns, tuning, `그리드 ${rowIndex + 1}행(row)`);
    for (const band of bands) {
      const local = tightRectInBand(strip, band, tuning);
      rects.push({ ...local, y: y + local.y });
    }
  });

  return rects;
}
