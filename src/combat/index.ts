/**
 * 전투 시뮬레이션 공개 API — PRD FR-6. DOM·타이머·전역 상태를 참조하지 않는 순수 함수만
 * 내보낸다. `CombatStateInternal`(state.ts)은 구현 세부사항이라 여기서 내보내지 않는다 —
 * 호출자는 항상 `types.ts`의 `CombatState`만으로 상태를 다룬다.
 */

export type {
  BossState,
  CombatEvents,
  CombatParams,
  CombatPhase,
  CombatState,
  DeathEvent,
  DeathKind,
  Enemy,
  EnemyKind,
  Lane,
  SkillCurrency,
  SkillId,
  SkillSpec,
  StageWaveTable,
  Tower,
  TowerKind,
  Unit,
  UnitKind,
} from './types';

export * from './constants';

// `EnemyKind`는 계약 파일(`types.ts`)이 소유한다 — 위 블록에서 이미 내보냈다.
export type { BossIdentity, EnemyIdentity, EntityCode, EntityIdentity, TowerIdentity } from './identity';
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

export type { BossPhase } from './boss';
export { bossPhaseOf, bossViewOf, isBossWave } from './boss';

export type { StageConfig, StageId } from './stages';
export {
  DEPLOYMENT_ALLOWANCE,
  STAGES,
  WAVE_BASE_HP_R1,
  bossHpOf,
  combatLoadPerGold,
  gateReturnRate,
  noTradeGold,
  scaleWaveHp,
  sessionTotalStake,
  totalBaseIncome,
  totalEnemyHp,
  totalGoldFor,
} from './stages';

export type { EnemySpec } from './waves';
export { aumDropPerKill, spawnPlanFor, waveIncomeFor } from './waves';

export { createCombat, step, waveClockParams } from './simulate';

export type { WaveClock, WaveClockParams, WaveMode } from './wave-clock';
export { advanceWaveClock, battleDurationMs, createWaveClock } from './wave-clock';

export type { ActionResult, SkillCastResult } from './actions';
export { buildTower, castSkill, skipPrep, summonUnit, upgradeTower } from './actions';

export { createSkillCooldowns, isShieldActive, skillCooldownOf, tickSkillCooldowns } from './skills';
