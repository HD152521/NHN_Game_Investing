/**
 * 스킬 FX 스프라이트 — 원본 `fx(kind)` 이식. 좌표·색 문자는 원본 그대로다.
 * kind 1 공시 폭탄 / 2 배당 살포 / 3 서킷브레이커 실드.
 */

import { mk, type Point, type SpriteGrid } from './grid';
import type { FxKind } from './types';

/** 원본 `fx(kind)` — `tf-fx-01~03` */
export function fx(kind: FxKind): SpriteGrid {
  const c = mk(36, 36);
  c.rect(0, 0, 36, 36, '1');
  if (kind === 1) {
    for (let a = 0; a < 16; a++) {
      const t = ((a / 16) * Math.PI * 2);
      const len = a % 2 ? 15 : 10;
      c.line(
        18 + Math.cos(t) * 4,
        18 + Math.sin(t) * 4,
        18 + Math.cos(t) * len,
        18 + Math.sin(t) * len,
        a % 2 ? 'g' : 'w',
      );
    }
    c.disc(18, 18, 3, 'w');
    const sparks: readonly Point[] = [
      [5, 7],
      [28, 9],
      [8, 28],
      [27, 26],
    ];
    sparks.forEach((pt) => c.rect(pt[0], pt[1], 3, 2, 'm'));
  } else if (kind === 2) {
    [6, 11, 16].forEach((r, i) => {
      for (let a = 0; a < 28; a++) {
        const t = (a / 28) * Math.PI * 2;
        c.px(18 + Math.cos(t) * r, 12 + i * 4 + Math.sin(t) * r * 0.35, i === 1 ? 'r' : 'd');
      }
    });
    const drops: readonly Point[] = [
      [10, 26],
      [18, 30],
      [26, 25],
      [14, 20],
      [23, 18],
    ];
    drops.forEach((pt) =>
      c.poly(
        [
          [pt[0], pt[1]],
          [pt[0] + 2, pt[1] + 3],
          [pt[0] - 2, pt[1] + 3],
        ],
        'r',
      ),
    );
  } else {
    for (let a = 0; a <= 20; a++) {
      const t = Math.PI + (a / 20) * Math.PI;
      c.px(18 + Math.cos(t) * 15, 30 + Math.sin(t) * 15, 'p');
    }
    for (let y = 16; y < 30; y += 4)
      for (let x = 6; x < 31; x += 4)
        if ((x + y) % 8 === 0)
          c.poly(
            [
              [x, y],
              [x + 2, y + 2],
              [x, y + 4],
              [x - 2, y + 2],
            ],
            'p',
          );
    c.rect(2, 30, 32, 1, 'p');
  }
  return c.g;
}
