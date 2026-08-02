/**
 * 타워 발사 모션 · 티어2 장식 — 원본 `towerFire(kind, f, t2)` 이식.
 * 좌표·색 문자는 원본 그대로다(재해석 금지).
 *
 * ★ 한 함수가 두 시트를 만든다 ★
 *     `towerFire(kind, f)`        → `tf-tfire-01~03` 의 4프레임(발사 반동 + 총구 섬광 + 잔재)
 *     `towerFire(kind, 0, true)`  → `tf-t2-01~03` 한 장(티어2 금색 장식이 붙은 정지 자세)
 *   즉 티어2는 **별도 그림이 아니라 같은 프레임 0 위의 금색 덧칠**이다.
 *
 * ★ 캔버스가 정지 스프라이트보다 크다 ★ `mk(w + 14, h + 4)` 이고 몸통은 `(2 + kick, 4)` 에
 *   찍힌다. 총구 섬광이 오른쪽으로, 대공포 섬광이 위로 삐져나가기 때문이다. 화면에 얹을 때
 *   정지 스프라이트의 좌상단에 맞추면 포신만 움직인다(유닛 모션과 같은 규약).
 *
 * ★ 색 ★ 몸통은 `stamp` 를 거치므로 **HEX 로 구워진다**(원본 그대로). 그 위에 덧칠하는
 *   섬광(`'r'`/`'w'`)·티어2 장식(`'g'`)·잔재(`'d'`/`'m'`)는 팔레트 문자 그대로 남는다.
 *   그래서 `tf-t2-*` 는 생 색과 문자가 섞여 있다 — `grids.json` 실측과 일치한다.
 *   화면에서 색약 모드를 온전히 따라가야 하는 자리에는 이 함수 대신 정지 스프라이트를 쓴다.
 */

import type { AnimFrame } from './anim';
import { mk, type SpriteGrid } from './grid';
import { TRANSPARENT } from './palette';
import { stampGrid } from './scene-wide';
import { towerAA, towerBasic, towerSplash } from './tower';

type Quad<T> = readonly [T, T, T, T];

/** 타워 3종. 1 = 단일표적(T-01), 2 = 대공(T-02), 3 = 광역(T-03). */
export type TowerFireKind = 1 | 2 | 3;

/** 캔버스 여유 — 오른쪽 총구 섬광용 가로 14px, 위쪽 대공 섬광용 세로 4px. */
const FIRE_PAD_X = 14;
const FIRE_PAD_Y = 4;
/** 몸통을 찍는 기준 위치. `x` 에는 프레임별 반동(`kick`)이 더해진다. */
const FIRE_BODY_X = 2;
const FIRE_BODY_Y = 4;

/** 발사 반동(px). 대공포는 위로 쏘므로 f 2 에서 뒤로 밀리지 않는다. */
function kickOf(kind: TowerFireKind, f: AnimFrame): number {
  const kicks: Quad<number> = [0, 0, kind === 2 ? 0 : -2, -1];
  return kicks[f];
}

function towerBody(kind: TowerFireKind): SpriteGrid {
  if (kind === 1) return towerBasic();
  if (kind === 2) return towerAA();
  return towerSplash();
}

/** 몸통을 팔레트 **문자 그대로** 옮긴다. `stampGrid` 와 좌표·클리핑 규칙이 같고 색만 굽지 않는다. */
function copyBody(dst: SpriteGrid, src: SpriteGrid, ox: number, oy: number): void {
  const width = dst[0]?.length ?? 0;
  for (let y = 0; y < src.length; y++) {
    const row = src[y];
    const target = dst[oy + y];
    if (row === undefined || target === undefined) continue;
    for (let x = 0; x < row.length; x++) {
      const v = row[x];
      if (v === undefined || v === TRANSPARENT) continue;
      const tx = ox + x;
      if (tx >= 0 && tx < width) target[tx] = v;
    }
  }
}

function buildTowerFire(kind: TowerFireKind, f: AnimFrame, t2: boolean, bakeBody: boolean): SpriteGrid {
  const body = towerBody(kind);
  const h = body.length;
  const w = body[0]?.length ?? 0;
  const c = mk(w + FIRE_PAD_X, h + FIRE_PAD_Y);
  const bodyX = FIRE_BODY_X + kickOf(kind, f);
  if (bakeBody) stampGrid(c.g, body, bodyX, FIRE_BODY_Y);
  else copyBody(c.g, body, bodyX, FIRE_BODY_Y);

  if (t2) {
    for (let x = 2; x < w; x += 3) c.px(x + 2, h - 1, 'g');
    c.rect(4, 5, w - 6, 1, 'g');
    if (kind === 2) c.rect(10, 4, 3, 2, 'g');
    else c.rect(w - 4, 8, 4, 2, 'g');
  }

  if (f === 1) {
    if (kind === 2) c.rect(11, 2, 3, 3, 'r');
    else c.rect(w - 2, 12, 3, 3, 'r');
  }

  if (f === 2) {
    if (kind === 2) {
      c.poly(
        [
          [9, 0],
          [15, 0],
          [12, 7],
        ],
        'w',
      );
      c.rect(11, 6, 3, 4, 'r');
    } else if (kind === 1) {
      c.poly(
        [
          [w - 3, 10],
          [w + 8, 13],
          [w - 3, 17],
        ],
        'w',
      );
      c.rect(w + 6, 12, 4, 3, 'r');
    } else {
      for (let k = 0; k < 6; k++) c.rect(w - 6 + k * 3, 6 - k, 2, 2, k % 2 ? 'r' : 'w');
    }
  }

  if (f === 3) {
    if (kind === 2) for (let k = 0; k < 4; k++) c.px(11 + (k % 2), 2 + k, 'm');
    else for (let k = 0; k < 5; k++) c.px(w + 1 + k, 13 + (k % 2), 'd');
  }

  return c.g;
}

/**
 * 원본 `towerFire(kind, f, t2)` — `tf-tfire-01~03` 의 프레임 / `tf-t2-01~03`(= f 0, t2).
 *
 * ⚠️ 원본은 마지막에 `outline`/`rim` 을 **부르지 않는다** — 몸통이 이미 외곽선을 갖고
 *    들어오기 때문이다. 여기서 외곽선을 더하면 원본 대조가 깨진다.
 * ⚠️ 몸통이 `stamp` 를 거치므로 **색이 구워진다.** 원본 대조용이다 —
 *    게임 화면에는 `towerFireFrame` 을 써라(아래).
 */
export function towerFire(kind: TowerFireKind, f: AnimFrame, t2 = false): SpriteGrid {
  return buildTowerFire(kind, f, t2, true);
}

/**
 * 화면용 타워 발사 프레임 — `towerFire` 와 **같은 그림이되 팔레트 문자를 굽지 않는다.**
 *
 * ★ 왜 따로 두는가 ★ 원본 `towerFire` 는 몸통을 `stamp` 로 찍어 팔레트 문자를 그 시점의
 *   HEX 로 굽는다. 그 그리드를 화면에 쓰면 색약 모드에서 **타워가 발사하는 순간에만**
 *   원래 색으로 튄다(지난 라운드에 유닛 모션에서 실제로 났던 사고와 같은 것이다).
 *   그래서 화면 경로는 문자를 보존하고, 두 경로가 같은 그림이라는 것은
 *   `tower-anim.test.ts` 가 픽셀 단위로 고정한다.
 */
export function towerFireFrame(kind: TowerFireKind, f: AnimFrame, t2 = false): SpriteGrid {
  return buildTowerFire(kind, f, t2, false);
}

/** 발사 프레임 안에서 정지 스프라이트 몸통이 놓이는 위치(반동 0 기준). 화면 배선의 원점 보정값이다. */
export const TOWER_FIRE_BODY_ORIGIN = { x: FIRE_BODY_X, y: FIRE_BODY_Y } as const;
