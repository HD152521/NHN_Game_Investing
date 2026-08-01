/**
 * 아군 유닛 스프라이트 — 원본 `allyRookie()` / `allyScout()` / `allyAnchor()` / `allyParts()` 이식.
 * 좌표·색 문자는 원본 그대로다.
 */

import { mk, type SpriteGrid } from './grid';

/** 원본 `allyRookie()` — `tf-ally-01` */
export function allyRookie(): SpriteGrid {
  const c = mk(26, 34);
  c.rect(8, 26, 4, 6, '2').rect(14, 27, 4, 5, '2');
  c.rect(6, 32, 7, 2, '3').rect(13, 32, 7, 2, '3');
  c.rect(7, 15, 12, 12, '3').rect(7, 15, 12, 3, '2');
  c.rect(10, 19, 4, 6, 'w').rect(7, 21, 12, 2, 'r');
  c.rect(18, 18, 6, 3, '3').rect(23, 14, 3, 9, 'm');
  c.disc(13, 9, 6, 'm').rect(7, 9, 13, 3, 'm').rect(12, 11, 8, 3, '2');
  return c.outline('0').rim('w').g;
}

/** 원본 `allyScout()` — `tf-ally-02` */
export function allyScout(): SpriteGrid {
  const c = mk(26, 34);
  c.disc(5, 18, 4, 'm').disc(5, 18, 2, '2');
  c.line(11, 12, 21, 3, 'm').px(21, 3, 'r').px(22, 2, 'm');
  c.rect(9, 25, 4, 7, '2').rect(15, 26, 4, 6, '2');
  c.rect(8, 32, 6, 2, '3').rect(14, 32, 6, 2, '3');
  c.rect(8, 13, 11, 13, '3').rect(8, 13, 11, 3, '2');
  c.rect(11, 17, 4, 7, 'w').rect(8, 19, 11, 2, 'r');
  c.line(8, 16, 18, 24, 'w').line(8, 24, 18, 16, 'w');
  c.disc(13, 8, 5, '3').rect(15, 6, 4, 3, 'r');
  c.rect(17, 16, 4, 3, '3').rect(20, 15, 5, 3, 'm').rect(24, 14, 2, 2, 'r');
  return c.outline('0').rim('w').g;
}

/** 원본 `allyAnchor()` — `tf-ally-03` */
export function allyAnchor(): SpriteGrid {
  const c = mk(28, 34);
  c.rect(6, 25, 5, 7, '2').rect(15, 25, 5, 7, '2');
  c.rect(4, 32, 8, 2, '3').rect(14, 32, 8, 2, '3');
  c.rect(6, 12, 13, 14, '3').rect(6, 12, 13, 3, '2');
  c.disc(6, 14, 4, '3').disc(19, 14, 4, '3');
  c.rect(9, 16, 5, 7, 'w').rect(6, 18, 13, 2, 'r');
  c.disc(12, 7, 5, '3').rect(14, 5, 4, 3, 'r');
  c.rect(21, 10, 6, 19, 'm').rect(22, 11, 4, 17, '3');
  c.disc(24, 19, 2, 'm').rect(21, 14, 6, 1, 'm').rect(21, 24, 6, 1, 'm');
  return c.outline('0').rim('w').g;
}

/**
 * 원본 `allyParts()` — `tf-ally-parts`
 *
 * ⚠️ 부품 참조 시트다. 게임 엔티티가 아니므로 **게임 화면에 그리지 마라.**
 *    (몸통/팔/다리/무기 부품을 나란히 늘어놓은 디자인 참조용 그림이다.)
 */
export function allyParts(): SpriteGrid {
  const c = mk(76, 34);
  c.rect(4, 6, 12, 14, '3').rect(4, 6, 12, 3, '2').rect(7, 10, 4, 6, 'w').rect(4, 12, 12, 2, 'r');
  c.disc(10, 3, 4, '3');
  c.rect(24, 8, 8, 4, '3');
  c.rect(24, 16, 7, 4, '3').rect(30, 17, 2, 2, 'w');
  c.rect(40, 6, 5, 9, '2');
  c.rect(40, 19, 4, 8, '2').rect(38, 26, 7, 2, '3');
  c.rect(54, 8, 4, 16, 'm').rect(52, 6, 8, 3, 'm').rect(55, 12, 2, 8, '2');
  c.rect(66, 10, 6, 12, 'm').rect(67, 12, 4, 8, '3').disc(69, 16, 1, 'm');
  return c.outline('0').rim('w').g;
}
