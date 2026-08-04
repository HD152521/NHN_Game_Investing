/**
 * 세계지도 — 10지역 전역 극장 (PRD FR-2 "미니 세계지도", 목업 `worldmap`).
 *
 * ★ 왜 지역 선택 화면을 대체하지 않고 그 **앞에** 들어가는가 ★
 * 기존 `region-select.ts`는 "한 국가 안에서 어느 전선을 잡을 것인가"를 고르는 화면이고,
 * 목업의 `countrymap`이 정확히 그 화면이다. 세계지도는 그 위층 — **어느 국가로 갈
 * 것인가** —이라 층이 다르다. 대체하면 R1/R2/R3 카드 배선(`regionButtons` ·
 * `syncRegionLocks` · `mountRegionArt` · 결과 화면의 [지역 선택으로])을 전부 다시 짜야 하고,
 * 그 배선은 click-path 감사가 결함 5건을 찾아낸 바로 그 구역이다. 층을 얹는 편이
 * 파급이 없고, 목업의 "← 세계지도" 버튼도 이 구조를 전제하고 있다.
 *
 * ★ 지도를 문자 그리드로 두지 않는 이유 ★
 * 목업의 격자는 8px 셀 · 144×57이다. 그 해상도를 손으로 찍은 문자 블록으로 들고 있으면
 * 57줄 × 144자짜리 덩어리가 되고, 대륙 하나를 고치려면 그 덩어리를 눈으로 세야 한다.
 * 그래서 대륙을 **경위도 사각형 목록**으로 두고 셀 격자로 굽는다(`worldCells`) —
 * 데이터가 사람이 읽을 수 있는 단위(경도 −180~180 / 위도 −60~80)로 남고, 해상도를
 * 바꿔도 데이터는 그대로다.
 *
 * ⚠️ **지리적 정확도를 목표로 하지 않는다.** 이건 실루엣이다 — 한 컷에 "어느 대륙인지"만
 * 읽히면 된다. 정밀한 해안선이 필요해지는 날에는 이 파일이 아니라 실제 지형 데이터를
 * 넣어야 한다.
 */

import type { StageId } from '../combat';
import type { GameProgress } from './progress';
import { emptyProgress, hasCleared } from './progress';

/** `stage.ts`가 이 값으로 지도 버튼을 찾는다. */
export const WORLD_SELECT_ACTION = 'select-world-region';
export const WORLD_ENTER_ACTION = 'world-enter';
export const WORLD_BACK_ACTION = 'world-back';
/** 지도 캔버스가 꽂히는 자리 표시자. */
export const WORLD_CANVAS_REF = 'world-canvas';

export const WORLD_TITLE = '세계지도';
export const WORLD_EYEBROW = 'GLOBAL THEATER · 10 REGIONS';
export const WORLD_BACK_LABEL = '← 타이틀로';
export const WORLD_ENTER_LABEL = '진 입';

/** 지도 격자 — 목업의 `EQUIRECTANGULAR · 2.5° / CELL · 8px`가 그대로 이 세 상수다. */
export const CELL_DEGREES = 2.5;
export const GRID_WIDTH = 144;
export const GRID_HEIGHT = 57;
/** 격자 위쪽 끝 위도. 아래쪽은 `80 - 57 × 2.5 = -62.5°`가 된다. */
export const TOP_LATITUDE = 80;

export type WorldRegionId =
  | 'korea'
  | 'japan'
  | 'china'
  | 'india'
  | 'europe'
  | 'namerica'
  | 'samerica'
  | 'africa'
  | 'russia'
  | 'oceania';

/** 지역의 해금 상태. 목업 사이드바의 [진행 중 / 해금 / 잠김] 세 가지다. */
export type WorldRegionStatus = 'active' | 'unlocked' | 'locked';

/** 경위도 사각형 하나. `lon`/`lat`는 좌상단(서쪽·북쪽) 모서리다. */
interface LandBox {
  readonly lon: number;
  readonly lat: number;
  readonly lonSpan: number;
  readonly latSpan: number;
}

const box = (lon: number, lat: number, lonSpan: number, latSpan: number): LandBox => ({
  lon,
  lat,
  lonSpan,
  latSpan,
});

/**
 * 위도 한 줄(밴드)을 경도 구간으로 칠한다.
 *
 * ★ 왜 밴드인가 ★ 예전에는 대륙 하나를 사각형 1~4개로 근사했는데, 그러면 지도가 아니라
 * **색 블록**으로 보인다("세계지도면 세계지도처럼 보여야 한다"는 지적이 이것이다).
 * 저해상도 격자에서 대륙 실루엣을 세우는 표준적인 방법은 **위도별로 해안선을 훑는 것**이다 —
 * 스캔라인 래스터화와 같은 원리다.
 *
 * `latTop`에서 아래로 `latSpan`만큼, 경도 `lonWest`~`lonEast`를 채운다.
 */
const band = (latTop: number, lonWest: number, lonEast: number, latSpan = 2.5): LandBox =>
  box(lonWest, latTop, lonEast - lonWest, latSpan);

export interface WorldRegion {
  readonly id: WorldRegionId;
  readonly name: string;
  /** 목업 우측 패널의 영문 코드. */
  readonly code: string;
  /** 사이드바에 뜨는 전선 수. 실제로 플레이 가능한 수와 다를 수 있다(§ `playableStages`). */
  readonly stageCount: number;
  /** 한 줄 정체성. 목업 패널의 설명문. */
  readonly flavor: string;
  /**
   * 이 지역이 실제로 굴릴 수 있는 스테이지.
   *
   * ★ 여기가 "지도는 10지역인데 왜 다 못 가는가"의 정직한 답이다 ★
   * 밸런스가 잡힌 스테이지는 `STAGES`에 있는 것뿐이다. 지도를 10칸으로 그려 놓고
   * 없는 스테이지로 보내면 빈 화면이 뜬다. 그래서 **플레이 가능한 지역만** 목록을 갖고,
   * 나머지는 비어 있다 — 비어 있으면 `진입`이 잠긴다(`isPlayable`).
   */
  readonly playableStages: readonly StageId[];
  /** 지도에 칠할 땅. 비어 있으면 지도에 그려지지 않는다(있을 수 없는 경우). */
  readonly land: readonly LandBox[];
}

/**
 * 10지역 정의.
 *
 * 사각형은 실루엣이 읽히는 최소 개수만 쓴다. 대륙 하나에 20개를 쓰면 데이터가 아니라
 * 비트맵이 되고, 그러면 문자 그리드를 피한 의미가 없다.
 */
export const WORLD_REGIONS: readonly WorldRegion[] = [
  {
    id: 'korea',
    name: '한국',
    code: 'KOREA',
    stageCount: 3,
    flavor: '홈 그라운드. 개인 투자자의 전장.',
    playableStages: ['R1', 'R2', 'R3'],
    land: [
      // 한반도 — 세계 격자(2.5°)에서는 3밴드가 한계다. 자세한 형태는 전선 지도가 맡는다.
      band(43, 126, 130.5),
      band(40.5, 124.5, 130),
      band(38, 126, 129.5),
      band(35.5, 126, 129.5, 1.5),
    ],
  },
  {
    id: 'japan',
    name: '일본',
    code: 'JAPAN',
    stageCount: 3,
    flavor: '엔 캐리와 상사(商社)의 나라. 준비 중.',
    playableStages: [],
    land: [
      // 홋카이도 → 혼슈 → 규슈. 호(弧)를 이루며 남서로 흐른다.
      band(45.5, 140.5, 145.5),
      band(43, 140, 145),
      band(40.5, 139.5, 142),
      band(38, 137.5, 141.5),
      band(35.5, 132.5, 140.5),
      band(33, 129.5, 136),
      band(31.5, 129.5, 132, 1.5),
      band(28, 127, 129.5, 2),
    ],
  },
  {
    id: 'china',
    name: '중국',
    code: 'CHINA',
    stageCount: 4,
    flavor: '국가가 시장을 겸하는 곳. 준비 중.',
    playableStages: [],
    land: [
      // 북동(만주) → 화북 → 화남. 동해안이 계단처럼 내려간다.
      band(53, 118, 135),
      band(50.5, 85, 135),
      band(48, 75, 134),
      band(45.5, 73, 133),
      band(43, 73, 131),
      band(40.5, 74, 126),
      band(38, 75, 123),
      band(35.5, 76, 122),
      band(33, 78, 122),
      band(30.5, 82, 122),
      band(28, 85, 121),
      band(25.5, 88, 120),
      band(23, 97, 117),
      band(20.5, 99, 111, 2),
    ],
  },
  {
    id: 'india',
    name: '인도',
    code: 'INDIA',
    stageCount: 3,
    flavor: '인구가 곧 수요인 시장. 준비 중.',
    playableStages: [],
    land: [
      // 히말라야 아래로 넓다가 데칸 고원에서 뾰족해진다 — 역삼각형이 인도의 서명이다.
      band(35, 74, 79),
      band(32.5, 71, 81),
      band(30, 69, 89),
      band(27.5, 68, 92),
      band(25, 68, 93),
      band(22.5, 69, 93),
      band(20, 70, 87),
      band(17.5, 72, 85),
      band(15, 73, 82),
      band(12.5, 74, 80),
      band(10, 75, 79),
      band(7.5, 76, 79, 1.5),
    ],
  },
  {
    id: 'europe',
    name: '유럽',
    code: 'EUROPE',
    stageCount: 5,
    flavor: '오래된 자본과 규제의 대륙. 준비 중.',
    playableStages: [],
    land: [
      // 스칸디나비아(북) → 서유럽 → 이베리아·이탈리아(남). 서쪽 해안이 들쭉날쭉하다.
      band(71, 20, 31),
      band(68.5, 14, 33),
      band(66, 12, 34),
      band(63.5, 5, 33),
      band(61, 4, 32),
      band(58.5, -8, 32),
      band(56, -10, 30),
      band(53.5, -10, 30),
      band(51, -10, 30),
      band(48.5, -5, 28),
      band(46, -2, 28),
      band(43.5, -9, 27),
      band(41, -9, 26),
      band(38.5, -9, 24),
      band(36, -8, 16, 2),
    ],
  },
  {
    id: 'namerica',
    name: '북미',
    code: 'N.AMERICA',
    stageCount: 6,
    flavor: '세계 유동성의 진앙. 준비 중.',
    playableStages: [],
    land: [
      // 알래스카·캐나다(넓다) → 미국 본토 → 멕시코·중미(가늘어진다).
      band(71, -160, -68),
      band(68.5, -165, -62),
      band(66, -163, -60),
      band(63.5, -160, -58),
      band(61, -150, -56),
      band(58.5, -140, -55),
      band(56, -135, -56),
      band(53.5, -132, -56),
      band(51, -130, -55),
      band(48.5, -127, -60),
      band(46, -125, -66),
      band(43.5, -124, -68),
      band(41, -124, -70),
      band(38.5, -123, -74),
      band(36, -122, -76),
      band(33.5, -120, -78),
      band(31, -117, -81),
      band(28.5, -115, -82),
      band(26, -113, -80),
      band(23.5, -110, -86),
      band(21, -106, -86),
      band(18.5, -104, -87),
      band(16, -99, -86),
      band(13.5, -93, -83),
      band(11, -87, -82, 2),
    ],
  },
  {
    id: 'samerica',
    name: '남미',
    code: 'S.AMERICA',
    stageCount: 3,
    flavor: '원자재와 초인플레의 대륙. 준비 중.',
    playableStages: [],
    land: [
      // 북쪽이 가장 넓고 남으로 갈수록 뾰족해진다 — 남미의 서명은 그 삼각형이다.
      band(12, -74, -60),
      band(9.5, -78, -57),
      band(7, -79, -50),
      band(4.5, -79, -46),
      band(2, -80, -44),
      band(-0.5, -80, -42),
      band(-3, -80, -36),
      band(-5.5, -80, -34),
      band(-8, -79, -34),
      band(-10.5, -77, -35),
      band(-13, -76, -37),
      band(-15.5, -74, -38),
      band(-18, -72, -39),
      band(-20.5, -71, -40),
      band(-23, -70, -41),
      band(-25.5, -71, -47),
      band(-28, -71, -49),
      band(-30.5, -72, -51),
      band(-33, -72, -53),
      band(-35.5, -73, -56),
      band(-38, -73, -57),
      band(-40.5, -73, -62),
      band(-43, -74, -64),
      band(-45.5, -75, -66),
      band(-48, -75, -67),
      band(-50.5, -75, -68),
      band(-53, -74, -68, 2),
    ],
  },
  {
    id: 'africa',
    name: '아프리카',
    code: 'AFRICA',
    stageCount: 4,
    flavor: '프런티어. 준비 중.',
    playableStages: [],
    land: [
      // 북(사하라)이 가장 넓고 적도 아래로 좁아진다. 서아프리카 돌출부가 서명이다.
      band(37, -6, 11),
      band(34.5, -8, 25),
      band(32, -9, 32),
      band(29.5, -11, 34),
      band(27, -13, 35),
      band(24.5, -14, 36),
      band(22, -16, 37),
      band(19.5, -16, 38),
      band(17, -17, 39),
      band(14.5, -17, 42),
      band(12, -17, 44),
      band(9.5, -15, 47),
      band(7, -13, 47),
      band(4.5, -9, 45),
      band(2, 8, 43),
      band(-0.5, 9, 42),
      band(-3, 11, 41),
      band(-5.5, 12, 40),
      band(-8, 12, 40),
      band(-10.5, 13, 40),
      band(-13, 13, 40),
      band(-15.5, 12, 40),
      band(-18, 12, 37),
      band(-20.5, 13, 35),
      band(-23, 14, 35),
      band(-25.5, 15, 33),
      band(-28, 16, 32),
      band(-30.5, 17, 31),
      band(-33, 18, 28, 2),
    ],
  },
  {
    id: 'russia',
    name: '러시아·CIS',
    code: 'RUSSIA·CIS',
    stageCount: 3,
    flavor: '자원과 제재 사이. 준비 중.',
    playableStages: [],
    land: [
      // 유라시아 북부를 가로지르는 띠. 유럽·중국이 먼저 칠한 칸은 자동으로 비켜간다
      // (`worldCells`가 먼저 claim 한 지역을 이긴다).
      band(78, 55, 105),
      band(75.5, 40, 145),
      band(73, 35, 150),
      band(70.5, 30, 175),
      band(68, 28, 180),
      band(65.5, 26, 180),
      band(63, 25, 180),
      band(60.5, 22, 175),
      band(58, 22, 165),
      band(55.5, 22, 160),
      band(53, 25, 145),
      band(50.5, 28, 143),
      band(48, 30, 140),
      band(45.5, 35, 90),
      band(43, 40, 85),
      band(40.5, 45, 80, 2),
    ],
  },
  {
    id: 'oceania',
    name: '오세아니아',
    code: 'OCEANIA',
    stageCount: 2,
    flavor: '자원 통화의 남쪽 끝. 준비 중.',
    playableStages: [],
    land: [
      // 호주 본토 + 태즈메이니아 + 뉴질랜드. 셋이 떨어져 있는 것이 이 지역의 서명이다.
      band(-10.5, 131, 143),
      band(-13, 126, 144),
      band(-15.5, 122, 146),
      band(-18, 118, 147),
      band(-20.5, 115, 149),
      band(-23, 113, 151),
      band(-25.5, 113, 153),
      band(-28, 114, 153),
      band(-30.5, 115, 153),
      band(-33, 115, 152),
      band(-35.5, 117, 150),
      band(-38, 140, 148, 1.5),
      // 태즈메이니아
      band(-41, 144.5, 148, 2.5),
      // 뉴질랜드 — 북섬·남섬
      band(-35, 172.5, 178.5, 3),
      band(-40, 172, 176, 3),
      band(-43, 167, 174, 3),
    ],
  },
];

/** 사이드바·지도가 같은 순서를 쓴다. `WORLD_REGIONS`의 배열 순서가 그 순서다. */
export const WORLD_ORDER: readonly WorldRegionId[] = WORLD_REGIONS.map((region) => region.id);

function regionById(id: WorldRegionId): WorldRegion | undefined {
  return WORLD_REGIONS.find((region) => region.id === id);
}

/** 플레이 가능한 지역인가 — 스테이지가 하나라도 있어야 한다. */
export function isPlayable(region: WorldRegion): boolean {
  return region.playableStages.length > 0;
}

/**
 * 지역 상태.
 *
 * - `active` — 지금 굴릴 수 있고, 아직 전부 깨지 않았다.
 * - `unlocked` — 굴릴 수 있는데 전부 깼다(= 점령 완료). 목업 사이드바의 "해금"이 이 칸이다.
 * - `locked` — 스테이지가 없다(콘텐츠 미구현). **잠긴 이유를 화면이 말해야 한다** —
 *   "준비 중"이라고 적는 것이 "잠김"이라고만 적는 것보다 정직하다.
 */
export function statusOf(region: WorldRegion, progress: GameProgress): WorldRegionStatus {
  if (!isPlayable(region)) return 'locked';
  const allCleared = region.playableStages.every((id) => hasCleared(progress, id));
  return allCleared ? 'unlocked' : 'active';
}

export const STATUS_LABEL: Readonly<Record<WorldRegionStatus, string>> = {
  active: '진행 중',
  unlocked: '점령 완료',
  locked: '준비 중',
};

/** 점령한 지역 수 / 전체. 목업 하단의 "점령 1 / 10 지역". */
export function conqueredCount(progress: GameProgress): number {
  return WORLD_REGIONS.filter((region) => statusOf(region, progress) === 'unlocked').length;
}

/** 문자열이 실제 지역 ID인지 (버튼 `dataset` 값 검증용). */
export function worldRegionFor(value: string | undefined): WorldRegion | null {
  if (value === undefined) return null;
  return regionById(value as WorldRegionId) ?? null;
}

// ── 지도 래스터화 ────────────────────────────────────────────

/** 격자 셀 하나 — 어느 지역의 땅인가. */
export interface WorldCell {
  readonly x: number;
  readonly y: number;
  readonly region: WorldRegionId;
}

/** 경도 → 셀 x. 격자 밖은 호출부가 자른다. */
export function lonToCell(lon: number): number {
  return Math.floor((lon + 180) / CELL_DEGREES);
}

/** 위도 → 셀 y. 위쪽(북쪽)이 0이다. */
export function latToCell(lat: number): number {
  return Math.floor((TOP_LATITUDE - lat) / CELL_DEGREES);
}

/**
 * 사각형 목록 → 셀 목록.
 *
 * 겹치는 칸은 **`WORLD_REGIONS` 순서가 앞선 지역이 이긴다** — 한국이 배열의 첫 번째라
 * 중국 사각형과 겹쳐도 한국 색으로 남는다. 이 규칙이 없으면 작은 지역이 큰 대륙에
 * 먹혀 지도에서 사라진다.
 */
export function worldCells(): readonly WorldCell[] {
  const owner = new Map<number, WorldRegionId>();

  for (const region of WORLD_REGIONS) {
    for (const land of region.land) {
      const x0 = lonToCell(land.lon);
      const x1 = lonToCell(land.lon + land.lonSpan);
      const y0 = latToCell(land.lat);
      const y1 = latToCell(land.lat - land.latSpan);
      for (let y = y0; y < y1; y += 1) {
        if (y < 0 || y >= GRID_HEIGHT) continue;
        for (let x = x0; x < x1; x += 1) {
          if (x < 0 || x >= GRID_WIDTH) continue;
          const key = y * GRID_WIDTH + x;
          if (!owner.has(key)) owner.set(key, region.id);
        }
      }
    }
  }

  const cells: WorldCell[] = [];
  for (const [key, region] of owner) {
    cells.push({ x: key % GRID_WIDTH, y: Math.floor(key / GRID_WIDTH), region });
  }
  return cells;
}

// ── 마크업 ───────────────────────────────────────────────────

const TITLE_ID = 'world-title';

function sidebarRow(region: WorldRegion, progress: GameProgress): string {
  const status = statusOf(region, progress);
  return `
        <li>
          <button class="wmap__row wmap__row--${status}" type="button"
                  data-action="${WORLD_SELECT_ACTION}" data-world="${region.id}">
            <span class="wmap__swatch wmap__swatch--${region.id}" aria-hidden="true"></span>
            <span class="wmap__row-name">${region.name}</span>
            <span class="wmap__row-count">${region.stageCount} STAGES</span>
            <span class="wmap__row-status">${STATUS_LABEL[status]}</span>
          </button>
        </li>`;
}

/** 우측 브리핑 패널. 선택이 바뀔 때마다 `stage.ts`가 이 함수로 다시 그린다. */
export function buildBriefingMarkup(region: WorldRegion, progress: GameProgress): string {
  const status = statusOf(region, progress);
  const playable = isPlayable(region);
  return `
      <p class="wmap__brief-eyebrow">REGION <span>${region.code}</span></p>
      <h3 class="wmap__brief-name">
        <span class="wmap__swatch wmap__swatch--${region.id}" aria-hidden="true"></span>
        ${region.name}
      </h3>
      <p class="wmap__brief-flavor">${region.flavor}</p>
      <dl class="wmap__brief-stats">
        <div><dt>스테이지</dt><dd>${region.stageCount} 스테이지</dd></div>
        <div><dt>상태</dt><dd>${STATUS_LABEL[status]}</dd></div>
        <div><dt>셀 그리드</dt><dd>8px · ${GRID_WIDTH}×${GRID_HEIGHT}</dd></div>
      </dl>
      <button class="wmap__enter" type="button" data-action="${WORLD_ENTER_ACTION}"
              data-world="${region.id}"${playable ? '' : ' disabled aria-disabled="true"'}>
        ${playable ? WORLD_ENTER_LABEL : '준비 중'}
      </button>`;
}

/** 하단 상태줄. 진행도가 바뀌면 함께 다시 그린다. */
export function buildFootMarkup(progress: GameProgress): string {
  return `점령 ${conqueredCount(progress)} / ${WORLD_REGIONS.length} 지역`;
}

/**
 * 세계지도 오버레이. **`hidden`으로 태어난다** — 타이틀 [스테이지 시작] 뒤에 열린다.
 * 사이드바는 진행도에 따라 상태가 바뀌므로 열 때 `buildSidebarMarkup`으로 다시 채운다.
 */
export function buildSidebarMarkup(progress: GameProgress = emptyProgress()): string {
  return WORLD_REGIONS.map((region) => sidebarRow(region, progress)).join('');
}

export function buildWorldMapMarkup(): string {
  return `
    <div class="wmap" data-ref="world-map" role="dialog" aria-modal="true"
         aria-labelledby="${TITLE_ID}" hidden>
      <div class="wmap__head">
        <h2 class="wmap__title" id="${TITLE_ID}">${WORLD_TITLE}</h2>
        <p class="wmap__eyebrow">${WORLD_EYEBROW}</p>
      </div>
      <ul class="wmap__list" data-ref="world-list"></ul>
      <div class="wmap__canvas-wrap">
        <canvas class="wmap__canvas" data-ref="${WORLD_CANVAS_REF}" role="img"
                aria-label="세계지도 — 지역 ${WORLD_REGIONS.length}곳"></canvas>
        <p class="wmap__proj">EQUIRECTANGULAR · ${CELL_DEGREES}° / CELL · 8px</p>
      </div>
      <aside class="wmap__brief" data-ref="world-brief"></aside>
      <div class="wmap__foot">
        <button class="wmap__back" type="button" data-action="${WORLD_BACK_ACTION}">
          ${WORLD_BACK_LABEL}
        </button>
        <span class="wmap__foot-status" data-ref="world-foot"></span>
      </div>
    </div>
  `;
}

// ── 캔버스 ───────────────────────────────────────────────────

/** 셀 한 변의 픽셀. 목업과 같은 8px. */
export const CELL_PIXELS = 8;

/**
 * 지역별 색을 CSS 변수 이름으로 준다.
 *
 * 하드코딩 HEX가 금지돼 있고(`no-hardcoded-hex`), 색약 모드가 토큰을 바꿔치기하므로
 * **캔버스도 토큰에서 색을 읽어야 한다.** `getComputedStyle`로 실제 값을 뽑아 쓴다 —
 * 그래야 테마가 바뀌면 지도도 같이 바뀐다.
 */
export const REGION_COLOR_VAR: Readonly<Record<WorldRegionId, string>> = {
  korea: '--tf-up-ally',
  japan: '--tf-enemy-down',
  china: '--tf-enemy-deep',
  india: '--tf-up-deep',
  europe: '--tf-aum',
  namerica: '--tf-direction',
  samerica: '--tf-gold',
  africa: '--tf-enemy-down',
  russia: '--tf-muted',
  oceania: '--tf-up-deep',
};

export interface WorldMapPaintOptions {
  /** 선택된 지역. 나머지는 흐리게 깔린다. */
  readonly selected?: WorldRegionId;
  readonly cellPixels?: number;
}

/**
 * 세계지도를 캔버스에 굽는다.
 *
 * @returns 실제로 그린 셀 수. 컨텍스트가 없으면 0 (헤드리스·캔버스 미지원 환경).
 */
export function paintWorldMap(
  canvas: HTMLCanvasElement,
  options: WorldMapPaintOptions = {},
): number {
  const cell = options.cellPixels ?? CELL_PIXELS;
  canvas.width = GRID_WIDTH * cell;
  canvas.height = GRID_HEIGHT * cell;

  const ctx = canvas.getContext('2d');
  if (!ctx) return 0;

  const styles = getComputedStyle(canvas);
  const colorOf = (id: WorldRegionId): string =>
    styles.getPropertyValue(REGION_COLOR_VAR[id]).trim() || styles.color;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  let painted = 0;
  for (const item of worldCells()) {
    const focused = options.selected === undefined || options.selected === item.region;
    ctx.globalAlpha = focused ? 0.9 : 0.32;
    ctx.fillStyle = colorOf(item.region);
    // 셀 사이에 1px 틈을 남겨 격자가 읽히게 한다 — 목업의 픽셀 느낌이 여기서 나온다.
    ctx.fillRect(item.x * cell, item.y * cell, cell - 1, cell - 1);
    painted += 1;
  }
  ctx.globalAlpha = 1;

  return painted;
}
