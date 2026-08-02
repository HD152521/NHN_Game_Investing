/**
 * 스킬 이펙트의 **실제 효과 범위** 선언 — 연출이 규칙을 정직하게 보여주기 위한 표.
 *
 * ★ 왜 이 표가 필요한가 ★
 * 플레이 피드백: "스킬 같은 거 위치가 지금 고정이잖아. 그거 맵 전체 적용인 거 아니면
 * 범위 설정 하게 해줘." 코드를 확인하면 **효과는 이미 맵 전체**인데(아래 표) 연출만
 * `anchor.ts`가 정한 한 자리에서 작게 터지고 있었다. 즉 문제는 효과 범위가 아니라
 * **연출이 범위를 거짓으로 알리고 있었다**는 것이다.
 *
 * ── 범위의 단일 출처는 `src/combat/actions.ts`의 `castSkill`이다 ──
 *   `S-01` detonate(enemies)  → `enemy.lane === 'ground'` 인 적 **전원**. 위치 무관.
 *                                 공중 적은 **맞지 않는다** → 연출도 지상 레인에만 걸려야 한다.
 *   `S-02` heal(units)        → 아군 유닛 **전원**. 위치 무관.
 *   `S-03` shieldRemainingMs  → 본진(아군 사옥) 피해 차단. **지점 효과**.
 *
 * ⚠️ 이 표는 `castSkill`을 **따라가는** 사본이다. 효과 범위를 바꾸려면 `castSkill`을 먼저
 *    바꾸고 여기를 맞춰라. 반대로 하면 화면이 다시 거짓말을 시작한다.
 */

import type { SkillEffectId } from './types.js';

/**
 * - `map-ground`  전장 전체의 **지상 레인**. 공중은 제외된다.
 * - `map-allies`  전장 전체의 **아군 유닛**. 유닛이 어디 있든 걸린다.
 * - `base-front`  아군 사옥 앞 한 지점.
 */
export type SkillFxScope = 'map-ground' | 'map-allies' | 'base-front';

export const SKILL_FX_SCOPE: Readonly<Record<SkillEffectId, SkillFxScope>> = {
  'S-01': 'map-ground',
  'S-02': 'map-allies',
  'S-03': 'base-front',
};

/** 맵 전체 효과인가 — 참이면 연출도 화면 폭 전체를 덮어야 한다. */
export function isMapWideScope(id: SkillEffectId): boolean {
  return SKILL_FX_SCOPE[id] !== 'base-front';
}

/**
 * 이펙트가 자기 범위를 그리기 위해 알아야 하는 전장 좌표.
 *
 * `src/battle/layout.ts`의 `BattleLayout`에서 뽑아 온 값이지만 **그 타입에 의존하지 않는다** —
 * fx는 전장 레이아웃 모듈을 import 하지 않는다(렌더 계층 간 단방향 유지). 값을 넣어 주는
 * 것은 배선하는 쪽(`src/app/stage.ts`)의 몫이다.
 */
export interface SkillFxViewport {
  /** 캔버스 논리 폭(px). */
  readonly width: number;
  /** 캔버스 논리 높이(px). */
  readonly height: number;
  /** 지상 레인 중심 y(px). `S-01`이 실제로 때리는 줄이다. */
  readonly groundY: number;
  /** 아군 사옥 앞(진행도 0)의 화면 x(px). `S-03` 돔이 서는 자리다. */
  readonly baseX: number;
}

/**
 * 맵 전체 연출이 화면 양 끝까지 닿는 데 필요한 반경(px).
 *
 * 진원(`epicenterX`)이 화면 한쪽으로 치우쳐 있어도 **먼 쪽 끝**까지 덮어야 "맵 전체"로
 * 읽힌다. 따라서 두 끝까지 거리 중 **큰 쪽**을 쓴다.
 */
export function mapWideRadius(epicenterX: number, width: number): number {
  return Math.max(Math.abs(epicenterX), Math.abs(width - epicenterX));
}
