import { describe, expect, test } from 'vitest';

import {
  ENEMY_ATTACK_COOLDOWN_MS,
  ENEMY_DAMAGE,
  UNIT_COOLDOWN_MS,
  UNIT_DAMAGE,
  UNIT_MELEE_RANGE,
  UNIT_RANGE,
  UNIT_SPEED,
  TOWER_DAMAGE,
  TOWER_RANGE,
  towerX,
} from './constants';

/**
 * ★ 피해량은 **리터럴로 박지 않고 상수에서 읽는다** ★
 * 이 테스트들이 고정하려는 명제는 "누가 누구를 때리는가 · 어느 사거리에서 때리는가"이지
 * "한 방이 몇인가"가 아니다. 리터럴을 박아 두면 밸런스 조정(v1.5의 타워 하향 등)마다
 * 레인 판정·슬롯 판정 테스트가 **거짓으로** 깨진다 — 실제로 그렇게 8개가 깨졌다.
 */
const BASIC_L1 = TOWER_DAMAGE.basic[1];
const ANTIAIR_L1 = TOWER_DAMAGE.antiair[1];
const SPLASH_L1 = TOWER_DAMAGE.splash[1];
import { applyEngagement, applyTowerFire, collectDeaths, collectLeaks } from './mechanics';
import type { Enemy, Tower, Unit } from './types';

/** 기본값은 근접 적(밀착 사거리, 웨이브 무관 고정 DPS)의 실제 스폰 값과 같게 잡는다. */
function makeEnemy(overrides: Partial<Enemy> & Pick<Enemy, 'id' | 'lane'>): Enemy {
  return {
    x: 0.1,
    hp: 100,
    maxHp: 100,
    speed: 0,
    damage: ENEMY_DAMAGE,
    range: UNIT_MELEE_RANGE,
    attackCooldownMs: ENEMY_ATTACK_COOLDOWN_MS,
    cooldownMs: 0,
    ...overrides,
  };
}

function makeTower(overrides: Partial<Tower> & Pick<Tower, 'slot' | 'kind'>): Tower {
  return { level: 1, cooldownMs: 0, ...overrides };
}

/** 기본값은 해당 kind의 실제 소환 스탯(constants.ts)과 같게 잡아, 기존 테스트가 kind만으로도
 * 올바른 사거리·데미지를 갖도록 한다. */
function makeUnit(overrides: Partial<Unit> & Pick<Unit, 'id' | 'kind'>): Unit {
  return {
    x: 0,
    hp: 100,
    maxHp: 100,
    speed: UNIT_SPEED,
    damage: UNIT_DAMAGE[overrides.kind],
    range: UNIT_RANGE[overrides.kind],
    attackCooldownMs: UNIT_COOLDOWN_MS,
    cooldownMs: 0,
    ...overrides,
  };
}

describe('applyTowerFire — FR-6.2 레인 표적 제한', () => {
  test('antiair는 지상 적을 공격하지 못하고, basic은 공중 적을 공격하지 못한다', () => {
    const towers: Tower[] = [makeTower({ slot: 0, kind: 'antiair' }), makeTower({ slot: 1, kind: 'basic' })];
    const enemies: Enemy[] = [
      makeEnemy({ id: 1, lane: 'ground', x: 0.1, hp: 1000, maxHp: 1000 }),
      makeEnemy({ id: 2, lane: 'air', x: 0.1, hp: 1000, maxHp: 1000 }),
    ];

    const result = applyTowerFire(towers, enemies, 1000);

    const ground = result.enemies.find((e) => e.id === 1);
    const air = result.enemies.find((e) => e.id === 2);

    // basic이 지상을 때렸으니 지상 hp만 깎이고, air는 antiair가 때려 air hp만 깎인다.
    expect(ground?.hp).toBe(1000 - BASIC_L1);
    expect(air?.hp).toBe(1000 - ANTIAIR_L1);
  });

  test('splash는 사거리 내 지상 적 전원에게 피해를 주고, 사거리 밖은 건드리지 않는다', () => {
    const towers: Tower[] = [makeTower({ slot: 0, kind: 'splash' })];
    const enemies: Enemy[] = [
      makeEnemy({ id: 1, lane: 'ground', x: 0.1, hp: 100, maxHp: 100 }),
      makeEnemy({ id: 2, lane: 'ground', x: 0.2, hp: 100, maxHp: 100 }),
      makeEnemy({ id: 3, lane: 'ground', x: 0.9, hp: 100, maxHp: 100 }), // splash 사거리(0.3) 밖
    ];

    const result = applyTowerFire(towers, enemies, 1400);

    expect(result.enemies.find((e) => e.id === 1)?.hp).toBe(100 - SPLASH_L1);
    expect(result.enemies.find((e) => e.id === 2)?.hp).toBe(100 - SPLASH_L1);
    expect(result.enemies.find((e) => e.id === 3)?.hp).toBe(100);
  });

  test('사거리 내 표적이 없으면 쿨다운을 쓰지 않고 대기한다', () => {
    const towers: Tower[] = [makeTower({ slot: 0, kind: 'basic' })];
    const enemies: Enemy[] = [makeEnemy({ id: 1, lane: 'ground', x: 0.9, hp: 100, maxHp: 100 })];

    const result = applyTowerFire(towers, enemies, 500);

    expect(result.towers[0]?.cooldownMs).toBe(0);
    expect(result.enemies[0]?.hp).toBe(100);
  });

  test('쿨다운이 남아 있으면 사거리 내 표적이 있어도 쏘지 않는다', () => {
    const towers: Tower[] = [makeTower({ slot: 0, kind: 'basic', cooldownMs: 500 })];
    const enemies: Enemy[] = [makeEnemy({ id: 1, lane: 'ground', x: 0.1, hp: 100, maxHp: 100 })];

    const result = applyTowerFire(towers, enemies, 200);

    expect(result.towers[0]?.cooldownMs).toBe(300);
    expect(result.enemies[0]?.hp).toBe(100);
  });
});

describe('applyEngagement — FR-6.5 유닛-적 교전', () => {
  test('밀착 거리 안의 유닛-적 쌍은 서로 피해를 주고받는다', () => {
    // gap = 0.1 - 0.06 = 0.04 ≤ UNIT_MELEE_RANGE(0.05) — 밀착 거리.
    const enemies: Enemy[] = [makeEnemy({ id: 1, lane: 'ground', x: 0.1, hp: 100, maxHp: 100 })];
    const units: Unit[] = [makeUnit({ id: 1, kind: 'analyst', x: 0.06, hp: 100, maxHp: 100, cooldownMs: 0 })];

    const result = applyEngagement(enemies, units, 1000);

    expect(result.blockedEnemyIds.has(1)).toBe(true);
    expect(result.blockedUnitIds.has(1)).toBe(true);
    // 유닛은 쿨다운 0이라 즉시 발사하고, 적도 1초에 한 번 반격한다.
    expect(result.enemies[0]?.hp).toBe(100 - UNIT_DAMAGE.analyst);
    expect(result.units[0]?.hp).toBe(100 - ENEMY_DAMAGE);
  });

  test('공중 적은 유닛과 교전하지 않는다', () => {
    const enemies: Enemy[] = [makeEnemy({ id: 1, lane: 'air', x: 0.1, hp: 100, maxHp: 100 })];
    const units: Unit[] = [makeUnit({ id: 1, kind: 'trader', x: 0.5, hp: 100, maxHp: 100 })];

    const result = applyEngagement(enemies, units, 1000);

    expect(result.blockedEnemyIds.size).toBe(0);
    expect(result.blockedUnitIds.size).toBe(0);
    expect(result.enemies[0]?.hp).toBe(100);
    expect(result.units[0]?.hp).toBe(100);
  });

  test('유닛 쿨다운이 남아 있으면 이번 틱에 적을 때리지 못하지만, 밀착한 적은 준비되어 있으면 즉시 반격한다', () => {
    // gap = 0.1 - 0.06 = 0.04 ≤ UNIT_MELEE_RANGE(0.05) — 밀착 거리.
    // 적·유닛 모두 이산(쿨다운 후 발사) 모델이라, 준비된 쪽은 dtMs가 짧아도 1회분 전체 피해를
    // 즉시 입힌다 — 예전의 연속 DPS(9 × dtSec) 근사는 더 이상 쓰지 않는다.
    const enemies: Enemy[] = [makeEnemy({ id: 1, lane: 'ground', x: 0.1, hp: 100, maxHp: 100, cooldownMs: 0 })];
    const units: Unit[] = [makeUnit({ id: 1, kind: 'intern', x: 0.06, hp: 100, maxHp: 100, cooldownMs: 500 })];

    const result = applyEngagement(enemies, units, 200);

    expect(result.enemies[0]?.hp).toBe(100); // 유닛 쿨다운(500) > dtMs(200)라 아직 못 쏨
    expect(result.units[0]?.cooldownMs).toBe(300);
    // 적은 쿨다운 0(준비됨)이었으므로 dtMs와 무관하게 1회 공격(ENEMY_DAMAGE)을 즉시 넣고
    // 자신의 쿨다운을 ENEMY_ATTACK_COOLDOWN_MS로 재장전한다.
    expect(result.units[0]?.hp).toBe(100 - ENEMY_DAMAGE);
    expect(result.enemies[0]?.cooldownMs).toBe(ENEMY_ATTACK_COOLDOWN_MS);
  });

  test('사거리 밖(교전 전)이면 서로 이동만 하고 피해를 주고받지 않는다', () => {
    const enemies: Enemy[] = [makeEnemy({ id: 1, lane: 'ground', x: 0.5, hp: 100, maxHp: 100 })];
    const units: Unit[] = [makeUnit({ id: 1, kind: 'trader', x: 0.1, hp: 100, maxHp: 100 })];

    const result = applyEngagement(enemies, units, 1000);

    expect(result.blockedEnemyIds.size).toBe(0);
    expect(result.blockedUnitIds.size).toBe(0);
    expect(result.enemies[0]?.hp).toBe(100);
    expect(result.units[0]?.hp).toBe(100);
  });
});

describe('collectLeaks / collectDeaths', () => {
  test('x<=0에 도달한 적은 누출로 집계되고 본진 피해를 낸다', () => {
    const enemies: Enemy[] = [
      makeEnemy({ id: 1, lane: 'ground', x: 0, hp: 100, maxHp: 100 }),
      makeEnemy({ id: 2, lane: 'ground', x: 0.1, hp: 100, maxHp: 100 }),
    ];

    const result = collectLeaks(enemies);

    expect(result.leakCount).toBe(1);
    expect(result.survivors).toHaveLength(1);
    expect(result.survivors[0]?.id).toBe(2);
    expect(result.baseDamage).toBeGreaterThan(0);
  });

  test('hp<=0인 적은 처치로 집계되고 개체당 aumPerKill만큼 AUM을 지급한다', () => {
    const enemies: Enemy[] = [
      makeEnemy({ id: 1, lane: 'ground', x: 0.1, hp: 0, maxHp: 100 }),
      makeEnemy({ id: 2, lane: 'ground', x: 0.1, hp: -5, maxHp: 100 }),
      makeEnemy({ id: 3, lane: 'ground', x: 0.1, hp: 10, maxHp: 100 }),
    ];

    const result = collectDeaths(enemies, 21);

    expect(result.kills).toBe(2);
    expect(result.aumDropped).toBe(42);
    expect(result.survivors).toHaveLength(1);
    expect(result.survivors[0]?.id).toBe(3);
  });

  test('처치가 없으면 AUM 드롭도 0이다', () => {
    const enemies: Enemy[] = [makeEnemy({ id: 1, lane: 'ground', x: 0.1, hp: 10, maxHp: 100 })];
    const result = collectDeaths(enemies, 21);
    expect(result.kills).toBe(0);
    expect(result.aumDropped).toBe(0);
  });
});

describe('applyTowerFire — 슬롯 위치가 사거리를 바꾼다 (상대좌표 판정)', () => {
  /**
   * 예전 판정은 `enemy.x <= range`(본진 절대좌표)라 슬롯 6개가 전부 같은 구간을 커버했고,
   * "어느 슬롯에 짓는가"라는 결정이 존재하지 않았다. 지금은 `enemy.x - towerX(slot) <= range`다.
   */
  test('슬롯마다 커버 구간의 바깥 경계가 TOWER_SLOT_SPACING만큼 밀린다', () => {
    const range = TOWER_RANGE.basic;

    // 슬롯이 앞설수록 경계가 towerX(slot) = slot × TOWER_SLOT_SPACING 만큼 밀린다.
    for (const slot of [0, 1, 5]) {
      const boundary = range + towerX(slot);
      const towers: Tower[] = [makeTower({ slot, kind: 'basic' })];

      // 경계 바로 안쪽: 맞는다.
      const inside = applyTowerFire(towers, [makeEnemy({ id: 1, lane: 'ground', x: boundary - 0.001 })], 1000);
      expect(inside.enemies[0]?.hp).toBe(100 - BASIC_L1);

      // 경계 바로 바깥: 안 맞는다.
      const outside = applyTowerFire(towers, [makeEnemy({ id: 1, lane: 'ground', x: boundary + 0.001 })], 1000);
      expect(outside.enemies[0]?.hp).toBe(100);
    }
  });

  test('슬롯 6개의 커버 상한이 전부 다르다 (배치 결정이 실제로 존재한다)', () => {
    const boundaries = [0, 1, 2, 3, 4, 5].map((slot) => TOWER_RANGE.basic + towerX(slot));
    expect(new Set(boundaries).size).toBe(6);

    // 각 상한 바로 안쪽/바깥쪽 적을 실제로 사격 판정해 본다 — 상수 계산만이 아니라
    // `applyTowerFire`가 정말 슬롯마다 다르게 동작하는지 확인한다.
    for (let slot = 0; slot < 6; slot += 1) {
      const boundary = boundaries[slot]!;
      const towers: Tower[] = [makeTower({ slot, kind: 'basic' })];
      const justInside = applyTowerFire(towers, [makeEnemy({ id: 1, lane: 'ground', x: boundary - 0.001 })], 1000);
      const justOutside = applyTowerFire(towers, [makeEnemy({ id: 1, lane: 'ground', x: boundary + 0.001 })], 1000);

      expect(justInside.enemies[0]?.hp).toBe(100 - BASIC_L1);
      expect(justOutside.enemies[0]?.hp).toBe(100);
    }
  });

  test('같은 적에 대해 앞 슬롯은 사격하고 뒤 슬롯은 아직 못 한다', () => {
    // 슬롯 0의 경계(=TOWER_RANGE.basic) 바깥이지만 슬롯 1의 경계 안쪽인 지점.
    // 상수를 그대로 쓴다 — 리터럴로 박으면 사거리·간격 조정 때마다 테스트가 거짓으로 깨진다.
    const between = TOWER_RANGE.basic + towerX(1) / 2;
    const enemies: Enemy[] = [makeEnemy({ id: 1, lane: 'ground', x: between })];

    const backSlot = applyTowerFire([makeTower({ slot: 0, kind: 'basic' })], enemies, 1000);
    const frontSlot = applyTowerFire([makeTower({ slot: 1, kind: 'basic' })], enemies, 1000);

    expect(backSlot.enemies[0]?.hp).toBe(100); // 슬롯 0: 사거리 밖
    expect(frontSlot.enemies[0]?.hp).toBe(100 - BASIC_L1); // 슬롯 1: 사거리 안
  });

  test('타워를 지나쳐 본진 쪽으로 간 적도 계속 표적이 된다 (음수 거리)', () => {
    // 슬롯 5보다 본진 쪽(x=0.01)에 있는 적. enemy.x - towerX(5) 는 음수라 항상 ≤ range.
    const towers: Tower[] = [makeTower({ slot: 5, kind: 'basic' })];
    const result = applyTowerFire(towers, [makeEnemy({ id: 1, lane: 'ground', x: 0.01 })], 1000);

    expect(result.enemies[0]?.hp).toBe(100 - BASIC_L1);
  });

  test('splash의 범위 피해도 자기 위치 기준으로 판정한다', () => {
    // 슬롯 5 기준 경계 = TOWER_RANGE.splash + towerX(5).
    const boundary = TOWER_RANGE.splash + towerX(5);
    const towers: Tower[] = [makeTower({ slot: 5, kind: 'splash' })];
    const enemies: Enemy[] = [
      // 슬롯 0이었다면 사거리 밖이지만 슬롯 5에서는 안쪽인 지점.
      makeEnemy({ id: 1, lane: 'ground', x: TOWER_RANGE.splash + towerX(5) / 2 }),
      makeEnemy({ id: 2, lane: 'ground', x: boundary + 0.01 }), // 슬롯 5에서도 밖
    ];

    const result = applyTowerFire(towers, enemies, 1400);

    expect(result.enemies.find((e) => e.id === 1)?.hp).toBe(100 - SPLASH_L1);
    expect(result.enemies.find((e) => e.id === 2)?.hp).toBe(100);
  });
});
