/**
 * 그리드 드로잉 프리미티브 — 원본 `ticker-front-sprites.js` 의 `mk(w, h)` 이식.
 *
 * ★ 재해석 금지: 반올림·경계·스캔라인 규칙을 원본 그대로 옮긴다.
 *   - `px` 는 `Math.round` 후 경계 검사
 *   - `disc` 의 반경 판정은 `r*r + r*0.45` (정확한 원이 아님 — 원본 그대로)
 *   - `poly` 는 짝수쌍 스캔라인 채우기
 *   - `rim` 은 `y = 1` 부터 시작하고 `'0'`(외곽선)·자기 색을 제외
 *
 * DOM 의존은 원본에도 없었다. 클래스 대신 순수 함수 모듈로 옮긴다.
 */

import { TRANSPARENT, type SpriteCell } from './palette';

/** 문자 그리드. `grid[y][x]` 순서다. */
export type SpriteGrid = SpriteCell[][];

/** 폴리곤 꼭짓점. 원본은 `[x, y]` 2원소 배열이다. */
export type Point = readonly [number, number];

export interface GridBuilder {
  readonly w: number;
  readonly h: number;
  readonly g: SpriteGrid;
  px(x: number, y: number, c: SpriteCell): GridBuilder;
  rect(x: number, y: number, rw: number, rh: number, c: SpriteCell): GridBuilder;
  disc(cx: number, cy: number, r: number, c: SpriteCell): GridBuilder;
  poly(pts: readonly Point[], c: SpriteCell): GridBuilder;
  line(x0: number, y0: number, x1: number, y1: number, c: SpriteCell): GridBuilder;
  outline(c: SpriteCell): GridBuilder;
  rim(c: SpriteCell): GridBuilder;
}

/** 복사본에서 셀을 읽는다. 범위 밖은 `undefined`(원본의 `inb` 검사와 동치). */
function cellOf(grid: readonly (readonly SpriteCell[])[], x: number, y: number): SpriteCell | undefined {
  return grid[y]?.[x];
}

const NEIGHBOURS: readonly Point[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** 원본 `mk(w, h)`. 체이닝 가능한 드로잉 API 를 돌려준다. */
export function mk(w: number, h: number): GridBuilder {
  const g: SpriteGrid = Array.from({ length: h }, () => new Array<SpriteCell>(w).fill(TRANSPARENT));
  const inb = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h;
  const put = (x: number, y: number, c: SpriteCell): void => {
    const row = g[y];
    if (row) row[x] = c;
  };

  const api: GridBuilder = {
    w,
    h,
    g,

    px(x, y, c) {
      const rx = Math.round(x);
      const ry = Math.round(y);
      if (inb(rx, ry)) put(rx, ry, c);
      return api;
    },

    rect(x, y, rw, rh, c) {
      for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) api.px(x + i, y + j, c);
      return api;
    },

    disc(cx, cy, r, c) {
      // 원본 그대로: 반경 판정에 r*0.45 여유를 더한다.
      for (let j = -r; j <= r; j++)
        for (let i = -r; i <= r; i++) if (i * i + j * j <= r * r + r * 0.45) api.px(cx + i, cy + j, c);
      return api;
    },

    poly(pts, c) {
      const ys = pts.map((p) => p[1]);
      const y0 = Math.floor(Math.min(...ys));
      const y1 = Math.ceil(Math.max(...ys));
      for (let y = y0; y <= y1; y++) {
        const xs: number[] = [];
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i] as Point;
          const bb = pts[(i + 1) % pts.length] as Point;
          if ((a[1] <= y && bb[1] > y) || (bb[1] <= y && a[1] > y)) {
            xs.push(a[0] + ((y - a[1]) / (bb[1] - a[1])) * (bb[0] - a[0]));
          }
        }
        xs.sort((u, v) => u - v);
        for (let k = 0; k + 1 < xs.length; k += 2) {
          for (let x = Math.round(xs[k] as number); x <= Math.round(xs[k + 1] as number); x++) api.px(x, y, c);
        }
      }
      return api;
    },

    line(x0, y0, x1, y1, c) {
      const st = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
      for (let i = 0; i <= st; i++) api.px(x0 + ((x1 - x0) * i) / st, y0 + ((y1 - y0) * i) / st, c);
      return api;
    },

    outline(c) {
      const cp = g.map((r) => r.slice());
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          if (cellOf(cp, x, y) !== TRANSPARENT) continue;
          const touching = NEIGHBOURS.some((d) => {
            const v = cellOf(cp, x + d[0], y + d[1]);
            return v !== undefined && v !== TRANSPARENT;
          });
          if (touching) put(x, y, c);
        }
      return api;
    },

    rim(c) {
      const cp = g.map((r) => r.slice());
      for (let y = 1; y < h; y++)
        for (let x = 0; x < w; x++) {
          const v = cellOf(cp, x, y);
          if (v === undefined || v === TRANSPARENT || v === '0' || v === c) continue;
          const up = cellOf(cp, x, y - 1);
          if (up === TRANSPARENT || up === '0') put(x, y, c);
        }
      return api;
    },
  };

  return api;
}
