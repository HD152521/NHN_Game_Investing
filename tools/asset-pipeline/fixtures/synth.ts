import { MAGENTA } from '../constants.js';
import { AssetPipelineError } from '../errors.js';
import { ImageBuilder } from '../image.js';
import type { Rgba, RgbaImage } from '../types.js';

/**
 * 합성 픽스처 렌더러.
 *
 * 실제 AI 에셋의 특성을 흉내내는 것이 목적입니다:
 *  - 배경이 순수 마젠타 #FF00FF
 *  - 알파 채널 없음 (완전 불투명 PNG)
 *  - 곡선/사선 경계에 슈퍼샘플링으로 생긴 진짜 마젠타 혼색 프린지
 */

export type Shape =
  | { readonly kind: 'rect'; readonly x: number; readonly y: number; readonly width: number; readonly height: number }
  | { readonly kind: 'ellipse'; readonly cx: number; readonly cy: number; readonly rx: number; readonly ry: number };

export interface SynthSubject {
  readonly color: Rgba;
  readonly shapes: readonly Shape[];
}

export interface SynthSheetSpec {
  readonly width: number;
  readonly height: number;
  readonly subjects: readonly SynthSubject[];
  /** 한 축당 서브샘플 수. 클수록 프린지 계조가 부드러워집니다. */
  readonly samplesPerAxis?: number;
}

const DEFAULT_SAMPLES_PER_AXIS = 4;

interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

function shapeBounds(shape: Shape): Bounds {
  if (shape.kind === 'rect') {
    return { minX: shape.x, minY: shape.y, maxX: shape.x + shape.width, maxY: shape.y + shape.height };
  }
  return {
    minX: shape.cx - shape.rx,
    minY: shape.cy - shape.ry,
    maxX: shape.cx + shape.rx,
    maxY: shape.cy + shape.ry,
  };
}

function containsPoint(shape: Shape, px: number, py: number): boolean {
  if (shape.kind === 'rect') {
    return px >= shape.x && px < shape.x + shape.width && py >= shape.y && py < shape.y + shape.height;
  }
  const nx = (px - shape.cx) / shape.rx;
  const ny = (py - shape.cy) / shape.ry;
  return nx * nx + ny * ny <= 1;
}

function unionBounds(shapes: readonly Shape[]): Bounds {
  const boxes = shapes.map(shapeBounds);
  return {
    minX: Math.min(...boxes.map((b) => b.minX)),
    minY: Math.min(...boxes.map((b) => b.minY)),
    maxX: Math.max(...boxes.map((b) => b.maxX)),
    maxY: Math.max(...boxes.map((b) => b.maxY)),
  };
}

function coverageAt(
  shapes: readonly Shape[],
  x: number,
  y: number,
  samplesPerAxis: number,
): number {
  let hits = 0;
  for (let sy = 0; sy < samplesPerAxis; sy += 1) {
    const py = y + (sy + 0.5) / samplesPerAxis;
    for (let sx = 0; sx < samplesPerAxis; sx += 1) {
      const px = x + (sx + 0.5) / samplesPerAxis;
      if (shapes.some((shape) => containsPoint(shape, px, py))) hits += 1;
    }
  }
  return hits / (samplesPerAxis * samplesPerAxis);
}

function blend(subject: number, background: number, coverage: number): number {
  return Math.round(subject * coverage + background * (1 - coverage));
}

/** 마젠타 배경 위에 피사체들을 안티에일리어싱하며 그린 시트를 만듭니다. */
export function renderMagentaSheet(spec: SynthSheetSpec): RgbaImage {
  if (spec.subjects.length === 0) {
    throw new AssetPipelineError(
      '피사체가 없는 픽스처는 만들 수 없습니다.',
      '전부 마젠타인 시트는 파이프라인 입력으로 의미가 없습니다.',
    );
  }

  const samplesPerAxis = spec.samplesPerAxis ?? DEFAULT_SAMPLES_PER_AXIS;
  if (!Number.isInteger(samplesPerAxis) || samplesPerAxis < 1) {
    throw new AssetPipelineError('samplesPerAxis 는 1 이상의 정수여야 합니다.', `받은 값=${samplesPerAxis}`);
  }

  const builder = new ImageBuilder(spec.width, spec.height, MAGENTA);

  for (const subject of spec.subjects) {
    if (subject.shapes.length === 0) {
      throw new AssetPipelineError('도형이 없는 피사체가 있습니다.', '모든 피사체는 최소 1개의 도형을 가져야 합니다.');
    }
    const box = unionBounds(subject.shapes);
    const startX = Math.max(0, Math.floor(box.minX));
    const startY = Math.max(0, Math.floor(box.minY));
    const endX = Math.min(spec.width, Math.ceil(box.maxX) + 1);
    const endY = Math.min(spec.height, Math.ceil(box.maxY) + 1);

    for (let y = startY; y < endY; y += 1) {
      for (let x = startX; x < endX; x += 1) {
        const coverage = coverageAt(subject.shapes, x, y, samplesPerAxis);
        if (coverage <= 0) continue;
        // 이미 그려진 픽셀 위에 합성합니다. 겹친 파츠 경계에 마젠타가 새지 않습니다.
        const under = builder.getPixel(x, y);
        builder.setPixel(x, y, {
          r: blend(subject.color.r, under.r, coverage),
          g: blend(subject.color.g, under.g, coverage),
          b: blend(subject.color.b, under.b, coverage),
          a: 255,
        });
      }
    }
  }

  return builder.toImage();
}
