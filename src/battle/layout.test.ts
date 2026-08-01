import { describe, expect, test } from 'vitest';

import { computeBattleLayout, enemyBaseSpriteRect, hqSpriteRect, laneY, progressToX, slotRect } from './layout.js';

describe('computeBattleLayout', () => {
  test('일반적인 캔버스 크기에서 레인 순서가 위(공중)→아래(지상)로 유효하다', () => {
    const layout = computeBattleLayout(800, 300);

    expect(layout.airY).toBeLessThan(layout.groundY);
    expect(layout.laneLeft).toBeLessThan(layout.laneRight);
  });

  test('사옥(좌) · 본진(우) 영역이 레인 바깥쪽에 위치한다', () => {
    const layout = computeBattleLayout(800, 300);

    expect(layout.hqRect.x + layout.hqRect.w).toBeLessThanOrEqual(layout.laneLeft + 1);
    expect(layout.baseRect.x).toBeGreaterThanOrEqual(layout.laneRight - 1);
  });

  test('아주 작은 캔버스 크기에서도 NaN이나 음수 크기가 나오지 않는다', () => {
    const layout = computeBattleLayout(2, 1);

    expect(Number.isFinite(layout.laneLeft)).toBe(true);
    expect(Number.isFinite(layout.laneRight)).toBe(true);
    expect(Number.isFinite(layout.airY)).toBe(true);
    expect(Number.isFinite(layout.groundY)).toBe(true);
    expect(layout.laneRight).toBeGreaterThanOrEqual(layout.laneLeft);
    expect(layout.hqRect.w).toBeGreaterThanOrEqual(0);
    expect(layout.hqRect.h).toBeGreaterThanOrEqual(0);
    expect(layout.baseRect.w).toBeGreaterThanOrEqual(0);
    expect(layout.baseRect.h).toBeGreaterThanOrEqual(0);
  });

  test('너비/높이가 0이어도 크래시하지 않는다', () => {
    const layout = computeBattleLayout(0, 0);
    expect(Number.isFinite(layout.laneLeft)).toBe(true);
    expect(Number.isFinite(layout.laneRight)).toBe(true);
  });
});

describe('laneY', () => {
  test('공중 레인과 지상 레인이 서로 다른 y를 반환한다', () => {
    const layout = computeBattleLayout(800, 300);
    expect(laneY('air', layout)).not.toBe(laneY('ground', layout));
    expect(laneY('air', layout)).toBeLessThan(laneY('ground', layout));
  });
});

describe('progressToX — 방향 규약(0=아군 좌측, 1=적군 우측)', () => {
  test('progressToX(0)은 좌측(laneLeft)이다', () => {
    const layout = computeBattleLayout(800, 300);
    expect(progressToX(0, layout)).toBeCloseTo(layout.laneLeft, 5);
  });

  test('progressToX(1)은 우측(laneRight)이다', () => {
    const layout = computeBattleLayout(800, 300);
    expect(progressToX(1, layout)).toBeCloseTo(layout.laneRight, 5);
  });

  test('진행도가 커질수록 x도 커진다(방향이 뒤집히지 않는다)', () => {
    const layout = computeBattleLayout(800, 300);
    const xLow = progressToX(0.2, layout);
    const xHigh = progressToX(0.8, layout);
    expect(xHigh).toBeGreaterThan(xLow);
  });

  test('범위를 벗어난 입력은 0~1로 잘린다', () => {
    const layout = computeBattleLayout(800, 300);
    expect(progressToX(-1, layout)).toBeCloseTo(layout.laneLeft, 5);
    expect(progressToX(2, layout)).toBeCloseTo(layout.laneRight, 5);
  });
});

describe('slotRect — 기지 옆 2줄 배치 (전쟁시대 참고)', () => {
  const TOWER_SLOTS = 6;
  /** 실제 전장 캔버스와 같은 크기 — 배치 판단은 이 해상도 기준으로 내렸다. */
  const layout = computeBattleLayout(1024, 360);
  const rects = Array.from({ length: TOWER_SLOTS }, (_, i) => slotRect(i, layout, TOWER_SLOTS));
  const centerX = (i: number): number => rects[i]!.x + rects[i]!.w / 2;

  test('슬롯 인덱스가 커질수록 x 중심이 우측으로 이동한다', () => {
    const small = computeBattleLayout(800, 300);
    const smallRects = Array.from({ length: TOWER_SLOTS }, (_, i) => slotRect(i, small, TOWER_SLOTS));

    for (let i = 1; i < smallRects.length; i += 1) {
      const prevCenter = smallRects[i - 1]!.x + smallRects[i - 1]!.w / 2;
      const curCenter = smallRects[i]!.x + smallRects[i]!.w / 2;
      expect(curCenter).toBeGreaterThan(prevCenter);
    }
  });

  /**
   * ★ 회귀 방지 ★ 슬롯 6개가 같은 x를 가지면 `enemy.x - towerX(slot) <= range` 판정이
   * 전부 동일해져 "어디에 짓는가"라는 결정이 사라진다. 화면 배치가 바뀌어도 이건 유지된다.
   */
  test('슬롯 6개가 서로 다른 x 중심을 갖는다', () => {
    const centers = rects.map((_, i) => centerX(i));
    expect(new Set(centers).size).toBe(TOWER_SLOTS);
  });

  test('슬롯 뭉치가 아군 사옥 쪽(캔버스 좌측 1/3 이내)에 모여 있다', () => {
    const left = Math.min(...rects.map((r) => r.x));
    const right = Math.max(...rects.map((r) => r.x + r.w));

    expect(left).toBeGreaterThanOrEqual(0);
    expect(right).toBeLessThan(layout.width / 3);
  });

  test('전장 중앙(유닛 교전 공간)에는 슬롯이 하나도 없다', () => {
    const midX = layout.width / 2;
    for (const rect of rects) {
      expect(rect.x + rect.w).toBeLessThan(midX);
    }
  });

  test('짝수 인덱스는 윗줄, 홀수 인덱스는 아랫줄이다 (2줄 벽돌쌓기)', () => {
    const topRow = [0, 2, 4].map((i) => rects[i]!.y);
    const bottomRow = [1, 3, 5].map((i) => rects[i]!.y);

    expect(new Set(topRow).size).toBe(1);
    expect(new Set(bottomRow).size).toBe(1);
    expect(topRow[0]!).toBeLessThan(bottomRow[0]!);
  });

  test('위/아래 줄은 세로로 겹치지 않는다 (클릭 판정이 모호해지지 않는다)', () => {
    const top = rects[0]!;
    const bottom = rects[1]!;
    expect(top.y + top.h).toBeLessThanOrEqual(bottom.y);
  });

  test('슬롯이 작아져도 터치 타겟 44px 이상을 유지한다 (PRD §11)', () => {
    for (const rect of rects) {
      expect(rect.w).toBeGreaterThanOrEqual(44);
      expect(rect.h).toBeGreaterThanOrEqual(44);
    }
  });

  test('슬롯은 예전(96×68)보다 작다 — "기지에 작게 얹는다"', () => {
    for (const rect of rects) {
      expect(rect.w).toBeLessThan(96);
      expect(rect.h).toBeLessThan(68);
    }
  });

  test('슬롯이 공중·지상 레인을 침범하지 않는다', () => {
    for (const rect of rects) {
      expect(rect.y).toBeGreaterThan(layout.airY);
      expect(rect.y + rect.h).toBeLessThan(layout.groundY);
    }
  });

  test('아주 작은 캔버스에서도 NaN·음수 크기가 나오지 않는다', () => {
    const layout = computeBattleLayout(3, 2);
    const rect = slotRect(0, layout, 6);
    expect(Number.isFinite(rect.x)).toBe(true);
    expect(Number.isFinite(rect.y)).toBe(true);
    expect(rect.w).toBeGreaterThanOrEqual(0);
    expect(rect.h).toBeGreaterThanOrEqual(0);
  });

  test('towerSlots가 0이어도 크래시하지 않는다', () => {
    const layout = computeBattleLayout(800, 300);
    expect(() => slotRect(0, layout, 0)).not.toThrow();
  });
});

/**
 * 기지 그리기용 사각형 — 배율의 단일 출처다(`drawSpriteStanding`이 이 사각형에 들어가는
 * 최대 정수 배율로 그린다). 플레이 피드백 "우리 기지 크기가 너무 작아"의 회귀 방지.
 */
describe('hqSpriteRect / enemyBaseSpriteRect — 기지 그리기 사각형', () => {
  const TOWER_SLOTS = 6;
  const layout = computeBattleLayout(1024, 360);

  test('사옥 그림 폭이 첫 슬롯 왼쪽 끝보다 앞에서 멈춘다', () => {
    const rect = hqSpriteRect(layout, TOWER_SLOTS);
    expect(rect.x + rect.w).toBeLessThan(slotRect(0, layout, TOWER_SLOTS).x);
  });

  test('사옥 스프라이트(원본 76×40)가 2× 이상 들어간다', () => {
    const rect = hqSpriteRect(layout, TOWER_SLOTS);
    expect(Math.floor(rect.w / 76)).toBeGreaterThanOrEqual(2);
    expect(Math.floor(rect.h / 40)).toBeGreaterThanOrEqual(2);
  });

  test('두 사각형 모두 바닥이 지면선, 천장이 공중 레인이다', () => {
    for (const rect of [hqSpriteRect(layout, TOWER_SLOTS), enemyBaseSpriteRect(layout)]) {
      expect(rect.y).toBeCloseTo(layout.airY, 5);
      expect(rect.y + rect.h).toBeCloseTo(layout.groundY, 5);
    }
  });

  test('요새(30×44)·보스(34×46)가 공중 레인을 넘지 않는 3×로 제한된다', () => {
    const rect = enemyBaseSpriteRect(layout);
    expect(Math.min(Math.floor(rect.w / 30), Math.floor(rect.h / 44))).toBe(3);
    expect(Math.min(Math.floor(rect.w / 34), Math.floor(rect.h / 46))).toBe(3);
  });

  test('캔버스가 작아지거나 0이어도 NaN·음수 크기가 나오지 않는다', () => {
    for (const size of [[0, 0], [3, 2], [12, 12], [320, 200]] as const) {
      for (const rect of [
        hqSpriteRect(computeBattleLayout(size[0], size[1]), TOWER_SLOTS),
        enemyBaseSpriteRect(computeBattleLayout(size[0], size[1])),
      ]) {
        expect(Number.isFinite(rect.x)).toBe(true);
        expect(Number.isFinite(rect.y)).toBe(true);
        expect(rect.w).toBeGreaterThanOrEqual(0);
        expect(rect.h).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test('towerSlots가 0이어도 사옥 사각형을 만들 수 있다', () => {
    expect(() => hqSpriteRect(layout, 0)).not.toThrow();
  });
});
