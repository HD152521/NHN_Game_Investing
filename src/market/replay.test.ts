import { describe, expect, test } from 'vitest';

import { createReplay } from './replay';
import type { Bar, ChartSet } from './types';
import { BARS_PER_DAY, MS_PER_BAR, STAGE_DURATION_MS } from './types';

/** 종가가 `100 + t`로 예측 가능한 고정 봉 세트 — 보간 경계값 검증용. */
function fixtureBars(): Bar[] {
  return Array.from({ length: BARS_PER_DAY }, (_, t) => {
    const c = 100 + t;
    return { t, o: c, h: c, l: c, c, v: 1000 };
  });
}

function fixtureSet(): ChartSet {
  return {
    id: 'test-fixture',
    bars: fixtureBars(),
    sigma30: 1,
    archetype: 'range',
    events: [],
    volumeMultiple: 1,
  };
}

describe('priceAt — 선형 보간', () => {
  test('봉 경계에서는 해당 봉의 종가와 정확히 일치한다', () => {
    const replay = createReplay(fixtureSet());
    expect(replay.priceAt(0)).toBe(100);
    expect(replay.priceAt(MS_PER_BAR)).toBe(101);
    expect(replay.priceAt(MS_PER_BAR * 10)).toBe(110);
  });

  test('봉 사이 중간 지점은 두 종가의 평균이다', () => {
    const replay = createReplay(fixtureSet());
    expect(replay.priceAt(MS_PER_BAR * 0.5)).toBeCloseTo(100.5, 5);
  });

  test('마지막 봉 이후에는 마지막 종가로 클램프된다', () => {
    const replay = createReplay(fixtureSet());
    const lastClose = 100 + (BARS_PER_DAY - 1);
    expect(replay.priceAt(STAGE_DURATION_MS)).toBe(lastClose);
    expect(replay.priceAt(STAGE_DURATION_MS + 5000)).toBe(lastClose);
  });

  test('음수 입력은 첫 봉 종가로 클램프된다', () => {
    const replay = createReplay(fixtureSet());
    expect(replay.priceAt(-1000)).toBe(100);
  });
});

describe('durationMs — 배속 반영', () => {
  test('기본 배속(1x)에서는 STAGE_DURATION_MS와 같다', () => {
    const replay = createReplay(fixtureSet());
    expect(replay.durationMs).toBe(STAGE_DURATION_MS);
  });

  test('배속 2에서는 총 재생 시간이 절반이 된다', () => {
    const replay = createReplay(fixtureSet(), { speed: 2 });
    expect(replay.durationMs).toBe(STAGE_DURATION_MS / 2);
  });

  test('배속 0.5에서는 총 재생 시간이 두 배가 된다', () => {
    const replay = createReplay(fixtureSet(), { speed: 0.5 });
    expect(replay.durationMs).toBe(STAGE_DURATION_MS * 2);
  });
});

describe('tick — 순수 함수 & 서버 시계 주입', () => {
  test('같은 nowMs를 여러 번 넣으면 항상 같은 상태를 반환한다', () => {
    const replay = createReplay(fixtureSet());
    const first = replay.tick(123456);
    const second = replay.tick(123456);
    expect(first).toEqual(second);
  });

  test('시작 시각(startAtMs) 이전에는 진행이 0으로 고정된다', () => {
    const replay = createReplay(fixtureSet(), { startAtMs: 10_000 });
    const state = replay.tick(0);
    expect(state.elapsedMs).toBe(0);
    expect(state.barIndex).toBe(0);
    expect(state.finished).toBe(false);
  });

  test('startAtMs 기준 정확히 한 스테이지가 지나면 종료 상태가 된다', () => {
    const replay = createReplay(fixtureSet(), { startAtMs: 1_000 });
    const state = replay.tick(1_000 + STAGE_DURATION_MS);
    expect(state.finished).toBe(true);
    expect(state.progress).toBe(1);
    expect(state.barIndex).toBe(BARS_PER_DAY - 1);
  });

  test('배속 2에서는 실제 경과시간의 절반만에 스테이지가 끝난다', () => {
    const replay = createReplay(fixtureSet(), { speed: 2 });
    const halfWallClock = STAGE_DURATION_MS / 2;
    const state = replay.tick(halfWallClock);
    expect(state.finished).toBe(true);
    expect(state.elapsedMs).toBe(STAGE_DURATION_MS);
  });

  test('진행률(progress)은 0과 1 사이다', () => {
    const replay = createReplay(fixtureSet());
    const midState = replay.tick(STAGE_DURATION_MS / 2);
    expect(midState.progress).toBeCloseTo(0.5, 5);
    expect(midState.progress).toBeGreaterThanOrEqual(0);
    expect(midState.progress).toBeLessThanOrEqual(1);
  });

  test('set 필드는 생성 시 전달한 ChartSet을 그대로 노출한다', () => {
    const set = fixtureSet();
    const replay = createReplay(set);
    expect(replay.set).toBe(set);
  });
});
