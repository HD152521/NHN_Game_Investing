/**
 * 전투 시뮬레이션 코어 (PRD FR-6). DOM·타이머·전역 상태를 참조하지 않는 순수 함수만 제공한다.
 *
 * `step`은 고정 서브스텝(≤ `MAX_SUBSTEP_MS`)으로 `dtMs`를 쪼개 순차 적용한다 — 큰 `dtMs`
 * (탭 비활성 복귀 등)가 한 번에 들어와도 적이 사거리·본진을 건너뛰는 "터널링"이 일어나지
 * 않게 하기 위함이다. 공개 시그니처는 `types.ts`의 `CombatState`/`CombatEvents`만 쓰지만,
 * 내부적으로는 `CombatStateInternal`(스폰 진행도·ID 발급기 등 부기 필드 포함)로 다룬다 —
 * `createCombat`/`step`이 만든 상태만 서로 주고받는다는 전제 하에 안전한 캐스팅이다.
 */

import { MAX_SUBSTEP_MS, MAX_TOTAL_DT_MS } from './constants';
import { applyEngagement, applyTowerFire, collectDeaths, collectLeaks, moveEnemies, moveUnits } from './mechanics';
import type { CombatStateInternal } from './state';
import type { CombatEvents, CombatParams, CombatState, Enemy } from './types';
import { aumDropPerKill, spawnPlanFor, waveIncomeFor } from './waves';

const EMPTY_EVENTS: CombatEvents = {
  kills: 0,
  aumDropped: 0,
  goldIncome: 0,
  baseDamage: 0,
  waveStarted: null,
};

/** 전투 시작 전 초기 상태. `wave`는 아직 0 — 첫 `step()` 호출에서 웨이브 1이 시작된다. */
export function createCombat(params: CombatParams): CombatState {
  const initial: CombatStateInternal = {
    phase: 'running',
    wave: 0,
    waveCount: params.waveCount,
    waveElapsedMs: 0,
    enemies: [],
    units: [],
    towers: [],
    baseHp: params.maxBaseHp,
    maxBaseHp: params.maxBaseHp,
    towerSlots: params.towerSlots,
    skillCooldownMs: 0,
    spawnedInWave: 0,
    waveEnemyTotal: 0,
    nextEnemyId: 1,
    nextUnitId: 1,
  };
  return initial;
}

/** 현재 웨이브의 스폰 스케줄에 따라 이번 서브스텝에 새로 등장해야 할 적을 만든다. */
function spawnDue(
  state: CombatStateInternal,
  params: CombatParams,
): { enemies: Enemy[]; nextEnemyId: number; spawnedInWave: number } {
  const plan = spawnPlanFor(state.wave, params);
  const elapsedFraction = Math.min(1, state.waveElapsedMs / params.waveDurationMs);
  const targetSpawned = Math.min(plan.length, Math.ceil(plan.length * elapsedFraction));
  const toSpawn = Math.max(0, targetSpawned - state.spawnedInWave);

  let nextEnemyId = state.nextEnemyId;
  const spawned: Enemy[] = [];
  for (let i = 0; i < toSpawn; i += 1) {
    const spec = plan[state.spawnedInWave + i];
    if (!spec) {
      continue;
    }
    spawned.push({
      id: nextEnemyId,
      lane: spec.lane,
      x: 1,
      hp: spec.hp,
      maxHp: spec.hp,
      speed: spec.speed,
      damage: spec.damage,
      range: spec.range,
      attackCooldownMs: spec.attackCooldownMs,
      // 유닛(summonUnit)은 소환 직후 워밍업 개념으로 cooldownMs를 attackCooldownMs로 채우지만,
      // 적은 이미 행군해 온 상태로 등장하므로 밀착하자마자 바로 반격할 수 있게 0으로 스폰한다.
      cooldownMs: 0,
    });
    nextEnemyId += 1;
  }

  return { enemies: spawned, nextEnemyId, spawnedInWave: state.spawnedInWave + toSpawn };
}

interface WaveAdvance {
  readonly wave: number;
  readonly waveElapsedMs: number;
  readonly spawnedInWave: number;
  readonly waveEnemyTotal: number;
  readonly waveStarted: number | null;
  readonly goldIncome: number;
}

/** 웨이브 시작(0→1 포함)·전환을 처리한다. 지속시간을 넘겼고 다음 웨이브가 남아 있으면 진행한다. */
function advanceWave(state: CombatStateInternal, dtMs: number, params: CombatParams): WaveAdvance {
  let wave = state.wave;
  let spawnedInWave = state.spawnedInWave;
  let waveEnemyTotal = state.waveEnemyTotal;
  let waveElapsedMs = state.waveElapsedMs;
  let waveStarted: number | null = null;
  let goldIncome = 0;

  if (wave === 0) {
    wave = 1;
    waveElapsedMs = 0;
    spawnedInWave = 0;
    waveEnemyTotal = spawnPlanFor(wave, params).length;
    waveStarted = wave;
    goldIncome += waveIncomeFor(wave, params);
  }

  waveElapsedMs += dtMs;

  while (waveElapsedMs >= params.waveDurationMs && wave < params.waveCount) {
    waveElapsedMs -= params.waveDurationMs;
    wave += 1;
    spawnedInWave = 0;
    waveEnemyTotal = spawnPlanFor(wave, params).length;
    waveStarted = wave;
    goldIncome += waveIncomeFor(wave, params);
  }

  return { wave, waveElapsedMs, spawnedInWave, waveEnemyTotal, waveStarted, goldIncome };
}

/** 하나의 고정 서브스텝(≤ `MAX_SUBSTEP_MS`)만큼 물리를 진행시킨다. */
function substep(
  state: CombatStateInternal,
  dtMs: number,
  params: CombatParams,
): { state: CombatStateInternal; events: CombatEvents } {
  const waveInfo = advanceWave(state, dtMs, params);
  const stateAfterWave: CombatStateInternal = {
    ...state,
    wave: waveInfo.wave,
    waveElapsedMs: waveInfo.waveElapsedMs,
    spawnedInWave: waveInfo.spawnedInWave,
    waveEnemyTotal: waveInfo.waveEnemyTotal,
  };

  const spawnResult = spawnDue(stateAfterWave, params);
  const enemiesAfterSpawn = [...state.enemies, ...spawnResult.enemies];

  const fireResult = applyTowerFire(state.towers, enemiesAfterSpawn, dtMs);
  const engagement = applyEngagement(fireResult.enemies, state.units, dtMs);

  const dtSec = dtMs / 1000;
  const movedEnemies = moveEnemies(engagement.enemies, engagement.blockedEnemyIds, dtSec);
  const movedUnits = moveUnits(engagement.units, engagement.blockedUnitIds, dtSec);

  const leakResult = collectLeaks(movedEnemies);
  const aumPerKill = aumDropPerKill(waveInfo.wave, params);
  const deathResult = collectDeaths(leakResult.survivors, aumPerKill);
  const survivingUnits = movedUnits.filter((unit) => unit.hp > 0);

  const skillCooldownMs = Math.max(0, state.skillCooldownMs - dtMs);
  const baseHp = Math.max(0, state.baseHp - leakResult.baseDamage);

  let phase = state.phase;
  if (baseHp <= 0) {
    phase = 'defeated';
  } else if (
    waveInfo.wave >= params.waveCount &&
    waveInfo.waveElapsedMs >= params.waveDurationMs &&
    spawnResult.spawnedInWave >= waveInfo.waveEnemyTotal &&
    deathResult.survivors.length === 0
  ) {
    phase = 'cleared';
  }

  const nextState: CombatStateInternal = {
    phase,
    wave: waveInfo.wave,
    waveCount: state.waveCount,
    waveElapsedMs: waveInfo.waveElapsedMs,
    enemies: deathResult.survivors,
    units: survivingUnits,
    towers: fireResult.towers,
    baseHp,
    maxBaseHp: state.maxBaseHp,
    towerSlots: state.towerSlots,
    skillCooldownMs,
    // spawnedInWave는 반드시 이번 틱에 실제로 스폰된 수(spawnResult)를 반영해야 한다 —
    // waveInfo.spawnedInWave는 "웨이브 전환 시 리셋된 값"일 뿐이라 그대로 쓰면 같은 웨이브
    // 안에서 스폰 진행도가 매 틱 0으로 되돌아가 적이 무한 중복 스폰되는 버그가 생긴다.
    spawnedInWave: spawnResult.spawnedInWave,
    waveEnemyTotal: waveInfo.waveEnemyTotal,
    nextEnemyId: spawnResult.nextEnemyId,
    nextUnitId: state.nextUnitId,
  };

  const events: CombatEvents = {
    kills: deathResult.kills,
    aumDropped: deathResult.aumDropped,
    goldIncome: waveInfo.goldIncome,
    baseDamage: leakResult.baseDamage,
    waveStarted: waveInfo.waveStarted,
  };

  return { state: nextState, events };
}

/**
 * 전투를 `dtMs`만큼 진행한다. 내부적으로 `MAX_SUBSTEP_MS` 단위 고정 타임스텝으로 쪼개
 * 처리하며, 한 번의 호출에서 처리하는 총 시간은 `MAX_TOTAL_DT_MS`로 제한한다(극단적으로
 * 큰 `dtMs` 방어). `phase`가 `'running'`이 아니면 아무 것도 하지 않고 그대로 반환한다.
 */
export function step(
  state: CombatState,
  dtMs: number,
  params: CombatParams,
): { state: CombatState; events: CombatEvents } {
  const internalState = state as CombatStateInternal;

  if (internalState.phase !== 'running') {
    return { state: internalState, events: EMPTY_EVENTS };
  }

  let remaining = Math.min(Math.max(dtMs, 0), MAX_TOTAL_DT_MS);
  let current = internalState;
  let kills = 0;
  let aumDropped = 0;
  let goldIncome = 0;
  let baseDamage = 0;
  let waveStarted: number | null = null;

  while (remaining > 0 && current.phase === 'running') {
    const chunk = Math.min(MAX_SUBSTEP_MS, remaining);
    remaining -= chunk;

    const result = substep(current, chunk, params);
    current = result.state;
    kills += result.events.kills;
    aumDropped += result.events.aumDropped;
    goldIncome += result.events.goldIncome;
    baseDamage += result.events.baseDamage;
    if (result.events.waveStarted !== null) {
      waveStarted = result.events.waveStarted;
    }
  }

  return { state: current, events: { kills, aumDropped, goldIncome, baseDamage, waveStarted } };
}
