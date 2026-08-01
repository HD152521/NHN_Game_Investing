/**
 * 파노라마·스크림 시트 — 원본 `darken` / `stamp` / `stampOn` / `wideScene` / `scrimCompare` 이식.
 *
 * ★ `tf-sky-wide`(852×240) 는 **타일이 아니다.**
 *   원본 주석이 "852x240 ≈ 3840x1080. 유닛 34px = 화면 높이의 14% — 실제 게임 비율" 이라고
 *   못 박고 있고, 내용도 해(0.70W 고정) · 고유 스카이라인 · 기지/타워/유닛/보스를 `stampOn`
 *   으로 박아 넣은 **1장짜리 구도 검증 시트**다. 가로로 반복하면 보스가 여러 마리 나온다.
 *
 * ★ `tf-sky-scrim`(122×40) 도 게임 에셋이 아니라 **비교 시트**다.
 *   왼쪽 60×40 = 원본 씬, 오른쪽 60×40 = `darken(…, 0.5)`, 가운데 2열이 구분선이다.
 *   즉 "반투명 덮개 스프라이트" 가 아니라 **50% 어둡게 굽는 변환의 before/after 견본**이다.
 *   실제 스크림이 필요하면 이 키를 덮어 그리지 말고 `darkenGrid(grid, 0.5)` 를 써라.
 *
 * ★ `stamp` 는 팔레트 문자를 **그 시점에 HEX 로 굽는다**(원본 `this.PAL[v]`). 그래서 파노라마에
 *   박힌 유닛 색은 색약 모드를 따라가지 않는다 — 원본이 그렇게 만들어져 있다. 시트 전용이므로
 *   게임 화면에 쓰지 않는 한 문제가 되지 않는다.
 */

import { BASE_PALETTE, type PaletteToken } from '../design/palette';
import { allyAnchor, allyRookie, allyScout } from './ally';
import { baseAlly, baseEnemy, boss } from './base';
import { enemyBlocker, enemyKite, enemyRusher, enemySiren, enemyTank } from './enemy';
import { mk, type SpriteGrid } from './grid';
import {
  isSceneColor,
  MOOD,
  sceneColor,
  SCRIM_DIVIDER_DARK,
  SCRIM_DIVIDER_LIGHT,
  WIDE_LANE_CAP,
  WIDE_LANE_DASH,
  WIDE_NEAR_CAP,
} from './mood';
import { SPRITE_PALETTE, TRANSPARENT, type SpriteCell } from './palette';
import { scene } from './scene';
import { towerAA, towerBasic, towerSplash } from './tower';

/** 원본 `darken()` 이 색을 끌어당기는 목표 채널(= `PAL['1']` 근처의 야간 바탕). */
const DARKEN_TARGET: readonly [number, number, number] = [7, 10, 18];

/** 원본 `this.PAL` — 팔레트 문자를 굽는 시점의 기본 모드 HEX 로 바꾼다. */
const CHAR_TO_TOKEN = SPRITE_PALETTE as Record<string, PaletteToken | undefined>;

function inkOfChar(cell: SpriteCell): SpriteCell | null {
  const token = CHAR_TO_TOKEN[cell];
  if (token === undefined) return null;
  return BASE_PALETTE[token] as SpriteCell;
}

/** 셀을 실제 HEX 로 해석한다. 이미 생 색이면 그대로, 팔레트 문자면 구워서, 투명이면 `null`. */
function resolveInk(cell: SpriteCell | undefined): SpriteCell | null {
  if (cell === undefined || cell === TRANSPARENT) return null;
  return isSceneColor(cell) ? cell : inkOfChar(cell);
}

/** 원본 `darken(grid, amt)` — 생 색만 어둡게 한다. 출력은 소문자 HEX 다(원본 그대로). */
export function darkenGrid(grid: SpriteGrid, amt: number): SpriteGrid {
  return grid.map((row) =>
    row.map((v) => {
      if (v === TRANSPARENT || !isSceneColor(v)) return v;
      const channels = [0, 1, 2].map((index) => {
        const raw = parseInt(v.slice(1 + index * 2, 3 + index * 2), 16);
        return Math.round(raw * (1 - amt) + (DARKEN_TARGET[index] as number) * amt);
      });
      return sceneColor(channels.map((n) => n.toString(16).padStart(2, '0')).join(''));
    }),
  );
}

/** 원본 `stamp(dst, src, ox, oy, flip, k)` — 최근접 확대 후 목적지 그리드에 직접 찍는다. */
export function stampGrid(
  dst: SpriteGrid,
  src: SpriteGrid,
  ox: number,
  oy: number,
  flip = false,
  k = 1,
): void {
  const h = src.length;
  const w = src[0]?.length ?? 0;
  const oh = Math.round(h * k);
  const ow = Math.round(w * k);
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      const sy = Math.min(h - 1, Math.floor(y / k));
      const sxi = Math.min(w - 1, Math.floor(x / k));
      const col = resolveInk(src[sy]?.[flip ? w - 1 - sxi : sxi]);
      if (col === null) continue;
      const tx = ox + x;
      const ty = oy + y;
      const row = dst[ty];
      if (row !== undefined && tx >= 0 && tx < (dst[0]?.length ?? 0)) row[tx] = col;
    }
  }
}

/** 원본 `stampOn` — `baseY` 가 발밑(baseline), 높이는 배율에서 나온다. */
export function stampOnGrid(
  dst: SpriteGrid,
  src: SpriteGrid,
  cx: number,
  baseY: number,
  k: number,
  flip = false,
): void {
  const oh = Math.round(src.length * k);
  const ow = Math.round((src[0]?.length ?? 0) * k);
  stampGrid(dst, src, Math.round(cx - ow / 2), baseY - oh, flip, k);
}

const WIDE_W = 852;
const WIDE_H = 240;

/** 원본 `wideScene()` — `tf-sky-wide`. 852×240 파노라마 1장. 타일링 금지. */
export function wideScene(): SpriteGrid {
  const m = MOOD.dusk;
  const c = mk(WIDE_W, WIDE_H);
  const skyH = Math.round(WIDE_H * 0.62);
  const bands = m.sky.length;

  for (let y = 0; y < skyH; y++) {
    const f = Math.pow(y / skyH, 0.75) * (bands - 1);
    const i = Math.min(bands - 2, Math.floor(f));
    const t = f - i;
    for (let x = 0; x < WIDE_W; x++) {
      c.px(x, y, (t > ((x + y) % 2 ? 0.65 : 0.35) ? m.sky[i + 1] : m.sky[i]) as SpriteCell);
    }
  }

  c.disc(Math.round(WIDE_W * 0.7), Math.round(skyH * 0.3), 22, m.sun);
  for (let k = 0; k < 7; k++) {
    const yy = 22 + k * 11;
    c.rect(60 + k * 42, yy, 70 - k * 6, 3, m.sky[Math.min(4, 2 + (k % 2))] as SpriteCell);
  }

  const laneTop = WIDE_H - 40;
  const far: (readonly [number, number])[] = [];
  for (let i = 0; i < 34; i++) far.push([i / 34 + 0.004, 0.16 + ((i * 37) % 11) / 55]);
  far.forEach((t, i) => {
    const x = Math.round(t[0] * WIDE_W);
    const bw = 16 + (i % 4) * 4;
    const bh = Math.round(WIDE_H * t[1]);
    c.rect(x, skyH - bh, bw, bh + 8, m.far);
    for (let y = skyH - bh + 5; y < skyH; y += 7)
      for (let px = x + 3; px < x + bw - 2; px += 5) if ((px * 5 + y * 3) % 7 < 4) c.rect(px, y, 2, 3, m.win);
  });

  const mid: readonly (readonly [number, number, number])[] = [
    [0.05, 0.3, 30],
    [0.13, 0.4, 26],
    [0.22, 0.24, 34],
    [0.31, 0.34, 28],
    [0.42, 0.27, 36],
    [0.53, 0.38, 26],
    [0.62, 0.25, 32],
    [0.72, 0.33, 28],
    [0.83, 0.23, 34],
  ];
  mid.forEach((t) => {
    const x = Math.round(t[0] * WIDE_W);
    const bw = t[2];
    const bh = Math.round(WIDE_H * t[1]);
    const ty = skyH - bh;
    c.rect(x, ty, bw, bh + 14, m.mid);
    c.rect(x, ty, bw, 2, m.near);
    for (let y = ty + 7; y < skyH + 8; y += 8)
      for (let px = x + 4; px < x + bw - 3; px += 6)
        c.rect(px, y, 3, 4, (px * 3 + y) % 5 < 2 ? m.win : m.winDim);
  });

  const near: readonly (readonly [number, number, number])[] = [
    [0.0, 0.22, 46],
    [0.09, 0.27, 40],
    [0.19, 0.18, 44],
    [0.76, 0.2, 42],
    [0.86, 0.26, 40],
    [0.95, 0.17, 46],
  ];
  near.forEach((t) => {
    const x = Math.round(t[0] * WIDE_W);
    const bw = t[2];
    const bh = Math.round(WIDE_H * t[1]);
    const ty = laneTop - bh;
    c.rect(x, ty, bw, bh + 10, m.near);
    c.rect(x, ty, bw, 2, WIDE_NEAR_CAP);
    for (let y = ty + 8; y < laneTop - 4; y += 10)
      for (let px = x + 6; px < x + bw - 5; px += 9)
        c.rect(px, y, 4, 6, (px * 7 + y * 5) % 6 < 3 ? m.win : m.winDim);
  });

  c.rect(0, laneTop, WIDE_W, WIDE_H - laneTop, m.gnd);
  c.rect(0, laneTop, WIDE_W, 2, WIDE_LANE_CAP);
  for (let x = 0; x < WIDE_W; x += 14) c.rect(x, laneTop + 12, 6, 2, WIDE_LANE_DASH);

  const g = darkenGrid(c.g, 0.5);
  const base = laneTop + 30;
  stampOnGrid(g, baseAlly(), 52, base, 2.4);
  stampOnGrid(g, baseEnemy(), WIDE_W - 56, base, 2.4);
  stampOnGrid(g, towerBasic(), 170, base, 1.15);
  stampOnGrid(g, towerAA(), 232, base, 1.15);
  stampOnGrid(g, towerSplash(), 296, base, 1.15);
  stampOnGrid(g, allyScout(), 352, base, 1);
  stampOnGrid(g, allyRookie(), 386, base, 1);
  stampOnGrid(g, allyAnchor(), 418, base, 1);
  stampOnGrid(g, enemyRusher(), 480, base, 1, true);
  stampOnGrid(g, enemyBlocker(), 530, base, 1, true);
  stampOnGrid(g, enemyTank(), 588, base, 1, true);
  stampOnGrid(g, enemyKite(), 520, base - 96, 1, true);
  stampOnGrid(g, enemySiren(), 640, base - 108, 1, true);
  stampOnGrid(g, boss(), 706, base, 1.5, true);
  return g;
}

/** 원본 `scrimCompare()` — `tf-sky-scrim`. 좌: 원본 / 우: 50% 스크림 / 중앙 2열: 구분선. */
export function scrimCompare(): SpriteGrid {
  const src = scene('dusk', 60, 40);
  const dark = darkenGrid(src, 0.5);
  const out = mk(122, 40);
  src.forEach((row, y) =>
    row.forEach((v, x) => {
      if (v !== TRANSPARENT) out.px(x, y, v);
    }),
  );
  dark.forEach((row, y) =>
    row.forEach((v, x) => {
      if (v !== TRANSPARENT) out.px(x + 62, y, v);
    }),
  );
  for (let y = 0; y < 40; y++) out.px(60, y, SCRIM_DIVIDER_LIGHT).px(61, y, SCRIM_DIVIDER_DARK);
  return out.g;
}
