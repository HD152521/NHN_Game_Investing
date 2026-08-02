/**
 * 걷기 · 사망 프레임 — 원본 `walk(base, f)` / `death(base, f, tint)` 이식.
 * 좌표·색 문자는 원본 그대로다(재해석 금지).
 *
 * ★ 이 둘은 다른 모션과 달리 **정지 스프라이트를 변형**한다 — 몸을 새로 그리지 않고
 *   원본 그리드의 픽셀을 옮긴다. 그래서 어떤 유닛에도 붙일 수 있다.
 *
 *   `walk`  : 상체(`y < h - 10`)를 `bob` 만큼 위아래로, 다리(`y >= h - 10`)를 좌우로 민다.
 *             결과 캔버스 크기는 원본과 **같다** — 화면 배선에서 원점을 바꿀 필요가 없다.
 *   `death` : 캔버스가 좌우로 8px 넓어지고(원본 `mk(w + 8, h)`), 프레임마다 다른 붕괴 단계다.
 *             0 = 흰 스캔라인, 1 = 격자 디더 + 2px 침강, 2 = 체커 분해 + 4px 침강,
 *             3 = 몸이 사라지고 파편 14개만 남는다.
 *
 * ★ `walk` 은 팔레트 **문자** 를 그대로 옮긴다(색약 모드 정상 동작).
 *   `death` 의 f 0·1 은 원본이 `stamp` 를 쓰므로 **그 두 프레임만 색이 구워진다** —
 *   원본이 그렇게 짜여 있다. f 2·3 은 문자 그대로다. 스트립 시트(`tf-death-*`)는 어차피
 *   `strip` 이 전부 굽는다(`strip.ts` 머리말).
 */

import type { AnimFrame } from './anim';
import { mk, type SpriteGrid } from './grid';
import type { SpriteCell } from './palette';
import { TRANSPARENT } from './palette';
import { stampGrid } from './scene-wide';

type Quad<T> = readonly [T, T, T, T];

/** 정지 스프라이트 생성기. `walk`/`death` 는 아무 유닛에나 붙는다. */
export type SpriteBase = () => SpriteGrid;

/** 상체 상하 흔들림(px). 0 → 1 뜸 → 2 → 3 내려앉음. */
const WALK_BOB: Quad<number> = [0, -1, 0, 1];
/** 다리 좌우 벌림(px). 화면 좌반부와 우반부가 **반대 방향**으로 벌어진다. */
const WALK_STRIDE: Quad<number> = [0, 2, 0, -2];
/** 다리로 보는 아래쪽 띠의 높이(px). 원본 `legTop = h - 10`. */
const WALK_LEG_BAND = 10;

/**
 * 원본 `walk(base, f)` — `tf-walk-ally` / `tf-walk-tank` / `tf-walk-enemy` 의 프레임.
 *
 * 상체는 `bob` 만큼 세로로, 다리는 `stride × (좌반부 +1 / 우반부 −1)` 만큼 가로로 민다.
 * 캔버스 밖으로 밀린 픽셀은 `px` 의 경계 검사에서 버려진다(원본과 동일).
 */
export function walk(base: SpriteBase, f: AnimFrame): SpriteGrid {
  const src = base();
  const h = src.length;
  const w = src[0]?.length ?? 0;
  const c = mk(w, h);
  const bob = WALK_BOB[f];
  const stride = WALK_STRIDE[f];
  const legTop = h - WALK_LEG_BAND;

  for (let y = 0; y < h; y++) {
    const row = src[y];
    if (row === undefined) continue;
    for (let x = 0; x < w; x++) {
      const v = row[x];
      if (v === undefined || v === TRANSPARENT) continue;
      if (y < legTop) {
        c.px(x, y + bob, v);
      } else {
        c.px(x + stride * (x < w / 2 ? 1 : -1), y, v);
      }
    }
  }
  return c.g;
}

/** 사망 프레임에서 캔버스가 좌우로 넓어지는 양(px). 원본 `mk(w + 8, h)`. */
const DEATH_PAD = 8;
/** 몸통을 넣는 x 오프셋. 원본 `stamp(…, 4, …)`. */
const DEATH_BODY_X = 4;
/** f 별 몸통 침강량(px). 3 은 몸이 남지 않는다. */
const DEATH_SINK: Quad<number> = [0, 2, 4, 0];
/** f 3 의 파편 개수. */
const DEATH_DEBRIS = 14;

/**
 * 원본 `death(base, f, tint)` — `tf-death-ally`(tint `'r'`) / `tf-death-enemy`(tint `'b'`).
 *
 * ⚠️ `CombatState` 에 사망 연출용 필드가 없어 **현재는 배선하지 않는다**(`draw-units.ts` 참조).
 *    그리드는 만들어 두되 화면에 붙이는 것은 상태가 생긴 뒤다.
 */
export function death(base: SpriteBase, f: AnimFrame, tint: SpriteCell): SpriteGrid {
  const src = base();
  const h = src.length;
  const w = src[0]?.length ?? 0;
  const c = mk(w + DEATH_PAD, h);

  if (f === 0) {
    stampGrid(c.g, src, DEATH_BODY_X, DEATH_SINK[0]);
    for (let x = 0; x < w; x += 2) c.px(x + DEATH_BODY_X, 2, 'w');
    return c.g;
  }
  if (f === 1) {
    stampGrid(c.g, src, DEATH_BODY_X, DEATH_SINK[1]);
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) c.px(x + DEATH_BODY_X, y + DEATH_SINK[1], 'w');
    return c.g;
  }
  if (f === 2) {
    for (let y = 0; y < h; y++) {
      const row = src[y];
      if (row === undefined) continue;
      for (let x = 0; x < w; x++) {
        const v = row[x];
        if (v === undefined || v === TRANSPARENT) continue;
        if ((x + y) % 2 !== 0) continue;
        c.px(x + DEATH_BODY_X + ((y % 3) - 1), y + DEATH_SINK[2], v);
      }
    }
    return c.g;
  }

  for (let i = 0; i < DEATH_DEBRIS; i++) {
    const x = 3 + ((i * 5) % (w + 4));
    const y = h - 4 - (i % 4) * 3;
    c.rect(x, y, 2, 2, i % 3 ? tint : 'm');
  }
  return c.g;
}
