import { MANIFEST_VERSION } from './constants.js';
import { AssetPipelineError } from './errors.js';
import type { PackResult } from './packing.js';

export interface ManifestFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** 프레임 상단 기준 발밑 y좌표. 런타임은 `drawY = groundY - baselineY` 로 씁니다. */
  readonly baselineY: number;
  /** 이 프레임이 잘려 나온 원본 시트 파일명. 재키잉할 때 추적용. */
  readonly source: string;
}

export interface AtlasManifest {
  readonly version: number;
  readonly image: string;
  readonly preview: string;
  readonly size: { readonly width: number; readonly height: number };
  readonly frames: Readonly<Record<string, ManifestFrame>>;
}

export interface FrameMeta {
  readonly name: string;
  readonly baselineY: number;
  readonly source: string;
}

export interface ManifestInput {
  readonly imageFile: string;
  readonly previewFile: string;
  readonly pack: PackResult;
  readonly frames: readonly FrameMeta[];
}

/** 런타임 로더가 읽을 좌표표를 만듭니다. */
export function buildManifest(input: ManifestInput): AtlasManifest {
  const metaByName = new Map(input.frames.map((meta) => [meta.name, meta]));
  const frames: Record<string, ManifestFrame> = {};

  for (const placement of input.pack.placements) {
    const meta = metaByName.get(placement.name);
    if (meta === undefined) {
      throw new AssetPipelineError(
        '패킹된 프레임의 메타데이터가 없습니다.',
        `"${placement.name}" — frames 목록에 baselineY/source 를 넣어주세요.`,
      );
    }
    if (
      !Number.isInteger(meta.baselineY) ||
      meta.baselineY < 0 ||
      meta.baselineY >= placement.rect.height
    ) {
      throw new AssetPipelineError(
        'baselineY 가 프레임 밖을 가리킵니다.',
        `"${placement.name}" baselineY=${meta.baselineY}, 프레임 높이=${placement.rect.height}`,
      );
    }

    frames[placement.name] = {
      x: placement.rect.x,
      y: placement.rect.y,
      width: placement.rect.width,
      height: placement.rect.height,
      baselineY: meta.baselineY,
      source: meta.source,
    };
  }

  return {
    version: MANIFEST_VERSION,
    image: input.imageFile,
    preview: input.previewFile,
    size: { width: input.pack.width, height: input.pack.height },
    frames,
  };
}

/** 키 순서를 고정해 실행마다 diff 가 흔들리지 않게 직렬화합니다. */
export function serializeManifest(manifest: AtlasManifest): string {
  const sorted: Record<string, ManifestFrame> = {};
  for (const key of Object.keys(manifest.frames).sort()) {
    const frame = manifest.frames[key];
    if (frame !== undefined) sorted[key] = frame;
  }
  return `${JSON.stringify({ ...manifest, frames: sorted }, null, 2)}\n`;
}
