import { describe, expect, test } from 'vitest';

import {
  FIELD_SLOT_COUNT,
  activeCount,
  createWeatherField,
  fieldPhase,
  slotSeed,
} from './field.js';

describe('createWeatherField — 프레임당 할당 0을 위한 선할당 버퍼', () => {
  test('모든 버퍼가 슬롯 수만큼 미리 잡혀 있다', () => {
    const field = createWeatherField();
    expect(field.seed).toHaveLength(FIELD_SLOT_COUNT);
    expect(field.speed).toHaveLength(FIELD_SLOT_COUNT);
    expect(field.length).toHaveLength(FIELD_SLOT_COUNT);
  });

  test('시드는 0~1 범위이고 결정적이다', () => {
    const a = createWeatherField();
    const b = createWeatherField();
    for (let i = 0; i < FIELD_SLOT_COUNT; i += 1) {
      expect(slotSeed(a, i)).toBeGreaterThanOrEqual(0);
      expect(slotSeed(a, i)).toBeLessThanOrEqual(1);
      expect(slotSeed(a, i)).toBeCloseTo(slotSeed(b, i), 6);
    }
  });

  test('시드가 전부 같은 값이 아니다 (한 줄로 몰리지 않는다)', () => {
    const field = createWeatherField();
    const unique = new Set(Array.from(field.seed));
    expect(unique.size).toBeGreaterThan(FIELD_SLOT_COUNT / 2);
  });

  test('범위를 벗어난 슬롯 조회는 0을 돌려준다 (크래시 금지)', () => {
    const field = createWeatherField();
    expect(slotSeed(field, FIELD_SLOT_COUNT + 10)).toBe(0);
    expect(slotSeed(field, -1)).toBe(0);
  });
});

describe('fieldPhase — 시간 → 0~1 위상', () => {
  test('항상 0 이상 1 미만이다', () => {
    for (let t = 0; t < 10_000; t += 137) {
      const phase = fieldPhase(t, 900, 0.3, 1);
      expect(phase).toBeGreaterThanOrEqual(0);
      expect(phase).toBeLessThan(1);
    }
  });

  test('주기가 0 이하여도 유한한 값이다', () => {
    expect(Number.isFinite(fieldPhase(1234, 0, 0.5, 1))).toBe(true);
  });
});

describe('activeCount — 강도에 비례한 입자 수', () => {
  test('강도 0이면 0개다', () => {
    expect(activeCount(0, 40, 8)).toBe(0);
  });

  test('강도 1이면 최대치다', () => {
    expect(activeCount(1, 40, 8)).toBe(40);
  });

  test('강도가 커질수록 줄지 않는다', () => {
    let previous = -1;
    for (let i = 0; i <= 100; i += 1) {
      const count = activeCount(i / 100, 40, 8);
      expect(count).toBeGreaterThanOrEqual(previous);
      previous = count;
    }
  });

  test('강도가 아주 작아도 최소 개수는 보장된다', () => {
    expect(activeCount(0.001, 40, 8)).toBeGreaterThanOrEqual(8);
  });
});
