// @vitest-environment jsdom

import { describe, expect, test } from 'vitest';

/**
 * 골드 연출의 **DOM 배선** 검증 — CLICK-PATH LOW-3 회귀 방어선.
 *
 * `gold-flight-logic.test.ts`가 타임라인 계산을, 여기서는 그 계산이 실제로 HUD 숫자에
 * 옮겨지는지를 본다. LOW-3은 계산이 아니라 **`sync`와 `frame`의 시간차**에 있던 결함이라
 * 순수 함수 테스트만으로는 잡히지 않는다 (GAME.md §19-7).
 *
 * 시계와 rAF는 전부 주입한다 — 스케줄러를 직접 돌려 프레임을 한 칸씩 전진시킨다.
 */
import { createGoldMeter } from './gold-flight';
import { GOLD_FLIGHT_TOTAL_MS } from './gold-flight-logic';
import type { FlightScheduler } from './gold-flight';

/** rAF 대역. `step(nowMs)`로 다음 프레임을 수동으로 돌린다. */
function createScheduler(): FlightScheduler & { step(nowMs: number): void; pending(): boolean } {
  let queued: ((nowMs: number) => void) | null = null;
  let nextHandle = 1;
  return {
    request(callback) {
      queued = callback;
      return nextHandle++;
    },
    cancel() {
      queued = null;
    },
    step(nowMs) {
      const callback = queued;
      queued = null;
      callback?.(nowMs);
    },
    pending() {
      return queued !== null;
    },
  };
}

function setup(startingGold: number) {
  const layer = document.createElement('div');
  const source = document.createElement('div');
  const valueEl = document.createElement('span');
  const announceEl = document.createElement('span');
  valueEl.textContent = String(startingGold);
  layer.append(source, valueEl, announceEl);
  document.body.appendChild(layer);

  const scheduler = createScheduler();
  const meter = createGoldMeter({
    layer,
    source,
    valueEl,
    announceEl,
    scheduler,
    prefersReducedMotion: () => false,
  });
  return { meter, scheduler, valueEl };
}

const shown = (el: HTMLElement): number => Number(el.textContent);

describe('연출 중 골드 표시 (CLICK-PATH LOW-3)', () => {
  test('★ 연출 도중 타워를 사면 HUD가 실제 골드를 넘겨 표시하지 않는다', () => {
    // 200 G 보유 → +200 청산 연출 시작(목표 400).
    const { meter, scheduler, valueEl } = setup(200);
    meter.launch({ goldGained: 200, pnl: 200, reason: 'manual' });

    // 연출이 카운트업 구간까지 진행됐다.
    scheduler.step(0);
    scheduler.step(GOLD_FLIGHT_TOTAL_MS * 0.9);

    // 이 순간 플레이어가 120 G 포탑을 산다 → 실제 골드 280.
    meter.sync(280);
    scheduler.step(GOLD_FLIGHT_TOTAL_MS * 0.95);

    // 고치기 전에는 목표 400을 향해 계속 올라가 없는 돈을 보여줬다.
    expect(shown(valueEl)).toBeLessThanOrEqual(280);
  });

  test('지출이 없으면 연출은 목표값까지 정상적으로 올라간다 (연출을 죽이지 않는다)', () => {
    const { meter, scheduler, valueEl } = setup(200);
    meter.launch({ goldGained: 200, pnl: 200, reason: 'manual' });

    meter.sync(400); // 세션은 이미 청산 대금을 반영해 뒀다.
    scheduler.step(0);
    scheduler.step(GOLD_FLIGHT_TOTAL_MS);

    expect(shown(valueEl)).toBe(400);
  });

  test('연출이 끝나면 보류해 둔 실제 골드로 확정된다', () => {
    const { meter, scheduler, valueEl } = setup(200);
    meter.launch({ goldGained: 200, pnl: 200, reason: 'manual' });

    scheduler.step(0);
    meter.sync(280); // 연출 중 지출
    scheduler.step(GOLD_FLIGHT_TOTAL_MS);

    expect(shown(valueEl)).toBe(280);
  });

  test('이동 구간(카운트업 시작 전)의 지출도 과대 표시되지 않는다', () => {
    // 카운트업 전 표시 후보는 출발값 200인데, 그 사이 160만 남았다면 200을 보이면 안 된다.
    const { meter, scheduler, valueEl } = setup(200);
    meter.launch({ goldGained: 200, pnl: 200, reason: 'manual' });

    scheduler.step(0);
    meter.sync(160);
    scheduler.step(1);

    expect(shown(valueEl)).toBeLessThanOrEqual(160);
  });

  test('연출이 없을 때는 sync가 즉시 반영된다', () => {
    const { meter, valueEl } = setup(200);
    meter.sync(340);
    expect(shown(valueEl)).toBe(340);
  });
});
