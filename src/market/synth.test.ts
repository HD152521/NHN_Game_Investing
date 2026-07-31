import { describe, expect, test, vi } from 'vitest';

import { generateChartSet } from './synth';
import { BARS_PER_DAY } from './types';
import type { Archetype, Bar } from './types';

const ARCHETYPES: readonly Archetype[] = ['surge', 'plunge', 'range', 'reversal'];

function assertOhlcInvariant(bar: Bar): void {
  expect(bar.h).toBeGreaterThanOrEqual(Math.max(bar.o, bar.c));
  expect(bar.l).toBeLessThanOrEqual(Math.min(bar.o, bar.c));
  expect(bar.o).toBeGreaterThan(0);
  expect(bar.h).toBeGreaterThan(0);
  expect(bar.l).toBeGreaterThan(0);
  expect(bar.c).toBeGreaterThan(0);
}

describe('generateChartSet — 구조 정합성', () => {
  test('정확히 BARS_PER_DAY개의 봉을 생성한다', () => {
    const set = generateChartSet(1, 'range');
    expect(set.bars).toHaveLength(BARS_PER_DAY);
  });

  test('봉 인덱스가 0..389로 순서대로 매겨진다', () => {
    const set = generateChartSet(1, 'range');
    set.bars.forEach((bar, i) => {
      expect(bar.t).toBe(i);
    });
  });

  test.each(ARCHETYPES)('%s 아키타입의 모든 봉이 OHLC 정합성을 지킨다', (archetype) => {
    const set = generateChartSet(42, archetype);
    for (const bar of set.bars) {
      assertOhlcInvariant(bar);
    }
  });

  test('sigma30과 volumeMultiple이 0보다 크다', () => {
    const set = generateChartSet(7, 'surge');
    expect(set.sigma30).toBeGreaterThan(0);
    expect(set.volumeMultiple).toBeGreaterThan(0);
  });

  test('id는 비어있지 않은 불투명 문자열이다', () => {
    const set = generateChartSet(7, 'surge');
    expect(typeof set.id).toBe('string');
    expect(set.id.length).toBeGreaterThan(0);
  });
});

describe('generateChartSet — 결정론 (시드 기반 PRNG)', () => {
  test('같은 시드 + 같은 아키타입은 완전히 같은 결과를 낸다', () => {
    const a = generateChartSet(555, 'reversal');
    const b = generateChartSet(555, 'reversal');
    expect(a).toEqual(b);
  });

  test('다른 시드는 다른 봉 데이터를 낸다', () => {
    const a = generateChartSet(1, 'range');
    const b = generateChartSet(2, 'range');
    expect(a.bars).not.toEqual(b.bars);
    expect(a.id).not.toBe(b.id);
  });

  test('Math.random을 쓰지 않는다 (모니터링용 스파이 확인)', () => {
    const spy = vi.spyOn(Math, 'random');
    generateChartSet(99, 'plunge');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('generateChartSet — 아키타입별 방향성', () => {
  test('surge는 당일 종가가 시가보다 뚜렷하게 높다', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const set = generateChartSet(seed, 'surge');
      const first = set.bars[0];
      const last = set.bars[set.bars.length - 1];
      expect(first).toBeDefined();
      expect(last).toBeDefined();
      if (!first || !last) continue;
      expect(last.c).toBeGreaterThan(first.o * 1.05);
    }
  });

  test('plunge는 당일 종가가 시가보다 뚜렷하게 낮다', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const set = generateChartSet(seed, 'plunge');
      const first = set.bars[0];
      const last = set.bars[set.bars.length - 1];
      expect(first).toBeDefined();
      expect(last).toBeDefined();
      if (!first || !last) continue;
      expect(last.c).toBeLessThan(first.o * 0.95);
    }
  });

  test('range는 당일 종가가 시가 근방에서 크게 벗어나지 않는다', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const set = generateChartSet(seed, 'range');
      const first = set.bars[0];
      const last = set.bars[set.bars.length - 1];
      expect(first).toBeDefined();
      expect(last).toBeDefined();
      if (!first || !last) continue;
      const changePct = ((last.c - first.o) / first.o) * 100;
      expect(Math.abs(changePct)).toBeLessThan(8);
    }
  });

  test('reversal은 전반부와 후반부의 추세 방향이 서로 반대다', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const set = generateChartSet(seed, 'reversal');
      const first = set.bars[0];
      const mid = set.bars[Math.floor((set.bars.length - 1) / 2)];
      const last = set.bars[set.bars.length - 1];
      expect(first).toBeDefined();
      expect(mid).toBeDefined();
      expect(last).toBeDefined();
      if (!first || !mid || !last) continue;
      const firstHalfChange = mid.c - first.o;
      const secondHalfChange = last.c - mid.c;
      expect(Math.sign(firstHalfChange)).not.toBe(0);
      expect(Math.sign(secondHalfChange)).not.toBe(0);
      expect(Math.sign(firstHalfChange)).not.toBe(Math.sign(secondHalfChange));
    }
  });
});

describe('generateChartSet — 블라인드 규칙 (FR-4)', () => {
  test('ChartSet에는 종목명·날짜 필드가 존재하지 않는다', () => {
    const set = generateChartSet(1, 'range');
    const keys = Object.keys(set);
    expect(keys).not.toContain('ticker');
    expect(keys).not.toContain('symbol');
    expect(keys).not.toContain('date');
    expect(keys).not.toContain('name');
  });
});

describe('generateChartSet — 아키타입 미지정', () => {
  test('아키타입을 생략하면 4종 중 하나가 결정론적으로 배정된다', () => {
    const set = generateChartSet(321);
    expect(ARCHETYPES).toContain(set.archetype);
    const again = generateChartSet(321);
    expect(again.archetype).toBe(set.archetype);
  });
});
