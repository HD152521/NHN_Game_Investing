import { describe, expect, test } from 'vitest';

import type { MarketEvent } from '../market/types.js';
import { EVENT_WINDOW_MS } from './constants.js';
import { activeEventAt } from './event-window.js';

const EVENTS: readonly MarketEvent[] = [
  { atMs: 10_000, kind: 'panic_sell' },
  { atMs: 100_000, kind: 'fomo_rally' },
];

describe('activeEventAt — MarketEvent를 전장 날씨로 잇는 창', () => {
  test('이벤트 이전에는 활성 이벤트가 없다', () => {
    expect(activeEventAt(EVENTS, 0)).toBeNull();
    expect(activeEventAt(EVENTS, 9_999)).toBeNull();
  });

  test('이벤트 시각부터 활성이다', () => {
    expect(activeEventAt(EVENTS, 10_000)).toBe('panic_sell');
  });

  test('창 끝 직전까지 활성이다', () => {
    expect(activeEventAt(EVENTS, 10_000 + EVENT_WINDOW_MS - 1)).toBe('panic_sell');
  });

  test('창을 벗어나면 다시 없다', () => {
    expect(activeEventAt(EVENTS, 10_000 + EVENT_WINDOW_MS)).toBeNull();
  });

  test('나중 이벤트도 각자의 창에서 활성이다', () => {
    expect(activeEventAt(EVENTS, 100_500)).toBe('fomo_rally');
  });

  test('이벤트가 겹치면 가장 최근에 시작된 것이 이긴다', () => {
    const overlapping: readonly MarketEvent[] = [
      { atMs: 0, kind: 'panic_sell' },
      { atMs: 1_000, kind: 'fomo_rally' },
    ];
    expect(activeEventAt(overlapping, 1_500)).toBe('fomo_rally');
  });

  test('이벤트가 없으면 null이다', () => {
    expect(activeEventAt([], 50_000)).toBeNull();
  });
});
