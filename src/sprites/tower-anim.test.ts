import { describe, expect, test } from 'vitest';

import { ANIM_FRAMES, type AnimFrame } from './anim';
import { mk, type SpriteGrid } from './grid';
import { spriteGrid } from './index';
import { isSpriteCell } from './palette';
import { stampGrid } from './scene-wide';
import { towerFire, towerFireFrame, TOWER_FIRE_BODY_ORIGIN, type TowerFireKind } from './tower-anim';
import { towerAA, towerBasic, towerSplash } from './tower';

/**
 * 타워 발사 프레임의 **두 경로 동일성**.
 *
 * 원본 `towerFire` 는 몸통을 `stamp` 로 찍어 팔레트 문자를 HEX 로 굽는다. 화면에는 색약
 * 모드를 따라가야 하므로 문자를 보존하는 `towerFireFrame` 을 쓰는데, 두 그림이 어긋나면
 * "화면과 디자인이 다르다" 가 다시 시작된다. 여기서 픽셀 단위로 고정한다.
 */
function bake(grid: SpriteGrid): SpriteGrid {
  const out = mk(grid[0]?.length ?? 0, grid.length);
  stampGrid(out.g, grid, 0, 0);
  return out.g;
}

function render(grid: readonly (readonly string[])[]): string {
  return grid.map((row) => row.join('')).join('\n');
}

const KINDS: readonly TowerFireKind[] = [1, 2, 3];
const IDLE = { 1: towerBasic, 2: towerAA, 3: towerSplash } as const;

describe('towerFire ↔ towerFireFrame — 같은 그림, 다른 색 표현', () => {
  /**
   * ★ 양쪽을 한 번씩 굽고 비교한다 ★
   *   원본 `towerFire` 는 **몸통만** 굽는다 — 총구 섬광·티어2 장식·잔재는 `stamp` 뒤에
   *   덧칠되므로 팔레트 문자로 남는다(`grids.json` 의 `tf-t2-*` 에 `'g'` 가 그대로 있는 이유).
   *   화면 경로는 전부 문자다. 그래서 "같은 그림인가" 는 둘 다 한 번 구운 뒤에 물어야 한다.
   *   굽기는 이미 구워진 HEX 에 대해 항등이라 원본 쪽 몸통은 그대로 남는다.
   */
  test.each(KINDS)('kind %s 의 4프레임이 두 경로에서 픽셀 단위로 같다', (kind) => {
    for (const f of ANIM_FRAMES) {
      expect(render(bake(towerFireFrame(kind, f))), `kind ${kind} f ${f}`).toBe(render(bake(towerFire(kind, f))));
      expect(render(bake(towerFireFrame(kind, f, true))), `kind ${kind} f ${f} t2`).toBe(
        render(bake(towerFire(kind, f, true))),
      );
    }
  });

  test('굽기는 이미 구워진 색에 대해 항등이다 (위 비교가 원본을 바꾸지 않는다)', () => {
    const once = towerFire(1, 2, true);
    expect(render(bake(bake(once)))).toBe(render(bake(once)));
  });

  test.each(KINDS)('kind %s 의 화면 경로는 팔레트 문자를 유지한다 (색약 모드가 살아 있다)', (kind) => {
    for (const f of ANIM_FRAMES) {
      const chars = new Set<string>();
      for (const row of towerFireFrame(kind, f)) for (const cell of row) chars.add(cell);
      expect([...chars].filter((c) => !isSpriteCell(c)), `kind ${kind} f ${f}`).toEqual([]);
    }
  });

  test.each(KINDS)('kind %s 의 원본 대조 경로는 몸통을 굽는다 (원본 그대로)', (kind) => {
    const chars = new Set<string>();
    for (const row of towerFire(kind, 0)) for (const cell of row) chars.add(cell);
    expect([...chars].some((c) => !isSpriteCell(c))).toBe(true);
  });
});

describe('towerFire — 캔버스·원점', () => {
  test.each(KINDS)('kind %s 프레임은 정지 스프라이트보다 가로 14 · 세로 4 크다', (kind) => {
    const idle = IDLE[kind]();
    const frame = towerFireFrame(kind, 0);
    expect(frame[0]?.length).toBe((idle[0]?.length ?? 0) + 14);
    expect(frame.length).toBe(idle.length + 4);
  });

  test('몸통 원점 (2, 4) 에서 정지 스프라이트가 그대로 보인다 (반동 0 프레임)', () => {
    for (const kind of KINDS) {
      const idle = IDLE[kind]();
      const frame = towerFireFrame(kind, 0);
      for (let y = 0; y < idle.length; y += 1) {
        const src = idle[y];
        const dst = frame[y + TOWER_FIRE_BODY_ORIGIN.y];
        if (src === undefined || dst === undefined) continue;
        for (let x = 0; x < src.length; x += 1) {
          if (src[x] === '.') continue;
          expect(dst[x + TOWER_FIRE_BODY_ORIGIN.x], `kind ${kind} (${x}, ${y})`).toBe(src[x]);
        }
      }
    }
  });

  test('반동은 f 2·3 에만 있고, 대공포(kind 2)는 위로 쏘므로 f 2 에 밀리지 않는다', () => {
    // 원본 `kick = [0, 0, kind === 2 ? 0 : -2, -1]`. 프레임끼리 그림이 다른지로 확인한다.
    for (const kind of KINDS) {
      const seen = new Set(ANIM_FRAMES.map((f: AnimFrame) => render(towerFireFrame(kind, f))));
      expect(seen.size, `kind ${kind}`).toBe(4);
    }
  });
});

describe('tf-t2-01~03 — 티어2 한 장', () => {
  test.each([
    ['tf-t2-01', 1],
    ['tf-t2-02', 2],
    ['tf-t2-03', 3],
  ] as const)('%s 는 towerFire(kind, 0, true) 그대로다', (key, kind) => {
    expect(render(spriteGrid(key))).toBe(render(towerFire(kind as TowerFireKind, 0, true)));
  });

  test('티어2 장식(GOLD)은 레벨 1 프레임에 없다', () => {
    for (const kind of KINDS) {
      const hasGold = (grid: SpriteGrid): boolean => grid.some((row) => row.includes('g'));
      expect(hasGold(towerFireFrame(kind, 0, true)), `kind ${kind} t2`).toBe(true);
      expect(hasGold(towerFireFrame(kind, 0, false)), `kind ${kind} l1`).toBe(false);
    }
  });
});
