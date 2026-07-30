import { DEFAULT_BASELINE_PADDING, OPAQUE_ALPHA_THRESHOLD } from './constants.js';
import { AssetPipelineError } from './errors.js';
import { ImageBuilder, cropImage, opaqueBounds } from './image.js';
import type { Rect, RgbaImage } from './types.js';

export interface AlignOptions {
  /** 정렬 캔버스의 상하좌우 여백(px). baseline 아래에 이만큼 빈 줄이 남습니다. */
  readonly padding?: number;
  readonly alphaThreshold?: number;
}

export interface AlignedSprite {
  readonly image: RgbaImage;
  /** 캔버스 안에서 발밑이 놓인 y좌표. 모든 스프라이트가 같은 값을 갖습니다. */
  readonly baselineY: number;
}

/** 불투명 픽셀이 존재하는 가장 아래쪽 y좌표(발밑). */
export function findBaseline(
  image: RgbaImage,
  threshold: number = OPAQUE_ALPHA_THRESHOLD,
): number {
  const bounds = opaqueBounds(image, threshold);
  if (bounds === null) {
    throw new AssetPipelineError(
      'baseline 을 구할 수 없습니다 — 스프라이트가 완전히 투명합니다.',
      `${image.width}x${image.height} 이미지에 불투명 픽셀이 0개입니다.`,
    );
  }
  return bounds.y + bounds.height - 1;
}

function boundsOrThrow(image: RgbaImage, threshold: number, index: number): Rect {
  const bounds = opaqueBounds(image, threshold);
  if (bounds === null) {
    throw new AssetPipelineError(
      'baseline 정렬 대상 중 완전히 투명한 스프라이트가 있습니다.',
      `index ${index} (${image.width}x${image.height}) — 분할 결과나 키잉 허용 오차를 확인하세요.`,
    );
  }
  return bounds;
}

/**
 * 여러 스프라이트를 같은 크기의 캔버스에 올리고 발밑 y좌표를 픽셀 단위로 맞춥니다.
 * (아트가이드 PART 6 체크 2번 — 유닛 3종 baseline 픽셀 일치)
 */
export function alignBaselines(
  images: readonly RgbaImage[],
  options: AlignOptions = {},
): AlignedSprite[] {
  if (images.length === 0) {
    throw new AssetPipelineError('정렬할 스프라이트가 없습니다.', '최소 1개가 필요합니다.');
  }

  const padding = options.padding ?? DEFAULT_BASELINE_PADDING;
  if (!Number.isInteger(padding) || padding < 0) {
    throw new AssetPipelineError('padding 은 0 이상의 정수여야 합니다.', `받은 값=${padding}`);
  }
  const threshold = options.alphaThreshold ?? OPAQUE_ALPHA_THRESHOLD;

  const bounds = images.map((image, index) => boundsOrThrow(image, threshold, index));
  const canvasWidth = Math.max(...bounds.map((b) => b.width)) + padding * 2;
  const canvasHeight = Math.max(...bounds.map((b) => b.height)) + padding * 2;
  const baselineY = canvasHeight - 1 - padding;

  return images.map((image, index) => {
    const box = bounds[index];
    if (box === undefined) {
      throw new AssetPipelineError('내부 오류: 바운딩 박스가 없습니다.', `index=${index}`);
    }
    const builder = new ImageBuilder(canvasWidth, canvasHeight);
    builder.draw(
      cropImage(image, box),
      Math.round((canvasWidth - box.width) / 2),
      baselineY - (box.height - 1),
    );
    return { image: builder.toImage(), baselineY };
  });
}
