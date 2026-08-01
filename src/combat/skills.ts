/**
 * 스킬 상태 조회·감소 헬퍼 (FR-6.6). 전부 순수 함수다.
 *
 * `CombatState.skillCooldowns`와 `shieldRemainingMs`가 **선택 필드**인 이유는 types.ts에
 * 적어 두었다(렌더러 테스트 픽스처가 `CombatState` 리터럴을 직접 만든다). 그 선택성을
 * 읽는 쪽마다 `?? 0`으로 풀면 기본값 규칙이 파일마다 흩어지므로, 조회는 전부 이 파일을
 * 거치게 한다.
 */

import { SKILL_IDS } from './constants';
import type { CombatState, SkillId } from './types';

/** 전 스킬 쿨다운 0인 초기 레코드. 호출마다 새 객체를 만든다(공유 참조 금지). */
export function createSkillCooldowns(): Record<SkillId, number> {
  const cooldowns = {} as Record<SkillId, number>;
  for (const id of SKILL_IDS) {
    cooldowns[id] = 0;
  }
  return cooldowns;
}

/**
 * 스킬 하나의 남은 쿨다운(ms).
 *
 * `skillCooldowns`가 없는 상태(렌더러 픽스처)에서는 `S-01`만 별칭 필드
 * `skillCooldownMs`로 답하고 나머지는 0으로 본다 — 별칭의 의미가 곧 `S-01`이기 때문이다.
 */
export function skillCooldownOf(state: CombatState, id: SkillId): number {
  const cooldowns = state.skillCooldowns;
  if (cooldowns) {
    return cooldowns[id];
  }
  return id === 'S-01' ? state.skillCooldownMs : 0;
}

/** 실드(S-03)가 지금 본진 피해를 막고 있는가. */
export function isShieldActive(state: CombatState): boolean {
  return (state.shieldRemainingMs ?? 0) > 0;
}

/** 모든 스킬 쿨다운을 `dtMs`만큼 줄인다. 0 아래로는 내려가지 않는다. */
export function tickSkillCooldowns(
  cooldowns: Readonly<Record<SkillId, number>>,
  dtMs: number,
): Record<SkillId, number> {
  const next = {} as Record<SkillId, number>;
  for (const id of SKILL_IDS) {
    next[id] = Math.max(0, cooldowns[id] - dtMs);
  }
  return next;
}
