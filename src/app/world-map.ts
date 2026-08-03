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
    land: [box(125, 38.5, 5, 7)],
  },
  {
    id: 'japan',
    name: '일본',
    code: 'JAPAN',
    stageCount: 3,
    flavor: '엔 캐리와 상사(商社)의 나라. 준비 중.',
    playableStages: [],
    land: [box(130, 34, 5, 6), box(138, 40, 7, 6), box(141, 45, 4, 4)],
  },
  {
    id: 'china',
    name: '중국',
    code: 'CHINA',
    stageCount: 4,
    flavor: '국가가 시장을 겸하는 곳. 준비 중.',
    playableStages: [],
    land: [box(75, 45, 50, 22), box(105, 23, 15, 12)],
  },
  {
    id: 'india',
    name: '인도',
    code: 'INDIA',
    stageCount: 3,
    flavor: '인구가 곧 수요인 시장. 준비 중.',
    playableStages: [],
    land: [box(70, 33, 20, 15), box(74, 18, 10, 8)],
  },
  {
    id: 'europe',
    name: '유럽',
    code: 'EUROPE',
    stageCount: 5,
    flavor: '오래된 자본과 규제의 대륙. 준비 중.',
    playableStages: [],
    land: [box(-10, 60, 40, 18), box(0, 42, 30, 12), box(-8, 44, 12, 8)],
  },
  {
    id: 'namerica',
    name: '북미',
    code: 'N.AMERICA',
    stageCount: 6,
    flavor: '세계 유동성의 진앙. 준비 중.',
    playableStages: [],
    land: [box(-165, 70, 90, 12), box(-130, 58, 70, 16), box(-125, 42, 60, 18), box(-105, 24, 20, 8)],
  },
  {
    id: 'samerica',
    name: '남미',
    code: 'S.AMERICA',
    stageCount: 3,
    flavor: '원자재와 초인플레의 대륙. 준비 중.',
    playableStages: [],
    land: [box(-80, 10, 35, 25), box(-72, -15, 25, 25), box(-70, -40, 12, 15)],
  },
  {
    id: 'africa',
    name: '아프리카',
    code: 'AFRICA',
    stageCount: 4,
    flavor: '프런티어. 준비 중.',
    playableStages: [],
    land: [box(-18, 35, 55, 20), box(8, 15, 35, 30), box(15, -15, 25, 20)],
  },
  {
    id: 'russia',
    name: '러시아·CIS',
    code: 'RUSSIA·CIS',
    stageCount: 3,
    flavor: '자원과 제재 사이. 준비 중.',
    playableStages: [],
    land: [box(30, 75, 150, 12), box(35, 63, 145, 15)],
  },
  {
    id: 'oceania',
    name: '오세아니아',
    code: 'OCEANIA',
    stageCount: 2,
    flavor: '자원 통화의 남쪽 끝. 준비 중.',
    playableStages: [],
    land: [box(113, -12, 40, 26), box(166, -34, 8, 10)],
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
