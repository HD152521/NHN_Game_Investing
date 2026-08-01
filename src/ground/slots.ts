/**
 * 타워 슬롯 데칼 상태 판정 (시트 §02) — 순수 함수.
 *
 * "배치 가능 / 불가"를 **골드 보유량과 슬롯 점유 여부**로만 가른다. 이 판정이 화면에
 * 그대로 보이는 것이 이 데칼의 존재 이유다 — 지금 타워를 살 돈이 없으면 슬롯이 회색
 * 해칭으로 죽어, "매매를 해야 방어가 선다"를 글자 없이 알린다.
 */

import type { SlotConditions, SlotDecalState } from './types.js';

/**
 * 슬롯 하나의 데칼 상태를 고른다.
 *
 * 우선순위: 타워 미선택(비활성) > 점유(불가) > 골드 부족(불가) > 배치 가능.
 * 비정상 수치(NaN 골드·비용)는 안전한 쪽인 `blocked`로 떨어뜨린다 — 살 수 없는데
 * 살 수 있다고 표시하는 쪽이 더 나쁜 실패다.
 */
export function classifySlotDecal(conditions: SlotConditions): SlotDecalState {
  const cost = conditions.buildCost;
  if (cost === null) return 'inactive';
  if (conditions.isOccupied) return 'blocked';
  if (!Number.isFinite(conditions.gold) || !Number.isFinite(cost)) return 'blocked';
  return conditions.gold >= cost ? 'placeable' : 'blocked';
}
