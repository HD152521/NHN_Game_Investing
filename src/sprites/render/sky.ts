/**
 * 하늘(시간대) 레이어 — 어떤 그림을 어디에 놓을지. 그리는 것은 `battle/draw-background.ts` 다.
 *
 * ★ 지역별 시간대 키(`tf-r{1,2,3}-*`)와 기존 `tf-bg-*` 의 관계
 *   원본에서 둘은 **다른 물건**이다.
 *     - `bgFar(r)` / `bgMid(r)` : 104×30, 팔레트 문자 12색, 첫 줄이 `c.rect(0,0,104,30,'1')`
 *       즉 **BG_0 으로 꽉 찬 불투명 타일**이다. 가로로 반복해 깔라고 만든 밴드다.
 *     - `scene(mood, w, h, {region})` : 108×56, 생 색, 하늘 그라데이션 + 해/달 + 원경·중경·
 *       근경 실루엣 + 지면까지 **한 장에 다 들어 있는 완성 씬**이다. 폭이 104 가 아니고
 *       해가 0.74W 에 고정이라 타일링이 불가능하다.
 *   그래서 대체가 아니라 **별도 레이어**로 쓴다. 씬을 화면 전체에 1회 배치해 뒤에 깔고,
 *   그 위에 기존 far/mid 밴드를 그대로 얹는다. far/mid 가 불투명이므로 씬에서 실제로 보이는
 *   부분은 밴드 위쪽 — 즉 **하늘·해·달**뿐이고, 씬이 품고 있는 스카이라인·지면은 가려진다.
 *   덕분에 도시가 두 벌 보이지 않으면서 시간대만 갈아끼울 수 있다.
 *
 * ★ `tf-sky-wide` 는 여기 없다. 852×240 파노라마는 유닛·보스까지 박힌 구도 검증 시트라
 *   배경으로 반복하면 보스가 여러 마리 나온다(`scene-wide.ts` 주석 참고).
 */

import { scene } from '../scene';
import type { Region } from '../types';
import { spriteSourceOfKey, type SpriteSource } from './cache';
import type { RenderableSpriteKey } from './composite';

/** 시간대 4종. 원본 `MOOD` 의 시간대 축이다(날씨 3종은 별개 축이라 여기 없다). */
export type TimeOfDay = 'dawn' | 'noon' | 'dusk' | 'night';

/**
 * 기본 시간대.
 *
 * 원본이 파노라마(`wideScene()`)와 스크림 비교(`scrimCompare()`) 를 둘 다 `dusk` 로 구웠다 —
 * 즉 디자인이 고른 대표 시간대다. 기획이 시간대를 정하기 전까지 그것을 따른다.
 */
export const DEFAULT_TIME_OF_DAY: TimeOfDay = 'dusk';

/** 지역별 씬의 원본 크기 — `scene('…', 108, 56, { region })`. */
export const SKY_SCENE_WIDTH = 108;
export const SKY_SCENE_HEIGHT = 56;

/**
 * 원본이 **실제로 구운** 지역×시간대 키. 8칸뿐이다.
 *
 * 빈 칸이 두 종류 있다:
 *   - 새벽: 원본에 지역별 새벽이 없다(지역 없는 `tf-sky-dawn` 116×62 한 장뿐).
 *   - R3 밤: 원본이 R3 세 번째 칸을 밤 대신 **황사**(`tf-r3-dust`) 로 썼다. 황사는 시간대가
 *     아니라 날씨라 밤 자리를 대신할 수 없다.
 * 빈 칸은 `scene()` 을 직접 불러 같은 108×56 로 만든다 — 키는 별칭일 뿐이고 진짜 소스는
 * 파라메트릭 함수라는 원칙 그대로다. 크기가 다른 `tf-sky-dawn`(116×62) 을 섞지 않으므로
 * 12칸의 배치 계산이 하나로 통일된다.
 */
export const SKY_SCENE_KEYS = {
  1: { noon: 'tf-r1-noon', dusk: 'tf-r1-dusk', night: 'tf-r1-night' },
  2: { noon: 'tf-r2-noon', dusk: 'tf-r2-dusk', night: 'tf-r2-night' },
  3: { noon: 'tf-r3-noon', dusk: 'tf-r3-dusk' },
} as const satisfies Record<Region, Partial<Record<TimeOfDay, RenderableSpriteKey>>>;

/** 원본 키에는 없지만 씬으로 만들 수 있는 날씨 하늘. 배선 전이라 참고용으로만 노출한다. */
export const SKY_WEATHER_KEYS = {
  rain: 'tf-sky-rain',
  snow: 'tf-sky-snow',
  dust: 'tf-sky-dust',
} as const satisfies Record<string, RenderableSpriteKey>;

/** 이 지역·시간대의 원본 키. 없으면 `null` — 파라메트릭으로 만들어야 한다. */
export function skySceneKey(region: Region, timeOfDay: TimeOfDay): RenderableSpriteKey | null {
  const row: Partial<Record<TimeOfDay, RenderableSpriteKey>> = SKY_SCENE_KEYS[region];
  return row[timeOfDay] ?? null;
}

/**
 * 굽기 요청 메모 — 조합당 한 번만 그리드를 만든다(최대 12칸).
 *
 * 배경은 **매 프레임** 그려진다. 여기서 그리드를 새로 만들면 프레임마다 108×56 루프가 돈다.
 * 만들어진 그리드는 래스터 캐시가 한 번 읽고 캔버스로 구운 뒤 다시 보지 않으므로 공유해도 된다.
 */
const sources = new Map<string, SpriteSource>();

/**
 * 이 지역·시간대를 굽기 위한 요청 하나.
 * 원본 키가 있으면 키를 그대로 id 로 써서 `ofKey()` 와 래스터 캐시를 공유한다.
 */
export function skySource(region: Region, timeOfDay: TimeOfDay): SpriteSource {
  const key = skySceneKey(region, timeOfDay);
  const id = key ?? `sky-r${region}-${timeOfDay}`;
  const hit = sources.get(id);
  if (hit !== undefined) return hit;

  const source: SpriteSource =
    key !== null
      ? spriteSourceOfKey(key)
      : { id, grid: scene(timeOfDay, SKY_SCENE_WIDTH, SKY_SCENE_HEIGHT, { region }), composite: 'alpha' };
  sources.set(id, source);
  return source;
}

/** 지면 밴드 높이 비율 — 원본 `scene()` 의 `Math.round(h * 0.10)`. */
const GROUND_RATIO = 0.1;

/** 씬 스프라이트에서 **지면선**이 놓인 행. 화면의 지면선과 맞출 기준점이다. */
export function sceneGroundRow(spriteHeight: number): number {
  return spriteHeight - Math.round(spriteHeight * GROUND_RATIO);
}

/**
 * 하늘 씬을 화면에 덮는 **정수 배율**.
 *
 * 원본 `paint()` 처럼 정수 배율만 쓴다(비정수로 늘리면 픽셀 크기가 들쭉날쭉해진다).
 * 가로는 화면 폭을, 세로는 지면선 위 전체를 덮어야 하므로 둘 중 큰 쪽을 고른다.
 */
export function skyCoverScale(width: number, groundY: number, spriteWidth: number, spriteHeight: number): number {
  if (spriteWidth <= 0 || spriteHeight <= 0) return 1;
  const byWidth = Math.ceil(width / spriteWidth);
  const groundRow = sceneGroundRow(spriteHeight);
  const byHeight = groundRow > 0 ? Math.ceil(groundY / groundRow) : 1;
  return Math.max(1, byWidth, byHeight);
}

/** 화면 가운데 정렬한 좌상단 x. 넘치는 좌우는 캔버스 밖으로 잘린다. */
export function skyOriginX(width: number, spriteWidth: number, scale: number): number {
  return Math.round((width - spriteWidth * scale) / 2);
}

/** 씬의 지면선이 화면 지면선(`groundY`)에 정확히 얹히는 좌상단 y. 항상 0 이하다. */
export function skyOriginY(groundY: number, spriteHeight: number, scale: number): number {
  return Math.round(groundY) - sceneGroundRow(spriteHeight) * scale;
}
