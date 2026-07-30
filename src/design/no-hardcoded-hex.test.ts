import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

/**
 * 하드코딩 HEX 차단 가드 (PLAN STEP 9 수용 기준: "하드코딩된 HEX가 소스에 0개").
 *
 * ESLint 를 도입하지 않고 테스트로 강제합니다 (신규 의존성 금지 정책).
 */

const SRC_ROOT = fileURLToPath(new URL('..', import.meta.url));

/** #RRGGBB 형태의 생짜 HEX 리터럴 */
const HEX_LITERAL = /#[0-9A-Fa-f]{6}\b/;

const SCANNED_EXTENSIONS = ['.ts', '.tsx', '.css', '.js', '.mjs'];

/**
 * 팔레트 단일 소스. HEX 리터럴이 허용되는 유일한 파일입니다.
 */
const PALETTE_SOURCE = 'design/palette.ts';

/**
 * 테스트 파일은 제외합니다. 색 변환 수학(대비비·그레이스케일)을 검증하려면
 * 팔레트와 무관한 고정 색 픽스처가 필요하고, 팔레트 토큰으로 검증하면
 * 구현을 구현으로 검증하는 순환 테스트가 됩니다.
 */
const TEST_FILE = /\.test\.[cm]?[jt]sx?$/;

function toPosix(path: string): string {
  return path.split(sep).join(posix.sep);
}

function collectSourceFiles(directory: string): readonly string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const absolute = join(directory, entry);
    if (statSync(absolute).isDirectory()) {
      found.push(...collectSourceFiles(absolute));
      continue;
    }
    if (SCANNED_EXTENSIONS.some((extension) => entry.endsWith(extension))) {
      found.push(absolute);
    }
  }
  return found;
}

interface Violation {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

function findViolations(includeTests: boolean): readonly Violation[] {
  const violations: Violation[] = [];

  for (const absolute of collectSourceFiles(SRC_ROOT)) {
    const relativePath = toPosix(relative(SRC_ROOT, absolute));
    if (relativePath === PALETTE_SOURCE) continue;
    if (!includeTests && TEST_FILE.test(relativePath)) continue;

    const lines = readFileSync(absolute, 'utf8').split(/\r?\n/);
    lines.forEach((text, index) => {
      if (HEX_LITERAL.test(text)) {
        violations.push({ file: relativePath, line: index + 1, text: text.trim() });
      }
    });
  }

  return violations;
}

function format(violations: readonly Violation[]): string {
  return violations.map((v) => `${v.file}:${v.line}  ${v.text}`).join('\n');
}

describe('하드코딩 HEX 차단', () => {
  test('스캐너가 실제로 소스 파일을 찾아낸다 (가드 자체 검증)', () => {
    expect(collectSourceFiles(SRC_ROOT).length).toBeGreaterThan(0);
  });

  test('팔레트 파일에는 HEX 리터럴이 존재한다 (단일 소스 확인)', () => {
    const palette = readFileSync(join(SRC_ROOT, ...PALETTE_SOURCE.split('/')), 'utf8');
    expect(HEX_LITERAL.test(palette)).toBe(true);
  });

  test('src/** 프로덕션 코드에 생짜 HEX 리터럴이 0개다', () => {
    const violations = findViolations(false);
    expect(format(violations)).toBe('');
  });
});
