/**
 * 골드 이동 연출 DOM 배선 — 계산은 전부 `gold-flight-logic.ts`가 한다.
 *
 * 이 모듈은 **골드 HUD 숫자의 소유자**이기도 하다. 연출 중에 스테이지가 매 프레임
 * `textContent = String(gold)`로 덮어쓰면 카운트업이 즉시 치환으로 되돌아가므로,
 * 표시는 여기서만 만지고 스테이지는 `sync()`로 목표값만 알려 준다.
 */

import {
  clampGoldDisplay,
  countUpTo,
  formatGoldFlightLabel,
  goldFlightToneClass,
  resolveGoldFlightAnnouncement,
  resolveGoldFlightPlan,
  resolveGoldFlightTone,
  sampleGoldFlight,
} from './gold-flight-logic';
import type { CloseReason, FlightPath, GoldFlightPlan } from './gold-flight-logic';

/** rAF의 최소 계약. `src/app/frame-loop`의 스케줄러와 구조적으로 호환된다. */
export interface FlightScheduler {
  request(callback: (nowMs: number) => void): number;
  cancel(handle: number): void;
}

export interface GoldMeterOptions {
  /** 연출 엘리먼트가 얹힐 컨테이너. `position: relative`여야 한다. */
  readonly layer: HTMLElement;
  /** 출발점 — 차트 영역. */
  readonly source: HTMLElement;
  /** 도착점 — 골드 HUD 숫자. 표시 소유권도 이 엘리먼트에 있다. */
  readonly valueEl: HTMLElement;
  /** 스크린리더 아나운스 영역 (`aria-live`). */
  readonly announceEl: HTMLElement;
  readonly scheduler: FlightScheduler;
  prefersReducedMotion(): boolean;
}

export interface GoldFlightRequest {
  readonly goldGained: number;
  readonly pnl: number;
  readonly reason: CloseReason;
}

export interface GoldMeter {
  /** 매 프레임 호출. 연출 중이면 표시를 보류하고 끝난 뒤 반영한다. */
  sync(gold: number): void;
  launch(request: GoldFlightRequest): void;
  destroy(): void;
}

interface ActiveFlight {
  readonly element: HTMLElement;
  readonly plan: GoldFlightPlan;
  readonly path: FlightPath;
  readonly fromGold: number;
  readonly gained: number;
  startMs: number | null;
  handle: number | null;
}

/** 브라우저 기본 감지. 테스트·스텁에서는 옵션으로 대체한다. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function centerOf(element: HTMLElement, origin: DOMRect): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left - origin.left + rect.width / 2,
    y: rect.top - origin.top + rect.height / 2,
  };
}

export function createGoldMeter(options: GoldMeterOptions): GoldMeter {
  let displayed = Number(options.valueEl.textContent) || 0;
  let pending: number | null = null;
  let active: ActiveFlight | null = null;

  function render(gold: number): void {
    displayed = gold;
    options.valueEl.textContent = String(gold);
  }

  function finish(): void {
    if (!active) {
      return;
    }
    const settled = active.fromGold + active.gained;
    if (active.handle !== null) {
      options.scheduler.cancel(active.handle);
    }
    active.element.remove();
    active = null;
    render(pending ?? settled);
    pending = null;
  }

  function frame(nowMs: number): void {
    const flight = active;
    if (!flight) {
      return;
    }
    flight.handle = null;
    flight.startMs ??= nowMs;

    const sample = sampleGoldFlight(flight.plan, flight.path, nowMs - flight.startMs);
    flight.element.style.transform = `translate(${sample.x}px, ${sample.y}px) translate(-50%, -50%) scale(${sample.scale})`;
    flight.element.style.opacity = String(sample.opacity);

    // 카운트업이 시작되기 전(이동 구간)에는 출발값에 머문다.
    const countUp =
      sample.countUpProgress > 0
        ? countUpTo(flight.fromGold, flight.gained, sample.countUpProgress)
        : flight.fromGold;
    // ★ 실제 골드를 넘겨 표시하지 않는다 (CLICK-PATH LOW-3) ★
    // 연출 중 타워를 사면 `sync`가 줄어든 골드를 `pending`에 넣어 두므로 그것이 상한이 된다.
    // 이동 구간도 함께 덮는다 — 그 구간에 골드를 쓰면 `fromGold`조차 과대 표시가 된다.
    const shown = clampGoldDisplay(countUp, pending);
    if (shown !== displayed) {
      displayed = shown;
      options.valueEl.textContent = String(shown);
    }

    if (sample.done) {
      finish();
      return;
    }
    flight.handle = options.scheduler.request(frame);
  }

  function launch(request: GoldFlightRequest): void {
    // 연달아 청산되면 앞 연출은 즉시 확정하고 자리를 넘긴다.
    finish();

    const tone = resolveGoldFlightTone(request.reason, request.pnl);
    if (request.goldGained <= 0 && tone !== 'liquidated') {
      return; // 알릴 것이 없다.
    }

    const plan = resolveGoldFlightPlan(options.prefersReducedMotion());
    const origin = options.layer.getBoundingClientRect();
    const from = centerOf(options.source, origin);
    const to = centerOf(options.valueEl, origin);

    const element = document.createElement('span');
    element.className = `gold-flight ${goldFlightToneClass(tone)}`;
    element.setAttribute('aria-hidden', 'true');
    element.textContent = formatGoldFlightLabel(tone, request.goldGained);
    options.layer.appendChild(element);

    active = {
      element,
      plan,
      path: { fromX: from.x, fromY: from.y, toX: to.x, toY: to.y },
      fromGold: displayed,
      gained: request.goldGained,
      startMs: null,
      handle: null,
    };

    if (plan.announces) {
      options.announceEl.textContent = resolveGoldFlightAnnouncement(
        tone,
        request.goldGained,
        displayed + request.goldGained,
      );
    }

    active.handle = options.scheduler.request(frame);
  }

  return {
    sync(gold: number): void {
      if (active) {
        pending = gold;
        return;
      }
      if (gold !== displayed) {
        render(gold);
      }
    },
    launch,
    destroy(): void {
      finish();
    },
  };
}
