/**
 * 날씨 스프라이트 — 원본 `weather(kind)` 이식. 좌표·색 문자는 원본 그대로다.
 * kind 1 폭우(청) / 2 폭등장세(적) / 3 안개 / 4 스캔라인.
 */

import { mk, type SpriteGrid } from './grid';
import type { WeatherKind } from './types';

/** 원본 `weather(kind)` — `tf-wx-01~04` */
export function weather(kind: WeatherKind): SpriteGrid {
  const c = mk(80, 44);
  c.rect(0, 0, 80, 44, '1');
  if (kind === 1) {
    for (let i = -10; i < 90; i += 5) c.line(i, 0, i - 7, 30, ((i / 5) | 0) % 3 ? 'n' : 'b');
    for (let i = 4; i < 80; i += 11)
      c.poly(
        [
          [i, 6],
          [i + 3, 10],
          [i, 16],
          [i - 3, 10],
        ],
        'b',
      );
    for (let x = 0; x < 80; x++) {
      c.px(x, 0, '0');
      c.px(x, 43, '0');
    }
    for (let y = 0; y < 44; y++) {
      c.rect(0, y, 3, 1, '0');
      c.rect(77, y, 3, 1, '0');
    }
    c.line(2, 12, 40, 26, 'n').line(40, 26, 78, 38, 'n');
  } else if (kind === 2) {
    for (let i = -6; i < 90; i += 5) c.line(i, 44, i + 6, 14, ((i / 5) | 0) % 3 ? 'd' : 'r');
    for (let i = 6; i < 80; i += 9)
      c.poly(
        [
          [i, 30 - (i % 7)],
          [i + 2, 34 - (i % 7)],
          [i - 2, 34 - (i % 7)],
        ],
        'r',
      );
    c.rect(0, 41, 80, 3, 'd');
    c.line(2, 34, 40, 22, 'd').line(40, 22, 78, 8, 'd');
  } else if (kind === 3) {
    c.rect(0, 26, 80, 5, '2').rect(0, 33, 80, 4, '3');
    for (let i = 0; i < 80; i += 3) {
      c.px(i, 25, '2');
      c.px(i + 1, 32, '3');
    }
    for (let i = 0; i < 80; i += 6) c.rect(i, 38, 4, 2, '2');
    c.rect(0, 20, 80, 1, '2');
  } else {
    for (let y = 0; y < 44; y += 2) c.rect(0, y, 80, 1, '0');
    c.rect(0, 12, 80, 3, 'm').rect(0, 30, 80, 2, 'm');
    c.rect(0, 15, 80, 1, 'w');
    for (let i = 0; i < 80; i += 7) c.px(i, 31, 'w');
  }
  return c.g;
}
