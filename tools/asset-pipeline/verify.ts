import { OPAQUE_ALPHA_THRESHOLD, PIXEL_STRIDE, RESIDUE_TOLERANCE } from './constants.js';
import { magentaDistance } from './color.js';
import { MagentaResidueError } from './errors.js';
import type { RgbaImage } from './types.js';

export interface ResidueSample {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export interface ResidueReport {
  readonly count: number;
  readonly samples: readonly ResidueSample[];
}

export interface ResidueOptions {
  /** 이 거리 이내면 마젠타 잔여로 봅니다. */
  readonly tolerance?: number;
  /** 이 알파 미만은 보이지 않으므로 검사하지 않습니다. */
  readonly alphaThreshold?: number;
  readonly maxSamples?: number;
}

const DEFAULT_MAX_SAMPLES = 8;

/** 산출물에 남은 마젠타(또는 거의 마젠타) 픽셀을 셉니다. */
export function findMagentaResidue(
  image: RgbaImage,
  options: ResidueOptions = {},
): ResidueReport {
  const tolerance = options.tolerance ?? RESIDUE_TOLERANCE;
  const alphaThreshold = options.alphaThreshold ?? OPAQUE_ALPHA_THRESHOLD;
  const maxSamples = options.maxSamples ?? DEFAULT_MAX_SAMPLES;

  const samples: ResidueSample[] = [];
  let count = 0;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * PIXEL_STRIDE;
      const a = image.data[offset + 3] ?? 0;
      if (a < alphaThreshold) continue;

      const color = {
        r: image.data[offset] ?? 0,
        g: image.data[offset + 1] ?? 0,
        b: image.data[offset + 2] ?? 0,
      };
      if (magentaDistance(color) > tolerance) continue;

      count += 1;
      if (samples.length < maxSamples) samples.push({ x, y, ...color, a });
    }
  }

  return { count, samples };
}

/** 마젠타 잔여가 하나라도 있으면 예외를 던집니다. CLI 는 이걸로 non-zero exit 합니다. */
export function assertNoMagentaResidue(
  image: RgbaImage,
  label: string,
  options: ResidueOptions = {},
): void {
  const report = findMagentaResidue(image, options);
  if (report.count === 0) return;

  const where = report.samples
    .map((s) => `(${s.x}, ${s.y}) rgba(${s.r}, ${s.g}, ${s.b}, ${s.a})`)
    .join(', ');

  throw new MagentaResidueError(
    `마젠타 잔여 검사 실패: ${label}`,
    `잔여 픽셀 ${report.count}개 — 예: ${where}. 키잉 허용 오차(tolerance)나 프린지 반경(fringeRadius)을 올려보세요.`,
  );
}
