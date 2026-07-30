import { DEFAULT_MAX_ATLAS_WIDTH, PREVIEW_CELL_SIZE } from './constants.js';
import { AssetPipelineError } from './errors.js';
import type { KeyOptions } from './keying.js';
import { runPipeline } from './pipeline.js';

export const DEFAULT_INPUT_DIRS = ['assets/raw', 'assets/fixtures'] as const;
export const DEFAULT_OUT_DIR = 'assets/atlas';

export interface CliOptions {
  readonly inputDirs: readonly string[];
  readonly outDir: string;
  readonly keying: KeyOptions;
  readonly maxAtlasWidth: number;
  readonly previewCellSize: number;
  readonly help: boolean;
}

const USAGE = `
TICKER FRONT 에셋 후처리 파이프라인

  npm run assets:build -- [옵션]

옵션
  --input <dir>        입력 디렉터리. 여러 번 지정할 수 있습니다.
                       (기본: ${DEFAULT_INPUT_DIRS.join(', ')})
  --out <dir>          출력 디렉터리 (기본: ${DEFAULT_OUT_DIR})
  --tolerance <n>      마젠타 배경 판정 허용 오차
  --fringe-radius <n>  경계 프린지 탐색 반경
  --max-width <n>      아틀라스 최대 가로 폭 (기본: ${DEFAULT_MAX_ATLAS_WIDTH})
  --preview-size <n>   축소 프리뷰 셀 크기 (기본: ${PREVIEW_CELL_SIZE})
  --help               이 도움말

입력 디렉터리는 읽기 전용으로만 다룹니다.
`.trim();

function requireValue(flag: string, value: string | undefined): string {
  if (value === undefined || value.startsWith('--')) {
    throw new AssetPipelineError(`${flag} 에 값이 필요합니다.`, `사용법은 --help 를 보세요.`);
  }
  return value;
}

function requireInteger(flag: string, raw: string): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new AssetPipelineError(`${flag} 값이 올바르지 않습니다.`, `"${raw}" — 0 이상의 정수여야 합니다.`);
  }
  return parsed;
}

/** 순수 함수. 테스트가 프로세스를 띄우지 않고 인자 처리를 검증할 수 있게 분리했습니다. */
export function parseArgs(argv: readonly string[]): CliOptions {
  const inputDirs: string[] = [];
  let outDir = DEFAULT_OUT_DIR;
  let tolerance: number | undefined;
  let fringeRadius: number | undefined;
  let maxAtlasWidth = DEFAULT_MAX_ATLAS_WIDTH;
  let previewCellSize = PREVIEW_CELL_SIZE;
  let help = false;

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i] ?? '';
    const next = argv[i + 1];
    switch (flag) {
      case '--help':
      case '-h':
        help = true;
        break;
      case '--input':
        inputDirs.push(requireValue(flag, next));
        i += 1;
        break;
      case '--out':
        outDir = requireValue(flag, next);
        i += 1;
        break;
      case '--tolerance':
        tolerance = requireInteger(flag, requireValue(flag, next));
        i += 1;
        break;
      case '--fringe-radius':
        fringeRadius = requireInteger(flag, requireValue(flag, next));
        i += 1;
        break;
      case '--max-width':
        maxAtlasWidth = requireInteger(flag, requireValue(flag, next));
        i += 1;
        break;
      case '--preview-size':
        previewCellSize = requireInteger(flag, requireValue(flag, next));
        i += 1;
        break;
      default:
        throw new AssetPipelineError(`알 수 없는 옵션: ${flag}`, '사용법은 --help 를 보세요.');
    }
  }

  return {
    inputDirs: inputDirs.length > 0 ? inputDirs : [...DEFAULT_INPUT_DIRS],
    outDir,
    keying: {
      ...(tolerance !== undefined ? { tolerance } : {}),
      ...(fringeRadius !== undefined ? { fringeRadius } : {}),
    },
    maxAtlasWidth,
    previewCellSize,
    help,
  };
}

/** 성공하면 0, 실패하면 1 을 돌려줍니다. 프로세스 종료는 호출부가 합니다. */
export function main(
  argv: readonly string[],
  log: (message: string) => void = console.log,
  logError: (message: string) => void = console.error,
): number {
  try {
    const options = parseArgs(argv);
    if (options.help) {
      log(USAGE);
      return 0;
    }

    const report = runPipeline({
      inputDirs: options.inputDirs,
      outDir: options.outDir,
      keying: options.keying,
      maxAtlasWidth: options.maxAtlasWidth,
      previewCellSize: options.previewCellSize,
    });

    for (const dir of report.skippedDirs) log(`  (건너뜀) 입력 디렉터리 없음: ${dir}`);
    for (const sheet of report.sheets) {
      log(
        `  ${sheet.file.padEnd(12)} → 프레임 ${sheet.frames}개 ` +
          `(키잉 ${sheet.keyedPixels}px, 프린지 ${sheet.fringePixels}px)`,
      );
    }
    log(`아틀라스   ${report.atlasPath} (${report.atlasSize.width}x${report.atlasSize.height})`);
    log(`매니페스트 ${report.manifestPath} — 프레임 ${report.frameCount}개`);
    log(`프리뷰     ${report.previewPath}`);
    log(`마젠타 잔여 픽셀: ${report.residuePixels}`);
    return 0;
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error));
    if (!(error instanceof AssetPipelineError) && error instanceof Error && error.stack !== undefined) {
      logError(error.stack);
    }
    return 1;
  }
}
