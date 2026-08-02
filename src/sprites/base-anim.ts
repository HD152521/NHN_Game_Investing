/**
 * 기지 피격 4단계 — 원본 `baseAllyDamage(stage)` / `baseEnemyCollapse(stage)` 이식.
 * 좌표·색 문자는 원본 그대로다(재해석 금지).
 *
 * ★ 이 둘은 "루프 애니메이션" 이 아니라 **HP 단계** 다. 0 = 멀쩡, 3 = 파괴 직전이고,
 *   되돌아가지 않는다. 그래서 배선은 시간이 아니라 `baseHp / maxBaseHp` 로 한다
 *   (`draw-structures.ts` 참조).
 *
 *   아군 사옥(`baseAllyDamage`) : 창문 점등 비율 `lit` 이 1 → 0.7 → 0.35 → 0 으로 꺼지고
 *                                균열·붕괴 조각이 쌓인다. 3 단계는 `rim` 색까지 바뀐다.
 *   베어 요새(`baseEnemyCollapse`): 지붕이 `drop` 만큼 0 → 1 → 4 → 9px 주저앉는다.
 *
 * ★ 원본 정지 스프라이트(`baseAlly` 76×40 / `baseEnemy` 30×44)와 **다른 그림이다.**
 *   `baseAllyDamage` 는 30×44 한 동짜리 사옥이라 `tf-base-ally`(4동 76×40)의 손상 버전이
 *   아니다. 화면에서 정지 스프라이트와 바꿔치기하면 건물이 통째로 달라 보인다 —
 *   배선 근거는 `draw-structures.ts` 에 적어 두었다.
 */

import type { AnimFrame } from './anim';
import { mk, type SpriteGrid } from './grid';

type Quad<T> = readonly [T, T, T, T];

/** 피격 단계 4종. `AnimFrame` 과 같은 0~3 이지만 **루프가 아니라 진행 단계**다. */
export type DamageStage = AnimFrame;

/** 아군 사옥의 창문 점등 비율. */
const ALLY_LIT: Quad<number> = [1, 0.7, 0.35, 0];
/** 창문 격자가 시작하는 y. 원본 `top`. */
const ALLY_TOP = 6;

/** 원본 `baseAllyDamage(stage)` — `tf-basedmg-ally` 의 프레임. */
export function baseAllyDamage(stage: DamageStage): SpriteGrid {
  const c = mk(30, 44);
  const lit = ALLY_LIT[stage];
  const top = ALLY_TOP;

  c.rect(4, top, 22, 44 - top, '3');
  c.rect(4, top, 22, 3, '2');

  // 창문 점등은 결정적 해시(`(n * 37) % 100`)와 `lit` 비교다 — 난수가 아니다.
  let n = 0;
  for (let y = top + 5; y < 38; y += 5) {
    for (let x = 7; x < 24; x += 5) {
      n++;
      const on = ((n * 37) % 100) / 100 < lit;
      c.rect(x, y, 3, 3, on ? 'w' : '1');
    }
  }

  c.rect(4, 38, 22, 3, '2');
  c.rect(5, 37, 20, 1, stage < 3 ? 'r' : 'n');
  c.rect(13, top - 4, 2, 4, 'm');

  if (stage >= 1) {
    c.rect(4, 12, 5, 1, '1');
    c.rect(20, 22, 6, 1, '1');
  }
  if (stage >= 2) {
    c.poly(
      [
        [4, top],
        [11, top],
        [8, top + 6],
      ],
      '1',
    );
    c.rect(18, 30, 8, 2, '1');
    c.rect(4, 26, 4, 3, '1');
  }
  if (stage === 3) {
    c.poly(
      [
        [4, top],
        [26, top],
        [22, top + 9],
        [14, top + 4],
        [8, top + 11],
      ],
      '1',
    );
    for (let k = 0; k < 8; k++) c.rect(3 + k * 3, 20 + (k % 4) * 5, 2, 2, '1');
    c.rect(6, 30, 3, 8, '1');
  }

  c.rect(0, 41, 30, 3, '2');
  return c.outline('0').rim(stage === 3 ? 'm' : 'w').g;
}

/** 베어 요새 지붕이 주저앉는 양(px). */
const ENEMY_DROP: Quad<number> = [0, 1, 4, 9];

/** 원본 `baseEnemyCollapse(stage)` — `tf-basedmg-enemy` 의 프레임. */
export function baseEnemyCollapse(stage: DamageStage): SpriteGrid {
  const c = mk(32, 46);
  const drop = ENEMY_DROP[stage];

  c.poly(
    [
      [3, 14 + drop],
      [9, 8 + drop],
      [14, 13 + drop],
      [20, 6 + drop],
      [28, 16 + drop],
      [28, 42],
      [3, 42],
    ],
    '3',
  );
  c.poly(
    [
      [3, 14 + drop],
      [9, 8 + drop],
      [14, 13 + drop],
      [20, 6 + drop],
      [28, 16 + drop],
      [28, 23 + drop],
      [3, 23 + drop],
    ],
    '2',
  );
  c.rect(10, 30, 12, 12, 'n');
  c.disc(16, 36, 4, '3').disc(16, 36, 2, stage === 3 ? 'r' : 'b');
  for (let y = 20 + drop; y < 30; y += 4) for (let x = 5; x < 27; x += 5) c.rect(x, y, 2, 2, '1');

  if (stage >= 1) {
    c.line(5, 26, 12, 34, '1');
    c.rect(22, 28, 5, 1, '1');
  }
  if (stage >= 2) {
    c.poly(
      [
        [20, 6 + drop],
        [28, 16 + drop],
        [22, 18 + drop],
      ],
      '1',
    );
    c.line(8, 20 + drop, 16, 33, '1');
    c.rect(3, 32, 6, 2, '1');
  }
  if (stage === 3) {
    c.poly(
      [
        [3, 14 + drop],
        [16, 20 + drop],
        [28, 15 + drop],
        [28, 26],
        [3, 26],
      ],
      '1',
    );
    for (let k = 0; k < 10; k++) c.rect(2 + k * 3, 34 + (k % 3) * 3, 2, 2, k % 2 ? 'n' : '1');
    for (let k = 0; k < 5; k++) c.px(6 + k * 5, 12 + (k % 3) * 3, 'm');
  }

  c.rect(0, 42, 32, 4, '2');
  return c.outline('0').rim('w').g;
}
