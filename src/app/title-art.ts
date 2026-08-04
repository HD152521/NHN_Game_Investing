/**
 * 타이틀 화면 배경 — 픽셀 도시 스카이라인 (목업 `home`).
 *
 * 레이아웃은 **손으로 정한 고정값**이다. 시드 난수로 흔들면 매번 실루엣이 달라져
 * "이 게임의 얼굴"이 되지 못한다 — 타이틀 배경은 절차적 생성물이 아니라 아트다.
 * (그래서 이 파일에는 PRNG가 없다. `Math.random()` 금지 규율과도 자연히 맞는다.)
 *
 * ★★ 목업과 다르게 간 지점 1 — 좌측 빌딩 색 ★★
 * 목업은 **좌측 녹색 / 우측 적색**이었다. 그대로 옮길 수 없다:
 *   ① 팔레트에 **초록이 없다**(§19-12 "초록을 쓰지 마라"). `no-hardcoded-hex.test.ts`도 막는다.
 *   ② 이 게임은 **한국식 상승=적 / 하락=청**을 쓴다(FR-5.10). 녹색=상승은 서구식이라
 *      차트와 진영이 서로 다른 언어를 말하게 된다.
 *
 * 목업이 실제로 규정한 것은 색 이름이 아니라 **방향**이다 —
 * *"좌측이 아군 진영, 우측이 하락 압력. 전장의 좌→우 축과 같다. 뒤집지 마라."*
 * 그 의미를 팔레트 언어로 옮긴다:
 *
 *   좌측 = `UP_ALLY`   (아군 · 상승) ← 전장의 아군 사옥이 x=0
 *   우측 = `ENEMY_DOWN`(적 · 하락)   ← 전장의 적 본진이 x=1
 *
 * **방향은 목업 그대로다.** 색만 이 게임의 어휘로 바꿨다.
 *
 * ★★ 목업과 다르게 간 지점 2 — 하단 티커 ★★
 * 목업 하단은 `KOSPI 2,614.28 ▼ 1.24%`였다. **지어낸 시장 지수를 화면에 띄우지 않는다.**
 * 이 게임의 유일한 훅이 "그날이 진짜 어느 회사의 어떤 날이었는지"인데(`GATE_HINT`),
 * 타이틀에 가짜 지수를 걸면 그 약속을 첫 화면부터 깎아먹는다. 실데이터가 붙기 전까지
 * 티커는 **게임 안의 진짜 사실**(오늘의 챌린지 · 점령 · 도감)로 채운다 — `tickerLine()`.
 */

import type { Palette } from '../design';

/** 배경 캔버스 크기. 고정값이다 — 화면 크기에 따라 실루엣 비율이 달라지면 안 된다. */
export const TITLE_ART_WIDTH = 1024;
export const TITLE_ART_HEIGHT = 300;

/** 지면선. 빌딩은 여기서 위로 자란다. */
const GROUND_Y = 262;

/** 어느 진영의 건물인가. 색과 위치를 함께 규정한다. */
export type TitleSide = 'ally' | 'neutral' | 'enemy';

export interface TitleBuilding {
  readonly x: number;
  readonly width: number;
  readonly height: number;
  readonly side: TitleSide;
  /** 창문 격자 칸 수 (가로, 세로). 0이면 창을 그리지 않는다(먼 건물). */
  readonly windows: readonly [number, number];
}

/**
 * 스카이라인 — 좌(아군) → 중앙(중립) → 우(적) 순서로 읽힌다.
 *
 * 중앙을 낮게 두어 타이틀 글자가 앉을 자리를 비운다. 양 끝이 높아지는 실루엣이라
 * 화면이 "가운데로 모이는" 구도가 된다.
 */
export const TITLE_SKYLINE: readonly TitleBuilding[] = [
  { x: 18, width: 62, height: 118, side: 'ally', windows: [3, 6] },
  { x: 88, width: 46, height: 172, side: 'ally', windows: [2, 8] },
  { x: 140, width: 74, height: 96, side: 'ally', windows: [4, 4] },
  { x: 222, width: 40, height: 148, side: 'ally', windows: [2, 7] },
  { x: 270, width: 58, height: 74, side: 'ally', windows: [3, 3] },
  // ── 중앙: 낮고 무채색. 타이틀이 앉는 자리 ──
  { x: 340, width: 52, height: 54, side: 'neutral', windows: [2, 2] },
  { x: 400, width: 84, height: 40, side: 'neutral', windows: [0, 0] },
  { x: 492, width: 46, height: 58, side: 'neutral', windows: [2, 2] },
  { x: 546, width: 78, height: 44, side: 'neutral', windows: [0, 0] },
  { x: 632, width: 50, height: 62, side: 'neutral', windows: [2, 3] },
  // ── 우측: 적 진영. 좌측보다 조금 더 높게 — 압력이 크다 ──
  { x: 700, width: 56, height: 88, side: 'enemy', windows: [3, 4] },
  { x: 764, width: 44, height: 162, side: 'enemy', windows: [2, 7] },
  { x: 816, width: 70, height: 112, side: 'enemy', windows: [4, 5] },
  { x: 894, width: 42, height: 186, side: 'enemy', windows: [2, 9] },
  { x: 944, width: 62, height: 130, side: 'enemy', windows: [3, 6] },
];

/** 달 — 우상단. 적 진영 쪽에 걸어 "밤이 저쪽에서 온다"는 인상을 만든다. */
export const TITLE_MOON = { x: 862, y: 56, radius: 26 } as const;

/** 드론 2대. 상공을 훑는 정찰 — 적 `E-04 루머 연`과 같은 층위의 존재다. */
export const TITLE_DRONES: readonly { x: number; y: number }[] = [
  { x: 268, y: 84 },
  { x: 612, y: 52 },
];

/**
 * 곰 실루엣 2체 — **하락장(bear market)** 그 자체다.
 *
 * 지면에 세운다. 빌딩보다 앞이라 더 진하게 그려 원근을 만든다.
 */
export const TITLE_BEARS: readonly { x: number; scale: number }[] = [
  { x: 690, scale: 1 },
  { x: 812, scale: 0.72 },
];

/** 타이틀 문자열 — `TICKER`는 기본색, `FRONT`는 골드. 목업 그대로다. */
export const TITLE_HEAD = 'TICKER';
export const TITLE_TAIL = 'FRONT';

/** 목업이 규정한 부제. 기존 `GATE_GOAL`보다 짧고 세계관을 먼저 말한다. */
export const TITLE_SUBTITLE = '시장이 무너지는 자리에서, 사옥을 지켜라';

/** 빌드 표기 — 하단 좌측. */
export const TITLE_BUILD_LABEL = 'v0.1.0 · MVP BUILD';

export interface TickerFacts {
  /** 오늘의 챌린지 시드(날짜). */
  readonly dailyLabel: string | null;
  /** 점령한 지역 수. */
  readonly cleared: number;
  /** 전체 지역 수. */
  readonly totalRegions: number;
  /** 도감 수집 장수. */
  readonly codexCount: number;
}

/**
 * 하단 우측 티커 문구.
 *
 * ★ 지어낸 지수를 쓰지 않는다 ★ (머리말 참고) 전부 이 게임 안에서 실제로 참인 사실이다.
 * 진행도가 없는 첫 실행에서도 문구가 비지 않도록 오늘의 챌린지를 항상 앞에 둔다.
 */
export function tickerLine(facts: TickerFacts): string {
  const parts: string[] = [];
  if (facts.dailyLabel !== null) {
    parts.push(`오늘의 챌린지 ${facts.dailyLabel}`);
  }
  parts.push(`점령 ${facts.cleared}/${facts.totalRegions}`);
  if (facts.codexCount > 0) {
    parts.push(`도감 ${facts.codexCount}장`);
  }
  return parts.join('  ·  ');
}

/** 진영 → 팔레트 토큰. 색을 여기서만 고른다(§19-4 단일 출처). */
function sideColor(side: TitleSide, palette: Palette): string {
  switch (side) {
    case 'ally':
      return palette.UP_DEEP;
    case 'enemy':
      return palette.ENEMY_DEEP;
    default:
      return palette.BG_2;
  }
}

/** 창문 색 — 진영색보다 밝게. 켜진 창만 그린다. */
function windowColor(side: TitleSide, palette: Palette): string {
  switch (side) {
    case 'ally':
      return palette.UP_ALLY;
    case 'enemy':
      return palette.ENEMY_DOWN;
    default:
      return palette.MUTED;
  }
}

/**
 * 창이 켜져 있는가 — **결정론적 판정**이다.
 *
 * 난수를 쓰면 프레임마다 창이 깜빡이고(재렌더 시), 시드를 쓰면 인자가 하나 늘어난다.
 * 좌표만으로 정하면 같은 그림이 항상 나오고 배치도 규칙적이지 않게 흩어진다.
 */
function isWindowLit(buildingIndex: number, col: number, row: number): boolean {
  return ((buildingIndex * 7 + col * 3 + row * 5) % 11) < 6;
}

/** 캔버스 2D의 최소 계약. 테스트가 가짜를 넣을 수 있게 좁게 받는다. */
export type TitleArtCtx = Pick<
  CanvasRenderingContext2D,
  'fillStyle' | 'globalAlpha' | 'fillRect' | 'beginPath' | 'arc' | 'fill' | 'save' | 'restore'
>;

/**
 * 스카이라인을 그린다. **픽셀만 찍는다** — 레이아웃은 위 상수가 소유한다.
 *
 * 사각형만 쓴다(픽셀 아트 규율). 곡선은 달 하나뿐이다.
 */
export function drawTitleArt(ctx: TitleArtCtx, palette: Palette): void {
  ctx.save();

  // 하늘 — 단색. 그라디언트는 CSS가 얹는다(캔버스는 실루엣만 책임진다).
  ctx.globalAlpha = 1;
  ctx.fillStyle = palette.BG_0;
  ctx.fillRect(0, 0, TITLE_ART_WIDTH, TITLE_ART_HEIGHT);

  // 달 — 빌딩보다 뒤.
  ctx.fillStyle = palette.MUTED;
  ctx.globalAlpha = 0.32;
  ctx.beginPath();
  ctx.arc(TITLE_MOON.x, TITLE_MOON.y, TITLE_MOON.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // 빌딩 + 창문.
  TITLE_SKYLINE.forEach((building, index) => {
    const top = GROUND_Y - building.height;
    ctx.fillStyle = sideColor(building.side, palette);
    ctx.fillRect(building.x, top, building.width, building.height);

    const [cols, rows] = building.windows;
    if (cols === 0 || rows === 0) {
      return;
    }
    ctx.fillStyle = windowColor(building.side, palette);
    const cellW = building.width / (cols * 2 + 1);
    const cellH = building.height / (rows * 2 + 1);
    for (let col = 0; col < cols; col += 1) {
      for (let row = 0; row < rows; row += 1) {
        if (!isWindowLit(index, col, row)) {
          continue;
        }
        ctx.globalAlpha = 0.55;
        ctx.fillRect(
          building.x + cellW * (col * 2 + 1),
          top + cellH * (row * 2 + 1),
          cellW,
          cellH,
        );
      }
    }
    ctx.globalAlpha = 1;
  });

  // 드론 — 몸통 + 양 날개. 작아서 사각 3개면 읽힌다.
  ctx.fillStyle = palette.MUTED;
  ctx.globalAlpha = 0.7;
  for (const drone of TITLE_DRONES) {
    ctx.fillRect(drone.x - 3, drone.y, 6, 3);
    ctx.fillRect(drone.x - 8, drone.y - 2, 4, 2);
    ctx.fillRect(drone.x + 4, drone.y - 2, 4, 2);
  }
  ctx.globalAlpha = 1;

  // 곰 — 하락 압력. 지면에 세우고 적 진영색으로 칠한다.
  ctx.fillStyle = palette.ENEMY_DEEP;
  for (const bear of TITLE_BEARS) {
    const h = 46 * bear.scale;
    const w = 30 * bear.scale;
    // 몸통
    ctx.fillRect(bear.x, GROUND_Y - h, w, h);
    // 머리 — 몸통 좌상단에 얹는다(고개를 든 실루엣)
    ctx.fillRect(bear.x - 6 * bear.scale, GROUND_Y - h - 14 * bear.scale, 18 * bear.scale, 16 * bear.scale);
    // 귀
    ctx.fillRect(bear.x - 4 * bear.scale, GROUND_Y - h - 20 * bear.scale, 5 * bear.scale, 6 * bear.scale);
    ctx.fillRect(bear.x + 6 * bear.scale, GROUND_Y - h - 20 * bear.scale, 5 * bear.scale, 6 * bear.scale);
  }

  // 지면 — 실루엣의 바닥을 끊어 준다.
  ctx.fillStyle = palette.LINE;
  ctx.fillRect(0, GROUND_Y, TITLE_ART_WIDTH, TITLE_ART_HEIGHT - GROUND_Y);

  ctx.restore();
}
