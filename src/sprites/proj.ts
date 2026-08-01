/**
 * 발사체 스프라이트 — 원본 `proj(kind)` 이식. 좌표·색 문자는 원본 그대로다.
 * kind 1 아군 탄 / 2 관통탄 / 3 적 탄 / 4 피격 파열 2종.
 */

import { mk, type SpriteGrid } from './grid';
import type { ProjKind } from './types';

/** 원본 `proj(kind)` — `tf-w-01~04` */
export function proj(kind: ProjKind): SpriteGrid {
  const c = mk(28, 14);
  c.rect(0, 0, 28, 14, '1');
  if (kind === 1) {
    c.poly(
      [
        [20, 7],
        [10, 3],
        [12, 7],
        [10, 11],
      ],
      'r',
    );
    c.line(9, 5, 2, 4, 'd').line(9, 9, 2, 10, 'd');
  } else if (kind === 2) {
    c.rect(8, 6, 12, 3, 'm');
    c.poly(
      [
        [20, 4],
        [26, 7],
        [20, 11],
      ],
      'w',
    );
    c.rect(6, 5, 2, 5, '3');
  } else if (kind === 3) {
    c.poly(
      [
        [8, 6],
        [18, 4],
        [16, 8],
        [18, 12],
      ],
      'b',
    );
    c.poly(
      [
        [8, 6],
        [4, 9],
        [9, 10],
      ],
      'n',
    );
  } else {
    c.disc(7, 7, 3, 'r');
    for (let a = 0; a < 8; a++) {
      const t = (a / 8) * Math.PI * 2;
      c.px(7 + Math.cos(t) * 5, 7 + Math.sin(t) * 5, 'd');
    }
    c.disc(17, 7, 3, 'b');
    for (let a = 0; a < 8; a++) {
      const t = (a / 8) * Math.PI * 2;
      c.px(17 + Math.cos(t) * 5, 7 + Math.sin(t) * 5, 'n');
    }
    c.disc(25, 7, 2, 'm');
  }
  return c.g;
}
