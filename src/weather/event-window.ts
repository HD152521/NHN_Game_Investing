/**
 * `MarketEvent` → 지금 활성인 이벤트 종류.
 *
 * ★ 이 함수가 프로젝트의 구조 결함을 메우는 지점이다. `ChartSet.events`는 지금까지
 *   생성만 되고 `src/` 어디서도 소비되지 않았다 — 차트가 폭락해도 전장에서 아무 일도
 *   일어나지 않은 원인이다. 여기서 이벤트를 시간 창으로 바꿔 날씨 판정에 먹인다.
 */

import type { MarketEvent, MarketEventKind } from '../market/types.js';
import { EVENT_WINDOW_MS } from './constants.js';

/**
 * `elapsedMs` 시점에 활성인 이벤트의 종류. 없으면 `null`.
 *
 * 창이 겹치면 **가장 늦게 시작된 것**이 이긴다 — 시장이 방향을 튼 직후에는
 * 새 사건이 이전 사건을 덮어야 화면이 현실을 따라간다.
 */
export function activeEventAt(
  events: readonly MarketEvent[],
  elapsedMs: number,
): MarketEventKind | null {
  let winner: MarketEvent | null = null;

  for (const event of events) {
    const started = elapsedMs >= event.atMs;
    const stillOpen = elapsedMs < event.atMs + EVENT_WINDOW_MS;
    if (!started || !stillOpen) continue;
    if (winner === null || event.atMs >= winner.atMs) {
      winner = event;
    }
  }

  return winner === null ? null : winner.kind;
}
