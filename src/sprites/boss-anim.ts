/**
 * 보스 2페이즈 프레임 — 원본 `bossFrame(pattern, f)` 이식.
 * 좌표·색 문자는 원본 그대로다(재해석 금지).
 *
 * 몸통(42×50)은 두 페이즈가 공유하고, **무기와 흔들림만** 다르다:
 *   패턴 1 = 대검 휘두르기(`lean` 이 크고 f 2 에 원호 잔상 14점)
 *   패턴 2 = 포신 발사(`lean` 이 작고 f 2·3 에 지면 충격파)
 *
 * ★ 이 함수는 팔레트 **문자** 그리드를 만든다 — 색약 모드가 정상 동작한다.
 *   스트립 시트(`tf-boss-p1` / `tf-boss-p2`)는 `strip` 이 색을 굽는다(`strip.ts` 머리말).
 */

import type { AnimFrame } from './anim';
import { mk, type Point, type SpriteGrid } from './grid';

type Quad<T> = readonly [T, T, T, T];
type Segment = readonly [Point, Point];

/** 보스 공격 패턴 2종. 1 = 대검, 2 = 포신. */
export type BossPattern = 1 | 2;

/** 패턴별 상체 기울기(px). */
const BOSS_LEAN: Readonly<Record<BossPattern, Quad<number>>> = {
  1: [0, -1, 3, 1],
  2: [0, 0, 2, 1],
};

/** 패턴 1 대검의 선분(손잡이 → 칼끝). */
const BOSS_SWORD: Quad<Segment> = [
  [
    [33, 14],
    [40, 30],
  ],
  [
    [30, 6],
    [40, 14],
  ],
  [
    [28, 24],
    [8, 30],
  ],
  [
    [24, 34],
    [6, 38],
  ],
];

/** 패턴 2 포신의 y. 0 대기 → 1 들어올림 → 2 내려 발사 → 3 반동. */
const BOSS_CANNON_Y: Quad<number> = [12, 4, 30, 34];

/** 원본 `bossFrame(pattern, f)` — `tf-boss-p1` / `tf-boss-p2` 의 프레임. */
export function bossFrame(pattern: BossPattern, f: AnimFrame): SpriteGrid {
  const c = mk(42, 50);
  const lean = BOSS_LEAN[pattern][f];

  c.rect(12 + lean, 36, 6, 10, '2').rect(22 + lean, 36, 6, 10, '2');
  c.rect(10, 46, 9, 3, '3').rect(21, 46, 9, 3, '3');
  c.poly(
    [
      [9 + lean, 15],
      [29 + lean, 15],
      [33 + lean, 42],
      [6 + lean, 42],
    ],
    '3',
  );
  c.poly(
    [
      [9 + lean, 15],
      [29 + lean, 15],
      [31 + lean, 26],
      [7 + lean, 26],
    ],
    '2',
  );
  c.poly(
    [
      [12 + lean, 6],
      [27 + lean, 6],
      [29 + lean, 15],
      [10 + lean, 15],
    ],
    '3',
  );
  c.rect(13 + lean, 9, 13, 3, '1');
  c.poly(
    [
      [10 + lean, 10],
      [4 + lean, 3],
      [12 + lean, 2],
    ],
    'n',
  );
  c.poly(
    [
      [28 + lean, 10],
      [35 + lean, 3],
      [27 + lean, 2],
    ],
    'n',
  );
  c.poly(
    [
      [18 + lean, 28],
      [24 + lean, 28],
      [21 + lean, 36],
    ],
    'b',
  );

  if (pattern === 1) {
    const sw = BOSS_SWORD[f];
    const hilt = sw[0];
    const tip = sw[1];
    c.line(hilt[0] + lean, hilt[1], tip[0] + lean, tip[1], 'm');
    c.line(hilt[0] + lean, hilt[1] + 1, tip[0] + lean, tip[1] + 1, 'n');
    c.poly(
      [
        [tip[0] + lean - 3, tip[1] - 3],
        [tip[0] + lean + 3, tip[1] + 1],
        [tip[0] + lean - 2, tip[1] + 4],
      ],
      'b',
    );
    if (f === 2) {
      for (let k = 0; k < 14; k++) {
        const t = 2.3 + k * 0.12;
        c.px(21 + lean + Math.cos(t) * 20, 26 + Math.sin(t) * 20, k % 2 ? 'b' : 'n');
      }
    }
    if (f === 3) for (let k = 0; k < 8; k++) c.px(6 + k * 2, 40 + (k % 2), 'n');
  } else {
    const sy = BOSS_CANNON_Y[f];
    c.rect(30 + lean, sy, 9, 7, 'm');
    c.rect(31 + lean, sy + 7, 7, 4, '3');
    c.rect(32 + lean, sy + 2, 5, 3, 'n');
    if (f === 2) {
      c.rect(24, 44, 18, 3, 'b');
      for (let k = 0; k < 6; k++) c.px(28 + k * 3, 41 - (k % 3) * 2, 'n');
    }
    if (f === 3) {
      for (let k = 0; k < 5; k++) c.rect(26 + k * 4, 44, 2, 2, 'n');
      c.rect(22, 47, 20, 1, 'b');
    }
  }
  return c.outline('0').rim('w').g;
}
