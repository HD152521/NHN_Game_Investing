import { describe, expect, test } from 'vitest';

import { classifySlotDecal } from './slots.js';

describe('classifySlotDecal — 타워 슬롯 3상태 데칼', () => {
  test('타워를 고르지 않았으면(buildCost null) 비활성이다', () => {
    expect(classifySlotDecal({ isOccupied: false, gold: 9999, buildCost: null })).toBe('inactive');
  });

  test('골드가 충분하고 빈 슬롯이면 배치 가능이다', () => {
    expect(classifySlotDecal({ isOccupied: false, gold: 120, buildCost: 120 })).toBe('placeable');
  });

  test('골드가 1이라도 모자라면 배치 불가다 (매매를 해야 방어가 선다)', () => {
    expect(classifySlotDecal({ isOccupied: false, gold: 119, buildCost: 120 })).toBe('blocked');
  });

  test('슬롯이 점유돼 있으면 골드가 남아돌아도 배치 불가다', () => {
    expect(classifySlotDecal({ isOccupied: true, gold: 9999, buildCost: 120 })).toBe('blocked');
  });

  test('점유된 슬롯도 타워를 고르지 않았으면 비활성이다 (데칼 자체가 꺼진다)', () => {
    expect(classifySlotDecal({ isOccupied: true, gold: 0, buildCost: null })).toBe('inactive');
  });

  test('비용이 0이면 골드 0에서도 배치 가능이다 (경계값)', () => {
    expect(classifySlotDecal({ isOccupied: false, gold: 0, buildCost: 0 })).toBe('placeable');
  });

  test('비정상 입력(NaN 골드)은 배치 불가로 떨어진다', () => {
    expect(classifySlotDecal({ isOccupied: false, gold: Number.NaN, buildCost: 120 })).toBe('blocked');
  });
});
