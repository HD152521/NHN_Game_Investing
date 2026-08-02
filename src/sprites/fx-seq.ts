/**
 * 스킬 이펙트 5프레임 시퀀스 — 원본 `fxBomb` / `fxHeal` / `fxShield` / `fxSeq` /
 * `ringPx` / `fxScreen` 이식. 좌표·색 문자는 원본 그대로다(재해석 금지).
 *
 * `fx(kind)`(`src/sprites/fx.ts`, `tf-fx-01~03`) 가 **한 장짜리 대표 그림**이라면
 * 이쪽은 같은 스킬의 **시간 전개**다: 예고 → 섬광 → 파편링 → 확산 → 잔재.
 */

import { mk, type GridBuilder, type Point, type SpriteGrid } from './grid';
import type { SpriteCell } from './palette';
import { strip, FX_SEQ_STRIP_GAP } from './strip';
import type { FxKind } from './types';

/** 5프레임 시퀀스의 프레임 번호. */
export type FxFrame = 0 | 1 | 2 | 3 | 4;

/** 프레임 번호 목록. 스트립 빌더가 이 순서로 늘어놓는다. */
export const FX_FRAMES: readonly FxFrame[] = [0, 1, 2, 3, 4];

/**
 * 원본 `ringPx(c, cx, cy, r, sq, col, step)` — 타원 링을 점으로 찍는다.
 * `sq` 는 세로 눌림비, `step` 은 "몇 개 중 하나만 찍기"(생략하면 전부).
 */
export function ringPx(
  c: GridBuilder,
  cx: number,
  cy: number,
  r: number,
  sq: number,
  col: SpriteCell,
  step = 0,
): void {
  const n = Math.max(12, Math.round(r * 5));
  for (let a = 0; a < n; a++) {
    if (step && a % step) continue;
    const t = (a / n) * Math.PI * 2;
    c.px(cx + Math.cos(t) * r, cy + Math.sin(t) * r * sq, col);
  }
}

/** S-01 공시 폭탄: 예고 → 섬광 → 파편링 → 확산 → 잔재. */
export function fxBomb(f: FxFrame): SpriteGrid {
  const c = mk(44, 40);
  c.rect(0, 0, 44, 40, '1');
  const cx = 22;
  const cy = 22;

  if (f === 0) {
    ringPx(c, cx, cy, 13, 0.42, 'g', 3);
    c.rect(cx - 1, 2, 2, 12, 'g');
    c.poly(
      [
        [cx, 15],
        [cx + 3, 11],
        [cx - 3, 11],
      ],
      'w',
    );
  } else if (f === 1) {
    c.disc(cx, cy, 9, 'w');
    ringPx(c, cx, cy, 12, 0.5, 'g');
    for (let a = 0; a < 8; a++) {
      const t = (a / 8) * Math.PI * 2;
      c.line(cx + Math.cos(t) * 10, cy + Math.sin(t) * 5, cx + Math.cos(t) * 20, cy + Math.sin(t) * 11, 'g');
    }
  } else if (f === 2) {
    c.disc(cx, cy, 5, 'g');
    ringPx(c, cx, cy, 11, 0.45, 'w');
    ringPx(c, cx, cy, 17, 0.45, 'g', 2);
    for (let a = 0; a < 12; a++) {
      const t = (a / 12) * Math.PI * 2 + 0.2;
      c.rect(cx + Math.cos(t) * 19, cy + Math.sin(t) * 9, 2, 2, a % 2 ? 'w' : 'm');
    }
  } else if (f === 3) {
    c.disc(cx, cy, 2, 'g');
    ringPx(c, cx, cy, 20, 0.42, 'g', 2);
    for (let a = 0; a < 10; a++) {
      const t = (a / 10) * Math.PI * 2 + 0.5;
      c.rect(cx + Math.cos(t) * 15 - (a % 3), cy + Math.sin(t) * 8, 3, 2, 'm');
    }
    c.rect(2, 34, 40, 1, 'g');
  } else {
    for (let a = 0; a < 9; a++) {
      const t = (a / 9) * Math.PI * 2;
      c.rect(cx + Math.cos(t) * 13, cy + Math.sin(t) * 7 + 3 + (a % 3), 3, 2, 'm');
    }
    ringPx(c, cx, cy, 23, 0.4, 'm', 4);
  }
  return c.g;
}

/** S-02 배당 살포: 낙하 → 착지링 → 상승 입자 → 흡수 → 잔광. */
export function fxHeal(f: FxFrame): SpriteGrid {
  const c = mk(44, 40);
  c.rect(0, 0, 44, 40, '1');
  const cx = 22;
  const gy = 31;

  const sparkle = (pts: readonly Point[], col: SpriteCell): void => {
    pts.forEach((p) =>
      c.poly(
        [
          [p[0], p[1]],
          [p[0] + 2, p[1] + 4],
          [p[0] - 2, p[1] + 4],
        ],
        col,
      ),
    );
  };

  if (f === 0) {
    for (let i = 0; i < 5; i++) c.rect(8 + i * 7, 2 + (i % 3) * 3, 2, 6, 'd');
    c.rect(cx - 1, 1, 2, 14, 'r');
    ringPx(c, cx, gy, 12, 0.3, 'd', 4);
  } else if (f === 1) {
    ringPx(c, cx, gy, 8, 0.32, 'w');
    ringPx(c, cx, gy, 14, 0.32, 'r');
    for (let i = 0; i < 5; i++) c.rect(8 + i * 7, 12 + (i % 3) * 3, 2, 5, 'r');
  } else if (f === 2) {
    [9, 14, 19].forEach((r, i) => ringPx(c, cx, gy - i * 2, r, 0.32, i === 1 ? 'r' : 'd', i ? 2 : 1));
    sparkle(
      [
        [11, 22],
        [18, 17],
        [26, 20],
        [33, 24],
      ],
      'r',
    );
  } else if (f === 3) {
    ringPx(c, cx, gy, 18, 0.3, 'd', 2);
    sparkle(
      [
        [10, 14],
        [17, 8],
        [25, 12],
        [32, 16],
        [21, 5],
      ],
      'r',
    );
    c.rect(cx - 6, gy, 13, 1, 'w');
  } else {
    (
      [
        [16, 6],
        [24, 9],
        [30, 5],
      ] as readonly Point[]
    ).forEach((p) => c.px(p[0], p[1], 'r'));
    ringPx(c, cx, gy, 21, 0.28, 'd', 5);
    c.rect(cx - 9, gy + 1, 19, 1, 'd');
  }
  return c.g;
}

/** S-03 실드: 스파크 → 격자 전개 → 완성 → 피격 파문 → 소멸. */
export function fxShield(f: FxFrame): SpriteGrid {
  const c = mk(44, 40);
  c.rect(0, 0, 44, 40, '1');
  const cx = 22;
  const gy = 34;
  const R = 17;

  const dome = (r: number, col: SpriteCell, step = 0): void => {
    const n = 40;
    for (let a = 0; a <= n; a++) {
      const t = Math.PI + (a / n) * Math.PI;
      if (step && a % step) continue;
      c.px(cx + Math.cos(t) * r, gy + Math.sin(t) * r, col);
    }
  };

  const hexes = (col: SpriteCell, dense: boolean): void => {
    for (let y = gy - R + 3; y < gy - 1; y += 5)
      for (let x = cx - R + 3; x < cx + R - 2; x += 5) {
        const dx = (x - cx) / R;
        const dy = (y - gy) / R;
        if (dx * dx + dy * dy > 0.86) continue;
        if (!dense && (x + y) % 10 > 4) continue;
        c.poly(
          [
            [x, y],
            [x + 2, y + 2],
            [x, y + 4],
            [x - 2, y + 2],
          ],
          col,
        );
      }
  };

  if (f === 0) {
    c.rect(cx - 12, gy, 25, 1, 'p');
    for (let i = 0; i < 6; i++) c.px(cx - 10 + i * 4, gy - 2 - (i % 3) * 2, 'p');
  } else if (f === 1) {
    dome(R * 0.6, 'p');
    hexes('p', false);
    c.rect(cx - 13, gy, 27, 1, 'p');
  } else if (f === 2) {
    dome(R, 'p');
    dome(R - 1, 'p', 3);
    hexes('p', true);
    c.rect(cx - R, gy, R * 2 + 1, 1, 'w');
  } else if (f === 3) {
    dome(R, 'w');
    dome(R - 3, 'p', 2);
    dome(R - 6, 'p', 3);
    hexes('p', true);
    for (let a = 0; a < 5; a++) {
      const t = Math.PI + 0.4 + a * 0.5;
      c.px(cx + Math.cos(t) * (R + 3), gy + Math.sin(t) * (R + 3), 'b');
    }
    c.rect(cx - R, gy, R * 2 + 1, 1, 'w');
  } else {
    dome(R, 'p', 3);
    hexes('p', false);
    for (let i = 0; i < 7; i++) c.px(cx - 12 + i * 4, gy - 6 - (i % 4) * 3, 'p');
  }
  return c.g;
}

/** 원본 `fxSeq(kind)` — `tf-fx-seq-01~03`. 5프레임을 가로 스트립 한 장으로 만든다. */
export function fxSeq(kind: FxKind): SpriteGrid {
  const frame = kind === 1 ? fxBomb : kind === 2 ? fxHeal : fxShield;
  return strip(
    FX_FRAMES.map((f) => frame(f)),
    FX_SEQ_STRIP_GAP,
  );
}

/**
 * 원본 `fxScreen()` — `tf-fx-screen`. 스킬 발동 시 화면 레벨 연출(플래시·셰이크·방사선).
 *
 * ⚠️⚠️ **직접 blit 금지** ⚠️⚠️
 * 이 96×40 한 장은 게임 화면에 얹는 오버레이가 **아니다.** `scrimCompare()`(`tf-sky-scrim`)
 * 와 같은 부류의 **비교 시트**다: 28px 패널 3개(기본 / 금색 틴트 + 방사선 / 스캔라인)를
 * 나란히 놓고 그 사이를 여백으로 가른 견본이라, 전장에 통째로 그리면 화면에 작은 차트
 * 패널 세 개가 떠 있는 그림이 된다. 실제 연출이 필요하면 이 시트를 참고해 화면 효과를
 * 따로 구현해라(틴트 = 격자 디더, 방사선 = 중심에서 뻗는 선, 셰이크 = 가로 스캔라인).
 */
export function fxScreen(): SpriteGrid {
  const c = mk(96, 40);
  c.rect(0, 0, 96, 40, '1');

  const panel = (ox: number, tint: SpriteCell | null): void => {
    c.rect(ox, 4, 28, 32, '2');
    c.rect(ox, 4, 28, 1, 'm').rect(ox, 35, 28, 1, 'm');
    c.rect(ox + 2, 26, 24, 8, '3');
    c.rect(ox + 6, 20, 3, 6, 'r').rect(ox + 12, 22, 3, 4, 'r');
    c.rect(ox + 20, 21, 3, 5, 'b');
    if (tint)
      for (let y = 5; y < 35; y++)
        for (let x = ox + 1; x < ox + 27; x++) if ((x * 2 + y * 3) % 7 === 0) c.px(x, y, tint);
  };

  panel(2, null);
  panel(34, 'g');
  for (let a = 0; a < 20; a++) {
    const t = (a / 20) * Math.PI * 2;
    c.line(48 + Math.cos(t) * 6, 20 + Math.sin(t) * 6, 48 + Math.cos(t) * 15, 20 + Math.sin(t) * 15, a % 2 ? 'g' : 'w');
  }
  panel(66, null);
  for (let y = 5; y < 35; y += 3) c.rect(67, y, 26, 1, '1');
  c.rect(66, 4, 28, 1, 'w');
  return c.g;
}
