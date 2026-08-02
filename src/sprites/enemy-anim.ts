/**
 * 적 공격 모션 프레임 — 원본 `eAtk(kind, f)` / `eAirAtk(kind, f)` 이식.
 * 좌표·색 문자는 원본 그대로다(재해석 금지).
 *
 * ★ 지난 라운드에 "적 5종에는 대응하는 공격 스트립이 원본에 없다"고 적어 두고 정지
 *   스프라이트로 뒀는데, 원본이 갱신되며 `tf-eatk-01~05` 가 들어왔다. 이 파일이 그 5종이다.
 *
 * ★ 몸통 좌표는 정지 스프라이트(`enemy.ts`)와 **같은 계열**이지만 1:1 복사는 아니다 —
 *   원본이 공격 자세용으로 `poly` 실루엣을 새로 그린다. 그래서 화면에 얹을 때 원점을
 *   정지 스프라이트의 좌상단에 맞춘다(`draw-sprite.ts` 의 `drawUnitSprite` 규약).
 *
 * ★ 여기 함수들은 팔레트 **문자** 그리드를 만든다 — 색약 모드가 정상 동작한다.
 *   스트립 시트(`tf-eatk-01` 등)는 `stamp` 가 색을 구워버리므로 게임 화면에는
 *   스트립이 아니라 이 함수들을 써라(`strip.ts` 머리말 참조).
 */

import type { AnimFrame } from './anim';
import { mk, type Point, type SpriteGrid } from './grid';

type Quad<T> = readonly [T, T, T, T];
type Segment = readonly [Point, Point];

/** 지상 적 공격 3종. 1 = 첨병(창), 2 = 집행관(망치), 3 = 굴착기(집게). */
export type EnemyAtkKind = 1 | 2 | 3;
/** 공중 적 공격 2종. 1 = 루머 연, 2 = 패닉 사이렌. */
export type EnemyAirAtkKind = 1 | 2;

/** 원본 `eAtk` 의 `lunge` — 프레임마다 몸을 앞뒤로 흔드는 양(px). 3종이 공유한다. */
const LUNGE: Quad<number> = [0, -1, 3, 1];

/** 첨병의 창 선분(어깨 → 창끝). 0 준비 → 1 치켜듦 → 2 찌르기 → 3 회수. */
const SPEAR: Quad<Segment> = [
  [
    [6, 4],
    [2, 26],
  ],
  [
    [8, 2],
    [4, 22],
  ],
  [
    [2, 14],
    [22, 20],
  ],
  [
    [3, 18],
    [18, 24],
  ],
];

/** 집행관의 방패 팔 x 오프셋. */
const ENFORCER_SHIELD_X: Quad<number> = [1, 0, -3, -1];

/** 집행관의 망치 머리 `[x, y]`. */
const ENFORCER_HAMMER: Quad<Point> = [
  [24, 6],
  [26, 3],
  [22, 20],
  [24, 24],
];

/**
 * 굴착기의 집게 높이 데이터.
 *
 * ⚠️ 원본은 `[[13,6],[15,2],[12,16],[13,20]][f]` 를 `ar` 로 받아 **`ar[1]` 만 쓴다.**
 *    `ar[0]` 은 어디에도 등장하지 않는다. 재해석 금지 원칙에 따라 표를 그대로 옮기고,
 *    쓰이지 않는다는 사실만 여기 적어 둔다(값을 지우면 원본 대조가 아니게 된다).
 */
const DIGGER_ARM: Quad<Point> = [
  [13, 6],
  [15, 2],
  [12, 16],
  [13, 20],
];

/** 원본 `eAtk(1, f)` — E-01 갭하락 첨병의 창 찌르기. `tf-eatk-01` 의 프레임. */
function enemyRusherAtk(f: AnimFrame): SpriteGrid {
  const c = mk(30, 34);
  const lunge = LUNGE[f];
  c.poly(
    [
      [18 + lunge, 12],
      [23 + lunge, 17],
      [20 + lunge, 32],
      [7 + lunge, 32],
      [5 + lunge, 18],
      [10 + lunge, 12],
    ],
    '2',
  );
  c.poly(
    [
      [14 + lunge, 3],
      [22 + lunge, 10],
      [20 + lunge, 14],
      [12 + lunge, 15],
      [8 + lunge, 9],
    ],
    '3',
  );
  c.rect(13 + lunge, 9, 5, 4, '1');

  const sp = SPEAR[f];
  const tail = sp[0];
  const tip = sp[1];
  c.line(tail[0] + lunge, tail[1], tip[0] + lunge, tip[1], 'm');
  c.poly(
    [
      [tip[0] + lunge - 2, tip[1] - 2],
      [tip[0] + lunge + 3, tip[1]],
      [tip[0] + lunge - 1, tip[1] + 3],
    ],
    'b',
  );
  if (f === 2) for (let k = 0; k < 6; k++) c.px(24 - k, 18 + (k % 2), 'n');
  return c.outline('0').rim('w').g;
}

/** 원본 `eAtk(2, f)` — E-02 반대매매 집행관의 망치 내려치기. `tf-eatk-02` 의 프레임. */
function enemyBlockerAtk(f: AnimFrame): SpriteGrid {
  const c = mk(32, 34);
  const lunge = LUNGE[f];
  c.rect(8 + lunge, 26, 5, 6, '2').rect(16 + lunge, 26, 5, 6, '2');
  c.rect(6, 32, 8, 2, '3').rect(15, 32, 8, 2, '3');
  c.poly(
    [
      [7 + lunge, 13],
      [21 + lunge, 13],
      [23 + lunge, 26],
      [5 + lunge, 26],
    ],
    '3',
  );
  c.poly(
    [
      [7 + lunge, 13],
      [21 + lunge, 13],
      [22 + lunge, 18],
      [6 + lunge, 18],
    ],
    'n',
  );
  c.rect(10 + lunge, 5, 9, 7, '3').rect(11 + lunge, 7, 7, 3, '1');

  const sx = ENFORCER_SHIELD_X[f] + lunge;
  c.rect(sx, 14, 5, 15, 'm')
    .rect(sx + 1, 15, 3, 13, '2')
    .line(sx + 1, 20, sx + 3, 20, 'b');

  const hm = ENFORCER_HAMMER[f];
  c.rect(hm[0] + lunge, hm[1], 5, 4, 'm').rect(hm[0] + lunge + 1, hm[1] + 4, 2, 7, '3');
  if (f === 2) {
    for (let k = 0; k < 7; k++) c.px(20 + (k % 3), 24 + k, 'b');
    c.rect(18, 30, 10, 1, 'n');
  }
  return c.outline('0').rim('w').g;
}

/** 원본 `eAtk(3, f)` — E-03 청산 굴착기의 집게. `tf-eatk-03` 의 프레임(몸통은 `lunge` 없이 고정). */
function enemyTankAtk(f: AnimFrame): SpriteGrid {
  const c = mk(34, 34);
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
  c.rect(11, 4, 9, 8, '3').rect(12, 6, 7, 3, '1');

  const armY = DIGGER_ARM[f][1];
  c.rect(23, armY + 5, 6, 4, 'm');
  c.poly(
    [
      [27, armY + 7],
      [31, armY + 13],
      [24, armY + 15],
      [24, armY + 9],
    ],
    'm',
  );
  if (f === 2) {
    c.rect(24, 30, 10, 2, 'b');
    for (let k = 0; k < 5; k++) c.px(26 + k * 2, 28 - (k % 2) * 2, 'n');
  }
  return c.outline('0').rim('w').g;
}

/** 원본 `eAtk(kind, f)` — 지상 적 3종의 공격 프레임. */
export function eAtk(kind: EnemyAtkKind, f: AnimFrame): SpriteGrid {
  if (kind === 1) return enemyRusherAtk(f);
  if (kind === 2) return enemyBlockerAtk(f);
  return enemyTankAtk(f);
}

/** 루머 연의 상하 흔들림(px). */
const KITE_BOB: Quad<number> = [0, 1, 2, 1];
/** 사이렌의 상하 흔들림(px). */
const SIREN_BOB: Quad<number> = [0, 1, 0, 1];
/** 사이렌 몸통 3덩이의 중심 x. */
const SIREN_PODS: readonly number[] = [8, 18, 28];
/** 사이렌 음파 3줄의 y. */
const SIREN_WAVE_Y: readonly number[] = [23, 26, 29];

/** 원본 `eAirAtk(1, f)` — E-04 루머 연. `tf-eatk-04` 의 프레임. */
function enemyKiteAtk(f: AnimFrame): SpriteGrid {
  const c = mk(38, 26);
  const bob = KITE_BOB[f];
  c.poly(
    [
      [16, 1 + bob],
      [27, 10 + bob],
      [16, 19 + bob],
      [5, 10 + bob],
    ],
    '2',
  );
  c.line(16, 1 + bob, 16, 19 + bob, 'm').line(5, 10 + bob, 27, 10 + bob, 'm');
  c.poly(
    [
      [16, 4 + bob],
      [23, 10 + bob],
      [16, 16 + bob],
      [9, 10 + bob],
    ],
    '3',
  );
  c.rect(14, 8 + bob, 5, 4, 'w');
  for (let i = 0; i < 4; i++) c.line(16 - i * 4, 19 + bob, 12 - i * 4, 15 + bob, i % 2 ? 'b' : 'n');
  if (f >= 2) for (let k = 0; k < 4; k++) c.rect(20 + k * 3, 14 + bob + k * 2, 2, 2, k % 2 ? 'w' : 'b');
  return c.outline('0').rim('w').g;
}

/** 원본 `eAirAtk(2, f)` — E-05 패닉 사이렌. `tf-eatk-05` 의 프레임. */
function enemySirenAtk(f: AnimFrame): SpriteGrid {
  const c = mk(38, 30);
  const bob = SIREN_BOB[f];
  c.rect(14, 6 + bob, 8, 7, '3').rect(14, 6 + bob, 8, 2, 'n');
  for (const x of SIREN_PODS) {
    c.poly(
      [
        [x - 4, 14 + bob],
        [x + 4, 14 + bob],
        [x + 2, 21 + bob],
        [x - 2, 21 + bob],
      ],
      '2',
    );
    c.rect(x - 1, 11 + bob, 3, 4, 'm');
    c.line(x - 4, 21 + bob, x + 4, 21 + bob, 'b');
  }
  c.rect(12, 3 + bob, 12, 2, 'm').rect(17, 1 + bob, 3, 3, 'n');
  if (f >= 2) {
    SIREN_WAVE_Y.forEach((y, i) => {
      for (let x = 4 + i * 2; x < 34 - i * 2; x += 3) c.px(x, y, i % 2 ? 'b' : 'n');
    });
  }
  return c.outline('0').rim('w').g;
}

/** 원본 `eAirAtk(kind, f)` — 공중 적 2종의 공격 프레임. */
export function eAirAtk(kind: EnemyAirAtkKind, f: AnimFrame): SpriteGrid {
  return kind === 1 ? enemyKiteAtk(f) : enemySirenAtk(f);
}
