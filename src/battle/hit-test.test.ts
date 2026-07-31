import { describe, expect, test } from 'vitest';

import { computeBattleLayout } from './layout.js';
import { slotAt } from './hit-test.js';
import { slotRect } from './layout.js';

describe('slotAt', () => {
  test('슬롯 사각형 중심을 클릭하면 해당 슬롯 인덱스를 반환한다', () => {
    const layout = computeBattleLayout(800, 300);
    const towerSlots = 6;

    for (let i = 0; i < towerSlots; i += 1) {
      const rect = slotRect(i, layout, towerSlots);
      const centerX = rect.x + rect.w / 2;
      const centerY = rect.y + rect.h / 2;
      expect(slotAt(centerX, centerY, layout, towerSlots)).toBe(i);
    }
  });

  test('슬롯 사각형 경계 밖을 클릭하면 null을 반환한다', () => {
    const layout = computeBattleLayout(800, 300);
    const towerSlots = 6;

    expect(slotAt(-9999, -9999, layout, towerSlots)).toBeNull();
    expect(slotAt(999999, 999999, layout, towerSlots)).toBeNull();
  });

  test('두 슬롯 사이(간격)를 클릭하면 null을 반환한다', () => {
    const layout = computeBattleLayout(800, 300);
    const towerSlots = 6;
    const rect0 = slotRect(0, layout, towerSlots);
    const rect1 = slotRect(1, layout, towerSlots);
    const gapX = (rect0.x + rect0.w + rect1.x) / 2;
    const gapY = rect0.y + rect0.h / 2;

    // 슬롯 사이 간격이 존재한다면(폭이 셀보다 좁게 설계됨) null이어야 한다.
    if (gapX > rect0.x + rect0.w && gapX < rect1.x) {
      expect(slotAt(gapX, gapY, layout, towerSlots)).toBeNull();
    }
  });

  test('towerSlots가 0이면 항상 null이다', () => {
    const layout = computeBattleLayout(800, 300);
    expect(slotAt(400, 150, layout, 0)).toBeNull();
  });
});
