import { describe, expect, test } from 'vitest';

import { towerX } from '../combat/index.js';
import { computeBattleLayout } from './layout.js';
import { slotAt } from './hit-test.js';
import { progressToX, slotRect } from './layout.js';

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

  /**
   * ★ 배치 이동 회귀 방지 ★ 슬롯이 사옥 쪽으로 옮겨간 뒤에도 클릭 판정이 **전투 좌표**
   * (`towerX(slot)`)를 그대로 따라와야 한다. 예전에는 화면이 슬롯을 레인 전체에 균등
   * 분배해 놓고 판정만 사옥 앞 10%를 썼다 — 보이는 곳과 쏘는 곳이 달랐다.
   */
  test('전투 좌표(towerX)를 픽셀로 옮긴 지점을 클릭하면 그 슬롯이 잡힌다', () => {
    const layout = computeBattleLayout(1024, 360);
    const towerSlots = 6;

    for (let i = 0; i < towerSlots; i += 1) {
      const rect = slotRect(i, layout, towerSlots);
      const px = progressToX(towerX(i), layout);
      const py = rect.y + rect.h / 2;

      expect(px).toBeCloseTo(rect.x + rect.w / 2, 5);
      expect(slotAt(px, py, layout, towerSlots)).toBe(i);
    }
  });

  test('전장 중앙을 클릭해도 어떤 슬롯도 잡히지 않는다 (교전 공간은 비어 있다)', () => {
    const layout = computeBattleLayout(1024, 360);
    expect(slotAt(layout.width / 2, layout.towerRowY, layout, 6)).toBeNull();
  });

  test('towerSlots가 0이면 항상 null이다', () => {
    const layout = computeBattleLayout(800, 300);
    expect(slotAt(400, 150, layout, 0)).toBeNull();
  });
});
