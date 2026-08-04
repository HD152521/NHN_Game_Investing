import { describe, expect, test } from 'vitest';

/**
 * 타이틀 배경 — 레이아웃 데이터와 티커 문구.
 *
 * 그림 자체는 눈으로 봐야 하지만, **깨지면 안 되는 약속**은 테스트로 고정할 수 있다:
 * ① 좌=아군 / 우=적이라는 방향(목업이 "뒤집지 마라"고 못박은 것)
 * ② 팔레트 토큰만 쓴다(초록 금지 · 생짜 HEX 금지)
 * ③ 티커가 **지어낸 시장 지수를 말하지 않는다**
 */
import { BASE_PALETTE } from '../design';
import {
  TITLE_ART_HEIGHT,
  TITLE_ART_WIDTH,
  TITLE_BEARS,
  TITLE_DRONES,
  TITLE_MOON,
  TITLE_SKYLINE,
  drawTitleArt,
  tickerLine,
} from './title-art';
import type { TitleArtCtx } from './title-art';

/** 캔버스 호출을 받아 적는 가짜. 색과 사각형만 본다. */
function fakeCtx(): TitleArtCtx & { colors: string[]; rects: number; arcs: number } {
  const state = { colors: [] as string[], rects: 0, arcs: 0 };
  return {
    ...state,
    globalAlpha: 1,
    set fillStyle(value: string) {
      state.colors.push(value);
    },
    get fillStyle() {
      return state.colors[state.colors.length - 1] ?? '';
    },
    get colors() {
      return state.colors;
    },
    get rects() {
      return state.rects;
    },
    get arcs() {
      return state.arcs;
    },
    fillRect() {
      state.rects += 1;
    },
    beginPath() {},
    arc() {
      state.arcs += 1;
    },
    fill() {},
    save() {},
    restore() {},
  } as unknown as TitleArtCtx & { colors: string[]; rects: number; arcs: number };
}

describe('★ 좌=아군 / 우=적 — 목업이 "뒤집지 마라"고 못박은 방향', () => {
  const ally = TITLE_SKYLINE.filter((b) => b.side === 'ally');
  const enemy = TITLE_SKYLINE.filter((b) => b.side === 'enemy');

  test('아군 건물이 전부 적 건물보다 왼쪽에 있다', () => {
    const allyMaxX = Math.max(...ally.map((b) => b.x + b.width));
    const enemyMinX = Math.min(...enemy.map((b) => b.x));
    expect(allyMaxX).toBeLessThan(enemyMinX);
  });

  test('전장 축과 같다 — 아군 사옥이 x=0(좌), 적 본진이 x=1(우)', () => {
    expect(ally.length).toBeGreaterThan(0);
    expect(enemy.length).toBeGreaterThan(0);
    // 중앙은 중립이라 타이틀 글자가 앉을 자리가 비어 있어야 한다.
    const neutral = TITLE_SKYLINE.filter((b) => b.side === 'neutral');
    expect(neutral.length).toBeGreaterThan(0);
    const tallestNeutral = Math.max(...neutral.map((b) => b.height));
    const tallestAlly = Math.max(...ally.map((b) => b.height));
    expect(tallestNeutral).toBeLessThan(tallestAlly);
  });

  test('곰은 적 진영 쪽에 선다 — 하락 압력이 오는 방향이다', () => {
    const midpoint = TITLE_ART_WIDTH / 2;
    for (const bear of TITLE_BEARS) {
      expect(bear.x).toBeGreaterThan(midpoint);
    }
  });

  test('달도 적 진영 쪽 — "밤이 저쪽에서 온다"', () => {
    expect(TITLE_MOON.x).toBeGreaterThan(TITLE_ART_WIDTH / 2);
  });
});

describe('레이아웃이 캔버스 안에 들어간다', () => {
  test('모든 건물이 화면 폭 안에 있다', () => {
    for (const b of TITLE_SKYLINE) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(TITLE_ART_WIDTH);
    }
  });

  test('건물이 서로 겹치지 않는다 — 실루엣이 뭉개지지 않게', () => {
    const sorted = [...TITLE_SKYLINE].sort((a, b) => a.x - b.x);
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i]!.x).toBeGreaterThanOrEqual(sorted[i - 1]!.x + sorted[i - 1]!.width);
    }
  });

  test('건물 높이가 캔버스를 넘지 않는다', () => {
    for (const b of TITLE_SKYLINE) {
      expect(b.height).toBeLessThan(TITLE_ART_HEIGHT);
    }
  });

  test('드론은 지면보다 위에 있다', () => {
    for (const drone of TITLE_DRONES) {
      expect(drone.y).toBeLessThan(TITLE_ART_HEIGHT / 2);
    }
  });
});

describe('★ 팔레트 토큰만 쓴다 — 초록 금지 · 생짜 HEX 금지', () => {
  const allowed = new Set<string>(Object.values(BASE_PALETTE));

  test('그리기에 쓰인 색이 전부 팔레트 값이다', () => {
    const ctx = fakeCtx();
    drawTitleArt(ctx, BASE_PALETTE);
    expect(ctx.colors.length).toBeGreaterThan(0);
    for (const color of ctx.colors) {
      expect(allowed.has(color)).toBe(true);
    }
  });

  test('실제로 뭔가 그린다 — 사각형과 달', () => {
    const ctx = fakeCtx();
    drawTitleArt(ctx, BASE_PALETTE);
    expect(ctx.rects).toBeGreaterThan(TITLE_SKYLINE.length);
    expect(ctx.arcs).toBe(1); // 곡선은 달 하나뿐이다
  });
});

describe('★ 티커는 지어낸 시장 지수를 말하지 않는다', () => {
  test('게임 안의 사실만 싣는다', () => {
    const line = tickerLine({
      dailyLabel: '2026-08-04',
      cleared: 2,
      totalRegions: 10,
      codexCount: 7,
    });
    expect(line).toContain('2026-08-04');
    expect(line).toContain('2/10');
    expect(line).toContain('7장');
    // 목업의 `KOSPI 2,614.28 ▼ 1.24%` 같은 가짜 지수가 들어가면 안 된다.
    expect(line).not.toMatch(/KOSPI|코스피|[0-9],[0-9]{3}\.[0-9]{2}/);
  });

  test('진행도가 없는 첫 실행에서도 비지 않는다', () => {
    const line = tickerLine({
      dailyLabel: '2026-08-04',
      cleared: 0,
      totalRegions: 10,
      codexCount: 0,
    });
    expect(line.length).toBeGreaterThan(0);
    expect(line).toContain('0/10');
    // 0장은 싣지 않는다 — 성취가 아니라 잡음이다.
    expect(line).not.toContain('도감');
  });

  test('날짜를 모르면 그 항목만 빠지고 나머지는 남는다', () => {
    const line = tickerLine({ dailyLabel: null, cleared: 1, totalRegions: 10, codexCount: 0 });
    expect(line).toContain('1/10');
    expect(line).not.toContain('오늘의 챌린지');
  });
});
