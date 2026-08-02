import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

import { SCREEN_ONLY_SPRITE_KEYS } from './render/composite';
import { spriteGrid } from './index';
import { isSpriteCell } from './palette';
import { revealScreen, SCREEN_HEIGHT, SCREEN_WIDTH, titleScreen } from './screens';

/**
 * 화면 목업 2장(`tf-title` · `tf-reveal`)의 성질과 **전장 blit 금지**를 고정한다.
 *
 * 주석만으로는 못 막는다 — 실제로 `src/battle/**` 안에서 이 키가 나오는지 파일을 훑는다.
 */

const BATTLE_DIR = fileURLToPath(new URL('../battle', import.meta.url));

function sourceFiles(directory: string): readonly string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const absolute = join(directory, entry);
    if (statSync(absolute).isDirectory()) {
      found.push(...sourceFiles(absolute));
      continue;
    }
    if (entry.endsWith('.ts')) found.push(absolute);
  }
  return found;
}

describe('화면 목업 2장 — 크기·성질', () => {
  test('둘 다 168×76 한 화면이다', () => {
    for (const grid of [titleScreen(), revealScreen()]) {
      expect(grid).toHaveLength(SCREEN_HEIGHT);
      expect(grid[0]).toHaveLength(SCREEN_WIDTH);
    }
    expect(SCREEN_WIDTH).toBe(168);
    expect(SCREEN_HEIGHT).toBe(76);
  });

  test('키가 생성기의 별칭이다', () => {
    const render = (g: readonly (readonly string[])[]): string => g.map((r) => r.join('')).join('\n');
    expect(render(spriteGrid('tf-title'))).toBe(render(titleScreen()));
    expect(render(spriteGrid('tf-reveal'))).toBe(render(revealScreen()));
  });

  /**
   * `tf-title` 은 씬(생 색) + `darken` + `stamp` 라 **전부 구워진 색**이고,
   * `tf-reveal` 은 팔레트 문자만 쓴다. 즉 색약 모드를 따라가는 것은 `tf-reveal` 뿐이다.
   * (원본이 그렇게 짜여 있다 — 재해석하지 않는다.)
   */
  test('tf-title 은 생 색, tf-reveal 은 팔레트 문자다', () => {
    const chars = (g: readonly (readonly string[])[]): readonly string[] => {
      const seen = new Set<string>();
      for (const row of g) for (const cell of row) seen.add(cell);
      return [...seen];
    };
    expect(chars(titleScreen()).some((c) => !isSpriteCell(c))).toBe(true);
    expect(chars(revealScreen()).filter((c) => !isSpriteCell(c))).toEqual([]);
  });

  /**
   * 원본 마지막 줄 `px(x, laneY + 3, …)` 은 y = 77 로 캔버스(76) **밖**이다.
   * 좌표를 "고쳐서" 안으로 넣으면 원본 대조가 깨지므로, 한 픽셀도 안 그려진다는 사실을 고정한다.
   */
  test('타이틀의 레인 점선은 캔버스 밖이라 그려지지 않는다', () => {
    const grid = titleScreen();
    const bottom = grid[SCREEN_HEIGHT - 1];
    expect(bottom).toBeDefined();
    // 레인 색(#1B4A42)은 어디에도 등장하지 않는다.
    const hasLaneInk = grid.some((row) => row.some((cell) => cell.toLowerCase() === '#1b4a42'));
    expect(hasLaneInk).toBe(false);
  });
});

describe('전장 blit 금지 — 화면 목업·비교 시트', () => {
  test('`src/battle/**` 어디에서도 화면 전용 키를 참조하지 않는다', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(BATTLE_DIR)) {
      const text = readFileSync(file, 'utf8');
      for (const key of SCREEN_ONLY_SPRITE_KEYS) {
        // 주석에 키 이름을 적는 것은 허용한다 — 따옴표로 감싼 **참조**만 잡는다.
        if (text.includes(`'${key}'`) || text.includes(`"${key}"`)) offenders.push(`${file}: ${key}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test('화면 전용 목록에 이번 2장이 들어 있다', () => {
    expect(SCREEN_ONLY_SPRITE_KEYS).toContain('tf-title');
    expect(SCREEN_ONLY_SPRITE_KEYS).toContain('tf-reveal');
    // 지난 라운드에 확인한 비교 시트 3장도 같은 목록에 있다.
    expect(SCREEN_ONLY_SPRITE_KEYS).toContain('tf-fx-screen');
    expect(SCREEN_ONLY_SPRITE_KEYS).toContain('tf-sky-scrim');
    expect(SCREEN_ONLY_SPRITE_KEYS).toContain('tf-sky-wide');
  });
});
