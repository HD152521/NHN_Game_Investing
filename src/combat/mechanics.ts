/**
 * 전투 물리 헬퍼 — 타워 사격, 유닛-적 교전, 이동, 처치/누출 판정 (PRD FR-6.2, FR-6.4, FR-6.5).
 *
 * 전부 순수 함수다. 입력 배열·객체를 변형하지 않고 항상 새 배열/객체를 반환한다.
 * DOM·타이머·전역 상태는 참조하지 않으며, 경과 시간(dtMs)은 전부 호출자가 주입한다.
 */

import { BASE_DAMAGE_PER_LEAK, ENEMY_MELEE_DPS, TOWER_COOLDOWN_MS, TOWER_DAMAGE, TOWER_RANGE, UNIT_COOLDOWN_MS, UNIT_DAMAGE } from './constants';
import type { Enemy, Tower, Unit } from './types';

/** 남은 쿨다운(ms)을 dtMs만큼 줄인다. 0 아래로는 내려가지 않는다. */
function tickCooldown(cooldownMs: number, dtMs: number): number {
  return Math.max(0, cooldownMs - dtMs);
}

/** 사거리 안의 후보 중 x가 가장 작은(=본진에 가장 가까운, 가장 위협적인) 적을 고른다. */
function pickPriorityTarget(candidates: readonly Enemy[]): Enemy | null {
  let best: Enemy | null = null;
  for (const enemy of candidates) {
    if (best === null || enemy.x < best.x) {
      best = enemy;
    }
  }
  return best;
}

export interface TowerFireResult {
  readonly towers: readonly Tower[];
  readonly enemies: readonly Enemy[];
}

/**
 * 타워 쿨다운을 dtMs만큼 줄이고, 준비된 타워는 사거리 내 적을 공격한다 (FR-6.2, FR-6.4).
 * `basic`/`splash`는 지상만, `antiair`는 공중만 표적으로 삼는다. `splash`는 사거리 내
 * 전원에게 피해를 준다(범위 피해). 사거리 내 표적이 없으면 쿨다운을 소모하지 않고 대기한다.
 */
export function applyTowerFire(towers: readonly Tower[], enemies: readonly Enemy[], dtMs: number): TowerFireResult {
  let currentEnemies = enemies;
  const nextTowers: Tower[] = [];

  for (const tower of towers) {
    const cooledCooldownMs = tickCooldown(tower.cooldownMs, dtMs);

    if (cooledCooldownMs > 0) {
      nextTowers.push({ ...tower, cooldownMs: cooledCooldownMs });
      continue;
    }

    const range = TOWER_RANGE[tower.kind];
    const targetLane = tower.kind === 'antiair' ? 'air' : 'ground';
    const candidates = currentEnemies.filter((enemy) => enemy.lane === targetLane && enemy.x <= range);

    if (candidates.length === 0) {
      nextTowers.push({ ...tower, cooldownMs: 0 });
      continue;
    }

    const damage = TOWER_DAMAGE[tower.kind][tower.level];

    if (tower.kind === 'splash') {
      const hitIds = new Set(candidates.map((enemy) => enemy.id));
      currentEnemies = currentEnemies.map((enemy) => (hitIds.has(enemy.id) ? { ...enemy, hp: enemy.hp - damage } : enemy));
    } else {
      const target = pickPriorityTarget(candidates);
      if (target !== null) {
        currentEnemies = currentEnemies.map((enemy) => (enemy.id === target.id ? { ...enemy, hp: enemy.hp - damage } : enemy));
      }
    }

    nextTowers.push({ ...tower, cooldownMs: TOWER_COOLDOWN_MS[tower.kind] });
  }

  return { towers: nextTowers, enemies: currentEnemies };
}

export interface EngagementResult {
  readonly enemies: readonly Enemy[];
  readonly units: readonly Unit[];
  readonly blockedEnemyIds: ReadonlySet<number>;
  readonly blockedUnitIds: ReadonlySet<number>;
}

/**
 * 지상 적과 유닛의 교전을 처리한다 (FR-6.5). 지상 적을 x 오름차순(본진에 가까운 순), 유닛을
 * x 내림차순(가장 전진한 순)으로 정렬해 앞에서부터 짝짓는다 — 서로를 향해 움직이므로 가장
 * 먼저 마주치는 쌍이 이 순서와 일치한다. 짝지어진 쌍은 이번 틱에 이동하지 않고 서로에게
 * 피해를 준다. 공중 적은 유닛과 절대 교전하지 않는다(FR-6.2 — 지상 유닛은 지상만 공격 가능).
 */
export function applyEngagement(enemies: readonly Enemy[], units: readonly Unit[], dtMs: number): EngagementResult {
  const groundEnemies = enemies.filter((enemy) => enemy.lane === 'ground').sort((a, b) => a.x - b.x);
  const sortedUnits = [...units].sort((a, b) => b.x - a.x);
  const pairCount = Math.min(groundEnemies.length, sortedUnits.length);
  const dtSec = dtMs / 1000;

  const enemyHpDelta = new Map<number, number>();
  const unitHpDelta = new Map<number, number>();
  const unitCooldownOverride = new Map<number, number>();
  const blockedEnemyIds = new Set<number>();
  const blockedUnitIds = new Set<number>();

  for (let i = 0; i < pairCount; i += 1) {
    const enemy = groundEnemies[i];
    const unit = sortedUnits[i];
    if (!enemy || !unit) {
      continue;
    }
    blockedEnemyIds.add(enemy.id);
    blockedUnitIds.add(unit.id);

    // 적 → 유닛: Enemy 타입(types.ts)에 쿨다운 필드가 없어 연속 DPS로 단순화한다.
    unitHpDelta.set(unit.id, -(ENEMY_MELEE_DPS * dtSec));

    // 유닛 → 적: Unit.cooldownMs를 살려 타워와 동일한 "쿨다운 후 발사" 모델을 쓴다.
    const cooledCooldownMs = tickCooldown(unit.cooldownMs, dtMs);
    if (cooledCooldownMs <= 0) {
      enemyHpDelta.set(enemy.id, -UNIT_DAMAGE[unit.kind]);
      unitCooldownOverride.set(unit.id, UNIT_COOLDOWN_MS);
    } else {
      unitCooldownOverride.set(unit.id, cooledCooldownMs);
    }
  }

  const nextEnemies = enemies.map((enemy) => {
    const delta = enemyHpDelta.get(enemy.id);
    return delta !== undefined ? { ...enemy, hp: enemy.hp + delta } : enemy;
  });

  const nextUnits = units.map((unit) => {
    const hpDelta = unitHpDelta.get(unit.id) ?? 0;
    const cooldownMs = unitCooldownOverride.get(unit.id) ?? tickCooldown(unit.cooldownMs, dtMs);
    return { ...unit, hp: unit.hp + hpDelta, cooldownMs };
  });

  return { enemies: nextEnemies, units: nextUnits, blockedEnemyIds, blockedUnitIds };
}

/** 교전 중이 아닌 적을 전진(x 감소)시킨다. x는 0 밑으로 내려가지 않는다(누출 판정은 별도). */
export function moveEnemies(enemies: readonly Enemy[], blockedEnemyIds: ReadonlySet<number>, dtSec: number): Enemy[] {
  return enemies.map((enemy) => {
    if (enemy.lane === 'ground' && blockedEnemyIds.has(enemy.id)) {
      return enemy;
    }
    return { ...enemy, x: Math.max(0, enemy.x - enemy.speed * dtSec) };
  });
}

/** 교전 중이 아닌 유닛을 전진(x 증가)시킨다. x는 1 위로 올라가지 않는다. */
export function moveUnits(units: readonly Unit[], blockedUnitIds: ReadonlySet<number>, dtSec: number, unitSpeed: number): Unit[] {
  return units.map((unit) => {
    if (blockedUnitIds.has(unit.id)) {
      return unit;
    }
    return { ...unit, x: Math.min(1, unit.x + unitSpeed * dtSec) };
  });
}

export interface LeakResult {
  readonly survivors: readonly Enemy[];
  readonly baseDamage: number;
  readonly leakCount: number;
}

/** 본진(x<=0)에 도달한 적을 걸러내고 본진 피해를 집계한다. */
export function collectLeaks(enemies: readonly Enemy[]): LeakResult {
  const survivors: Enemy[] = [];
  let leakCount = 0;
  for (const enemy of enemies) {
    if (enemy.x <= 0) {
      leakCount += 1;
    } else {
      survivors.push(enemy);
    }
  }
  return { survivors, baseDamage: leakCount * BASE_DAMAGE_PER_LEAK, leakCount };
}

export interface DeathResult {
  readonly survivors: readonly Enemy[];
  readonly kills: number;
  readonly aumDropped: number;
}

/**
 * hp<=0인 적을 처치 처리한다 (FR-6.8-a). `aumPerKill`은 그 웨이브의 개체당 고정 드롭량이며,
 * 타워 사격·유닛 교전·스킬 등 무엇으로 죽었는지와 무관하게 여기 한 곳에서만 판정한다.
 */
export function collectDeaths(enemies: readonly Enemy[], aumPerKill: number): DeathResult {
  const survivors: Enemy[] = [];
  let kills = 0;
  for (const enemy of enemies) {
    if (enemy.hp <= 0) {
      kills += 1;
    } else {
      survivors.push(enemy);
    }
  }
  return { survivors, kills, aumDropped: kills * aumPerKill };
}
