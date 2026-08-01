/**
 * 스킬 이펙트 · 발사체 공용 타입 — 아트-프로덕션시트 §08.
 *
 * ★ 판정/트리거(순수)와 렌더(Canvas)의 인터페이스 계약이다. `src/weather/types.ts`,
 *   `src/ground/types.ts`와 같은 자리다. 구현 세부를 넣지 마라.
 *
 * ⚠️ 여기 있는 ID는 **이펙트 렌더러의 식별자**일 뿐 게임 로직이 아니다. 실제로
 *    구현된 스킬은 `S-01`(공시 폭탄) 하나뿐이며(PRD FR-6 '스킬 1종',
 *    `src/combat/actions.ts`의 `castSkill`), `S-02`/`S-03`은 이펙트와 트리거
 *    인터페이스만 존재한다. 없는 스킬의 전투 로직을 여기서 만들지 마라.
 */

/**
 * 스킬 이펙트 3종 (시트 §08).
 *
 * - `S-01` 공시 폭탄 (광역 즉발) — 각진 백색·금색 파편 링 + 서류 조각
 * - `S-02` 배당 살포 (아군 회복) — 적색 링 세 겹 + 상승 ▲ 입자. **골드색 금지**
 * - `S-03` 서킷브레이커 실드 (방어 · AUM 소모) — 육각 격자 돔. **유일한 보라 전장 요소**
 */
export const SKILL_EFFECT_IDS = ['S-01', 'S-02', 'S-03'] as const;

export type SkillEffectId = (typeof SKILL_EFFECT_IDS)[number];

/**
 * 발사체 3종 (시트 §08 `W-01`).
 *
 * - `ally_flare`  = 아군 신호탄. 적색 쐐기 + 짧은 꼬리 2개
 * - `anchor_bolt` = 앵커 탄. 무거운 쇠못, 회전 없음
 * - `enemy_arrow` = 적 하강 화살. 청색, 아래로 꺾인 촉
 */
export const PROJECTILE_KINDS = ['ally_flare', 'anchor_bolt', 'enemy_arrow'] as const;

export type ProjectileKind = (typeof PROJECTILE_KINDS)[number];

/** 피격 3종 — 적색 / 청색 / 무채. */
export const IMPACT_KINDS = ['ally', 'enemy', 'neutral'] as const;

export type ImpactKind = (typeof IMPACT_KINDS)[number];
