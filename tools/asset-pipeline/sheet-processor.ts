import { alignBaselines, findBaseline } from './baseline.js';
import { AssetPipelineError } from './errors.js';
import { cropImage, opaqueBounds } from './image.js';
import { keyMagenta } from './keying.js';
import type { KeyOptions } from './keying.js';
import { frameCountOf, resolveSheetSpec } from './sheet-spec.js';
import type { SheetLayout, SheetSpec } from './sheet-spec.js';
import { sliceGrid, sliceLineup } from './slicing.js';
import type { Rect, RgbaImage } from './types.js';

export interface ProcessedFrame {
  readonly name: string;
  readonly image: RgbaImage;
  /** 프레임 상단 기준 발밑 y좌표. */
  readonly baselineY: number;
  readonly source: string;
}

export interface SheetResult {
  readonly spec: SheetSpec;
  readonly frames: readonly ProcessedFrame[];
  readonly keyedPixels: number;
  readonly fringePixels: number;
}

function sliceByLayout(image: RgbaImage, layout: SheetLayout): Rect[] {
  switch (layout.kind) {
    case 'single': {
      const bounds = opaqueBounds(image);
      if (bounds === null) {
        throw new AssetPipelineError(
          '키잉 후 남은 피사체가 없습니다.',
          '허용 오차(tolerance)가 너무 커서 피사체까지 지웠을 수 있습니다.',
        );
      }
      return [bounds];
    }
    case 'lineup':
      return sliceLineup(image, { count: layout.count });
    case 'grid':
      return sliceGrid(image, { columns: layout.columns, rows: layout.rows });
  }
}

function nameFor(spec: SheetSpec, index: number): string {
  const name = spec.frameNames[index];
  if (name === undefined) {
    throw new AssetPipelineError(
      '분할된 프레임 수보다 등록된 이름이 적습니다.',
      `${spec.id} — 이름 ${spec.frameNames.length}개, 프레임 ${frameCountOf(spec.layout)}개`,
    );
  }
  return name;
}

/**
 * 시트 한 장을 키잉 → 분할 → (필요하면) baseline 정렬까지 처리합니다.
 * 실패 시 어떤 파일에서 났는지 항상 메시지에 담습니다.
 */
export function processSheet(
  fileName: string,
  image: RgbaImage,
  keying: KeyOptions = {},
): SheetResult {
  const spec = resolveSheetSpec(fileName);

  try {
    const keyed = keyMagenta(image, { ...keying, requireMagenta: true });
    const rects = sliceByLayout(keyed.image, spec.layout);
    const crops = rects.map((rect) => cropImage(keyed.image, rect));

    const frames: ProcessedFrame[] = spec.alignBaselines
      ? alignBaselines(crops).map((sprite, index) => ({
          name: nameFor(spec, index),
          image: sprite.image,
          baselineY: sprite.baselineY,
          source: fileName,
        }))
      : crops.map((crop, index) => ({
          name: nameFor(spec, index),
          image: crop,
          baselineY: findBaseline(crop),
          source: fileName,
        }));

    return {
      spec,
      frames,
      keyedPixels: keyed.keyedPixels,
      fringePixels: keyed.fringePixels,
    };
  } catch (cause) {
    if (cause instanceof AssetPipelineError) {
      throw new AssetPipelineError(`시트 처리 실패: ${fileName}`, cause.message, { cause });
    }
    throw cause;
  }
}
