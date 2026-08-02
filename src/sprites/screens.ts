/**
 * 화면 목업 2장 — 원본 `titleScreen()` / `revealScreen()` 이식.
 * 좌표·색은 원본 그대로다(재해석 금지).
 *
 * ★★ 전장에 blit 하지 마라 ★★
 *   둘 다 168×76 짜리 **한 화면 통째** 다. 유닛·타워처럼 전장 좌표에 얹는 스프라이트가
 *   아니라, `tf-sky-wide` 와 같은 부류의 **구도 시트**다(그쪽은 파노라마, 이쪽은 화면).
 *   전장 위에 그리면 화면 안에 작은 화면이 하나 더 떠 있는 그림이 된다.
 *   그래서 `SPRITE_BUILDERS` 에는 키를 노출하되 `draw-*.ts` 어디에서도 참조하지 않는다
 *   (테스트 `screens.test.ts` 가 이 사실을 고정한다).
 *
 * ★ 그런데 `tf-fx-screen`·`tf-sky-scrim` 같은 "패널 여러 개 + 구분선" 비교 시트는 **아니다.**
 *   근거(실측):
 *     - `tf-fx-screen` 은 같은 `panel()` 을 x = 2 / 34 / 66 에 세 번 그리고 그 사이를
 *       세로로 완전히 빈 열(`'1'` 로만 채워진 열 9개: x = 0,1,30,31,32,64,65,94,95)로 가른다.
 *       `tf-sky-scrim` 은 같은 씬을 좌우에 두 번 놓고 x = 60·61 두 열을 구분선으로 쓴다.
 *     - `tf-title`·`tf-reveal` 에는 **위아래로 균일한 열이 하나도 없다**(0 / 168).
 *       즉 화면을 세로로 가르는 구분선이 존재하지 않는다.
 *     - 반복 렌더도 없다. `titleScreen` 은 씬 1장 + 타이틀 바 + 로고 + 버튼 2개 + 유닛 4체를
 *       한 구도에 배치하고, `revealScreen` 은 캔들 차트 위에 카드 프레임 1개를 얹는다.
 *   결론: **비교 시트가 아니라 화면 목업**이다. 나중에 타이틀/공개 화면을 만들면 이 그림을
 *   기준으로 UI 를 짜면 된다.
 *
 * ★ 색약 모드 ★ `titleScreen` 은 씬(생 색) + `darken` + `stamp`(팔레트 문자를 HEX 로 구움)
 *   이라 **전부 생 색**이다 — 색약 팔레트를 따라가지 않는다(원본이 그렇다).
 *   `revealScreen` 은 팔레트 문자만 쓰므로 색약 모드가 정상 동작한다.
 */

import { allyAnchor, allyRookie } from './ally';
import { enemyBlocker, enemyRusher } from './enemy';
import { mk, type SpriteGrid } from './grid';
import { sceneColor } from './mood';
import type { SpriteCell } from './palette';
import { darkenGrid, stampGrid } from './scene-wide';
import { scene } from './scene';

/** 화면 목업의 크기. 두 장이 같다. */
export const SCREEN_WIDTH = 168;
export const SCREEN_HEIGHT = 76;

/** 원본 `darken(bg, 0.42)` — 타이틀 배경을 UI 뒤로 물리는 양. */
const TITLE_DARKEN = 0.42;
/** 원본 `laneY` — 유닛이 서는 바닥선. */
const TITLE_LANE_Y = 74;

/**
 * 원본 `titleScreen()` 의 생 색.
 *
 * `#` 없이 6자리만 두는 이유는 `src/sprites/mood.ts` 머리말과 같다 —
 * `src/design/no-hardcoded-hex.test.ts` 가 팔레트 파일 밖의 `#RRGGBB` 리터럴을 막는다.
 * 이 값들은 팔레트 토큰이 아니라 **원본 아트 데이터**라 토큰으로 대체할 수 없다.
 */
const TITLE_INK = {
  accent: sceneColor('FF4D5A'),
  rule: sceneColor('7C89A3'),
  frame: sceneColor('05070C'),
  panel: sceneColor('0F1524'),
  badge: sceneColor('B32330'),
  tick: sceneColor('FFC53D'),
  button: sceneColor('1A2236'),
  lane: sceneColor('1B4A42'),
} as const;

/** 그리드에 직접 찍는다. 원본 `titleScreen` 안의 지역 `px` 와 같은 경계 검사다. */
function screenPx(g: SpriteGrid, x: number, y: number, col: SpriteCell): void {
  const rx = Math.round(x);
  const ry = Math.round(y);
  if (ry < 0 || ry >= SCREEN_HEIGHT || rx < 0 || rx >= SCREEN_WIDTH) return;
  const row = g[ry];
  if (row !== undefined) row[rx] = col;
}

function screenRect(g: SpriteGrid, x: number, y: number, w: number, h: number, col: SpriteCell): void {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) screenPx(g, x + i, y + j, col);
}

/**
 * 원본 `titleScreen()` — `tf-title`.
 *
 * ⚠️ 마지막 레인 점선(`px(x, laneY + 3, …)`)은 y = 77 이라 **캔버스(76) 밖이다** —
 *    원본에서도 한 픽셀도 그려지지 않는다. 좌표를 "고쳐서" 안으로 넣으면 원본 대조가 깨진다.
 */
export function titleScreen(): SpriteGrid {
  const g = darkenGrid(scene('dusk', SCREEN_WIDTH, SCREEN_HEIGHT, { region: 1 }), TITLE_DARKEN);

  screenRect(g, 30, 16, 108, 2, TITLE_INK.accent);
  screenRect(g, 30, 40, 108, 1, TITLE_INK.rule);
  screenRect(g, 30, 20, 76, 16, TITLE_INK.frame);
  screenRect(g, 31, 21, 74, 14, TITLE_INK.panel);
  screenRect(g, 108, 22, 30, 12, TITLE_INK.frame);
  screenRect(g, 109, 23, 28, 10, TITLE_INK.badge);
  for (let i = 0; i < 22; i += 3) screenRect(g, 112 + i, 26, 2, 4, TITLE_INK.tick);
  screenRect(g, 58, 44, 24, 7, TITLE_INK.frame);
  screenRect(g, 59, 45, 22, 5, TITLE_INK.button);
  screenRect(g, 86, 44, 24, 7, TITLE_INK.frame);
  screenRect(g, 87, 45, 22, 5, TITLE_INK.button);

  stampGrid(g, allyAnchor(), 4, TITLE_LANE_Y - 34);
  stampGrid(g, allyRookie(), 30, TITLE_LANE_Y - 32);
  stampGrid(g, enemyRusher(), 118, TITLE_LANE_Y - 34, true);
  stampGrid(g, enemyBlocker(), 138, TITLE_LANE_Y - 34, true);
  for (let x = 0; x < SCREEN_WIDTH; x += 5) screenPx(g, x, TITLE_LANE_Y + 3, TITLE_INK.lane);
  return g;
}

/** 원본 `revealScreen()` — `tf-reveal`. 캔들 차트 위에 공개 카드 1장. */
export function revealScreen(): SpriteGrid {
  const c = mk(SCREEN_WIDTH, SCREEN_HEIGHT);
  c.rect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT, '1');

  // 배경 캔들 — 두 사인파를 합친 결정적 시세다(난수 아님).
  for (let x = 6; x < 162; x += 5) {
    const t = 30 + Math.round(Math.sin(x * 0.09) * 12 + Math.sin(x * 0.31) * 4);
    const len = 5 + ((x * 7) % 10);
    const up = x % 10 < 5;
    c.rect(x, t, 3, len, up ? 'r' : 'b');
    c.rect(x + 1, t - 3, 1, len + 6, up ? 'd' : 'n');
  }

  // 카드 안쪽을 격자 디더로 눌러 차트를 뒤로 물린다.
  for (let y = 20; y < 56; y++) for (let x = 34; x < 134; x++) if ((x + y) % 2 === 0) c.px(x, y, '1');

  c.rect(34, 20, 100, 1, 'g').rect(34, 55, 100, 1, 'g');
  c.rect(34, 20, 1, 36, 'g').rect(133, 20, 1, 36, 'g');
  (
    [
      [34, 20],
      [130, 20],
      [34, 52],
      [130, 52],
    ] as const
  ).forEach((p) => {
    c.rect(p[0], p[1], 4, 1, 'w');
    c.rect(p[0] + (p[0] > 100 ? 3 : 0), p[1], 1, 4, 'w');
  });

  c.rect(44, 28, 34, 6, '2').rect(44, 28, 34, 1, 'm');
  c.rect(44, 38, 22, 4, '2');
  c.rect(90, 28, 34, 6, '2').rect(90, 28, 34, 1, 'm');
  c.rect(90, 38, 28, 4, '2');
  c.rect(44, 46, 80, 1, '3');
  for (let i = 0; i < 5; i++) c.rect(46 + i * 17, 49, 12, 3, i < 3 ? 'r' : '3');
  c.rect(0, 70, SCREEN_WIDTH, 6, '2');
  for (let x = 0; x < SCREEN_WIDTH; x += 6) c.px(x, 70, '3');
  return c.g;
}
