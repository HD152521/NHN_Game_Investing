import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { PNG } from 'pngjs';
import { PIXEL_STRIDE } from './constants.js';
import { AssetPipelineError } from './errors.js';
import type { RgbaImage } from './types.js';

/** PNG 파일을 8bit RGBA 이미지로 읽습니다. 원본 파일은 절대 수정하지 않습니다. */
export function readPng(path: string): RgbaImage {
  let raw: Buffer;
  try {
    const stat = statSync(path);
    if (!stat.isFile()) {
      throw new AssetPipelineError('PNG 경로가 파일이 아닙니다.', path);
    }
    if (stat.size === 0) {
      throw new AssetPipelineError('PNG 파일이 0바이트입니다 (생성이 중단된 파일로 보입니다).', path);
    }
    raw = readFileSync(path);
  } catch (cause) {
    if (cause instanceof AssetPipelineError) throw cause;
    throw new AssetPipelineError('PNG 파일을 읽지 못했습니다.', path, { cause });
  }

  let decoded: PNG;
  try {
    decoded = PNG.sync.read(raw);
  } catch (cause) {
    throw new AssetPipelineError(
      'PNG 디코딩에 실패했습니다 (손상되었거나 PNG가 아닙니다).',
      `${path} — ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
  }

  const expected = decoded.width * decoded.height * PIXEL_STRIDE;
  if (decoded.data.length !== expected) {
    throw new AssetPipelineError(
      'PNG 픽셀 버퍼 크기가 헤더와 맞지 않습니다.',
      `${path} — ${decoded.width}x${decoded.height} 기대 ${expected}바이트, 실제 ${decoded.data.length}바이트`,
    );
  }

  return {
    width: decoded.width,
    height: decoded.height,
    data: new Uint8ClampedArray(decoded.data),
  };
}

/** RGBA 이미지를 PNG로 저장합니다. 상위 디렉터리는 자동 생성합니다. */
export function writePng(path: string, image: RgbaImage): void {
  const png = new PNG({ width: image.width, height: image.height });
  png.data = Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength);

  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, PNG.sync.write(png));
  } catch (cause) {
    throw new AssetPipelineError('PNG 파일을 저장하지 못했습니다.', path, { cause });
  }
}
