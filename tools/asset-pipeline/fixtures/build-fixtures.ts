#!/usr/bin/env node
/**
 * 합성 픽스처 생성기.
 *
 * 실제 AI 에셋(`assets/raw/`)이 아직 없어서, 파이프라인이 처리할 입력을
 * 코드로 만들어 `assets/fixtures/` 에 씁니다. 결정적(deterministic)이라
 * 같은 코드에서는 항상 같은 PNG 가 나옵니다.
 */
import { join } from 'node:path';
import { AssetPipelineError } from '../errors.js';
import { writePng } from '../png-io.js';
import { FIXTURE_SPECS } from './specs.js';

export const FIXTURE_OUT_DIR = 'assets/fixtures';

export function buildFixtures(outDir: string = FIXTURE_OUT_DIR): string[] {
  return FIXTURE_SPECS.map((spec) => {
    const path = join(outDir, spec.fileName);
    writePng(path, spec.build());
    return path;
  });
}

export function main(outDir: string = FIXTURE_OUT_DIR, log = console.log): number {
  try {
    for (const path of buildFixtures(outDir)) log(`  픽스처 생성 ${path}`);
    return 0;
  } catch (error) {
    console.error(error instanceof AssetPipelineError ? error.message : String(error));
    return 1;
  }
}
