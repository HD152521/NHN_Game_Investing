/**
 * 플레이어 행동 — 타워 건설/업그레이드, 유닛 소환, 스킬 시전 (PRD FR-6.4~FR-6.6).
 *
 * 전부 순수 함수다. 골드가 부족하거나 조건이 안 맞으면 `ok: false`를 반환하고 입력 상태·
 * 골드를 그대로 돌려준다 — 아무 것도 바뀌지 않는다.
 *
 * `castSkill`(S-01)이 지상 적의 hp를 깎아 죽여도 이 파일은 처치를 직접 제거하거나 kills/AUM
 * 이벤트를 만들지 않는다. hp<=0인 적의 제거·이벤트 처리는 `simulate.ts`의 `step()` 한 곳
 * 에서만 일어나야 "누가 죽였는지"에 상관없이 판정 경로가 하나로 유지된다 — 스킬로 죽은
 * 적도 다음 `step()` 호출에서 자연히 처치 처리된다.
 */

import {
  SKILL_DAMAGE,
  SKILL_HEAL,
  SKILL_SHIELD_DURATION_MS,
  SKILL_SPECS,
  TOWER_BUILD_COST,
  TOWER_UPGRADE_COST,
  UNIT_COOLDOWN_MS,
  UNIT_COST,
  UNIT_DAMAGE,
  UNIT_HP,
  UNIT_RANGE,
  UNIT_SPEED,
} from './constants';
import { createSkillCooldowns, skillCooldownOf } from './skills';
import type { CombatStateInternal } from './state';
import type {
  CombatParams,
  CombatState,
  Enemy,
  SkillId,
  Tower,
  TowerKind,
  Unit,
  UnitKind,
} from './types';
import { skipPrep as skipWaveClockPrep } from './wave-clock';

export interface ActionResult {
  readonly state: CombatState;
  readonly gold: number;
  readonly ok: boolean;
}

/**
 * 스킬 시전 결과 — `ActionResult`에 **시전 후 AUM 잔액**을 더한 것.
 *
 * ★ 왜 전투가 AUM을 직접 깎지 않는가 ★
 * AUM(매매 원금)의 소유자는 `src/position`이고 지갑을 들고 있는 것은 세션
 * (`src/app/session.ts`)이다. 전투 시뮬레이션이 지갑을 직접 만지면 "재화가 바뀌는 곳"이
 * 둘로 갈라져, 나중에 판정을 서버로 옮길 때 두 경로를 따로 옮겨야 한다.
 *
 * 그래서 `castSkill`은 **골드와 정확히 같은 패턴**을 쓴다: 잔액을 입력으로 받고,
 * "이 시전이 끝난 뒤의 잔액"을 출력으로 돌려줄 뿐 어디에도 쓰지 않는다. 실제 지갑 반영은
 * 세션이 한다. 골드를 쓰는 스킬이면 `aum`은 입력값 그대로 돌아온다.
 */
export interface SkillCastResult extends ActionResult {
  readonly aum: number;
}

/**
 * 준비 시간을 즉시 끝낸다 (Space 키, FR-6 플레이테스트 피드백).
 *
 * 아는 사람은 5초를 기다릴 이유가 없다. 준비 구간이 아니면 상태를 그대로 돌려준다 —
 * 골드를 쓰지 않는 행동이라 `ActionResult` 대신 상태만 반환한다.
 */
export function skipPrep(state: CombatState): CombatState {
  const internal = state as CombatStateInternal;
  if (internal.phase !== 'running') {
    return internal;
  }

  const clock = skipWaveClockPrep({
    mode: internal.waveMode,
    wave: internal.wave,
    waveElapsedMs: internal.waveElapsedMs,
    prepRemainingMs: internal.prepRemainingMs,
  });

  if (clock.prepRemainingMs === internal.prepRemainingMs) {
    return internal;
  }
  return { ...internal, prepRemainingMs: clock.prepRemainingMs };
}

/** 슬롯 범위를 벗어나거나 이미 찼거나 골드가 부족하면 실패("ok: false", 상태·골드 불변). */
export function buildTower(
  state: CombatState,
  slot: number,
  kind: TowerKind,
  gold: number,
  params: CombatParams,
  /** FR-11 R&D 피해 배수. 생략하면 1 — 부서를 모르는 호출부·테스트가 그대로 돈다. */
  damageMultiplier: number = 1,
): ActionResult {
  const internal = state as CombatStateInternal;

  if (slot < 0 || slot >= params.towerSlots) {
    return { state: internal, gold, ok: false };
  }
  if (internal.towers.some((tower) => tower.slot === slot)) {
    return { state: internal, gold, ok: false };
  }

  const cost = TOWER_BUILD_COST[kind];
  if (gold < cost) {
    return { state: internal, gold, ok: false };
  }

  // 조회가 아니라 복사다 — 나중에 R&D를 올려도 이 타워의 피해는 그대로 남는다.
  const newTower: Tower = { slot, kind, level: 1, cooldownMs: 0, damageMultiplier };
  const towers: Tower[] = [...internal.towers, newTower];

  return { state: { ...internal, towers }, gold: gold - cost, ok: true };
}

/** 타워가 없거나 이미 레벨 2거나 골드가 부족하면 실패한다. */
export function upgradeTower(state: CombatState, slot: number, gold: number): ActionResult {
  const internal = state as CombatStateInternal;
  const tower = internal.towers.find((candidate) => candidate.slot === slot);

  if (!tower || tower.level !== 1) {
    return { state: internal, gold, ok: false };
  }

  const cost = TOWER_UPGRADE_COST[tower.kind];
  if (gold < cost) {
    return { state: internal, gold, ok: false };
  }

  const towers: Tower[] = internal.towers.map((candidate) =>
    candidate.slot === slot ? { ...candidate, level: 2 as const } : candidate,
  );

  return { state: { ...internal, towers }, gold: gold - cost, ok: true };
}

/** 골드가 부족하면 실패한다. 소환된 유닛은 x=0(아군 사옥)에서 시작해 자동 우측 전진한다. */
export function summonUnit(
  state: CombatState,
  kind: UnitKind,
  gold: number,
  /** FR-11 인사팀 HP 배수. 생략하면 1. */
  hpMultiplier: number = 1,
): ActionResult {
  const internal = state as CombatStateInternal;
  const cost = UNIT_COST[kind];

  if (gold < cost) {
    return { state: internal, gold, ok: false };
  }

  // 소환 시점의 상수 테이블 값을 개체에 그대로 실어 스냅샷한다 — 이후 부서 업그레이드(FR-11)로
  // 상수가 바뀌어도 이미 소환된 유닛의 스탯은 소급되지 않아야 하므로, 조회가 아니라 복사다.
  const hp = Math.max(1, Math.round(UNIT_HP[kind] * hpMultiplier));
  const newUnit: Unit = {
    id: internal.nextUnitId,
    kind,
    x: 0,
    hp,
    maxHp: hp,
    speed: UNIT_SPEED,
    damage: UNIT_DAMAGE[kind],
    range: UNIT_RANGE[kind],
    attackCooldownMs: UNIT_COOLDOWN_MS,
    cooldownMs: UNIT_COOLDOWN_MS,
  };
  const units: Unit[] = [...internal.units, newUnit];
  const nextState: CombatStateInternal = { ...internal, units, nextUnitId: internal.nextUnitId + 1 };

  return { state: nextState, gold: gold - cost, ok: true };
}

/** `S-01` 공시 폭탄 — 화면의 모든 **지상** 적에게 즉시 피해. */
function detonate(enemies: readonly Enemy[]): readonly Enemy[] {
  return enemies.map((enemy) =>
    enemy.lane === 'ground' ? { ...enemy, hp: enemy.hp - SKILL_DAMAGE } : enemy,
  );
}

/** `S-02` 배당 살포 — 아군 유닛 회복. **최대 HP를 넘기지 않는다**(초과분은 버려진다). */
function heal(units: readonly Unit[]): readonly Unit[] {
  return units.map((unit) => ({ ...unit, hp: Math.min(unit.maxHp, unit.hp + SKILL_HEAL) }));
}

/**
 * 스킬을 시전한다 (FR-6.6). 재화가 부족하거나 **그 스킬의** 쿨다운이 남아 있으면 실패한다.
 *
 * 쿨다운은 스킬마다 따로 돈다 — 하나를 쓰면 나머지 둘도 잠기는 공용 쿨다운이면 "무엇을
 * 쓸까"가 아니라 "언제 쓸까"만 남아 종류 축을 넣은 의미가 없어진다.
 *
 * 소모 재화는 `SKILL_SPECS[id].currency`가 정한다. `S-03`만 AUM을 쓰며, 그 반영은
 * 세션이 한다(`SkillCastResult` 주석 참고).
 */
export function castSkill(
  state: CombatState,
  id: SkillId,
  gold: number,
  aum: number,
): SkillCastResult {
  const internal = state as CombatStateInternal;
  const spec = SKILL_SPECS[id];
  const balance = spec.currency === 'gold' ? gold : aum;

  if (balance < spec.cost || skillCooldownOf(internal, id) > 0) {
    return { state: internal, gold, aum, ok: false };
  }

  const cooldowns = { ...(internal.skillCooldowns ?? createSkillCooldowns()), [id]: spec.cooldownMs };
  const next: CombatStateInternal = {
    ...internal,
    ...(id === 'S-01' ? { enemies: detonate(internal.enemies) } : {}),
    ...(id === 'S-02' ? { units: heal(internal.units) } : {}),
    // 재시전은 남은 시간을 **연장하지 않고 새로 채운다**(둘 중 긴 쪽). 쿨다운(60초)이
    // 지속시간(8초)보다 훨씬 길어 실제로는 겹칠 일이 없지만, 규칙은 명시해 둔다.
    ...(id === 'S-03'
      ? { shieldRemainingMs: Math.max(internal.shieldRemainingMs ?? 0, SKILL_SHIELD_DURATION_MS) }
      : {}),
    skillCooldowns: cooldowns,
    skillCooldownMs: cooldowns['S-01'],
  };

  return {
    state: next,
    gold: spec.currency === 'gold' ? gold - spec.cost : gold,
    aum: spec.currency === 'aum' ? aum - spec.cost : aum,
    ok: true,
  };
}
