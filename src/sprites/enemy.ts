/**
 * 적군 유닛 스프라이트 — 원본 `enemyRusher()` / `enemyBlocker()` / `enemyTank()` /
 * `enemyKite()` / `enemySiren()` 이식. 좌표·색 문자는 원본 그대로다.
 */

import { mk, type Point, type SpriteGrid } from './grid';

/** 원본 `enemyRusher()` — `tf-enemy-01` */
export function enemyRusher(): SpriteGrid {
  const c = mk(26, 34);
  c.poly(
    [
      [18, 12],
      [23, 17],
      [20, 32],
      [7, 32],
      [5, 18],
      [10, 12],
    ],
    '2',
  );
  c.poly(
    [
      [18, 12],
      [23, 17],
      [21, 22],
      [17, 16],
    ],
    'n',
  );
  c.poly(
    [
      [14, 3],
      [22, 10],
      [20, 14],
      [12, 15],
      [8, 9],
    ],
    '3',
  );
  c.rect(13, 9, 5, 4, '1');
  c.line(12, 15, 22, 13, 'b');
  c.line(6, 6, 3, 28, 'm').poly(
    [
      [2, 26],
      [6, 24],
      [3, 33],
    ],
    'b',
  );
  c.poly(
    [
      [7, 32],
      [12, 30],
      [11, 34],
      [6, 34],
    ],
    '2',
  );
  return c.outline('0').rim('w').g;
}

/** 원본 `enemyBlocker()` — `tf-enemy-02` */
export function enemyBlocker(): SpriteGrid {
  const c = mk(28, 34);
  c.rect(8, 26, 5, 6, '2').rect(16, 26, 5, 6, '2');
  c.rect(6, 32, 8, 2, '3').rect(15, 32, 8, 2, '3');
  c.poly(
    [
      [7, 13],
      [21, 13],
      [23, 26],
      [5, 26],
    ],
    '3',
  );
  c.poly(
    [
      [7, 13],
      [21, 13],
      [22, 18],
      [6, 18],
    ],
    'n',
  );
  c.poly(
    [
      [5, 13],
      [10, 10],
      [9, 17],
      [3, 16],
    ],
    '3',
  );
  c.poly(
    [
      [18, 10],
      [24, 13],
      [24, 18],
      [18, 16],
    ],
    '3',
  );
  c.rect(10, 5, 9, 7, '3').rect(11, 7, 7, 3, '1');
  c.rect(11, 19, 8, 2, 'b');
  c.rect(1, 14, 5, 15, 'm').rect(2, 15, 3, 13, '2').line(2, 20, 4, 20, 'b');
  c.rect(23, 8, 3, 10, 'm').rect(22, 6, 5, 4, 'm');
  return c.outline('0').rim('w').g;
}

/** 원본 `enemyTank()` — `tf-enemy-03` */
export function enemyTank(): SpriteGrid {
  const c = mk(30, 34);
  c.rect(9, 25, 5, 7, '2').rect(18, 25, 5, 7, '2');
  c.rect(7, 32, 9, 2, '3').rect(17, 32, 9, 2, '3');
  c.poly(
    [
      [7, 11],
      [23, 11],
      [26, 26],
      [4, 26],
    ],
    '3',
  );
  c.poly(
    [
      [7, 11],
      [23, 11],
      [24, 17],
      [6, 17],
    ],
    'n',
  );
  c.poly(
    [
      [13, 18],
      [19, 18],
      [16, 24],
    ],
    'b',
  );
  c.rect(11, 4, 9, 8, '3').rect(12, 6, 7, 3, '1');
  c.poly(
    [
      [4, 13],
      [9, 12],
      [8, 20],
      [2, 19],
    ],
    '3',
  );
  c.rect(23, 13, 6, 4, 'm').poly(
    [
      [27, 15],
      [30, 22],
      [24, 24],
      [24, 17],
    ],
    'm',
  );
  c.line(24, 22, 30, 21, 'n');
  return c.outline('0').rim('w').g;
}

/** 원본 `enemyKite()` — `tf-enemy-air-01` */
export function enemyKite(): SpriteGrid {
  const c = mk(36, 22);
  c.poly(
    [
      [16, 1],
      [27, 10],
      [16, 19],
      [5, 10],
    ],
    '2',
  );
  c.line(16, 1, 16, 19, 'm').line(5, 10, 27, 10, 'm');
  c.poly(
    [
      [16, 4],
      [23, 10],
      [16, 16],
      [9, 10],
    ],
    '3',
  );
  c.rect(14, 8, 5, 4, 'w');
  for (let i = 0; i < 4; i++) c.line(16 - i * 4, 19 + 0, 12 - i * 4, 15, i % 2 ? 'b' : 'n');
  c.line(5, 10, 0, 8, 'b');
  return c.outline('0').rim('w').g;
}

/** 원본 `enemySiren()` — `tf-enemy-air-02` */
export function enemySiren(): SpriteGrid {
  const c = mk(36, 24);
  c.rect(14, 6, 8, 7, '3').rect(14, 6, 8, 2, 'n');
  [8, 18, 28].forEach((x, i) => {
    const pts: readonly Point[] = [
      [x - 4, 14 + (i % 2)],
      [x + 4, 14 + (i % 2)],
      [x + 2, 21 + (i % 2)],
      [x - 2, 21 + (i % 2)],
    ];
    c.poly(pts, '2');
    c.rect(x - 1, 11 + (i % 2), 3, 4, 'm');
    c.line(x - 4, 21 + (i % 2), x + 4, 21 + (i % 2), 'b');
  });
  c.rect(12, 3, 12, 2, 'm').rect(17, 1, 3, 3, 'n');
  return c.outline('0').rim('w').g;
}
