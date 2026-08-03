/**
 * 전투 물리 헬퍼 — 타워 사격, 유닛-적 교전, 이동, 처치/누출 판정 (PRD FR-6.2, FR-6.4, FR-6.5).
 *
 * 전부 순수 함수다. 입력 배열·객체를 변형하지 않고 항상 새 배열/객체를 반환한다.
 * DOM·타이머·전역 상태는 참조하지 않으며, 경과 시간(dtMs)은 전부 호출자가 주입한다.
 */

import {
  BASE_DAMAGE_PER_LEAK,
  TOWER_COOLDOWN_MS,
  TOWER_DAMAGE,
  TOWER_RANGE,
  towerX,
} from './constants';
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
 *
 * ★ 사거리는 **타워 자기 위치 기준 상대 거리**로 잰다 ★
 * 판정식은 `enemy.x - towerX(tower.slot) <= range`다. 예전에는 `enemy.x <= range`,
 * 즉 본진(x=0) 절대좌표 기준이라 **슬롯 6개가 전부 같은 구간을 커버**했다 — 어디에 짓든
 * 결과가 완전히 동일해서 배치라는 결정 자체가 존재하지 않았다. 상대 거리로 바꾸면
 * 앞 슬롯일수록 적을 더 일찍(더 먼 x에서) 잡는 대신 커버 구간이 통째로 앞으로 밀린다.
 *
 * 뺄셈 결과가 음수인 경우(적이 타워를 지나쳐 본진 쪽으로 간 경우)도 `<= range`를 만족해
 * 계속 표적이 된다 — 지나친 적이 무적이 되면 안 되기 때문이다.
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
    const originX = towerX(tower.slot);
    const targetLane = tower.kind === 'antiair' ? 'air' : 'ground';
    const candidates = currentEnemies.filter(
      (enemy) => enemy.lane === targetLane && enemy.x - originX <= range,
    );

    if (candidates.length === 0) {
      nextTowers.push({ ...tower, cooldownMs: 0 });
      continue;
    }

    // 배수는 건설 시점에 개체가 물고 있다(FR-11 R&D). 없으면 1 — 구 저장·기존 테스트 호환.
    const damage = Math.round(TOWER_DAMAGE[tower.kind][tower.level] * (tower.damageMultiplier ?? 1));

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

/** id별 피해량을 누적한다. 여러 개체가 같은 표적을 때릴 수 있으므로 덮어쓰기가 아니라 합산이다. */
function addDelta(deltas: Map<number, number>, id: number, amount: number): void {
  deltas.set(id, (deltas.get(id) ?? 0) + amount);
}

/**
 * `fromX`에서 사거리(`range`) 안에 있는 후보 중 **가장 가까운** 하나를 고른다. 없으면 null.
 *
 * 거리는 절대값으로 잰다 — 적이 유닛을 지나쳐 뒤로 간 경우(gap 음수)에도 사거리 안이면
 * 표적으로 삼아야 한다. 부호로 판정하면 스쳐 지나간 적이 무적이 된다.
 *
 * 거리가 같으면 **자기 사거리가 짧은 쪽**을 고른다. 적이 유닛을 고를 때 이 규칙이 "탱커가
 * 앞에 서면 원거리가 보호받는다"는 기획 의도를 만든다 — 동시 소환으로 x가 같아도 근접
 * 탱커가 먼저 맞는다. 보통은 전열이 더 가까우므로 거리만으로 갈리고, 이 타이브레이크는
 * 동률일 때만 작동한다.
 */
function nearestInRange<T extends { readonly id: number; readonly x: number; readonly range: number }>(
  candidates: readonly T[],
  fromX: number,
  range: number,
): T | null {
  let best: T | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const distance = Math.abs(candidate.x - fromX);
    if (distance > range) {
      continue;
    }
    if (best === null || distance < bestDistance || (distance === bestDistance && candidate.range < best.range)) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * 지상 적과 유닛의 교전을 처리한다 (FR-6.5).
 *
 * **개체별 독립 판정이다.** 모든 유닛·적이 각자 "내 사거리 안에 표적이 있는가"만 본다.
 * 있으면 **그 자리에 멈춰서 때리고**, 없으면 **이동한다**. 표적은 사거리 안에서 가장 가까운
 * 개체다.
 *
 * 이전 구현은 적과 유닛을 정렬 인덱스로 1:1 짝지어(`min(적 수, 유닛 수)`) 교전시켰는데,
 * 짝이 없는 유닛은 사거리 안에 적이 있어도 계속 전진해 원거리 유닛이 밀착해 버렸다. 개체별
 * 판정은 그 문제가 구조적으로 생기지 않는다 — 유닛 5명 vs 적 1명이면 사거리가 닿는 5명 전원이
 * 멈춰서 사격한다.
 *
 * 스탯은 전부 개체(`unit.range`/`unit.damage`/`enemy.range`/`enemy.damage` 등)에서 읽는다 —
 * `kind`로 전역 상수 테이블을 조회하지 않는다(types.ts 참고). 부서 업그레이드(FR-11)가
 * 개체별로 다른 스탯을 요구하므로, 이 파일이 조회 대신 개체 필드를 읽어야 그 기능이 이 위에
 * 자연스럽게 올라간다.
 *
 * 유닛 사거리(`unit.range`)와 적 사거리(`enemy.range`)가 다르므로 **비대칭 구간**이 자연히
 * 생긴다: 원거리 유닛(analyst, 0.2)은 근접 적(0.05)이 밀착하기 전까지 일방적으로 때린다.
 * 그 구간에서 유닛은 멈춰 있고 적만 접근한다. 근접·탱커는 사거리가 밀착 거리와 같아 이
 * 구간이 없다.
 *
 * 유닛·적 모두 "쿨다운 후 발사" 모델이다(각자 `cooldownMs`를 dtMs만큼 줄이다가 0 이하가 되면
 * 공격하고 자신의 `attackCooldownMs`로 재장전). 교전 중이 아니어도 쿨다운은 계속 줄어든다 —
 * 사거리 안에 들어오는 순간 바로 쏠 수 있어야 하기 때문이다.
 *
 * 공중 적은 유닛과 절대 교전하지 않는다(FR-6.2 — 지상 유닛은 지상만 공격 가능, 원거리 유닛도
 * 예외 없음).
 */
export function applyEngagement(enemies: readonly Enemy[], units: readonly Unit[], dtMs: number): EngagementResult {
  const groundEnemies = enemies.filter((enemy) => enemy.lane === 'ground');

  const enemyHpDelta = new Map<number, number>();
  const unitHpDelta = new Map<number, number>();
  const unitCooldownOverride = new Map<number, number>();
  const enemyCooldownOverride = new Map<number, number>();
  const blockedEnemyIds = new Set<number>();
  const blockedUnitIds = new Set<number>();

  // 유닛 → 적: 사거리 안에 지상 적이 있으면 전진을 멈추고 가장 가까운 적을 때린다.
  for (const unit of units) {
    const target = nearestInRange(groundEnemies, unit.x, unit.range);
    if (target === null) {
      continue;
    }

    blockedUnitIds.add(unit.id);

    const cooledUnitCooldownMs = tickCooldown(unit.cooldownMs, dtMs);
    if (cooledUnitCooldownMs <= 0) {
      addDelta(enemyHpDelta, target.id, -unit.damage);
      unitCooldownOverride.set(unit.id, unit.attackCooldownMs);
    } else {
      unitCooldownOverride.set(unit.id, cooledUnitCooldownMs);
    }
  }

  // 적 → 유닛: 동일한 규칙을 적에게도 적용한다. 자기 사거리 안에 유닛이 있으면 멈춰서 때린다.
  for (const enemy of groundEnemies) {
    const target = nearestInRange(units, enemy.x, enemy.range);
    if (target === null) {
      continue;
    }

    blockedEnemyIds.add(enemy.id);

    const cooledEnemyCooldownMs = tickCooldown(enemy.cooldownMs, dtMs);
    if (cooledEnemyCooldownMs <= 0) {
      addDelta(unitHpDelta, target.id, -enemy.damage);
      enemyCooldownOverride.set(enemy.id, enemy.attackCooldownMs);
    } else {
      enemyCooldownOverride.set(enemy.id, cooledEnemyCooldownMs);
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

/**
 * 교전 중이 아닌 유닛을 전진(x 증가)시킨다. 표적이 없으면 적 본진(x = 1)까지 나아간다.
 *
 * ★ 전진 한계선 폐지 (기획자 결정) ★ 예전에는 `UNIT_HOLD_LINE`(0.45)에서 유닛을 세웠다.
 * 유닛이 적 본진 앞까지 나가 초반 웨이브를 혼자 요격하면 타워가 한 발도 못 쏘기 때문에
 * 넣었던 장치인데, 플레이해 보니 아군이 보이지 않는 선에 막혀 서는 것이 어색했다.
 * 지금은 유닛이 자유롭게 전진한다 — 전선을 어디에 세울지는 플레이어가 소환 타이밍으로
 * 정한다.
 */
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

/**
 * 본진(x<=0)에 도달한 적을 걸러내고 본진 피해를 집계한다.
 *
 * 피해량은 **개체가 들고 있는 값**(`enemy.leakDamage`)이다 — 종류로 상수 테이블을 조회하지
 * 않는다(`types.ts` Combatant 주석의 원칙). 보스만 다른 값(3배)을 실어 오고, 나머지는
 * 생략된 채로 와서 `BASE_DAMAGE_PER_LEAK`로 떨어진다.
 */
export function collectLeaks(enemies: readonly Enemy[]): LeakResult {
  const survivors: Enemy[] = [];
  let leakCount = 0;
  let baseDamage = 0;
  for (const enemy of enemies) {
    if (enemy.x <= 0) {
      leakCount += 1;
      baseDamage += enemy.leakDamage ?? BASE_DAMAGE_PER_LEAK;
    } else {
      survivors.push(enemy);
    }
  }
  return { survivors, baseDamage, leakCount };
}

export interface DeathResult {
  readonly survivors: readonly Enemy[];
  readonly kills: number;
  readonly aumDropped: number;
  /**
   * 이번 틱에 죽은 개체들. 사망 연출(`CombatEvents.deaths`)의 원본이다.
   *
   * 아무도 안 죽었으면 **항상 같은 빈 배열 참조**를 돌려준다 — 이 함수는 매 서브스텝
   * 호출되고 대부분의 틱에는 사망이 없으므로, 여기서 배열을 새로 만들면 그것만으로
   * 프레임당 할당이 생긴다(PRD §11).
   */
  readonly dead: readonly Enemy[];
}

/** 사망이 없는 틱이 공유하는 빈 목록. 새 배열을 만들지 않기 위한 상수다. */
const NO_DEAD: readonly Enemy[] = Object.freeze([]);

/**
 * hp<=0인 적을 처치 처리한다 (FR-6.8-a). `aumPerKill`은 그 웨이브의 개체당 고정 드롭량이며,
 * 타워 사격·유닛 교전·스킬 등 무엇으로 죽었는지와 무관하게 여기 한 곳에서만 판정한다.
 */
export function collectDeaths(enemies: readonly Enemy[], aumPerKill: number): DeathResult {
  const survivors: Enemy[] = [];
  let dead: Enemy[] | null = null;
  for (const enemy of enemies) {
    if (enemy.hp <= 0) {
      if (dead === null) {
        dead = [];
      }
      dead.push(enemy);
    } else {
      survivors.push(enemy);
    }
  }
  const kills = dead === null ? 0 : dead.length;
  return { survivors, kills, aumDropped: kills * aumPerKill, dead: dead ?? NO_DEAD };
}
