/**
 * 타워 슬롯 클릭 판정 — 순수 함수.
 *
 * 셸(UI)이 타워 건설 화면을 붙일 때 캔버스 좌표를 슬롯 인덱스로 바꾸는 용도다.
 * `layout.ts`의 `slotRect`와 동일한 사각형을 사용해, 그려지는 위치와 클릭 판정
 * 위치가 항상 일치하도록 보장한다.
 */

import type { BattleLayout } from './layout.js';
import { slotRect } from './layout.js';

/**
 * 캔버스 좌표(px, px) → 타워 슬롯 인덱스. 어느 슬롯에도 속하지 않으면 `null`.
 *
 * `towerSlots<=0`이면(전투 시작 전 등) 항상 `null`을 반환한다.
 */
export function slotAt(
  px: number,
  py: number,
  layout: BattleLayout,
  towerSlots: number,
): number | null {
  if (towerSlots <= 0) return null;

  for (let i = 0; i < towerSlots; i += 1) {
    const rect = slotRect(i, layout, towerSlots);
    const insideX = px >= rect.x && px <= rect.x + rect.w;
    const insideY = py >= rect.y && py <= rect.y + rect.h;
    if (insideX && insideY) return i;
  }

  return null;
}
