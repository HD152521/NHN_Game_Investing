import { PIXEL_STRIDE, PREVIEW_CELL_SIZE, PREVIEW_COLUMNS } from './constants.js';
import { AssetPipelineError } from './errors.js';
import { ImageBuilder, createImage } from './image.js';
import type { Rect, RgbaImage } from './types.js';

export interface PreviewEntry {
  readonly name: string;
  readonly image: RgbaImage;
}

export interface PreviewCell {
  readonly name: string;
  readonly rect: Rect;
}

export interface PreviewSheet {
  readonly image: RgbaImage;
  readonly cells: readonly PreviewCell[];
}

export interface PreviewOptions {
  readonly cellSize?: number;
  readonly columns?: number;
}

/**
 * 박스 필터 축소. 색을 알파로 가중 평균해서
 * 투명한 이웃이 피사체 색을 어둡게 끌어내리는 현상을 막습니다.
 */
export function downscaleToFit(image: RgbaImage, maxSize: number): RgbaImage {
  if (!Number.isInteger(maxSize) || maxSize < 1) {
    throw new AssetPipelineError('축소 목표 크기는 1 이상의 정수여야 합니다.', `받은 값=${maxSize}`);
  }

  const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
  if (scale >= 1) return createCopy(image);

  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const out = createImage(width, height);

  for (let y = 0; y < height; y += 1) {
    const y0 = Math.floor((y * image.height) / height);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * image.height) / height));
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.floor((x * image.width) / width);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * image.width) / width));
      writeAveraged(out, x, y, sampleBox(image, x0, y0, x1, y1));
    }
  }

  return out;
}

interface BoxSample {
  readonly weightedR: number;
  readonly weightedG: number;
  readonly weightedB: number;
  readonly alphaSum: number;
  readonly samples: number;
}

function sampleBox(image: RgbaImage, x0: number, y0: number, x1: number, y1: number): BoxSample {
  let weightedR = 0;
  let weightedG = 0;
  let weightedB = 0;
  let alphaSum = 0;
  let samples = 0;

  for (let sy = y0; sy < Math.min(y1, image.height); sy += 1) {
    for (let sx = x0; sx < Math.min(x1, image.width); sx += 1) {
      const offset = (sy * image.width + sx) * PIXEL_STRIDE;
      const alpha = image.data[offset + 3] ?? 0;
      weightedR += (image.data[offset] ?? 0) * alpha;
      weightedG += (image.data[offset + 1] ?? 0) * alpha;
      weightedB += (image.data[offset + 2] ?? 0) * alpha;
      alphaSum += alpha;
      samples += 1;
    }
  }

  return { weightedR, weightedG, weightedB, alphaSum, samples };
}

function writeAveraged(target: RgbaImage, x: number, y: number, box: BoxSample): void {
  const offset = (y * target.width + x) * PIXEL_STRIDE;
  if (box.samples === 0 || box.alphaSum === 0) return;

  target.data[offset] = Math.round(box.weightedR / box.alphaSum);
  target.data[offset + 1] = Math.round(box.weightedG / box.alphaSum);
  target.data[offset + 2] = Math.round(box.weightedB / box.alphaSum);
  target.data[offset + 3] = Math.round(box.alphaSum / box.samples);
}

function createCopy(image: RgbaImage): RgbaImage {
  return { width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) };
}

/**
 * 축소 프리뷰 시트. 아트가이드 PART 6 체크 3번 —
 * 실사용 크기로 줄여놓고 실루엣만으로 구분되는지 눈으로 판정할 때 씁니다.
 */
export function buildPreviewSheet(
  entries: readonly PreviewEntry[],
  options: PreviewOptions = {},
): PreviewSheet {
  if (entries.length === 0) {
    throw new AssetPipelineError('프리뷰를 만들 대상이 없습니다.', '최소 1개가 필요합니다.');
  }

  const cellSize = options.cellSize ?? PREVIEW_CELL_SIZE;
  const columns = Math.min(options.columns ?? PREVIEW_COLUMNS, entries.length);
  if (!Number.isInteger(cellSize) || cellSize < 1) {
    throw new AssetPipelineError('cellSize 는 1 이상의 정수여야 합니다.', `받은 값=${cellSize}`);
  }
  if (!Number.isInteger(columns) || columns < 1) {
    throw new AssetPipelineError('columns 는 1 이상의 정수여야 합니다.', `받은 값=${options.columns}`);
  }

  const rows = Math.ceil(entries.length / columns);
  const builder = new ImageBuilder(columns * cellSize, rows * cellSize);
  const cells: PreviewCell[] = [];

  entries.forEach((entry, index) => {
    const thumb = downscaleToFit(entry.image, cellSize);
    const cellX = (index % columns) * cellSize;
    const cellY = Math.floor(index / columns) * cellSize;
    // 셀 안에서 가로 중앙 · 세로 하단 정렬 — 발밑이 나란히 보여야 실루엣 비교가 됩니다.
    const x = cellX + Math.round((cellSize - thumb.width) / 2);
    const y = cellY + (cellSize - thumb.height);

    builder.draw(thumb, x, y);
    cells.push({ name: entry.name, rect: { x, y, width: thumb.width, height: thumb.height } });
  });

  return { image: builder.toImage(), cells };
}
