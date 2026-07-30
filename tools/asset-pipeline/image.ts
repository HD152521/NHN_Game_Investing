import { OPAQUE_ALPHA_THRESHOLD, PIXEL_STRIDE } from './constants.js';
import { AssetPipelineError } from './errors.js';
import type { Rect, Rgba, RgbaImage } from './types.js';

function assertDimensions(width: number, height: number): void {
  const isValid = (n: number): boolean => Number.isInteger(n) && n > 0;
  if (!isValid(width) || !isValid(height)) {
    throw new AssetPipelineError(
      '이미지 크기가 올바르지 않습니다.',
      `width=${width}, height=${height} — 둘 다 1 이상의 정수여야 합니다.`,
    );
  }
}

function offsetOf(image: RgbaImage, x: number, y: number): number {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= image.width || y >= image.height) {
    throw new AssetPipelineError(
      '이미지 범위를 벗어난 좌표에 접근했습니다.',
      `(${x}, ${y}) 는 ${image.width}x${image.height} 밖입니다.`,
    );
  }
  return (y * image.width + x) * PIXEL_STRIDE;
}

function byteAt(data: Uint8ClampedArray, index: number): number {
  const value = data[index];
  if (value === undefined) {
    throw new AssetPipelineError('픽셀 버퍼 인덱스가 범위를 벗어났습니다.', `index=${index}, length=${data.length}`);
  }
  return value;
}

/** 지정한 색으로 채운 새 이미지를 만듭니다. 색을 생략하면 완전 투명. */
export function createImage(width: number, height: number, fill?: Rgba): RgbaImage {
  assertDimensions(width, height);
  const data = new Uint8ClampedArray(width * height * PIXEL_STRIDE);
  if (fill !== undefined) {
    for (let i = 0; i < data.length; i += PIXEL_STRIDE) {
      data[i] = fill.r;
      data[i + 1] = fill.g;
      data[i + 2] = fill.b;
      data[i + 3] = fill.a;
    }
  }
  return { width, height, data };
}

export function getPixel(image: RgbaImage, x: number, y: number): Rgba {
  const offset = offsetOf(image, x, y);
  return {
    r: byteAt(image.data, offset),
    g: byteAt(image.data, offset + 1),
    b: byteAt(image.data, offset + 2),
    a: byteAt(image.data, offset + 3),
  };
}

export function getAlpha(image: RgbaImage, x: number, y: number): number {
  return byteAt(image.data, offsetOf(image, x, y) + 3);
}

export function isOpaque(
  image: RgbaImage,
  x: number,
  y: number,
  threshold: number = OPAQUE_ALPHA_THRESHOLD,
): boolean {
  return getAlpha(image, x, y) >= threshold;
}

/** 원본을 건드리지 않고 잘라낸 새 이미지를 반환합니다. */
export function cropImage(image: RgbaImage, rect: Rect): RgbaImage {
  assertDimensions(rect.width, rect.height);
  const fitsInside =
    Number.isInteger(rect.x) &&
    Number.isInteger(rect.y) &&
    rect.x >= 0 &&
    rect.y >= 0 &&
    rect.x + rect.width <= image.width &&
    rect.y + rect.height <= image.height;
  if (!fitsInside) {
    throw new AssetPipelineError(
      '잘라낼 영역이 원본 밖으로 벗어납니다.',
      `rect=(${rect.x}, ${rect.y}, ${rect.width}x${rect.height}), source=${image.width}x${image.height}`,
    );
  }

  const out = createImage(rect.width, rect.height);
  for (let row = 0; row < rect.height; row += 1) {
    const from = ((rect.y + row) * image.width + rect.x) * PIXEL_STRIDE;
    const to = row * rect.width * PIXEL_STRIDE;
    out.data.set(image.data.subarray(from, from + rect.width * PIXEL_STRIDE), to);
  }
  return out;
}

/** 원본 알파가 임계값 이상인 픽셀들의 최소 사각형. 전부 투명하면 null. */
export function opaqueBounds(
  image: RgbaImage,
  threshold: number = OPAQUE_ALPHA_THRESHOLD,
): Rect | null {
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (byteAt(image.data, (y * image.width + x) * PIXEL_STRIDE + 3) < threshold) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * 합성 전용 가변 캔버스.
 * 공개 API는 불변 RgbaImage 만 주고받고, 변형은 이 빌더 안에서만 일어납니다.
 */
export class ImageBuilder {
  readonly width: number;
  readonly height: number;
  private readonly data: Uint8ClampedArray;

  constructor(width: number, height: number, fill?: Rgba) {
    const seed = createImage(width, height, fill);
    this.width = width;
    this.height = height;
    this.data = seed.data;
  }

  static from(image: RgbaImage): ImageBuilder {
    const builder = new ImageBuilder(image.width, image.height);
    builder.data.set(image.data);
    return builder;
  }

  getPixel(x: number, y: number): Rgba {
    return getPixel(this.snapshotShape(), x, y);
  }

  setPixel(x: number, y: number, color: Rgba): void {
    const offset = offsetOf(this.snapshotShape(), x, y);
    this.data[offset] = color.r;
    this.data[offset + 1] = color.g;
    this.data[offset + 2] = color.b;
    this.data[offset + 3] = color.a;
  }

  /** src 를 (dx, dy) 에 그대로 덮어씁니다(블렌딩 없음). 캔버스 밖은 잘라냅니다. */
  draw(src: RgbaImage, dx: number, dy: number): void {
    const startX = Math.max(0, -dx);
    const startY = Math.max(0, -dy);
    const endX = Math.min(src.width, this.width - dx);
    const endY = Math.min(src.height, this.height - dy);

    for (let y = startY; y < endY; y += 1) {
      const from = (y * src.width + startX) * PIXEL_STRIDE;
      const span = Math.max(0, endX - startX) * PIXEL_STRIDE;
      if (span <= 0) continue;
      const to = ((y + dy) * this.width + (startX + dx)) * PIXEL_STRIDE;
      this.data.set(src.data.subarray(from, from + span), to);
    }
  }

  /** 현재 상태의 독립 복사본. 이후 빌더 변경은 반영되지 않습니다. */
  toImage(): RgbaImage {
    return { width: this.width, height: this.height, data: new Uint8ClampedArray(this.data) };
  }

  private snapshotShape(): RgbaImage {
    return { width: this.width, height: this.height, data: this.data };
  }
}
