/**
 * 시간대·날씨 씬 — 원본 `ticker-front-sprites.js` 의 `scene(key, w, h, opts)` 이식.
 *
 * ★ 재해석 금지: 반올림·루프 간격·비율 상수를 원본 그대로 옮긴다.
 *   - 하늘 그라데이션은 `(x + y) % 2` 디더 임계 0.35 / 0.65
 *   - 지면 밴드는 `h * 0.10`, 하늘 높이는 `h * 0.62` (둘 다 `Math.round`)
 *   - 황사 헤이즈의 밴드 인덱스는 `(2 + y * 3 / h) | 0` — `|` 가 `+` 보다 낮은 우선순위라
 *     **덧셈 전체가 절삭**된다. 괄호를 바꾸면 그림이 달라진다.
 *
 * `tf-sky-*`(116×62 · 100×56) 와 `tf-r{1,2,3}-*`(108×56) 는 전부 이 함수의 별칭이다.
 * 원본 키에 없는 조합(예: R2 의 새벽)도 여기서 바로 만들 수 있다.
 */

import { mk, type SpriteGrid } from './grid';
import { MOOD, RAIN_STREAK, SNOW_FLAKE, type Mood, type MoodKey } from './mood';
import type { SpriteCell } from './palette';
import type { Region } from './types';

/** 원본 `scene()` 의 세 번째 인자. 전부 선택이다. */
export interface SceneOptions {
  /** 실루엣 레이아웃 지역. 기본 1. */
  readonly region?: Region;
  /** 사선 빗줄기. */
  readonly rain?: boolean;
  /** 눈송이 점 뿌리기. */
  readonly snowFall?: boolean;
  /** 황사 헤이즈(대각선 격자). */
  readonly haze?: boolean;
}

/** 원경 실루엣 — `[x비율, 높이비율]`. */
type FarTower = readonly [number, number];
/** 중경·근경 실루엣 — `[x비율, 높이비율, 폭비율]`. */
type Block = readonly [number, number, number];

interface Layout {
  readonly far: readonly FarTower[];
  readonly mid: readonly Block[];
  readonly near: readonly Block[];
}

/** 원본 `LAY` — 지역별 실루엣 배치. 좌표는 폭·높이 대비 비율이다. */
const LAYOUTS = {
  1: {
    far: [
      [0.02, 0.3],
      [0.09, 0.42],
      [0.16, 0.24],
      [0.24, 0.48],
      [0.62, 0.26],
      [0.7, 0.4],
      [0.78, 0.2],
      [0.87, 0.35],
      [0.94, 0.28],
    ],
    mid: [
      [0.3, 0.52, 0.08],
      [0.39, 0.66, 0.07],
      [0.47, 0.44, 0.09],
      [0.56, 0.58, 0.06],
    ],
    near: [
      [-0.01, 0.36, 0.13],
      [0.11, 0.46, 0.1],
      [0.2, 0.3, 0.12],
      [0.63, 0.34, 0.14],
      [0.76, 0.42, 0.11],
      [0.88, 0.28, 0.14],
    ],
  },
  2: {
    far: [
      [0.04, 0.16],
      [0.14, 0.22],
      [0.26, 0.14],
      [0.66, 0.18],
      [0.78, 0.13],
      [0.9, 0.2],
    ],
    mid: [
      [0.3, 0.26, 0.13],
      [0.45, 0.2, 0.15],
      [0.6, 0.28, 0.12],
    ],
    near: [
      [0.0, 0.2, 0.18],
      [0.18, 0.26, 0.16],
      [0.66, 0.22, 0.17],
      [0.86, 0.18, 0.18],
    ],
  },
  3: {
    far: [
      [0.03, 0.34],
      [0.13, 0.26],
      [0.7, 0.3],
      [0.84, 0.24],
      [0.94, 0.34],
    ],
    mid: [
      [0.32, 0.3, 0.1],
      [0.46, 0.24, 0.12],
      [0.58, 0.34, 0.09],
    ],
    near: [
      [0.0, 0.24, 0.16],
      [0.16, 0.3, 0.14],
      [0.68, 0.26, 0.16],
      [0.88, 0.22, 0.16],
    ],
  },
} as const satisfies Record<Region, Layout>;

/** 하늘 높이 비율 — 원본 `Math.round(h * 0.62)`. */
const SKY_RATIO = 0.62;
/** 지면 밴드 높이 비율 — 원본 `Math.round(h * 0.10)`. */
const GROUND_RATIO = 0.1;

/** 하늘 그라데이션 5단을 디더링해서 칠한다. */
function paintSky(c: ReturnType<typeof mk>, m: Mood, w: number, skyH: number): void {
  const bands = m.sky.length;
  for (let y = 0; y < skyH; y++) {
    const f = (y / skyH) * (bands - 1);
    const i = Math.min(bands - 2, Math.floor(f));
    const t = f - i;
    for (let x = 0; x < w; x++) {
      const dith = (x + y) % 2 === 0 ? 0.35 : 0.65;
      c.px(x, y, (t > dith ? m.sky[i + 1] : m.sky[i]) as SpriteCell);
    }
  }
}

/** 해 또는 달. 달은 초승달을 만들려고 하늘색 원을 겹쳐 판다. */
function paintCelestial(c: ReturnType<typeof mk>, m: Mood, w: number, h: number, skyH: number): void {
  if (m.sun) {
    c.disc(Math.round(w * 0.74), Math.round(skyH * 0.34), Math.round(h * 0.11), m.sun);
  }
  if (m.moon) {
    const sx = Math.round(w * 0.78);
    const sy = Math.round(skyH * 0.28);
    const r = Math.round(h * 0.07);
    c.disc(sx, sy, r, m.moon);
    c.disc(sx + Math.round(r * 0.6), sy - Math.round(r * 0.35), r, m.sky[1] as SpriteCell);
  }
}

/** 지역별 소품 — R1 가로등 / R2 안테나 / R3 크레인·굴뚝. */
function paintRegionProps(c: ReturnType<typeof mk>, m: Mood, w: number, h: number, skyH: number, region: Region): void {
  if (region === 1) {
    const posts: readonly (readonly [number, number])[] = [
      [0.34, 0.72],
      [0.52, 0.78],
    ];
    posts.forEach((t) => {
      const x = Math.round(t[0] * w);
      c.rect(x, Math.round(skyH * (1 - t[1])) - 6, 1, 8, m.near);
    });
    return;
  }
  if (region === 2) {
    for (let i = 0; i < 4; i++) {
      const x = Math.round(w * (0.24 + i * 0.14));
      c.rect(x, Math.round(skyH * 0.42), 1, Math.round(h * 0.1), m.mid);
      c.px(x, Math.round(skyH * 0.42) - 1, m.win);
    }
    return;
  }
  const cranes: readonly (readonly [number, number])[] = [
    [0.24, 0.4],
    [0.4, 0.46],
    [0.54, 0.38],
  ];
  cranes.forEach((t) => {
    const x = Math.round(t[0] * w);
    const ty = skyH - Math.round(h * t[1]);
    c.rect(x, ty, 2, Math.round(h * t[1]) + 4, m.mid);
    c.rect(x - Math.round(w * 0.05), ty, Math.round(w * 0.11), 2, m.mid);
    c.rect(x + Math.round(w * 0.045), ty + 2, 1, Math.round(h * 0.1), m.mid);
    c.rect(x + Math.round(w * 0.035), ty + 2 + Math.round(h * 0.1), 3, 3, m.near);
  });
  const stacks: readonly (readonly [number, number])[] = [
    [0.18, 0.3],
    [0.64, 0.34],
  ];
  stacks.forEach((t) => {
    const x = Math.round(t[0] * w);
    const ty = skyH - Math.round(h * t[1]);
    c.rect(x, ty, 3, Math.round(h * t[1]) + 4, m.near);
    c.rect(x - 1, ty, 5, 2, m.mid);
    for (let k = 0; k < 5; k++) c.px(x + 1 + (k % 2), ty - 3 - k * 2, m.sky[Math.min(4, 3 + (k % 2))] as SpriteCell);
  });
}

/** 비·눈·황사 오버레이. 원본에서 씬 마지막에 얹힌다. */
function paintOverlay(c: ReturnType<typeof mk>, m: Mood, w: number, h: number, o: SceneOptions): void {
  if (o.rain) {
    for (let i = -12; i < w + 12; i += 4) {
      const bright = ((i / 4) | 0) % 3;
      c.line(i, 0, i - Math.round(h * 0.22), h, RAIN_STREAK[bright ? 1 : 0] as SpriteCell);
    }
  }
  if (o.snowFall) {
    for (let i = 0; i < w; i += 5) for (let j = (i * 3) % 7; j < h - 3; j += 9) c.px(i + (j % 3), j, SNOW_FLAKE);
  }
  if (o.haze) {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if ((x + y * 2) % 5 === 0) c.px(x, y, m.sky[Math.min(4, (2 + (y * 3) / h) | 0)] as SpriteCell);
  }
}

/** 원본 `scene(key, w, h, opts)`. `tf-sky-*` · `tf-r{1,2,3}-*` 는 전부 이 함수의 별칭이다. */
export function scene(key: MoodKey, w: number, h: number, opts: SceneOptions = {}): SpriteGrid {
  const m: Mood = MOOD[key];
  const c = mk(w, h);
  const skyH = Math.round(h * SKY_RATIO);
  const groundH = Math.round(h * GROUND_RATIO);

  paintSky(c, m, w, skyH);
  paintCelestial(c, m, w, h, skyH);

  const region: Region = opts.region ?? 1;
  const lay: Layout = LAYOUTS[region];

  if (m.far) {
    const far = m.far;
    lay.far.forEach((t) => {
      const x = Math.round(t[0] * w);
      const bw = Math.round(w * (region === 2 ? 0.09 : 0.06));
      const bh = Math.round(h * t[1]);
      c.rect(x, skyH - bh, bw, bh + 4, far);
      for (let y = skyH - bh + 3; y < skyH; y += 3)
        for (let px = x + 1; px < x + bw - 1; px += 2) if ((px * 5 + y * 3) % 7 < 3) c.px(px, y, m.win);
    });
  }

  lay.mid.forEach((t) => {
    const x = Math.round(t[0] * w);
    const bw = Math.round(t[2] * w);
    const bh = Math.round(h * t[1]);
    c.rect(x, skyH - bh, bw, bh + 5, m.mid);
    c.rect(x, skyH - bh, bw, 1, m.near);
    if (m.snow) c.rect(x, skyH - bh - 1, bw, 1, m.snow);
    for (let y = skyH - bh + 3; y < skyH + 3; y += 3)
      for (let px = x + 1; px < x + bw - 1; px += 2) c.px(px, y, (px * 3 + y) % 5 < 2 ? m.win : m.winDim);
  });

  paintRegionProps(c, m, w, h, skyH, region);

  lay.near.forEach((t) => {
    const x = Math.round(t[0] * w);
    const bw = Math.round(t[2] * w);
    const bh = Math.round(h * t[1]);
    const ty = h - groundH - bh;
    c.rect(x, ty, bw, bh + groundH, m.near);
    if (m.snow) c.rect(x, ty - 1, bw, 1, m.snow);
    for (let y = ty + 3; y < h - groundH; y += 4)
      for (let px = x + 2; px < x + bw - 2; px += 3)
        c.rect(px, y, 2, 2, (px * 7 + y * 5) % 6 < 3 ? m.win : m.winDim);
  });

  if (region === 1) {
    const by = h - groundH;
    c.rect(0, by - 3, w, 1, m.mid);
    for (let i = 4; i < w; i += 9) c.rect(i, by - 6, 1, 3, m.mid);
  }

  c.rect(0, h - groundH, w, groundH + 2, m.gnd);
  if (m.snow) c.rect(0, h - groundH, w, 2, m.snow);

  paintOverlay(c, m, w, h, opts);
  return c.g;
}
