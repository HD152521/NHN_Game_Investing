/**
 * 전선 선택 지도 — 한반도 (목업 `countrymap`).
 *
 * ```
 * 투영    KOREAN PENINSULA · 0.14° / CELL · 8px · DMZ 38°N
 * 챕터    CHAPTER 1 — 국내 시장
 * ```
 *
 * ★ 세계지도와 같은 방식이다 ★ `world-map.ts`가 쓰는 **경위도 사각형 래스터화**를 격자만
 * 좁혀(2.5° → 0.14°) 그대로 재사용한다. 투영·셀 변환 규칙이 두 화면에서 같아야 지도가
 * 한 세계로 읽힌다 — 여기서 다른 투영을 쓰면 세계지도에서 줌인한 느낌이 사라진다.
 *
 * ★ 숫자는 전부 `STAGES`에서 온다 ★ 브리핑에 적히는 시작 AUM·필요 지출·목표 수익률은
 * `src/combat/stages.ts`가 단일 출처다. 여기에 값을 다시 적으면 §19-4 이중 출처다.
 */

import { STAGES, WAVE_COUNT } from '../combat';
import type { StageId } from '../combat';
import { hasCleared } from './progress';
import type { GameProgress } from './progress';

/** 목업이 규정한 격자. 세계지도(2.5°)보다 훨씬 촘촘하다. */
export const COUNTRY_CELL_DEGREES = 0.14;
/** 한반도를 담는 경위도 창. 남한 전역 + DMZ 위쪽 여백까지. */
export const WEST_LONGITUDE = 124.6;
export const NORTH_LATITUDE = 39.2;
export const COUNTRY_GRID_WIDTH = 46;
export const COUNTRY_GRID_HEIGHT = 46;

/** 목업이 지목한 기준선. 38선은 이 지도에서 유일한 정치적 표식이다. */
export const DMZ_LATITUDE = 38;

export const COUNTRY_TITLE = 'CHAPTER 1 — 국내 시장';
export const COUNTRY_EYEBROW = 'KOREAN PENINSULA · FRONT SELECT';

/** 경도 → 셀 x. `world-map.ts`의 `lonToCell`과 같은 형태다(창과 격자만 다르다). */
export function lonToCountryCell(lon: number): number {
  return Math.floor((lon - WEST_LONGITUDE) / COUNTRY_CELL_DEGREES);
}

/** 위도 → 셀 y. 위쪽(북쪽)이 0이다. */
export function latToCountryCell(lat: number): number {
  return Math.floor((NORTH_LATITUDE - lat) / COUNTRY_CELL_DEGREES);
}

/** 육지 사각형 하나. 경위도로 적고 래스터화는 아래가 한다. */
export interface LandRect {
  readonly lon: number;
  readonly lat: number;
  readonly lonSpan: number;
  readonly latSpan: number;
}

/**
 * 한반도 실루엣 — 사각형 근사.
 *
 * 정밀한 해안선이 목적이 아니다. **어느 나라인지 한 컷에 읽히는 것**이 기준이고(§6
 * `cityview`가 도시에 요구하는 것과 같다), 8px 격자에서는 사각형 몇 개면 그 형태가 선다.
 * 위에서 아래로: 북부(넓다) → 허리(잘록) → 남부(넓어짐) → 남해안 → 제주.
 */
/**
 * 위도 한 줄을 경도 구간으로 칠한다 — `world-map.ts`의 `band`와 같은 개념이다.
 *
 * ★ 왜 밴드인가 ★ 사각형 몇 개로 근사하면 지도가 아니라 색 블록으로 보인다. 저해상도
 * 격자에서 해안선을 세우는 방법은 **위도별로 동서 끝을 찍는 것**이다(스캔라인 래스터화).
 * 0.14° 격자에서는 0.4° 간격이면 서해안의 들쭉날쭉함까지 잡힌다.
 */
const band = (latTop: number, lonWest: number, lonEast: number, latSpan = 0.4): LandRect => ({
  lon: lonWest,
  lat: latTop,
  lonSpan: lonEast - lonWest,
  latSpan,
});

/**
 * 한반도 실루엣.
 *
 * 정밀 해안선이 목적이 아니라 **한 컷에 어느 나라인지 읽히는 것**이 기준이다.
 * 한반도의 서명은 셋이다:
 *   ① 북쪽이 잘록하고 중부에서 넓어진다
 *   ② **서해안은 들쭉날쭉, 동해안은 곧다** — 이 비대칭이 한반도를 한반도로 만든다
 *   ③ 남쪽 끝에서 급히 좁아지고, 제주가 떨어져 있다
 */
export const PENINSULA_LAND: readonly LandRect[] = [
  // ── 북부: DMZ 위. 플레이 대상은 아니지만 반도 형태에 필요하다 ──
  band(39.2, 125.0, 128.2),
  band(38.8, 124.9, 128.4),
  band(38.4, 124.8, 128.6),
  // ── DMZ(38°N) 아래: 여기서부터가 전장이다 ──
  band(38.0, 126.0, 128.9),
  band(37.6, 126.1, 129.1),
  band(37.2, 126.2, 129.3),
  // ── 중부: 가장 넓다 ──
  band(36.8, 126.3, 129.4),
  band(36.4, 126.2, 129.4),
  band(36.0, 126.2, 129.5),
  band(35.6, 126.3, 129.5),
  // ── 남부: 서서히 좁아진다 ──
  band(35.2, 126.3, 129.4),
  band(34.8, 126.3, 129.2),
  // ── 남해안: 급히 좁아지며 끝난다 ──
  band(34.4, 126.4, 128.6),
  band(34.0, 126.5, 127.9, 0.3),
  // ── 제주: 떨어진 섬. 이것이 있어야 남쪽이 완성된다 ──
  band(33.6, 126.15, 126.95, 0.35),
];

export interface CountryCell {
  readonly x: number;
  readonly y: number;
}

/**
 * 육지 사각형 → 셀 목록. 중복 좌표는 한 번만 담는다.
 *
 * `world-map.ts`의 `worldCells()`와 같은 알고리즘이다 — 그쪽은 지역 소유권까지 따지지만
 * 여기는 나라가 하나라 좌표만 모으면 된다.
 */
export function peninsulaCells(): readonly CountryCell[] {
  const seen = new Set<number>();
  const cells: CountryCell[] = [];
  for (const land of PENINSULA_LAND) {
    const x0 = lonToCountryCell(land.lon);
    const x1 = lonToCountryCell(land.lon + land.lonSpan);
    const y0 = latToCountryCell(land.lat);
    const y1 = latToCountryCell(land.lat - land.latSpan);
    for (let y = y0; y < y1; y += 1) {
      if (y < 0 || y >= COUNTRY_GRID_HEIGHT) continue;
      for (let x = x0; x < x1; x += 1) {
        if (x < 0 || x >= COUNTRY_GRID_WIDTH) continue;
        const key = y * COUNTRY_GRID_WIDTH + x;
        if (seen.has(key)) continue;
        seen.add(key);
        cells.push({ x, y });
      }
    }
  }
  return cells;
}

/**
 * 전선 노드.
 *
 * ⚠️ **`R0`은 `STAGES`에 없다.** 목업에는 "튜토리얼 · 사옥 / CLEARED / RANK S"로 그려져
 * 있지만 실제 스테이지가 아니다. 노드로는 그리되 **선택 불가**로 둔다 — 없는 스테이지로
 * 보내면 빈 화면이 뜬다. `world-map.ts`가 J1~J3(스테이지 없는 지역)을 같은 이유로
 * 진입 잠금해 둔 것과 같은 판단이다.
 */
export interface FrontNode {
  readonly id: string;
  /** 실제 스테이지면 그 id. `R0`처럼 스테이지가 없으면 `null`. */
  readonly stageId: StageId | null;
  readonly name: string;
  readonly sector: string;
  readonly lon: number;
  readonly lat: number;
}

export const FRONT_NODES: readonly FrontNode[] = [
  // 사옥 — 서울 도심. 게임이 지키는 곳이자 튜토리얼의 무대다.
  { id: 'R0', stageId: null, name: '사옥', sector: '튜토리얼', lon: 126.98, lat: 37.57 },
  { id: 'R1', stageId: 'R1', name: '여의도', sector: '금융', lon: 126.93, lat: 37.52 },
  { id: 'R2', stageId: 'R2', name: '판교', sector: 'IT · 플랫폼', lon: 127.11, lat: 37.40 },
  { id: 'R3', stageId: 'R3', name: '울산', sector: '중공업 · 에너지', lon: 129.31, lat: 35.54 },
];

/** 노드를 잇는 선. 목업의 "노드 연결선" — 진격 순서를 눈으로 읽게 한다. */
export const FRONT_LINKS: readonly (readonly [string, string])[] = [
  ['R0', 'R1'],
  ['R1', 'R2'],
  ['R2', 'R3'],
];

export type NodeStatus = 'cleared' | 'available' | 'locked' | 'nostage';

/**
 * 노드 상태 — **진행도에서 파생한다.**
 *
 * 잠금 규칙은 `region-select.ts`의 `isRegionLocked`와 **같아야 한다**(바로 앞 지역 클리어).
 * 그래서 판정을 새로 만들지 않고 그 함수를 주입받는다 — 두 곳이 각자 판정하면 지도와
 * 카드가 다른 말을 하게 된다(§19-4).
 */
export function nodeStatusOf(
  node: FrontNode,
  progress: GameProgress,
  isLocked: (id: StageId, progress: GameProgress) => boolean,
): NodeStatus {
  if (node.stageId === null) {
    return 'nostage';
  }
  if (hasCleared(progress, node.stageId)) {
    return 'cleared';
  }
  return isLocked(node.stageId, progress) ? 'locked' : 'available';
}

export const NODE_STATUS_LABEL: Readonly<Record<NodeStatus, string>> = {
  cleared: 'CLEARED',
  available: 'AVAILABLE',
  locked: 'LOCKED',
  nostage: '준비 중',
};

export interface BriefingLine {
  readonly label: string;
  readonly value: string;
}

/**
 * 브리핑 패널 — 목업이 규정한 항목: **웨이브 수 · 추천 AUM · 보상 · 시간대**.
 *
 * 숫자는 전부 `STAGES`에서 읽는다. `timeOfDay`는 지역 정체성이라 호출부가 넘긴다
 * (`region-select.ts`가 그 표를 소유한다 — 여기서 다시 적으면 이중 출처).
 */
export function briefingFor(node: FrontNode, timeOfDay: string): readonly BriefingLine[] {
  if (node.stageId === null) {
    return [
      { label: '상태', value: '플레이 가능한 스테이지가 아직 없다' },
      { label: '역할', value: '코어 루프를 배우는 자리' },
    ];
  }
  const stage = STAGES[node.stageId];
  return [
    { label: '웨이브', value: `${WAVE_COUNT}` },
    { label: '추천 AUM', value: `${stage.startingAum.toLocaleString('ko-KR')}` },
    { label: '필요 지출', value: `${stage.requiredSpend.toLocaleString('ko-KR')} G` },
    // 보상은 도감 카드다. 클리어해야 발행되므로 "방어 완료 시"를 함께 적는다.
    { label: '보상', value: '방어 완료 시 도감 카드 1장' },
    { label: '시간대', value: timeOfDay },
  ];
}

/** 셀 좌표 → 캔버스 픽셀. 픽셀 크기는 렌더러가 정한다(§17-4). */
export function cellToPixel(cell: number, cellSize: number): number {
  return cell * cellSize;
}

/** 셀 한 칸의 픽셀 크기 — 목업이 규정한 8px. */
export const COUNTRY_CELL_PX = 8;
export const COUNTRY_CANVAS_WIDTH = COUNTRY_GRID_WIDTH * COUNTRY_CELL_PX;
export const COUNTRY_CANVAS_HEIGHT = COUNTRY_GRID_HEIGHT * COUNTRY_CELL_PX;

/** 캔버스 2D의 최소 계약. 테스트가 가짜를 넣을 수 있게 좁게 받는다. */
export type CountryMapCtx = Pick<
  CanvasRenderingContext2D,
  'fillStyle' | 'strokeStyle' | 'lineWidth' | 'globalAlpha' | 'fillRect' | 'beginPath'
  | 'moveTo' | 'lineTo' | 'stroke' | 'arc' | 'fill' | 'save' | 'restore' | 'setLineDash'
>;

/** 상태 → 팔레트 토큰. 색을 여기서만 고른다(§19-4 단일 출처). */
export function nodeToneOf(status: NodeStatus): 'GOLD' | 'UP_ALLY' | 'MUTED' {
  switch (status) {
    case 'cleared':
      return 'GOLD';
    case 'available':
      return 'UP_ALLY';
    default:
      return 'MUTED';
  }
}

export interface CountryMapPaint {
  readonly progress: GameProgress;
  readonly isLocked: (id: StageId, progress: GameProgress) => boolean;
  /** 팔레트. HEX를 이 파일이 만들지 않는다 — 토큰으로 받은 값을 그대로 쓴다. */
  readonly palette: Readonly<Record<string, string>>;
  /** 지금 가리키고 있는 노드 id. 없으면 강조하지 않는다. */
  readonly focusedId?: string | null;
}

/**
 * 지도를 그린다. **좌표 규칙은 위 상수가 소유하고 여기서는 픽셀만 찍는다.**
 *
 * 순서: 육지 → DMZ 선 → 연결선 → 노드. 뒤에 그린 것이 위로 온다.
 */
export function paintCountryMap(ctx: CountryMapCtx, opts: CountryMapPaint): void {
  const { palette } = opts;
  ctx.save();
  ctx.fillStyle = palette['BG_0'] ?? '';
  ctx.fillRect(0, 0, COUNTRY_CANVAS_WIDTH, COUNTRY_CANVAS_HEIGHT);

  // 육지 — 셀 격자. 한 칸씩 비워 픽셀 격자가 드러나게 한다.
  ctx.fillStyle = palette['BG_2'] ?? '';
  for (const cell of peninsulaCells()) {
    ctx.fillRect(
      cell.x * COUNTRY_CELL_PX,
      cell.y * COUNTRY_CELL_PX,
      COUNTRY_CELL_PX - 1,
      COUNTRY_CELL_PX - 1,
    );
  }

  // DMZ — 점선 한 줄. 목업이 지목한 유일한 기준선이다.
  const dmzY = latToCountryCell(DMZ_LATITUDE) * COUNTRY_CELL_PX;
  ctx.strokeStyle = palette['MUTED'] ?? '';
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.moveTo(0, dmzY);
  ctx.lineTo(COUNTRY_CANVAS_WIDTH, dmzY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  const pixelOf = (node: FrontNode): readonly [number, number] => [
    lonToCountryCell(node.lon) * COUNTRY_CELL_PX + COUNTRY_CELL_PX / 2,
    latToCountryCell(node.lat) * COUNTRY_CELL_PX + COUNTRY_CELL_PX / 2,
  ];
  const byId = new Map(FRONT_NODES.map((node) => [node.id, node]));

  // 연결선 — 진격 순서를 눈으로 읽게 한다.
  ctx.strokeStyle = palette['MUTED'] ?? '';
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 1;
  for (const [fromId, toId] of FRONT_LINKS) {
    const from = byId.get(fromId);
    const to = byId.get(toId);
    if (!from || !to) continue;
    const [fx, fy] = pixelOf(from);
    const [tx, ty] = pixelOf(to);
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(tx, ty);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // 노드 — 상태색 원. 가리키고 있는 노드는 테두리를 더 준다.
  for (const node of FRONT_NODES) {
    const status = nodeStatusOf(node, opts.progress, opts.isLocked);
    const [x, y] = pixelOf(node);
    ctx.fillStyle = palette[nodeToneOf(status)] ?? '';
    ctx.beginPath();
    // ⚠️ 사옥(R0)과 여의도(R1)는 **인접 셀**이다(실제로 5km 거리). 반경이 크면 두 원이
    // 겹쳐 하나로 보인다 — 셀 간격 8px 안에서 갈라지도록 작게 유지한다.
    ctx.arc(x, y, opts.focusedId === node.id ? 5 : 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}
