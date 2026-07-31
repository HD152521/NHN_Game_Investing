/**
 * 전투 시뮬레이션 공개 API — PRD FR-6. DOM·타이머·전역 상태를 참조하지 않는 순수 함수만
 * 내보낸다. `CombatStateInternal`(state.ts)은 구현 세부사항이라 여기서 내보내지 않는다 —
 * 호출자는 항상 `types.ts`의 `CombatState`만으로 상태를 다룬다.
 */

export type {
  CombatEvents,
  CombatParams,
  CombatPhase,
  CombatState,
  Enemy,
  Lane,
  StageWaveTable,
  Tower,
  TowerKind,
  Unit,
  UnitKind,
} from './types';

export * from './constants';

export type {
  BossIdentity,
  EnemyIdentity,
  EnemyKind,
  EntityCode,
  EntityIdentity,
  TowerIdentity,
} from './identity';
export {
  ALLY_IDENTITY,
  BOSS_IDENTITY,
  ENEMY_IDENTITY,
  ENEMY_KINDS,
  IDENTITY_BY_CODE,
  TOWER_IDENTITY,
  allIdentities,
  enemyKindsForLane,
  identityForCode,
} from './identity';

export type { StageConfig, StageId } from './stages';
export { STAGES, WAVE_BASE_HP_R1, scaleWaveHp, totalBaseIncome, totalGoldFor } from './stages';

export type { EnemySpec } from './waves';
export { aumDropPerKill, spawnPlanFor, waveIncomeFor } from './waves';

export { createCombat, step } from './simulate';

export type { ActionResult } from './actions';
export { buildTower, castSkill, summonUnit, upgradeTower } from './actions';
