/**
 * 배경 스프라이트 — 원본 `bgFar(region)` / `bgMid(region)` 이식.
 * 좌표·색 문자는 원본 그대로다. region 은 파라미터로 남긴다(별칭 키를 얹기 위해).
 */

import { mk, type SpriteGrid } from './grid';
import type { SpriteCell } from './palette';
import type { Region } from './types';

/** 원본 `bgFar(region)` — `tf-bg-r{1,2,3}-far` */
export function bgFar(region: Region): SpriteGrid {
  const c = mk(104, 30);
  c.rect(0, 0, 104, 30, '1');
  const put = (x: number, top: number, bw: number, col: SpriteCell, winCol: SpriteCell | null): void => {
    c.rect(x, top, bw, 26 - top, col);
    if (winCol)
      for (let y = top + 2; y < 26; y += 3)
        for (let px = x + 1; px < x + bw - 1; px += 2) if ((px * 7 + y * 3) % 5 < 2) c.px(px, y, winCol);
  };
  if (region === 1) {
    for (let x = 0; x < 104; x += 2) {
      c.px(x, 19, '2');
      c.px(x + 1, 20, '2');
    }
    c.rect(0, 21, 104, 2, '2');
    const towers: readonly (readonly [number, number, number])[] = [
      [2, 8, 7],
      [10, 4, 6],
      [17, 12, 5],
      [23, 2, 8],
      [32, 9, 6],
      [39, 13, 7],
      [47, 5, 7],
      [55, 11, 6],
      [62, 6, 9],
      [72, 12, 6],
      [79, 9, 7],
      [87, 4, 8],
      [96, 11, 6],
    ];
    towers.forEach((t, i) => put(t[0], t[1], t[2], i % 2 ? '2' : '3', i % 3 === 0 ? 'm' : null));
    c.rect(0, 26, 104, 4, '2');
    for (let i = 0; i < 104; i += 3) c.px(i, 27, '3');
    for (let i = 6; i < 104; i += 16) c.rect(i, 23, 1, 3, '3');
  } else if (region === 2) {
    const blocks: readonly (readonly [number, number, number])[] = [
      [3, 16, 15],
      [20, 14, 12],
      [34, 17, 17],
      [53, 13, 14],
      [69, 18, 13],
      [84, 15, 16],
    ];
    blocks.forEach((t, i) => put(t[0], t[1], t[2], i % 2 ? '2' : '3', 'm'));
    [12, 44, 76].forEach((x) => {
      c.rect(x, 6, 1, 8, '3');
      c.px(x, 5, 'b');
    });
    c.rect(0, 26, 104, 4, '2');
  } else {
    const stacks: readonly (readonly [number, number])[] = [
      [6, 9],
      [26, 6],
      [48, 10],
      [70, 7],
      [92, 11],
    ];
    stacks.forEach((t, i) => {
      c.rect(t[0], t[1], 3, 26 - t[1], i % 2 ? '2' : '3');
      c.rect(t[0] - 1, t[1], 5, 1, '3');
      for (let k = 0; k < 6; k++) c.px(t[0] + 1 + (k % 2), t[1] - 2 - k, '2');
    });
    const masts: readonly (readonly [number, number])[] = [
      [16, 11],
      [40, 8],
      [62, 12],
      [84, 9],
    ];
    masts.forEach((t) => {
      c.rect(t[0], t[1], 2, 26 - t[1], '3');
      c.rect(t[0] - 7, t[1], 16, 1, '3');
      c.rect(t[0] + 6, t[1] + 1, 1, 6, '2');
      c.rect(t[0] + 5, t[1] + 7, 3, 2, '3');
    });
    for (let x = 0; x < 104; x += 2) c.px(x, 22, '2');
    c.rect(0, 26, 104, 4, '2');
  }
  return c.g;
}

/** 원본 `bgMid(region)` — `tf-bg-r{1,2,3}-mid` */
export function bgMid(region: Region): SpriteGrid {
  const c = mk(104, 30);
  c.rect(0, 0, 104, 30, '1');
  c.rect(0, 25, 104, 5, '3');
  if (region === 1) {
    const shops: readonly (readonly [number, number])[] = [
      [2, 22],
      [26, 22],
      [50, 22],
      [74, 22],
    ];
    shops.forEach((t) => {
      const x = t[0];
      c.rect(x, 6, 20, 19, '2');
      c.rect(x, 6, 20, 2, '3');
      for (let px = x + 2; px < x + 19; px += 4) c.rect(px, 9, 2, 14, '3');
      c.rect(x + 3, 11, 14, 6, '1').rect(x + 3, 11, 14, 1, 'm');
      c.rect(x + 1, 23, 18, 2, '3');
    });
    for (let i = 0; i < 104; i += 13) {
      c.rect(i, 14, 1, 11, '3');
      c.rect(i - 1, 13, 3, 1, 'm');
    }
  } else if (region === 2) {
    const towers: readonly (readonly [number, number])[] = [
      [1, 10],
      [27, 8],
      [55, 11],
      [80, 9],
    ];
    towers.forEach((t) => {
      const x = t[0];
      const top = t[1];
      c.rect(x, top, 22, 25 - top, '2').rect(x, top, 22, 2, '3');
      for (let y = top + 3; y < 24; y += 4) c.rect(x + 2, y, 18, 2, '1');
      c.rect(x + 4, top - 2, 6, 2, '3');
    });
    for (let i = 4; i < 104; i += 9) c.rect(i, 22, 3, 3, '2');
  } else {
    c.rect(0, 12, 104, 3, '2').rect(0, 18, 104, 3, '2');
    for (let i = 0; i < 104; i += 12) {
      c.rect(i, 10, 2, 15, '3');
      c.rect(i - 1, 15, 4, 2, 'm');
    }
    [14, 52, 88].forEach((x) => {
      c.rect(x, 4, 14, 7, '2');
      c.rect(x, 4, 14, 1, 'm');
    });
    for (let i = 6; i < 104; i += 22) {
      c.rect(i, 21, 8, 4, '3');
      c.rect(i, 21, 8, 1, 'm');
    }
  }
  return c.g;
}
