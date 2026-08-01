/**
 * 발판 스프라이트 — 원본 `ground(region, state)` / `groundSlot()` 이식.
 *
 * ★ `ground` 는 지역 3 × 상태 3 = 9조합을 낸다. 원본 키에는 R1 의 상태 변형
 *   (`tf-gnd-s1~s3`)만 있지만, R2·R3 의 균열/함몰 발판도 이 함수로 만들 수 있다.
 */

import { mk, type SpriteGrid } from './grid';
import type { GroundState, Region } from './types';

/**
 * 원본 `ground(region, state)` — `tf-gnd-r1~r3`(state 1) / `tf-gnd-s1~s3`(region 1).
 * `tf-gnd-r1` 과 `tf-gnd-s1` 은 둘 다 `ground(1, 1)` 이므로 바이트 동일하다.
 */
export function ground(region: Region, state: GroundState): SpriteGrid {
  const c = mk(104, 16);
  c.rect(0, 4, 104, 12, '3');
  c.rect(0, 4, 104, 1, 'm');
  c.rect(0, 5, 104, 1, '2');
  if (region === 1) {
    for (let i = 0; i < 104; i += 8) c.rect(i, 6, 1, 10, '2');
    for (let i = 12; i < 104; i += 34) {
      c.disc(i, 11, 2, '2');
      c.px(i, 11, 'm');
    }
    c.rect(0, 14, 104, 2, '2');
  } else if (region === 2) {
    for (let i = 0; i < 104; i += 6) c.rect(i, 8, 3, 1, 'm');
    c.rect(0, 12, 104, 2, '2');
    for (let i = 2; i < 104; i += 5) c.px(i, 13, '3');
  } else {
    for (let i = 0; i < 104; i += 14) c.rect(i, 7, 10, 1, 'm');
    for (let i = 4; i < 104; i += 9) c.rect(i, 10, 2, 2, '2');
    c.rect(0, 13, 104, 3, '2');
  }
  if (state >= 2) {
    // 균열
    for (let i = 5; i < 104; i += 17) {
      c.line(i, 4, i + 4, 12, '2');
      c.px(i + 1, 5, '1');
    }
  }
  if (state >= 3) {
    // 함몰
    for (let i = 9; i < 104; i += 13) {
      c.line(i, 4, i - 5, 14, '1');
      c.px(i, 5, 'b');
      c.px(i - 2, 8, 'n');
    }
    c.rect(0, 4, 104, 1, 'n');
  }
  return c.g;
}

/** 원본 `groundSlot()` — `tf-gnd-slot` (배치 슬롯 데칼 3종) */
export function groundSlot(): SpriteGrid {
  const c = mk(60, 20);
  c.rect(0, 12, 60, 8, '3').rect(0, 12, 60, 1, 'm');
  const box = (x: number, col: 'm' | 'r', style: 'dot' | 'bracket' | 'hatch'): void => {
    if (style === 'dot') {
      for (let i = 0; i < 14; i += 2) {
        c.px(x + i, 6, col);
        c.px(x + i, 15, col);
      }
      for (let j = 6; j < 16; j += 2) {
        c.px(x, j, col);
        c.px(x + 13, j, col);
      }
    } else {
      c.rect(x, 6, 14, 1, col).rect(x, 15, 14, 1, col).rect(x, 6, 1, 10, col).rect(x + 13, 6, 1, 10, col);
    }
    if (style === 'bracket') {
      c.rect(x - 1, 5, 3, 1, col).rect(x + 12, 5, 3, 1, col).rect(x - 1, 16, 3, 1, col).rect(x + 12, 16, 3, 1, col);
    }
    if (style === 'hatch') for (let i = 0; i < 12; i += 3) c.line(x + i, 15, x + i + 4, 7, col);
  };
  box(4, 'm', 'dot');
  box(24, 'r', 'bracket');
  box(44, 'm', 'hatch');
  return c.g;
}
