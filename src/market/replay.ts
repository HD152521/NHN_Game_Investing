/**
 * 리플레이 엔진 — 스테이지 데이터(ChartSet)를 재생 시각에 맞춰 현재가로 바꾼다.
 *
 * 내부에서 `Date.now()` / `performance.now()`를 절대 부르지 않는다. 시계는 항상
 * `tick(nowMs)`로 주입받는다 — 서버 권위 판정(FR-5.4)과 헤드리스 테스트가 여기에 걸려 있다.
 */

import type { ChartSet, Replay, ReplayState } from './types';
import { BARS_PER_DAY, MS_PER_BAR, STAGE_DURATION_MS } from './types';

export interface ReplayOptions {
  /** 배속 `0.5 / 1 / 2`. FR-3.5 — 스테이지 시작 전에만 정해지고 진행 중 바뀌지 않는다. */
  readonly speed?: number;
  /** 이 리플레이의 elapsed=0에 대응하는 외부 시계 값(ms). */
  readonly startAtMs?: number;
}

const DEFAULT_SPEED = 1;
const DEFAULT_START_AT_MS = 0;

/**
 * `ChartSet` 하나로 리플레이 인스턴스를 만든다.
 * 반환된 인스턴스는 내부 상태를 갖지 않는 순수 계산기다 — `tick`/`priceAt`은
 * 같은 인자에 항상 같은 값을 낸다.
 */
export function createReplay(set: ChartSet, options?: ReplayOptions): Replay {
  const speed = options?.speed ?? DEFAULT_SPEED;
  const startAtMs = options?.startAtMs ?? DEFAULT_START_AT_MS;
  const durationMs = STAGE_DURATION_MS / speed;

  /**
   * 재생 경과(elapsedMs, 배속 반영된 값)에서 보간가를 뽑는다.
   * FR-3.3: 봉 i의 종가와 봉 i+1의 종가 사이를 선형 보간한다.
   * 범위를 벗어난 입력은 [0, STAGE_DURATION_MS]로 클램프한다.
   */
  function priceAt(elapsedMs: number): number {
    const clampedElapsed = Math.min(Math.max(elapsedMs, 0), STAGE_DURATION_MS);
    const scaledPosition = clampedElapsed / MS_PER_BAR;
    const index = Math.min(Math.floor(scaledPosition), BARS_PER_DAY - 1);

    const currentBar = set.bars[index];
    if (!currentBar) {
      // 계약상 set.bars는 정확히 BARS_PER_DAY개라 도달하지 않지만, 인덱스 접근은
      // `T | undefined`이므로(noUncheckedIndexedAccess) 방어적으로 0을 반환한다.
      return 0;
    }
    if (index >= BARS_PER_DAY - 1) {
      return currentBar.c;
    }

    const nextBar = set.bars[index + 1];
    if (!nextBar) {
      return currentBar.c;
    }

    const fraction = scaledPosition - index;
    return currentBar.c + (nextBar.c - currentBar.c) * fraction;
  }

  /** 외부 시계(nowMs)를 먹여 현재 리플레이 상태를 계산한다. */
  function tick(nowMs: number): ReplayState {
    const wallClockElapsed = Math.max(0, nowMs - startAtMs);
    const elapsedMs = Math.min(wallClockElapsed * speed, STAGE_DURATION_MS);
    const barIndex = Math.min(Math.floor(elapsedMs / MS_PER_BAR), BARS_PER_DAY - 1);
    const progress = elapsedMs / STAGE_DURATION_MS;
    const finished = elapsedMs >= STAGE_DURATION_MS;

    return {
      elapsedMs,
      barIndex,
      price: priceAt(elapsedMs),
      progress,
      finished,
    };
  }

  return {
    tick,
    priceAt,
    durationMs,
    speed,
    set,
  };
}
