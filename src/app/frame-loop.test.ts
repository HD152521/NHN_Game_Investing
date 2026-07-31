import { describe, expect, test } from 'vitest';

/**
 * 시작 게이트의 핵심 계약을 검증한다.
 *
 * "시작 버튼을 누르기 전에는 스테이지가 정지해 있다"는 요구는 결국
 * **프레임 루프가 한 번도 돌지 않는다**는 뜻이다. rAF를 직접 부르면 jsdom 없이
 * 검증할 수 없으므로 스케줄러를 주입 가능한 인터페이스로 뽑았다.
 */
import { createFrameLoop } from './frame-loop';
import type { FrameScheduler } from './frame-loop';

/** 프레임을 수동으로 흘려보내는 가짜 스케줄러. */
function createFakeScheduler(): FrameScheduler & {
  readonly requested: number;
  readonly cancelled: readonly number[];
  flush(nowMs: number): boolean;
} {
  let pending: ((nowMs: number) => void) | null = null;
  let handle = 0;
  let requested = 0;
  const cancelled: number[] = [];

  return {
    request(callback) {
      pending = callback;
      requested += 1;
      handle += 1;
      return handle;
    },
    cancel(target) {
      cancelled.push(target);
      pending = null;
    },
    get requested() {
      return requested;
    },
    get cancelled() {
      return cancelled;
    },
    flush(nowMs) {
      const callback = pending;
      if (!callback) {
        return false;
      }
      pending = null;
      callback(nowMs);
      return true;
    },
  };
}

describe('createFrameLoop', () => {
  test('시작 전에는 스테이지 루프가 진행되지 않는다', () => {
    const scheduler = createFakeScheduler();
    let frames = 0;
    createFrameLoop(scheduler, () => {
      frames += 1;
    });

    // 프레임을 흘려보내려 해도 예약된 것이 없다 = 차트가 재생되지 않는다.
    expect(scheduler.requested).toBe(0);
    expect(scheduler.flush(16)).toBe(false);
    expect(frames).toBe(0);
  });

  test('start() 이후에만 프레임이 호출된다', () => {
    const scheduler = createFakeScheduler();
    const seen: number[] = [];
    const loop = createFrameLoop(scheduler, (nowMs) => {
      seen.push(nowMs);
    });

    loop.start();
    expect(scheduler.flush(16)).toBe(true);
    expect(scheduler.flush(32)).toBe(true);

    expect(seen).toEqual([16, 32]);
  });

  test('running 플래그가 시작·정지를 반영한다', () => {
    const scheduler = createFakeScheduler();
    const loop = createFrameLoop(scheduler, () => undefined);

    expect(loop.running).toBe(false);
    loop.start();
    expect(loop.running).toBe(true);
    loop.stop();
    expect(loop.running).toBe(false);
  });

  test('start()를 두 번 불러도 프레임이 중복 예약되지 않는다', () => {
    const scheduler = createFakeScheduler();
    let frames = 0;
    const loop = createFrameLoop(scheduler, () => {
      frames += 1;
    });

    loop.start();
    loop.start();
    scheduler.flush(16);

    expect(scheduler.requested).toBe(2); // start 1회 + 프레임 후 재예약 1회
    expect(frames).toBe(1);
  });

  test('stop() 이후에는 프레임이 더 이상 호출되지 않는다', () => {
    const scheduler = createFakeScheduler();
    let frames = 0;
    const loop = createFrameLoop(scheduler, () => {
      frames += 1;
    });

    loop.start();
    scheduler.flush(16);
    loop.stop();

    expect(scheduler.cancelled.length).toBe(1);
    expect(scheduler.flush(32)).toBe(false);
    expect(frames).toBe(1);
  });

  test('stop() 후 다시 start() 하면 재개된다', () => {
    const scheduler = createFakeScheduler();
    let frames = 0;
    const loop = createFrameLoop(scheduler, () => {
      frames += 1;
    });

    loop.start();
    loop.stop();
    loop.start();
    scheduler.flush(16);

    expect(frames).toBe(1);
  });

  test('프레임 콜백 안에서 stop() 하면 다음 프레임을 예약하지 않는다', () => {
    const scheduler = createFakeScheduler();
    let frames = 0;
    const loop = createFrameLoop(scheduler, () => {
      frames += 1;
      loop.stop();
    });

    loop.start();
    scheduler.flush(16);

    expect(frames).toBe(1);
    expect(scheduler.flush(32)).toBe(false);
  });
});
