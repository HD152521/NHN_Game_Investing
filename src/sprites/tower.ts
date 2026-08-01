/**
 * 타워 스프라이트 — 원본 `towerBasic()` / `towerAA()` / `towerSplash()` 이식.
 * 좌표·색 문자는 원본 그대로다.
 */

import { mk, type SpriteGrid } from './grid';

/** 원본 `towerBasic()` — `tf-tower-01` */
export function towerBasic(): SpriteGrid {
  const c = mk(32, 22);
  c.rect(3, 18, 20, 3, '3').rect(3, 18, 20, 1, 'm');
  c.poly(
    [
      [6, 8],
      [18, 8],
      [20, 18],
      [4, 18],
    ],
    '3',
  );
  c.rect(7, 10, 11, 3, 'r').rect(7, 14, 11, 2, '2');
  c.rect(18, 10, 12, 4, 'm').rect(29, 9, 3, 6, '3');
  c.rect(2, 20, 4, 2, 'm').rect(20, 20, 4, 2, 'm');
  c.rect(9, 5, 6, 4, '3').rect(10, 6, 4, 2, 'r');
  return c.outline('0').rim('w').g;
}

/** 원본 `towerAA()` — `tf-tower-02` */
export function towerAA(): SpriteGrid {
  const c = mk(32, 26);
  c.rect(5, 21, 18, 4, '3').rect(5, 21, 18, 1, 'm');
  c.rect(8, 12, 12, 10, '3').rect(9, 14, 10, 2, 'r').rect(9, 18, 10, 2, '2');
  [9, 13, 17].forEach((x) => {
    c.rect(x, 2, 3, 11, 'm');
    c.rect(x, 2, 3, 2, '2');
  });
  c.disc(26, 9, 5, 'm').disc(26, 9, 3, '3').rect(23, 13, 3, 8, '3');
  c.rect(4, 24, 5, 2, 'm').rect(19, 24, 5, 2, 'm');
  return c.outline('0').rim('w').g;
}

/** 원본 `towerSplash()` — `tf-tower-03` */
export function towerSplash(): SpriteGrid {
  const c = mk(34, 22);
  c.rect(3, 18, 24, 3, '3').rect(3, 18, 24, 1, 'm');
  c.poly(
    [
      [6, 10],
      [22, 10],
      [24, 18],
      [4, 18],
    ],
    '3',
  );
  c.rect(7, 12, 14, 3, 'r');
  c.poly(
    [
      [20, 6],
      [32, 2],
      [33, 10],
      [20, 13],
    ],
    'm',
  );
  c.poly(
    [
      [22, 7],
      [31, 4],
      [31, 9],
      [22, 11],
    ],
    '2',
  );
  c.disc(9, 14, 3, 'm').disc(9, 14, 1, '2');
  c.rect(2, 20, 5, 2, 'm').rect(23, 20, 5, 2, 'm');
  return c.outline('0').rim('w').g;
}
