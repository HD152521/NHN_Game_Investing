import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

import { BASE_PALETTE, COLORBLIND_OVERRIDES, PALETTE_TOKENS } from './palette';

/**
 * 팔레트는 아트가이드 §1.3 표가 원본입니다.
 * 테스트가 HEX를 다시 적으면 "두 번 적기"가 되어 단일 소스가 깨지므로,
 * 문서의 표를 직접 파싱해서 대조합니다.
 */
const ART_GUIDE_PATH = fileURLToPath(
  new URL('../../docs/아트가이드_프롬프트시트.md', import.meta.url),
);

const PALETTE_ROW = /^\|\s*`([^`]+)`\s*\|\s*`(#[0-9A-Fa-f]{6})`\s*\|/gm;
const COLORBLIND_ROW = /^\|\s*(UP|DOWN)\s*\|\s*`(#[0-9A-Fa-f]{6})`\s*\|\s*`(#[0-9A-Fa-f]{6})`/gm;

const EXPECTED_TOKEN_COUNT = 12;

function normalizeDocToken(docToken: string): string {
  return docToken.replace(/\s*\/\s*/g, '_').replace(/-/g, '_').toUpperCase();
}

function readArtGuide(): string {
  return readFileSync(ART_GUIDE_PATH, 'utf8');
}

function parseDocPalette(): Map<string, string> {
  const doc = readArtGuide();
  const entries = new Map<string, string>();
  for (const match of doc.matchAll(PALETTE_ROW)) {
    const [, docToken, hex] = match;
    if (docToken === undefined || hex === undefined) continue;
    entries.set(normalizeDocToken(docToken), hex.toUpperCase());
  }
  return entries;
}

function parseDocColorblind(): Map<string, string> {
  const doc = readArtGuide();
  const entries = new Map<string, string>();
  for (const match of doc.matchAll(COLORBLIND_ROW)) {
    const [, direction, , colorblindHex] = match;
    if (direction === undefined || colorblindHex === undefined) continue;
    entries.set(direction, colorblindHex.toUpperCase());
  }
  return entries;
}

describe('palette (아트가이드 §1.3 단일 소스)', () => {
  test('아트가이드 표에서 12개 토큰을 파싱한다 (파서 자체 검증)', () => {
    expect(parseDocPalette().size).toBe(EXPECTED_TOKEN_COUNT);
  });

  test('PALETTE_TOKENS 는 12개이고 BASE_PALETTE 키와 정확히 일치한다', () => {
    expect(PALETTE_TOKENS).toHaveLength(EXPECTED_TOKEN_COUNT);
    expect([...PALETTE_TOKENS].sort()).toEqual(Object.keys(BASE_PALETTE).sort());
  });

  test('12토큰 HEX가 아트가이드 표와 정확히 일치한다', () => {
    const documented = parseDocPalette();
    const implemented = new Map(
      Object.entries(BASE_PALETTE).map(([token, hex]) => [token, hex.toUpperCase()]),
    );
    expect(implemented).toEqual(documented);
  });

  test('색약 모드 오버라이드가 아트가이드 색약 표와 일치한다', () => {
    const documented = parseDocColorblind();
    expect(COLORBLIND_OVERRIDES.UP_ALLY.toUpperCase()).toBe(documented.get('UP'));
    expect(COLORBLIND_OVERRIDES.ENEMY_DOWN.toUpperCase()).toBe(documented.get('DOWN'));
  });

  test('색약 오버라이드는 기본값과 실제로 다른 색이다', () => {
    expect(COLORBLIND_OVERRIDES.UP_ALLY).not.toBe(BASE_PALETTE.UP_ALLY);
    expect(COLORBLIND_OVERRIDES.ENEMY_DOWN).not.toBe(BASE_PALETTE.ENEMY_DOWN);
  });

  test('음영 토큰도 색약 오버라이드를 가진다 (기본 팔레트의 base→deep 관계 유지)', () => {
    expect(COLORBLIND_OVERRIDES.UP_DEEP).not.toBe(BASE_PALETTE.UP_DEEP);
    expect(COLORBLIND_OVERRIDES.ENEMY_DEEP).not.toBe(BASE_PALETTE.ENEMY_DEEP);
  });
});
