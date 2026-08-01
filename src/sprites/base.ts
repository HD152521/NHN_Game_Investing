/**
 * 기지·보스 스프라이트 — 원본 `baseAlly()` / `baseEnemy()` / `boss()` 이식.
 * 좌표·색 문자는 원본 그대로다.
 */

import { mk, type SpriteGrid } from './grid';

/** 원본 `baseAlly()` — `tf-base-ally` */
export function baseAlly(): SpriteGrid {
  const c = mk(76, 40);
  /** 원본 `st` — [x, top, bw] 4개 동 */
  const st: readonly (readonly [number, number, number])[] = [
    [3, 30, 12],
    [20, 22, 13],
    [38, 12, 14],
    [58, 3, 15],
  ];
  st.forEach((s, i) => {
    const x = s[0];
    const top = s[1];
    const bw = s[2];
    c.rect(x, top, bw, 37 - top, '3');
    c.rect(x, top, bw, 2, '2');
    for (let y = top + 3; y < 36; y += 4)
      for (let px = x + 2; px < x + bw - 1; px += 3) c.px(px, y, (px + y) % 2 ? 'w' : 'm');
    c.rect(x, 34, bw, 3, '2');
    c.rect(x + 1, 33, bw - 2, 1, 'r');
    if (i === 3) {
      c.rect(x + 6, top - 3, 2, 3, 'm');
      c.rect(x + 4, top - 5, 6, 2, 'r');
    }
    if (i >= 2) c.rect(x + 2, top - 2, 1, 2, 'm');
  });
  c.rect(0, 37, 76, 3, '2');
  return c.outline('0').rim('w').g;
}

/** 원본 `baseEnemy()` — `tf-base-enemy` */
export function baseEnemy(): SpriteGrid {
  const c = mk(30, 44);
  c.poly(
    [
      [3, 14],
      [9, 8],
      [14, 13],
      [20, 6],
      [27, 16],
      [27, 40],
      [3, 40],
    ],
    '3',
  );
  c.poly(
    [
      [3, 14],
      [9, 8],
      [14, 13],
      [20, 6],
      [27, 16],
      [27, 22],
      [3, 22],
    ],
    '2',
  );
  c.rect(10, 28, 12, 12, 'n');
  c.disc(16, 34, 4, '3').disc(16, 34, 2, 'b');
  for (let y = 18; y < 28; y += 4) for (let x = 5; x < 26; x += 5) c.rect(x, y, 2, 2, '1');
  c.line(4, 24, 26, 24, 'b');
  c.poly(
    [
      [13, 12],
      [19, 12],
      [16, 20],
    ],
    'b',
  );
  c.rect(0, 40, 30, 4, '2');
  return c.outline('0').rim('w').g;
}

/** 원본 `boss()` — `tf-boss` */
export function boss(): SpriteGrid {
  const c = mk(34, 46);
  c.rect(10, 34, 6, 9, '2').rect(19, 34, 6, 9, '2');
  c.rect(8, 43, 9, 3, '3').rect(18, 43, 9, 3, '3');
  c.poly(
    [
      [7, 14],
      [26, 14],
      [30, 40],
      [4, 40],
    ],
    '3',
  );
  c.poly(
    [
      [7, 14],
      [26, 14],
      [28, 24],
      [5, 24],
    ],
    '2',
  );
  c.poly(
    [
      [10, 6],
      [24, 6],
      [26, 14],
      [8, 14],
    ],
    '3',
  );
  c.rect(11, 9, 12, 3, '1');
  c.poly(
    [
      [8, 10],
      [3, 4],
      [10, 3],
    ],
    'n',
  ).poly(
    [
      [25, 10],
      [31, 4],
      [24, 3],
    ],
    'n',
  );
  c.poly(
    [
      [15, 26],
      [21, 26],
      [18, 34],
    ],
    'b',
  );
  c.poly(
    [
      [28, 18],
      [34, 22],
      [30, 40],
      [26, 34],
    ],
    'm',
  );
  c.line(27, 24, 33, 26, 'b').line(27, 30, 31, 33, 'b');
  c.rect(1, 20, 6, 7, 'm').rect(2, 21, 4, 5, 'n');
  return c.outline('0').rim('w').g;
}
