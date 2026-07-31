/**
 * 프레임 루프 드라이버 — **정지 상태로 태어난다**.
 *
 * 예전에는 `mountStage()`가 곧바로 `requestAnimationFrame`을 걸어서, 링크를 여는
 * 순간 이미 차트가 흐르고 있었다. 처음 보는 사람에게는 게임이 아니라 "덜 만든 툴"로
 * 읽히는 화면이었다. 그래서 루프 소유권을 이 모듈로 옮기고 `start()`가 있어야만
 * 첫 프레임이 예약되도록 못박는다.
 *
 * 스케줄러를 주입받는 이유는 테스트다. 이 프로젝트 vitest는 node 환경이라
 * `requestAnimationFrame`이 없다 — 가짜 스케줄러를 꽂아야 "시작 전에는 한 프레임도
 * 돌지 않는다"를 실제로 검증할 수 있다.
 */

/** rAF의 최소 계약. 테스트에서 가짜 스케줄러로 대체된다. */
export interface FrameScheduler {
  request(callback: (nowMs: number) => void): number;
  cancel(handle: number): void;
}

export interface FrameLoop {
  /** 첫 프레임을 예약한다. 이미 돌고 있으면 아무 일도 하지 않는다. */
  start(): void;
  /** 예약된 프레임을 취소한다. 프레임 콜백 안에서 불러도 안전하다. */
  stop(): void;
  readonly running: boolean;
}

/** 브라우저 rAF 어댑터. 테스트에서는 쓰이지 않는다. */
export function createRafScheduler(): FrameScheduler {
  return {
    request: (callback) => requestAnimationFrame(callback),
    cancel: (handle) => cancelAnimationFrame(handle),
  };
}

export function createFrameLoop(
  scheduler: FrameScheduler,
  onFrame: (nowMs: number) => void,
): FrameLoop {
  let handle: number | null = null;
  let running = false;

  function tick(nowMs: number): void {
    handle = null;
    onFrame(nowMs);
    // 콜백 안에서 stop()이 불렸을 수 있다 — 그 경우 재예약하지 않는다.
    if (running) {
      handle = scheduler.request(tick);
    }
  }

  return {
    start(): void {
      if (running) {
        return;
      }
      running = true;
      handle = scheduler.request(tick);
    },
    stop(): void {
      running = false;
      if (handle !== null) {
        scheduler.cancel(handle);
        handle = null;
      }
    },
    get running(): boolean {
      return running;
    },
  };
}
