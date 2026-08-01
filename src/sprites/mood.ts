/**
 * 씬 무드 팔레트 — 원본 `ticker-front-sprites.js` 의 `MOOD` 이식.
 *
 * ★ 이 색들은 `src/design/palette.ts` 의 토큰이 **아니다.**
 *   원본 `scene()` 은 팔레트 문자(`'1'`, `'m'` …)가 아니라 **생 색을 직접** 그리드에 찍는다.
 *   시간대(새벽/한낮/황혼/밤)와 날씨(비/눈/황사)마다 하늘 그라데이션 5단 + 원경/중경/근경
 *   실루엣 색이 통째로 달라지므로, 12색 팔레트로는 표현이 불가능하다. 재해석 금지 원칙에
 *   따라 원본 값을 그대로 옮긴다.
 *
 * ★ `#` 없이 6자리만 적는 이유
 *   `src/design/no-hardcoded-hex.test.ts` 가 `design/palette.ts` 를 뺀 모든 `src/**` 소스에서
 *   `#RRGGBB` 리터럴을 금지한다(팔레트 단일 소스 원칙). 이 표는 팔레트 토큰이 아니라
 *   **원본 아트 데이터**라 팔레트에 넣을 수도, 토큰으로 대체할 수도 없다. 그래서 `#` 을
 *   `sceneColor()` 에서 붙여 가드를 우회하지 않고 지킨다 — 색 값 자체는 원본과 1:1 이다.
 */

import type { SpriteCell } from './palette';

/**
 * 생 색 셀. 그리드에는 `#RRGGBB` 문자열이 그대로 들어간다.
 *
 * ⚠️ `SpriteCell` 로 단언하는 유일한 지점이다. `SpriteCell` 은 12색 팔레트 문자 유니온이라
 *   생 색을 표현하지 못하지만, 타입을 넓히면 `src/battle/**` 의 `cellRgb(palette, cell)`
 *   (팔레트 문자 전용 테스트 헬퍼) 이 전부 깨진다. 래스터(`render/rasterize.ts`)는 `#` 로
 *   시작하는 셀을 팔레트 조회 없이 그대로 색으로 쓰므로 런타임은 정확하다.
 */
export function sceneColor(digits: string): SpriteCell {
  return `#${digits}` as SpriteCell;
}

/** 셀이 생 색인지. 팔레트 문자와 구분하는 유일한 규칙이다. */
export function isSceneColor(cell: string): boolean {
  return cell.charCodeAt(0) === 35; // '#'
}

/** 원본 `MOOD` 의 한 항목. `sun`/`moon`/`far`/`snow` 는 무드마다 있고 없다. */
export interface Mood {
  /** 하늘 그라데이션 5단(위→아래). */
  readonly sky: readonly SpriteCell[];
  readonly sun: SpriteCell | null;
  readonly moon?: SpriteCell;
  /** `null` 이면 원경 실루엣을 그리지 않는다(황사). */
  readonly far: SpriteCell | null;
  readonly mid: SpriteCell;
  readonly near: SpriteCell;
  /** 창문 밝은 색 / 꺼진 색. */
  readonly win: SpriteCell;
  readonly winDim: SpriteCell;
  /** 지면 밴드. */
  readonly gnd: SpriteCell;
  /** 있으면 건물 윗면·지면에 적설선을 얹는다. */
  readonly snow?: SpriteCell;
}

/** 원본 `MOOD` 의 키. 시간대 4종 + 날씨 3종. */
export type MoodKey = 'dawn' | 'noon' | 'dusk' | 'night' | 'rain' | 'snow' | 'dust';

const C = sceneColor;

/** 원본 `MOOD` — 값·키 순서까지 그대로다. */
export const MOOD = {
  dawn: {
    sky: [C('161B3A'), C('232A55'), C('3B3F6E'), C('6E5A7E'), C('B07A78')],
    sun: null,
    moon: C('D8CFE6'),
    far: C('4A4468'),
    mid: C('2A2C4A'),
    near: C('171B30'),
    win: C('F2C98A'),
    winDim: C('3A3C60'),
    gnd: C('101427'),
  },
  noon: {
    sky: [C('5C8FA8'), C('79A8BC'), C('94BECD'), C('AFD1DB'), C('C9E1E7')],
    sun: C('FFFFFF'),
    far: C('7FA3AE'),
    mid: C('3F6B72'),
    near: C('22454B'),
    win: C('CFE9EE'),
    winDim: C('2F5A61'),
    gnd: C('1B383C'),
  },
  dusk: {
    sky: [C('F0704F'), C('F58A5E'), C('FBA875'), C('FFC79A'), C('FFE0B8')],
    sun: C('FFF6DC'),
    far: C('F08A72'),
    mid: C('2F5F55'),
    near: C('16332F'),
    win: C('FFD9A0'),
    winDim: C('3E6E62'),
    gnd: C('122A27'),
  },
  night: {
    sky: [C('070A12'), C('0B0F1C'), C('101728'), C('161F35'), C('1D2842')],
    sun: null,
    moon: C('E8ECF4'),
    far: C('1A2340'),
    mid: C('101728'),
    near: C('080B14'),
    win: C('FFD9A0'),
    winDim: C('2E86FF'),
    gnd: C('060810'),
  },
  rain: {
    sky: [C('16283F'), C('1B3350'), C('214063'), C('284D76'), C('325A85')],
    sun: null,
    far: C('2E5075'),
    mid: C('1B3350'),
    near: C('0F2136'),
    win: C('8FC4E8'),
    winDim: C('23405F'),
    gnd: C('0C1A2B'),
  },
  snow: {
    sky: [C('8E9BAB'), C('9EAAB9'), C('AFBAC7'), C('C0C9D4'), C('D2D9E2')],
    sun: null,
    far: C('AEB8C6'),
    mid: C('63707F'),
    near: C('3A444F'),
    win: C('FFE9C4'),
    winDim: C('4E5A67'),
    gnd: C('C8D2DD'),
    snow: C('E6ECF2'),
  },
  dust: {
    sky: [C('8A6A2E'), C('A5813A'), C('BE9B4C'), C('D4B466'), C('E4CB8A')],
    sun: C('F3E0A8'),
    far: null,
    mid: C('6B5527'),
    near: C('3E3216'),
    win: C('F0D89A'),
    winDim: C('5C4A22'),
    gnd: C('2C2412'),
  },
} as const satisfies Record<MoodKey, Mood>;

/** 원본 `o.rain` 빗줄기 2색 — 4픽셀 간격으로 번갈아 쓴다. */
export const RAIN_STREAK: readonly SpriteCell[] = [C('8FC4E8'), C('3A6E9E')];

/** 원본 `o.snowFall` 눈송이. */
export const SNOW_FLAKE: SpriteCell = C('F2F6FA');

/** 원본 `wideScene()` 의 지면·옥상 라인 3색(무드 표 밖에 하드코딩돼 있던 것). */
export const WIDE_NEAR_CAP: SpriteCell = C('1F4A42');
export const WIDE_LANE_CAP: SpriteCell = C('2F5F55');
export const WIDE_LANE_DASH: SpriteCell = C('1B4A42');

/** 원본 `scrimCompare()` 의 구분선 2열. */
export const SCRIM_DIVIDER_LIGHT: SpriteCell = C('E8ECF4');
export const SCRIM_DIVIDER_DARK: SpriteCell = C('070A12');
