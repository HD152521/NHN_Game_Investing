import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

import { BASE_PALETTE } from '../design/palette';
import type { SpriteGrid } from './grid';
import { ground } from './ground';
import { scene } from './scene';
import { isSpriteCell, SPRITE_CHARS, SPRITE_PALETTE, TRANSPARENT } from './palette';
import { SPRITE_BUILDERS, SPRITE_KEYS, spriteGrid, type SpriteKey } from './index';
import type { GroundState, Region } from './types';

/**
 * 디자인 원본 대조 — 이 파일이 이식의 합격 조건이다.
 *
 * `docs/design-reference/grids.json` 은 원본 `ticker-front-sprites.js` 를 Node 에서
 * 그대로 실행해 뽑은 정답 그리드다. 이식본이 **문자 단위로 완전히 일치**해야 한다.
 * (형태를 재해석하면 여기서 즉시 깨진다.)
 *
 * 그리드 비교는 문자 비교이므로 HEX 리터럴이 필요 없다 —
 * `no-hardcoded-hex.test.ts` 와 충돌하지 않는다.
 */

const REFERENCE_PATH = fileURLToPath(new URL('../../docs/design-reference/grids.json', import.meta.url));

const reference = JSON.parse(readFileSync(REFERENCE_PATH, 'utf8')) as Record<string, string[][]>;

/** 원본 갱신으로 순수 추가된 시간대·하늘 18키. 기존 43키는 한 픽셀도 바뀌지 않았다. */
const SKY_KEYS_ADDED: readonly SpriteKey[] = [
  'tf-sky-dawn',
  'tf-sky-noon',
  'tf-sky-dusk',
  'tf-sky-night',
  'tf-sky-rain',
  'tf-sky-snow',
  'tf-sky-dust',
  'tf-sky-scrim',
  'tf-sky-wide',
  'tf-r1-noon',
  'tf-r1-dusk',
  'tf-r1-night',
  'tf-r2-noon',
  'tf-r2-dusk',
  'tf-r2-night',
  'tf-r3-noon',
  'tf-r3-dusk',
  'tf-r3-dust',
];

/** 셀이 팔레트 문자이거나 씬 전용 생 색(`#RRGGBB`)인지. */
function isKnownCell(cell: string): boolean {
  return isSpriteCell(cell) || /^#[0-9a-f]{6}$/i.test(cell);
}

/** 사람이 읽을 수 있는 한 장의 문자열. 실패 시 diff 가 그림처럼 보인다. */
function render(grid: readonly (readonly string[])[]): string {
  return grid.map((row) => row.join('')).join('\n');
}

function charSet(grid: readonly (readonly string[])[]): readonly string[] {
  const seen = new Set<string>();
  for (const row of grid) for (const cell of row) seen.add(cell);
  return [...seen].sort();
}

describe('스프라이트 이식 — 원본 대조', () => {
  test('키 61개가 원본 `sheets()` 와 이름·순서까지 같다', () => {
    expect(SPRITE_KEYS).toEqual(Object.keys(reference));
    expect(SPRITE_KEYS).toHaveLength(61);
  });

  test('시간대·하늘 18키가 전부 들어와 있다 (원본 갱신분)', () => {
    expect(SKY_KEYS_ADDED).toHaveLength(18);
    for (const key of SKY_KEYS_ADDED) expect(SPRITE_KEYS).toContain(key);
  });

  test.each(SPRITE_KEYS)('%s 그리드가 원본과 문자 단위로 일치한다', (key) => {
    const expected = reference[key];
    expect(expected, `참조 그리드 없음: ${key}`).toBeDefined();
    const actual = spriteGrid(key);
    expect(render(actual)).toBe(render(expected as string[][]));
  });

  test.each(SPRITE_KEYS)('%s 의 w×h 와 사용 문자 집합이 원본과 같다', (key) => {
    const expected = reference[key] as string[][];
    const actual = spriteGrid(key);
    expect(actual.length).toBe(expected.length);
    expect(actual[0]?.length).toBe(expected[0]?.length);
    expect(charSet(actual)).toEqual(charSet(expected));
  });

  test('`tf-gnd-r1` 과 `tf-gnd-s1` 은 바이트 동일하다 (둘 다 ground(1, 1))', () => {
    expect(render(spriteGrid('tf-gnd-r1'))).toBe(render(spriteGrid('tf-gnd-s1')));
    expect(render(spriteGrid('tf-gnd-r1'))).toBe(render(ground(1, 1)));
  });
});

describe('스프라이트 그리드 불변식', () => {
  const built: readonly (readonly [SpriteKey, SpriteGrid])[] = SPRITE_KEYS.map((key) => [key, spriteGrid(key)]);

  test.each(built)('%s 는 ragged 하지 않다 (모든 행 길이 동일)', (_key, grid) => {
    const width = grid[0]?.length ?? 0;
    expect(width).toBeGreaterThan(0);
    for (const row of grid) expect(row).toHaveLength(width);
  });

  test.each(built)('%s 의 모든 셀이 PAL 문자이거나 씬 생 색이다', (_key, grid) => {
    const unknown = charSet(grid).filter((char) => !isKnownCell(char));
    expect(unknown).toEqual([]);
  });

  test('기존 43키는 PAL 문자만 쓴다 (생 색은 신규 18키에만 등장한다)', () => {
    const legacy = SPRITE_KEYS.filter((key) => !SKY_KEYS_ADDED.includes(key));
    expect(legacy).toHaveLength(43);
    for (const key of legacy) {
      expect(charSet(spriteGrid(key)).filter((char) => !isSpriteCell(char)), key).toEqual([]);
    }
  });

  test('생성기는 호출할 때마다 새 그리드를 돌려준다 (공유 상태 없음)', () => {
    const first = spriteGrid('tf-ally-01');
    const second = spriteGrid('tf-ally-01');
    expect(first).not.toBe(second);
    expect(render(first)).toBe(render(second));
  });
});

describe('파라메트릭 생성기', () => {
  const regions: readonly Region[] = [1, 2, 3];
  const states: readonly GroundState[] = [1, 2, 3];

  test('ground 의 3×3 = 9조합이 전부 유효한 그리드를 낸다', () => {
    const rendered = new Set<string>();
    for (const region of regions) {
      for (const state of states) {
        const grid = ground(region, state);
        expect(grid).toHaveLength(16);
        for (const row of grid) expect(row).toHaveLength(104);
        expect(charSet(grid).filter((char) => !isKnownCell(char))).toEqual([]);
        rendered.add(render(grid));
      }
    }
    // 9조합이 전부 서로 다르다 — 지역/상태가 실제로 그림을 바꾼다
    expect(rendered.size).toBe(9);
  });

  test('원본 키에 없는 조합도 만들 수 있다 (Step 4 의 지역×상태 배선 전제)', () => {
    // `tf-gnd-r2-s2`(R2 균열) 는 원본 43키에 존재하지 않는다
    expect(Object.keys(reference)).not.toContain('tf-gnd-r2-s2');
    expect(render(ground(2, 2))).not.toBe(render(ground(2, 1)));
    expect(render(ground(3, 3))).not.toBe(render(ground(3, 1)));
  });

  test('키는 파라메트릭 함수 위의 별칭이다', () => {
    expect(render(spriteGrid('tf-gnd-s2'))).toBe(render(ground(1, 2)));
    expect(render(spriteGrid('tf-gnd-s3'))).toBe(render(ground(1, 3)));
    expect(render(spriteGrid('tf-gnd-r2'))).toBe(render(ground(2, 1)));
    expect(render(spriteGrid('tf-gnd-r3'))).toBe(render(ground(3, 1)));
    expect(render(spriteGrid('tf-r2-dusk'))).toBe(render(scene('dusk', 108, 56, { region: 2 })));
    expect(render(spriteGrid('tf-sky-noon'))).toBe(render(scene('noon', 116, 62)));
  });

  test('원본 키에 없는 시간대×지역 조합도 만들 수 있다 (하늘 배선 전제)', () => {
    // 원본 61키에 `tf-r2-dawn`(R2 새벽) 은 없지만 `scene()` 으로는 만들 수 있다
    expect(Object.keys(reference)).not.toContain('tf-r2-dawn');
    const dawnR2 = scene('dawn', 108, 56, { region: 2 });
    expect(dawnR2).toHaveLength(56);
    expect(render(dawnR2)).not.toBe(render(scene('dawn', 108, 56, { region: 1 })));
  });
});

describe('문자 팔레트', () => {
  test('PAL 12색 + 투명 sentinel', () => {
    expect(SPRITE_CHARS).toHaveLength(12);
    expect(isSpriteCell(TRANSPARENT)).toBe(true);
    expect(isSpriteCell('z')).toBe(false);
  });

  test('모든 문자가 `src/design` 팔레트 토큰으로 해석된다', () => {
    for (const char of SPRITE_CHARS) {
      const token = SPRITE_PALETTE[char];
      expect(BASE_PALETTE[token]).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  test('빌더 맵과 키 목록이 어긋나지 않는다', () => {
    expect(Object.keys(SPRITE_BUILDERS)).toEqual([...SPRITE_KEYS]);
  });
});
