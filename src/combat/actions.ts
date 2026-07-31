/**
 * 플레이어 행동 — 타워 건설/업그레이드, 유닛 소환, 스킬 시전 (PRD FR-6.4~FR-6.6).
 *
 * 전부 순수 함수다. 골드가 부족하거나 조건이 안 맞으면 `ok: false`를 반환하고 입력 상태·
 * 골드를 그대로 돌려준다 — 아무 것도 바뀌지 않는다.
 *
 * `castSkill`이 지상 적의 hp를 깎아 죽여도 이 파일은 처치를 직접 제거하거나 kills/AUM
 * 이벤트를 만들지 않는다. hp<=0인 적의 제거·이벤트 처리는 `simulate.ts`의 `step()` 한 곳
 * 에서만 일어나야 "누가 죽였는지"에 상관없이 판정 경로가 하나로 유지된다 — 스킬로 죽은
 * 적도 다음 `step()` 호출에서 자연히 처치 처리된다.
 */

import {
  SKILL_COOLDOWN_MS,
  SKILL_COST,
  SKILL_DAMAGE,
  TOWER_BUILD_COST,
  TOWER_UPGRADE_COST,
  UNIT_COOLDOWN_MS,
  UNIT_COST,
  UNIT_DAMAGE,
  UNIT_HP,
  UNIT_RANGE,
  UNIT_SPEED,
} from './constants';
import type { CombatStateInternal } from './state';
import type { CombatParams, CombatState, Tower, TowerKind, Unit, UnitKind } from './types';

export interface ActionResult {
  readonly state: CombatState;
  readonly gold: number;
  readonly ok: boolean;
}

/** 슬롯 범위를 벗어나거나 이미 찼거나 골드가 부족하면 실패("ok: false", 상태·골드 불변). */
export function buildTower(
  state: CombatState,
  slot: number,
  kind: TowerKind,
  gold: number,
  params: CombatParams,
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

  const newTower: Tower = { slot, kind, level: 1, cooldownMs: 0 };
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
export function summonUnit(state: CombatState, kind: UnitKind, gold: number): ActionResult {
  const internal = state as CombatStateInternal;
  const cost = UNIT_COST[kind];

  if (gold < cost) {
    return { state: internal, gold, ok: false };
  }

  // 소환 시점의 상수 테이블 값을 개체에 그대로 실어 스냅샷한다 — 이후 부서 업그레이드(FR-11)로
  // 상수가 바뀌어도 이미 소환된 유닛의 스탯은 소급되지 않아야 하므로, 조회가 아니라 복사다.
  const hp = UNIT_HP[kind];
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

/** 골드가 부족하거나 쿨다운 중이면 실패한다. 성공 시 화면의 모든 지상 적에게 즉시 피해(FR-6.6). */
export function castSkill(state: CombatState, gold: number): ActionResult {
  const internal = state as CombatStateInternal;

  if (gold < SKILL_COST || internal.skillCooldownMs > 0) {
    return { state: internal, gold, ok: false };
  }

  const enemies = internal.enemies.map((enemy) =>
    enemy.lane === 'ground' ? { ...enemy, hp: enemy.hp - SKILL_DAMAGE } : enemy,
  );

  return {
    state: { ...internal, enemies, skillCooldownMs: SKILL_COOLDOWN_MS },
    gold: gold - SKILL_COST,
    ok: true,
  };
}
