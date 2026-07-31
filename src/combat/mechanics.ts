/**
 * 전투 물리 헬퍼 — 타워 사격, 유닛-적 교전, 이동, 처치/누출 판정 (PRD FR-6.2, FR-6.4, FR-6.5).
 *
 * 전부 순수 함수다. 입력 배열·객체를 변형하지 않고 항상 새 배열/객체를 반환한다.
 * DOM·타이머·전역 상태는 참조하지 않으며, 경과 시간(dtMs)은 전부 호출자가 주입한다.
 */

import { BASE_DAMAGE_PER_LEAK, TOWER_COOLDOWN_MS, TOWER_DAMAGE, TOWER_RANGE } from './constants';
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
 * 먼저 마주치는 쌍이 이 순서와 일치한다. x가 같으면 사거리가 짧은(근접·탱커) 유닛을 앞세운다
 * — 탱커가 원거리 유닛보다 먼저 적과 붙어야 "탱커가 앞에 서면 원거리가 보호받는" 구도가
 * 나온다(기획 의도).
 *
 * 스탯은 전부 개체(`unit.range`/`unit.damage`/`enemy.range`/`enemy.damage` 등)에서 읽는다 —
 * `kind`로 전역 상수 테이블을 조회하지 않는다(types.ts 참고). 부서 업그레이드(FR-11)가
 * 개체별로 다른 스탯을 요구하므로, 이 파일이 조회 대신 개체 필드를 읽어야 그 기능이 이 위에
 * 자연스럽게 올라간다.
 *
 * 각 쌍은 유닛의 사거리(`unit.range`) 안에 적이 들어와야 교전을 시작한다 — 사거리 밖이면
 * 이번 틱에 아무 일도 없이 각자 이동한다. 사거리 안에 들어오면 유닛은 전진을 멈추고
 * 공격하지만, 적은 그보다 짧은 자신의 밀착 사거리(`enemy.range`, 근접이라 보통 유닛의 밀착
 * 거리와 같은 값) 안까지 접근해야만 반격할 수 있다 — 원거리 유닛(analyst)은 이 둘의 차이만큼
 * "일방적으로 때리기만 하는 구간"을 갖는다. 근접·탱커는 사거리 자체가 밀착 거리와 같아 이
 * 구간이 사실상 없다(밀착해야만 교전).
 *
 * 유닛·적 모두 "쿨다운 후 발사" 모델이다(각자 `cooldownMs`를 dtMs만큼 줄이다가 0 이하가 되면
 * 공격하고 자신의 `attackCooldownMs`로 재장전). 교전 중이 아니어도 쿨다운은 계속 줄어든다 —
 * 사거리 안에 들어오는 순간 바로 쏠 수 있어야 하기 때문이다.
 *
 * 공중 적은 유닛과 절대 교전하지 않는다(FR-6.2 — 지상 유닛은 지상만 공격 가능, 원거리 유닛도
 * 예외 없음).
 */
export function applyEngagement(enemies: readonly Enemy[], units: readonly Unit[], dtMs: number): EngagementResult {
  const groundEnemies = enemies.filter((enemy) => enemy.lane === 'ground').sort((a, b) => a.x - b.x);
  const sortedUnits = [...units].sort((a, b) => {
    if (a.x !== b.x) {
      return b.x - a.x;
    }
    return a.range - b.range;
  });
  const pairCount = Math.min(groundEnemies.length, sortedUnits.length);

  const enemyHpDelta = new Map<number, number>();
  const unitHpDelta = new Map<number, number>();
  const unitCooldownOverride = new Map<number, number>();
  const enemyCooldownOverride = new Map<number, number>();
  const blockedEnemyIds = new Set<number>();
  const blockedUnitIds = new Set<number>();

  for (let i = 0; i < pairCount; i += 1) {
    const enemy = groundEnemies[i];
    const unit = sortedUnits[i];
    if (!enemy || !unit) {
      continue;
    }

    const gap = enemy.x - unit.x;
    if (gap > unit.range) {
      // 사거리 밖 — 교전 없음. 둘 다 이번 틱에 자유롭게 이동한다.
      continue;
    }

    // 사거리 안에 들어왔다 — 유닛은 전진을 멈추고 공격에 전념한다.
    blockedUnitIds.add(unit.id);

    if (gap <= enemy.range) {
      // 적의 밀착 거리 안 — 적도 멈춰서 반격한다. 근접·탱커는 사거리=밀착거리라 항상 이 분기다.
      blockedEnemyIds.add(enemy.id);

      // 적 → 유닛: 적도 쿨다운 후 발사 모델을 쓴다(Enemy.cooldownMs, types.ts).
      const cooledEnemyCooldownMs = tickCooldown(enemy.cooldownMs, dtMs);
      if (cooledEnemyCooldownMs <= 0) {
        unitHpDelta.set(unit.id, -enemy.damage);
        enemyCooldownOverride.set(enemy.id, enemy.attackCooldownMs);
      } else {
        enemyCooldownOverride.set(enemy.id, cooledEnemyCooldownMs);
      }
    }
    // else: 사거리 안이지만 밀착 전 — 원거리 유닛의 일방적 사격 구간. 적은 멈추지도,
    // 반격하지도 않고 계속 접근한다(쿨다운도 이 쌍에서는 다루지 않고 아래 fallback으로 흐른다).

    // 유닛 → 적: 유닛도 자신의 attackCooldownMs로 재장전한다.
    const cooledUnitCooldownMs = tickCooldown(unit.cooldownMs, dtMs);
    if (cooledUnitCooldownMs <= 0) {
      enemyHpDelta.set(enemy.id, -unit.damage);
      unitCooldownOverride.set(unit.id, unit.attackCooldownMs);
    } else {
      unitCooldownOverride.set(unit.id, cooledUnitCooldownMs);
    }
  }

  const nextEnemies = enemies.map((enemy) => {
    const hpDelta = enemyHpDelta.get(enemy.id) ?? 0;
    const cooldownMs = enemyCooldownOverride.get(enemy.id) ?? tickCooldown(enemy.cooldownMs, dtMs);
    return { ...enemy, hp: enemy.hp + hpDelta, cooldownMs };
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
export function moveUnits(units: readonly Unit[], blockedUnitIds: ReadonlySet<number>, dtSec: number): Unit[] {
  return units.map((unit) => {
    if (blockedUnitIds.has(unit.id)) {
      return unit;
    }
    return { ...unit, x: Math.min(1, unit.x + unit.speed * dtSec) };
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
