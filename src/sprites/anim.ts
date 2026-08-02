/**
 * 유닛 공격 모션 프레임 — 원본 `meleeFrame` / `throwFrame` / `shieldFrame` / `canFrame` /
 * `canSpin` 이식. 좌표·색 문자는 원본 그대로다(재해석 금지).
 *
 * ★ 프레임은 각각 **정지 스프라이트와 같은 몸통 좌표**를 쓴다 — 원본이 그렇게 짜여 있다.
 *   `meleeFrame`  = `allyRookie` 몸통 + `lean` 만큼 밀기 + 칼      (A-01 근거리)
 *   `throwFrame`  = `allyScout`  몸통 + 팔/캔                      (A-02 원거리)
 *   `shieldFrame` = `allyAnchor` 몸통 + 방패 밀기(`push`)          (A-03 탱커)
 *   그래서 화면에 얹을 때 **왼쪽 위 원점을 정지 스프라이트와 맞추면** 몸이 움직이지 않고
 *   무기만 움직인다(캔버스가 4~6px 넓어진 만큼은 오른쪽으로만 늘어난다).
 *
 * ★ 여기 함수들은 팔레트 **문자** 그리드를 만든다 — 색약 모드가 정상 동작한다.
 *   스트립 시트(`tf-melee-loop` 등)는 `stamp` 가 색을 구워버리므로 게임 화면에는
 *   스트립이 아니라 이 함수들을 써라(`strip.ts` 머리말 참조).
 */

import { mk, type Point, type SpriteGrid } from './grid';
import { stampGrid } from './scene-wide';
import { UNIT_STRIP_FRAMES } from './strip';

/** 4프레임 루프의 프레임 번호. */
export type AnimFrame = 0 | 1 | 2 | 3;

/** 프레임 번호 목록. 스트립 빌더와 렌더 배선이 같은 순서를 쓴다. */
export const ANIM_FRAMES: readonly AnimFrame[] = [0, 1, 2, 3];

/** 프레임 수는 스트립 메타데이터가 단일 출처다. */
export const ANIM_FRAME_COUNT = UNIT_STRIP_FRAMES;

type Quad<T> = readonly [T, T, T, T];
type Blade = readonly [Point, Point];

/** 프레임마다 몸을 앞으로 미는 양(px). */
const MELEE_LEAN: Quad<number> = [0, 1, 2, 1];
/** 손잡이 높이. 0 준비 → 1 치켜듦 → 2 내려침 → 3 마무리. */
const MELEE_HAND_Y: Quad<number> = [16, 12, 18, 22];

/**
 * 원본 `meleeFrame(f)` — `tf-melee-loop` 의 프레임 / `tf-melee-hold`(= f 1).
 * A-01 근거리 유닛의 칼 휘두르기 4프레임.
 */
export function meleeFrame(f: AnimFrame): SpriteGrid {
  const c = mk(30, 34);
  const lean = MELEE_LEAN[f];
  c.rect(8 + lean, 26, 4, 6, '2').rect(14 + lean, 27, 4, 5, '2');
  c.rect(6 + lean, 32, 7, 2, '3').rect(13 + lean, 32, 7, 2, '3');
  c.rect(7 + lean, 15, 12, 12, '3').rect(7 + lean, 15, 12, 3, '2');
  c.rect(10 + lean, 19, 4, 6, 'w').rect(7 + lean, 21, 12, 2, 'r');
  c.disc(13 + lean, 9, 6, 'm')
    .rect(7 + lean, 9, 13, 3, 'm')
    .rect(12 + lean, 11, 8, 3, '2');

  const hx = 19 + lean;
  const hy = MELEE_HAND_Y[f];
  c.rect(hx - 1, hy - 1, 3, 3, '3');

  const blades: Quad<Blade> = [
    [
      [hx, hy],
      [hx - 4, hy - 12],
    ],
    [
      [hx, hy],
      [hx + 9, hy - 8],
    ],
    [
      [hx, hy],
      [hx + 12, hy + 3],
    ],
    [
      [hx, hy],
      [hx + 6, hy + 9],
    ],
  ];
  const blade = blades[f];
  const a = blade[0];
  const b = blade[1];
  c.line(a[0], a[1], b[0], b[1], 'w');
  c.line(a[0] + 1, a[1], b[0] + 1, b[1], 'm');
  c.line(a[0] - 1, a[1] + 1, a[0] + 2, a[1] - 1, 'r');

  if (f === 2) {
    for (let k = 0; k < 9; k++) {
      const t = -0.7 + k * 0.19;
      c.px(hx + Math.cos(t) * 13, hy + Math.sin(t) * 13, 'r');
    }
  }
  if (f === 3) {
    for (let k = 0; k < 7; k++) {
      const t = 0.1 + k * 0.16;
      c.px(hx + Math.cos(t) * 12, hy + Math.sin(t) * 12, 'd');
    }
  }
  return c.outline('0').rim('w').g;
}

/** 캔 몸통 색 — 회전하면서 밝은 면/어두운 면이 번갈아 온다. */
const CAN_BODY: Quad<'r' | 'd'> = ['r', 'd', 'r', 'd'];

/**
 * 원본 `canFrame(f)` — `tf-can-idle`(= f 0) / `tf-can-spin` 의 프레임.
 * A-02 원거리 유닛이 던지는 **캔**이다(= 이 유닛의 발사체).
 */
export function canFrame(f: AnimFrame): SpriteGrid {
  const c = mk(16, 20);
  c.rect(4, 3, 8, 14, CAN_BODY[f]);
  c.rect(4, 3, 8, 2, 'm').rect(4, 15, 8, 2, 'm');
  c.rect(5, 1, 6, 2, 'm').rect(7, 0, 2, 1, 'w');
  if (f === 0) {
    c.rect(6, 7, 4, 6, 'w');
    c.rect(7, 8, 2, 4, 'd');
  } else if (f === 1) {
    c.rect(8, 6, 3, 8, 'w');
    c.rect(4, 7, 2, 6, 'd');
  } else if (f === 2) {
    c.rect(5, 7, 2, 6, 'd');
    c.rect(9, 7, 2, 6, 'd');
  } else {
    c.rect(5, 6, 3, 8, 'w');
    c.rect(10, 7, 2, 6, 'd');
  }
  c.rect(4, 5, 1, 10, 'w');
  return c.outline('0').g;
}

/** 원본 `canSpin()` 의 프레임 원점 x — `3 + i * 20`. `strip()` 배치가 아니다. */
export const CAN_SPIN_ORIGIN_X = 3;
export const CAN_SPIN_ORIGIN_Y = 1;
export const CAN_SPIN_PITCH_X = 20;

/**
 * 원본 `canSpin()` — `tf-can-spin`. 캔 4프레임 + 프레임 사이 잔상 점.
 * ⚠️ `strip()` 이 아니라 자체 배치(원점 3, 피치 20)다.
 */
export function canSpin(): SpriteGrid {
  const c = mk(84, 22);
  for (let i = 0; i < ANIM_FRAME_COUNT; i++) {
    const frame = ANIM_FRAMES[i];
    if (frame === undefined) continue;
    stampGrid(c.g, canFrame(frame), CAN_SPIN_ORIGIN_X + i * CAN_SPIN_PITCH_X, CAN_SPIN_ORIGIN_Y);
    if (i) for (let k = 0; k < 4; k++) c.px(1 + i * CAN_SPIN_PITCH_X - k, 11 + (k % 2), 'd');
  }
  return c.g;
}

/** 던지는 팔의 어깨→손 선분. 0 뒤로 당김 → 1 머리 위 → 2 앞으로 → 3 놓은 뒤. */
const THROW_ARM: Quad<Blade> = [
  [
    [19, 15],
    [14, 6],
  ],
  [
    [19, 15],
    [22, 5],
  ],
  [
    [19, 15],
    [27, 12],
  ],
  [
    [19, 15],
    [26, 20],
  ],
];

/**
 * 원본 `throwFrame(f)` — `tf-throw-loop` 의 프레임.
 * A-02 원거리 유닛의 캔 던지기 4프레임(f 3 에서 캔이 손을 떠난다).
 */
export function throwFrame(f: AnimFrame): SpriteGrid {
  const c = mk(30, 34);
  c.disc(5, 18, 4, 'm').disc(5, 18, 2, '2');
  c.rect(9, 25, 4, 7, '2').rect(15, 26, 4, 6, '2');
  c.rect(8, 32, 6, 2, '3').rect(14, 32, 6, 2, '3');
  c.rect(8, 13, 11, 13, '3').rect(8, 13, 11, 3, '2');
  c.rect(11, 17, 4, 7, 'w').rect(8, 19, 11, 2, 'r');
  c.disc(13, 8, 5, '3').rect(15, 6, 4, 3, 'r');

  const arm = THROW_ARM[f];
  c.line(arm[0][0], arm[0][1], arm[1][0], arm[1][1], '3');
  c.line(arm[0][0], arm[0][1] + 1, arm[1][0], arm[1][1] + 1, '3');

  const cx = arm[1][0];
  const cy = arm[1][1] - 2;
  if (f < 3) {
    c.rect(cx - 1, cy, 3, 5, f === 1 ? 'd' : 'r');
    c.rect(cx - 1, cy, 3, 1, 'm');
  } else {
    c.rect(cx + 2, cy - 2, 3, 5, 'r');
    c.rect(cx + 2, cy - 2, 3, 1, 'm');
    for (let k = 1; k < 5; k++) c.px(cx + 1 - k * 2, cy + (k % 2), 'd');
  }
  return c.outline('0').rim('w').g;
}

/** 방패를 앞으로 밀어내는 양(px). 0·1 은 대기, 2·3 이 밀치기다. */
const SHIELD_PUSH: Quad<number> = [0, 0, 3, 6];

/**
 * 원본 `shieldFrame(f)` — `tf-shield-idle`(= f 0) / `tf-shield-loop` 의 프레임.
 * A-03 탱커의 방패 대기 · 밀치기 4프레임.
 */
export function shieldFrame(f: AnimFrame): SpriteGrid {
  const c = mk(34, 34);
  const push = SHIELD_PUSH[f];
  c.rect(6, 25, 5, 7, '2').rect(15 + (f > 1 ? 1 : 0), 25, 5, 7, '2');
  c.rect(4, 32, 8, 2, '3').rect(14, 32, 8, 2, '3');
  c.rect(6, 12, 13, 14, '3').rect(6, 12, 13, 3, '2');
  c.disc(6, 14, 4, '3').disc(19, 14, 4, '3');
  c.rect(9, 16, 5, 7, 'w').rect(6, 18, 13, 2, 'r');
  c.disc(12, 7, 5, '3').rect(14, 5, 4, 3, 'r');

  const sx = 21 + push;
  const top = f === 1 ? 8 : 10;
  c.rect(sx, top, 6, 19, 'm');
  c.rect(sx + 1, top + 1, 4, 17, '3');
  c.disc(sx + 3, top + 9, 2, 'm');
  c.rect(sx, top + 4, 6, 1, 'm');
  c.rect(sx, top + 14, 6, 1, 'm');
  if (f === 3) {
    for (let k = 0; k < 6; k++) c.px(sx + 7 + (k % 3), 12 + k * 2, 'r');
    c.rect(sx + 7, 14, 2, 10, 'd');
  }
  if (f === 1) c.rect(sx - 1, 7, 8, 1, 'w');
  return c.outline('0').rim('w').g;
}
