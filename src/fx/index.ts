/**
 * 스킬 이펙트 · 발사체 공개 API — 아트-프로덕션시트 §08.
 *
 * 사용 예:
 * ```ts
 * const fx = createSkillFxField();                         // 앱 시작 때 한 번
 * triggerSkillEffect(fx, 'S-01', x, y, now);               // 스킬이 실제로 발동했을 때
 * drawSkillFx(ctx, palette, fx, viewport, now, reduced);   // 매 프레임 (src/battle)
 * ```
 *
 * ⚠️ 스킬의 비용·쿨다운·효과는 `src/combat`이 소유한다. 이 모듈은 **재생만** 한다.
 *    다만 재생 **크기**는 `skill-scope.ts`가 선언한 실제 효과 범위를 따라야 한다 —
 *    맵 전체 스킬을 한 자리에서 작게 터뜨리면 화면이 규칙을 거짓으로 알린다.
 */

export { SKILL_EFFECT_DURATION_MS, SKILL_FX_SLOT_COUNT } from './constants.js';

export { ANCHOR_JITTER_PX, skillAnchor } from './anchor.js';
export type { SkillAnchor } from './anchor.js';

export { SKILL_FX_SCOPE, isMapWideScope, mapWideRadius } from './skill-scope.js';
export type { SkillFxScope, SkillFxViewport } from './skill-scope.js';

export { drawSkillFx } from './draw-skill-fx.js';
export type { FxCtx } from './draw-skill-fx.js';

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
