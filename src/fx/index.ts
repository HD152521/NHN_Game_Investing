/**
 * 스킬 이펙트 · 발사체 공개 API — 아트-프로덕션시트 §08.
 *
 * 사용 예:
 * ```ts
 * const fx = createSkillFxField();               // 앱 시작 때 한 번
 * triggerSkillEffect(fx, 'S-01', x, y, now);     // 스킬이 실제로 발동했을 때
 * drawSkillFx(ctx, palette, fx, now, reduced);   // 매 프레임 (src/battle)
 * ```
 *
 * ⚠️ 실제 게임 로직이 있는 스킬은 `S-01` 하나뿐이다(PRD FR-6). `S-02`/`S-03`은
 *    이펙트와 트리거 인터페이스만 준비돼 있다.
 */

export { SKILL_EFFECT_DURATION_MS, SKILL_FX_SLOT_COUNT } from './constants.js';

export {
  createSkillFxField,
  skillFxIdAt,
  skillFxProgress,
  skillFxX,
  skillFxY,
  triggerSkillEffect,
} from './skill-effects.js';
export type { SkillFxField } from './skill-effects.js';

export { impactKindForProjectile, projectileKindForTower } from './projectiles.js';

export { IMPACT_KINDS, PROJECTILE_KINDS, SKILL_EFFECT_IDS } from './types.js';
export type { ImpactKind, ProjectileKind, SkillEffectId } from './types.js';
