import { describe, expect, test } from 'vitest';

import { computeBattleLayout, laneY, progressToX, slotRect } from './layout.js';

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

describe('slotRect', () => {
  test('슬롯 인덱스가 커질수록 x 중심이 우측으로 이동한다', () => {
    const layout = computeBattleLayout(800, 300);
    const towerSlots = 6;
    const rects = Array.from({ length: towerSlots }, (_, i) => slotRect(i, layout, towerSlots));

    for (let i = 1; i < rects.length; i += 1) {
      const prevCenter = rects[i - 1]!.x + rects[i - 1]!.w / 2;
      const curCenter = rects[i]!.x + rects[i]!.w / 2;
      expect(curCenter).toBeGreaterThan(prevCenter);
    }
  });

  test('모든 슬롯이 레인 폭 안에 대략 들어온다', () => {
    const layout = computeBattleLayout(800, 300);
    const towerSlots = 6;
    for (let i = 0; i < towerSlots; i += 1) {
      const rect = slotRect(i, layout, towerSlots);
      expect(rect.x).toBeGreaterThanOrEqual(layout.laneLeft - 1);
      expect(rect.x + rect.w).toBeLessThanOrEqual(layout.laneRight + 1);
      expect(rect.w).toBeGreaterThan(0);
      expect(rect.h).toBeGreaterThan(0);
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
