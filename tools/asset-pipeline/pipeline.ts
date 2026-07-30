import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import {
  DEFAULT_MAX_ATLAS_WIDTH,
  PREVIEW_CELL_SIZE,
  PREVIEW_COLUMNS,
} from './constants.js';
import { AssetPipelineError } from './errors.js';
import type { KeyOptions } from './keying.js';
import { buildManifest, serializeManifest } from './manifest.js';
import { composeAtlas, packShelves } from './packing.js';
import type { PackInput } from './packing.js';
import { readPng, writePng } from './png-io.js';
import { buildPreviewSheet } from './preview.js';
import { processSheet } from './sheet-processor.js';
import type { ProcessedFrame } from './sheet-processor.js';
import { assertNoMagentaResidue, findMagentaResidue } from './verify.js';
import { writeFileSync } from 'node:fs';

const ATLAS_BASE_NAME = 'atlas';

export interface PipelineOptions {
  /** 읽을 디렉터리들. 존재하지 않는 곳은 건너뛰고 report.skippedDirs 에 남깁니다. */
  readonly inputDirs: readonly string[];
  readonly outDir: string;
  readonly keying?: KeyOptions;
  readonly maxAtlasWidth?: number;
  readonly previewCellSize?: number;
  readonly previewColumns?: number;
}

export interface SheetReport {
  readonly file: string;
  readonly id: string;
  readonly frames: number;
  readonly keyedPixels: number;
  readonly fringePixels: number;
}

export interface PipelineReport {
  readonly sheets: readonly SheetReport[];
  readonly frameCount: number;
  readonly atlasPath: string;
  readonly manifestPath: string;
  readonly previewPath: string;
  readonly atlasSize: { readonly width: number; readonly height: number };
  readonly residuePixels: number;
  readonly skippedDirs: readonly string[];
}

interface CollectedInputs {
  readonly files: readonly string[];
  readonly skippedDirs: readonly string[];
}

/** 입력 디렉터리들에서 PNG 파일을 모읍니다. 파일명 기준 오름차순 — 실행 순서를 고정합니다. */
function collectSheetFiles(inputDirs: readonly string[]): CollectedInputs {
  const files: string[] = [];
  const skippedDirs: string[] = [];
  const seen = new Set<string>();

  for (const dir of inputDirs) {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
      skippedDirs.push(dir);
      continue;
    }
    for (const entry of readdirSync(dir).sort()) {
      if (extname(entry).toLowerCase() !== '.png') continue;
      if (seen.has(entry)) continue;
      seen.add(entry);
      files.push(join(dir, entry));
    }
  }

  if (files.length === 0) {
    throw new AssetPipelineError(
      '처리할 PNG 를 하나도 찾지 못했습니다.',
      `확인한 경로: ${inputDirs.join(', ')} — 마젠타 배경 PNG 를 넣거나 --input 을 확인하세요.`,
    );
  }
  return { files, skippedDirs };
}

function toPackInput(frame: ProcessedFrame): PackInput {
  return { name: frame.name, image: frame.image, baselineY: frame.baselineY };
}

/**
 * `assets/raw/` → `assets/atlas/` 전체 후처리.
 * 원본 디렉터리는 읽기만 하고 절대 쓰지 않습니다.
 */
export function runPipeline(options: PipelineOptions): PipelineReport {
  const { files, skippedDirs } = collectSheetFiles(options.inputDirs);

  const sheets: SheetReport[] = [];
  const frames: ProcessedFrame[] = [];

  for (const path of files) {
    const fileName = basename(path);
    const result = processSheet(fileName, readPng(path), options.keying ?? {});
    frames.push(...result.frames);
    sheets.push({
      file: fileName,
      id: result.spec.id,
      frames: result.frames.length,
      keyedPixels: result.keyedPixels,
      fringePixels: result.fringePixels,
    });
  }

  const packInputs = frames.map(toPackInput);
  const packed = packShelves(packInputs, {
    maxWidth: options.maxAtlasWidth ?? DEFAULT_MAX_ATLAS_WIDTH,
  });
  const atlas = composeAtlas(packInputs, packed);
  assertNoMagentaResidue(atlas, `${ATLAS_BASE_NAME}.png`);

  const preview = buildPreviewSheet(
    frames.map((frame) => ({ name: frame.name, image: frame.image })),
    {
      cellSize: options.previewCellSize ?? PREVIEW_CELL_SIZE,
      columns: options.previewColumns ?? PREVIEW_COLUMNS,
    },
  );
  assertNoMagentaResidue(preview.image, `${ATLAS_BASE_NAME}.preview.png`);

  const atlasFile = `${ATLAS_BASE_NAME}.png`;
  const previewFile = `${ATLAS_BASE_NAME}.preview.png`;
  const manifest = buildManifest({
    imageFile: atlasFile,
    previewFile,
    pack: packed,
    frames: frames.map((f) => ({ name: f.name, baselineY: f.baselineY, source: f.source })),
  });

  const atlasPath = join(options.outDir, atlasFile);
  const previewPath = join(options.outDir, previewFile);
  const manifestPath = join(options.outDir, `${ATLAS_BASE_NAME}.json`);

  writePng(atlasPath, atlas);
  writePng(previewPath, preview.image);
  try {
    writeFileSync(manifestPath, serializeManifest(manifest), 'utf8');
  } catch (cause) {
    throw new AssetPipelineError('매니페스트를 저장하지 못했습니다.', manifestPath, { cause });
  }

  return {
    sheets,
    frameCount: frames.length,
    atlasPath,
    manifestPath,
    previewPath,
    atlasSize: { width: packed.width, height: packed.height },
    residuePixels: findMagentaResidue(atlas).count,
    skippedDirs,
  };
}
