/**
 * 전투 시뮬레이션 코어 (PRD FR-6). DOM·타이머·전역 상태를 참조하지 않는 순수 함수만 제공한다.
 *
 * `step`은 고정 서브스텝(≤ `MAX_SUBSTEP_MS`)으로 `dtMs`를 쪼개 순차 적용한다 — 큰 `dtMs`
 * (탭 비활성 복귀 등)가 한 번에 들어와도 적이 사거리·본진을 건너뛰는 "터널링"이 일어나지
 * 않게 하기 위함이다. 공개 시그니처는 `types.ts`의 `CombatState`/`CombatEvents`만 쓰지만,
 * 내부적으로는 `CombatStateInternal`(스폰 진행도·ID 발급기 등 부기 필드 포함)로 다룬다 —
 * `createCombat`/`step`이 만든 상태만 서로 주고받는다는 전제 하에 안전한 캐스팅이다.
 */

import { MAX_SUBSTEP_MS, MAX_TOTAL_DT_MS, WAVE_PREP_MS } from './constants';
import { applyEngagement, applyTowerFire, collectDeaths, collectLeaks, moveEnemies, moveUnits } from './mechanics';
import { createSkillCooldowns, tickSkillCooldowns } from './skills';
import type { CombatStateInternal } from './state';
import type { CombatEvents, CombatParams, CombatState, Enemy } from './types';
import { advanceWaveClock, battleDurationMs, createWaveClock } from './wave-clock';
import type { WaveClock, WaveClockParams } from './wave-clock';
import { aumDropPerKill, spawnPlanFor, waveIncomeFor } from './waves';

const EMPTY_EVENTS: CombatEvents = {
  kills: 0,
  aumDropped: 0,
  goldIncome: 0,
  baseDamage: 0,
  waveStarted: null,
};

/** `CombatParams` → 웨이브 시계 파라미터. 준비 시간이 생략되면 `WAVE_PREP_MS`를 쓴다. */
export function waveClockParams(params: CombatParams): WaveClockParams {
  return {
    waveCount: params.waveCount,
    waveDurationMs: params.waveDurationMs,
    prepMs: params.wavePrepMs ?? WAVE_PREP_MS,
  };
}

/** 내부 상태에서 시계 부분만 뽑는다 (시계 모듈은 전투 상태를 몰라도 되게 유지). */
function clockOf(state: CombatStateInternal): WaveClock {
  return {
    mode: state.waveMode,
    wave: state.wave,
    waveElapsedMs: state.waveElapsedMs,
    prepRemainingMs: state.prepRemainingMs,
  };
}

/**
 * 전투 시작 전 초기 상태. `wave`는 아직 0이고 **준비 구간부터 시작한다** — 첫 `step()`은
 * 웨이브를 시작하지 않고 준비 시간을 깎으며, 준비가 끝나야 웨이브 1이 시작된다.
 */
export function createCombat(params: CombatParams): CombatState {
  const clock = createWaveClock(waveClockParams(params));
  const initial: CombatStateInternal = {
    phase: 'running',
    wave: clock.wave,
    waveCount: params.waveCount,
    waveElapsedMs: clock.waveElapsedMs,
    prepRemainingMs: clock.prepRemainingMs,
    enemies: [],
    units: [],
    towers: [],
    baseHp: params.maxBaseHp,
    maxBaseHp: params.maxBaseHp,
    towerSlots: params.towerSlots,
    skillCooldownMs: 0,
    skillCooldowns: createSkillCooldowns(),
    shieldRemainingMs: 0,
    waveMode: clock.mode,
    spawnedInWave: 0,
    waveEnemyTotal: 0,
    nextEnemyId: 1,
    nextUnitId: 1,
  };
  return initial;
}

/**
 * 현재 웨이브의 스폰 스케줄에 따라 이번 서브스텝에 새로 등장해야 할 적을 만든다.
 * **준비 구간에는 한 마리도 만들지 않는다** — 그게 준비 시간의 정의다.
 */
function spawnDue(
  state: CombatStateInternal,
  params: CombatParams,
): { enemies: Enemy[]; nextEnemyId: number; spawnedInWave: number } {
  if (state.waveMode === 'prep') {
    return { enemies: [], nextEnemyId: state.nextEnemyId, spawnedInWave: state.spawnedInWave };
  }

  const plan = spawnPlanFor(state.wave, params);
  const battleMs = battleDurationMs(waveClockParams(params));
  const elapsedFraction = battleMs <= 0 ? 1 : Math.min(1, state.waveElapsedMs / battleMs);
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
  readonly clock: WaveClock;
  readonly spawnedInWave: number;
  readonly waveEnemyTotal: number;
  readonly waveStarted: number | null;
  readonly goldIncome: number;
}

/**
 * 웨이브 시계를 진행시키고, 이번에 시작된 웨이브의 부기(스폰 계획·기본 수입)를 확정한다.
 * 시간 전이 규칙 자체는 `wave-clock.ts`가 소유한다 — 여기서는 "웨이브가 시작되면 무엇을
 * 하는가"만 다룬다.
 */
function advanceWave(state: CombatStateInternal, dtMs: number, params: CombatParams): WaveAdvance {
  const advance = advanceWaveClock(clockOf(state), dtMs, waveClockParams(params));

  let spawnedInWave = state.spawnedInWave;
  let waveEnemyTotal = state.waveEnemyTotal;
  let waveStarted: number | null = null;
  let goldIncome = 0;

  for (const wave of advance.wavesStarted) {
    spawnedInWave = 0;
    waveEnemyTotal = spawnPlanFor(wave, params).length;
    waveStarted = wave;
    goldIncome += waveIncomeFor(wave, params);
  }

  return { clock: advance.clock, spawnedInWave, waveEnemyTotal, waveStarted, goldIncome };
}

/** 하나의 고정 서브스텝(≤ `MAX_SUBSTEP_MS`)만큼 물리를 진행시킨다. */
function substep(
  state: CombatStateInternal,
  dtMs: number,
  params: CombatParams,
): { state: CombatStateInternal; events: CombatEvents } {
  const waveInfo = advanceWave(state, dtMs, params);
  const clock = waveInfo.clock;
  const stateAfterWave: CombatStateInternal = {
    ...state,
    waveMode: clock.mode,
    wave: clock.wave,
    waveElapsedMs: clock.waveElapsedMs,
    prepRemainingMs: clock.prepRemainingMs,
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
  const aumPerKill = aumDropPerKill(clock.wave, params);
  const deathResult = collectDeaths(leakResult.survivors, aumPerKill);
  const survivingUnits = movedUnits.filter((unit) => unit.hp > 0);

  const skillCooldowns = tickSkillCooldowns(
    state.skillCooldowns ?? createSkillCooldowns(),
    dtMs,
  );

  /**
   * 서킷브레이커 실드(S-03) — **이 서브스텝 시작 시점의 잔여시간**으로 판정한다.
   *
   * 먼저 깎고 판정하면 마지막 서브스텝에서 실드가 0이 되어, 플레이어가 산 8초의 끝자락이
   * 조용히 사라진다. "남아 있었으면 막는다"가 지속시간의 정의다.
   */
  const shieldWasActive = (state.shieldRemainingMs ?? 0) > 0;
  const shieldRemainingMs = Math.max(0, (state.shieldRemainingMs ?? 0) - dtMs);

  // 실드가 서 있으면 본진에 닿은 적은 피해를 주지 못하고 소멸한다(누출 판정 자체는 그대로다 —
  // 적은 사라지고, 사라진 자리에서 피해만 지워진다).
  const baseDamage = shieldWasActive ? 0 : leakResult.baseDamage;
  const baseHp = Math.max(0, state.baseHp - baseDamage);

  let phase = state.phase;
  if (baseHp <= 0) {
    phase = 'defeated';
  } else if (
    clock.wave >= params.waveCount &&
    // 마지막 웨이브는 더 이상 전이하지 않고 waveElapsedMs만 쌓이므로, 교전 구간
    // (주기 − 준비)을 넘겼는지로 소진 여부를 본다.
    clock.waveElapsedMs >= battleDurationMs(waveClockParams(params)) &&
    spawnResult.spawnedInWave >= waveInfo.waveEnemyTotal &&
    deathResult.survivors.length === 0
  ) {
    phase = 'cleared';
  }

  const nextState: CombatStateInternal = {
    phase,
    waveMode: clock.mode,
    wave: clock.wave,
    waveCount: state.waveCount,
    waveElapsedMs: clock.waveElapsedMs,
    prepRemainingMs: clock.prepRemainingMs,
    enemies: deathResult.survivors,
    units: survivingUnits,
    towers: fireResult.towers,
    baseHp,
    maxBaseHp: state.maxBaseHp,
    towerSlots: state.towerSlots,
    skillCooldownMs: skillCooldowns['S-01'],
    skillCooldowns,
    shieldRemainingMs,
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
    baseDamage,
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
