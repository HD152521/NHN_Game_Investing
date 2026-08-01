/**
 * UI 스프라이트 — 원본 `uiChart()` / `uiButtons()` / `uiIcons()` / `uiReveal()` 이식.
 * 좌표·색 문자는 원본 그대로다. (시트 09 원칙: 프레임만 그리고 글자는 코드에서 얹는다.)
 */

import { mk, type Point, type SpriteGrid } from './grid';

/** 원본 `uiChart()` — `tf-ui-chart` */
export function uiChart(): SpriteGrid {
  const c = mk(80, 30);
  c.rect(0, 0, 80, 30, '2');
  c.rect(0, 0, 80, 1, 'm').rect(0, 29, 80, 1, 'm').rect(0, 0, 1, 30, 'm').rect(79, 0, 1, 30, 'm');
  c.rect(0, 0, 80, 4, '3').rect(0, 4, 80, 1, 'm');
  const corners: readonly Point[] = [
    [0, 0],
    [76, 0],
    [0, 26],
    [76, 26],
  ];
  corners.forEach((pt) => {
    c.rect(pt[0], pt[1], 4, 1, 'w');
    c.rect(pt[0] + (pt[0] ? 3 : 0), pt[1], 1, 4, 'w');
  });
  for (let y = 8; y < 28; y += 4) c.rect(1, y, 2, 1, 'm');
  for (let x = 6; x < 78; x += 6) c.rect(x, 27, 1, 2, 'm');
  return c.g;
}

/** 원본 `uiButtons()` — `tf-ui-btn` (상승/하락 예측 버튼) */
export function uiButtons(): SpriteGrid {
  const c = mk(40, 34);
  c.rect(0, 0, 40, 34, '1');
  c.poly(
    [
      [2, 2],
      [37, 2],
      [39, 14],
      [4, 14],
    ],
    'r',
  );
  c.poly(
    [
      [16, 5],
      [24, 11],
      [8, 11],
    ],
    'w',
  );
  c.poly(
    [
      [2, 19],
      [37, 19],
      [39, 31],
      [4, 31],
    ],
    'b',
  );
  c.poly(
    [
      [16, 28],
      [8, 22],
      [24, 22],
    ],
    'w',
  );
  return c.outline('0').g;
}

/** 원본 `uiIcons()` — `tf-ui-icons` (3×2 아이콘 시트) */
export function uiIcons(): SpriteGrid {
  const c = mk(54, 34);
  c.rect(0, 0, 54, 34, '1');
  const cx: readonly [number, number, number] = [9, 27, 45];
  const cy: readonly [number, number] = [9, 25];
  c.disc(cx[0], cy[0], 4, 'g').rect(cx[0] - 4, cy[0] + 2, 9, 2, 'g');
  c.rect(cx[1] - 5, cy[0] - 3, 11, 8, 'p')
    .rect(cx[1] - 2, cy[0] - 5, 5, 2, 'p')
    .poly(
      [
        [cx[1], cy[0] - 1],
        [cx[1] + 3, cy[0] + 2],
        [cx[1] - 3, cy[0] + 2],
      ],
      '1',
    );
  c.poly(
    [
      [cx[2] - 5, cy[0] - 5],
      [cx[2] + 5, cy[0] - 5],
      [cx[2], cy[0] + 5],
    ],
    'r',
  ).rect(cx[2] - 2, cy[0] - 3, 4, 5, '1');
  c.poly(
    [
      [cx[0] + 4, cy[1] - 4],
      [cx[0] - 4, cy[1]],
      [cx[0] + 4, cy[1] + 4],
      [cx[0] + 1, cy[1]],
    ],
    'b',
  );
  for (let a = 0; a < 16; a++) {
    const t = (a / 16) * Math.PI * 2;
    c.px(cx[1] + Math.cos(t) * 5, cy[1] + Math.sin(t) * 5, 'w');
  }
  c.rect(cx[1] - 6, cy[1], 13, 1, 'w').rect(cx[1], cy[1] - 6, 1, 13, 'w');
  c.disc(cx[2], cy[1], 4, 'm').rect(cx[2] - 1, cy[1] - 4, 2, 8, '1');
  return c.g;
}

/** 원본 `uiReveal()` — `tf-ui-reveal` (공개 연출 배경) */
export function uiReveal(): SpriteGrid {
  const c = mk(80, 44);
  c.rect(0, 0, 80, 44, '1');
  for (let x = 4; x < 78; x += 6) {
    const top = 14 + ((x * 5) % 11);
    const len = 6 + ((x * 3) % 9);
    c.rect(x, top, 3, len, '2');
    c.rect(x + 1, top - 2, 1, len + 4, '2');
  }
  for (let a = 0; a < 24; a++) {
    const t = (a / 24) * Math.PI * 2;
    c.px(40 + Math.cos(t) * 9, 22 + Math.sin(t) * 6, 'g');
  }
  c.rect(26, 21, 28, 1, 'g').rect(38, 12, 4, 1, 'g').rect(38, 31, 4, 1, 'g');
  const dots: readonly Point[] = [
    [12, 8],
    [66, 10],
    [18, 36],
    [62, 34],
  ];
  dots.forEach((pt) => c.px(pt[0], pt[1], 'm'));
  return c.g;
}
