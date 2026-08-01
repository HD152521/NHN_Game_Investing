/**
 * 스킬 이펙트 · 발사체 공용 타입 — 아트-프로덕션시트 §08.
 *
 * ★ 판정/트리거(순수)와 렌더(Canvas)의 인터페이스 계약이다. `src/weather/types.ts`,
 *   `src/ground/types.ts`와 같은 자리다. 구현 세부를 넣지 마라.
 *
 * ⚠️ 여기 있는 ID는 **이펙트 렌더러의 식별자**다. 게임 로직은 여전히 `src/combat`이
 *    소유한다 — 스킬 3종의 비용·쿨다운·효과는 `src/combat/constants.ts`의 `SKILL_SPECS`와
 *    `src/combat/actions.ts`의 `castSkill`에 있다. **전투 로직을 이 모듈에 만들지 마라.**
 *
 *    (2026-08-01 개정: 예전에는 "구현된 스킬은 S-01 하나뿐"이라고 적혀 있었다. Step 7에서
 *    기획자가 A안을 택해 `S-02` 배당 살포(골드·아군 회복)와 `S-03` 서킷브레이커 실드
 *    (AUM·본진 피해 차단)가 실제 스킬이 되었고, 문자열은 `src/combat/types.ts`의 `SkillId`와
 *    **의도적으로 같다** — 로직 ID와 이펙트 ID가 1:1이라 매핑 테이블이 필요 없다.
 *    두 유니온이 어긋나지 않는지는 `src/combat/skills.test.ts`가 고정한다.)
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
