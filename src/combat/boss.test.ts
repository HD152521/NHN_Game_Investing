/**
 * 보스(B-03 마진콜 심판관) 회귀 테스트.
 *
 * ★ 이 파일이 지키는 명제 ★
 * 보스는 **연출이 아니라 실제 적 개체**다. 예전에는 `identity.ts`에 등장 웨이브만 있고
 * `enemies`로 스폰되지 않아, 렌더러가 요새 위에 정지 그림을 얹는 것이 전부였다
 * (= "보스가 등장했는데 안 걸어오고 기지에 서 있기만 한다"). 아래 테스트들은 보스가
 * 걷고 · 교전하고 · 본진을 때리고 · 죽는다는 것을 순수 함수 수준에서 고정한다.
 */

import { describe, expect, test } from 'vitest';

import { bossPhaseOf, bossViewOf, isBossWave } from './boss';
import {
  BASE_DAMAGE_PER_LEAK,
  BASE_HP,
  BOSS_BASE_DAMAGE,
  BOSS_DAMAGE,
  BOSS_HP_MULTIPLIER,
  BOSS_PHASE2_HP_RATIO,
  BOSS_SPEED,
  ENEMY_DAMAGE,
  ENEMY_SPEED_GROUND,
  TOWER_SLOTS,
  UNIT_COOLDOWN_MS,
  UNIT_HP,
  UNIT_MELEE_RANGE,
  UNIT_SPEED,
  WAVE_BASE_HP,
  WAVE_COUNT,
  WAVE_DURATION_MS,
} from './constants';
import { BOSS_IDENTITY } from './identity';
import { applyEngagement, collectLeaks, moveEnemies } from './mechanics';
import { buildTower, upgradeTower } from './actions';
import { createCombat, step } from './simulate';
import { STAGES } from './stages';
import type { CombatParams, Enemy, Unit } from './types';
import { spawnPlanFor } from './waves';

const NO_BLOCK: ReadonlySet<number> = new Set();

function bossEnemy(overrides: Partial<Enemy> = {}): Enemy {
  const hp = (WAVE_BASE_HP[WAVE_COUNT - 1] ?? 300) * BOSS_HP_MULTIPLIER;
  return {
    id: 99,
    lane: 'ground',
    x: 1,
    hp,
    maxHp: hp,
    speed: BOSS_SPEED,
    damage: BOSS_DAMAGE,
    range: UNIT_MELEE_RANGE,
    attackCooldownMs: 1000,
    cooldownMs: 0,
    isBoss: true,
    leakDamage: BOSS_BASE_DAMAGE,
    ...overrides,
  };
}

function ally(overrides: Partial<Unit> = {}): Unit {
  return {
    id: 1,
    kind: 'trader',
    x: 0.45,
    hp: UNIT_HP.trader,
    maxHp: UNIT_HP.trader,
    speed: UNIT_SPEED,
    damage: 17,
    range: UNIT_MELEE_RANGE,
    attackCooldownMs: UNIT_COOLDOWN_MS,
    cooldownMs: 0,
    ...overrides,
  };
}

describe('보스 등장 — 실제 적으로 스폰된다', () => {
  const params = {
    waveCount: WAVE_COUNT,
    waveDurationMs: WAVE_DURATION_MS,
    towerSlots: TOWER_SLOTS,
    maxBaseHp: BASE_HP,
    heat: 1,
    aumDropPerWave: 150,
    totalBaseIncome: 195,
  };

  test('등장 웨이브는 시트 §07의 정체성 데이터가 정한다 (숫자를 다시 적지 않는다)', () => {
    expect(BOSS_IDENTITY.appearWave).toBe(WAVE_COUNT);
    expect(isBossWave(WAVE_COUNT)).toBe(true);
    expect(isBossWave(WAVE_COUNT - 1)).toBe(false);
  });

  test('보스 HP는 마지막 웨이브 기본 HP의 3배다 (시트 "일반 유닛 3배 높이")', () => {
    const plan = spawnPlanFor(WAVE_COUNT, params);
    const boss = plan.find((spec) => spec.isBoss === true);
    expect(boss?.hp).toBe((WAVE_BASE_HP[WAVE_COUNT - 1] as number) * BOSS_HP_MULTIPLIER);
  });

  test('보스 스탯은 일반 지상 적의 3배 규칙을 따른다 (속도만 동일)', () => {
    expect(BOSS_DAMAGE).toBe(ENEMY_DAMAGE * 3);
    expect(BOSS_BASE_DAMAGE).toBe(BASE_DAMAGE_PER_LEAK * 3);
    // ★ 속도는 3배도 1/3도 아닌 **동일**이다 — 느리면 잡졸에 가려 표적 우선순위에서
    //   밀려 한 대도 안 맞고 지나간다(`constants.ts BOSS_SPEED` 주석의 실측 근거).
    expect(BOSS_SPEED).toBe(ENEMY_SPEED_GROUND);
  });
});

describe('보스는 걷고 교전한다 — 일반 적과 같은 물리를 탄다', () => {
  test('막히지 않은 보스는 본진 쪽(x 감소)으로 이동한다', () => {
    const moved = moveEnemies([bossEnemy({ x: 0.8 })], NO_BLOCK, 1);
    expect(moved[0]?.x).toBeCloseTo(0.8 - BOSS_SPEED, 6);
  });

  test('밀착한 아군 유닛과 서로 피해를 주고받는다', () => {
    const boss = bossEnemy({ x: 0.47 });
    const unit = ally({ x: 0.45 });

    const result = applyEngagement([boss], [unit], 1000);

    expect(result.blockedEnemyIds.has(boss.id)).toBe(true);
    expect(result.units[0]?.hp).toBe(UNIT_HP.trader - BOSS_DAMAGE);
    expect(result.enemies[0]?.hp).toBeLessThan(boss.hp);
  });

  test('보스 한 방은 일반 적 한 방의 3배다 — 같은 유닛이 1/3의 시간에 죽는다', () => {
    const unit = ally();
    const fromBoss = applyEngagement([bossEnemy({ x: 0.47 })], [unit], 1000);
    const fromTrash = applyEngagement(
      [bossEnemy({ x: 0.47, isBoss: false, damage: ENEMY_DAMAGE, leakDamage: undefined })],
      [unit],
      1000,
    );
    const bossHit = UNIT_HP.trader - (fromBoss.units[0]?.hp ?? 0);
    const trashHit = UNIT_HP.trader - (fromTrash.units[0]?.hp ?? 0);
    expect(bossHit).toBe(trashHit * 3);
  });
});

describe('보스가 본진에 도달하면 3배 피해를 준다', () => {
  test('누출 피해는 개체가 들고 온 값을 쓴다 (보스 18 / 일반 6)', () => {
    const result = collectLeaks([bossEnemy({ x: 0 })]);
    expect(result.leakCount).toBe(1);
    expect(result.baseDamage).toBe(BOSS_BASE_DAMAGE);
    expect(result.baseDamage).toBe(BASE_DAMAGE_PER_LEAK * 3);
  });

  test('보스와 잡졸이 같이 누출되면 피해가 개체별로 합산된다', () => {
    const trash = bossEnemy({ id: 1, x: 0, isBoss: false, leakDamage: undefined });
    const result = collectLeaks([bossEnemy({ x: 0 }), trash]);
    expect(result.baseDamage).toBe(BOSS_BASE_DAMAGE + BASE_DAMAGE_PER_LEAK);
  });

  test('★ 마지막 웨이브를 통째로 흘려보내면 본진이 죽는다 (보스가 마지막 한 방이다)', () => {
    // 보스 도입 전에는 14 × 6 = 84 < 100이라 전부 놓쳐도 살아남았다.
    const lastWaveTrash = 14 * BASE_DAMAGE_PER_LEAK;
    expect(lastWaveTrash).toBeLessThan(BASE_HP);
    expect(lastWaveTrash + BOSS_BASE_DAMAGE).toBeGreaterThan(BASE_HP);
  });
});

describe('페이즈 — HP 비율로 갈린다', () => {
  test('절반 초과면 1페이즈, 미만이면 2페이즈다', () => {
    expect(bossPhaseOf({ hp: 900, maxHp: 900 })).toBe(1);
    expect(bossPhaseOf({ hp: 451, maxHp: 900 })).toBe(1);
    // 정확히 경계면 아직 1페이즈다(`<` 비교).
    expect(bossPhaseOf({ hp: 450, maxHp: 900 })).toBe(1);
    expect(bossPhaseOf({ hp: 449, maxHp: 900 })).toBe(2);
    expect(bossPhaseOf({ hp: 1, maxHp: 900 })).toBe(2);
  });

  test('전환선은 상수 하나에서 나온다 — 렌더러가 자기 값을 갖지 않는다', () => {
    const maxHp = 1000;
    expect(bossPhaseOf({ hp: maxHp * BOSS_PHASE2_HP_RATIO, maxHp })).toBe(1);
    expect(bossPhaseOf({ hp: maxHp * BOSS_PHASE2_HP_RATIO - 1, maxHp })).toBe(2);
  });

  test('전환은 한 방향으로 한 번만 일어난다 (HP는 단조 감소한다)', () => {
    const phases = [900, 700, 500, 450, 449, 200, 1].map((hp) => bossPhaseOf({ hp, maxHp: 900 }));
    expect(phases).toEqual([1, 1, 1, 1, 2, 2, 2]);
  });

  test('비정상 입력(maxHp 0 등)은 1페이즈로 떨어진다 — 연출이 최종 패턴으로 튀지 않는다', () => {
    expect(bossPhaseOf({ hp: 10, maxHp: 0 })).toBe(1);
    expect(bossPhaseOf({ hp: Number.NaN, maxHp: 900 })).toBe(1);
  });
});

describe('bossViewOf — 개체에서 파생되는 투영값', () => {
  test('보스가 있으면 현재/최대 HP를 돌려준다', () => {
    expect(bossViewOf([bossEnemy({ hp: 300 })])).toEqual({ hp: 300, maxHp: 900 });
  });

  test('보스가 없으면 null이다 — 죽는 순간 HP 바가 같이 사라진다', () => {
    expect(bossViewOf([])).toBeNull();
    expect(bossViewOf([bossEnemy({ isBoss: false })])).toBeNull();
  });
});


/**
 * ★★ 회귀 방어선 — 실제로 났던 버그다 ★★
 * `simulate.ts spawnDue`가 `EnemySpec`의 필드를 **하나씩 옮겨 적는** 구조라, 스펙에
 * `isBoss: true`를 추가했는데 그 줄을 빠뜨려 **보스가 일반 적으로 스폰됐다.** 순수 함수
 * 테스트는 전부 통과했다(스펙에는 플래그가 있었으니까). 전 구간을 실제로 돌려 봐야만
 * 잡히는 종류의 버그라, 이 describe가 그 자리를 지킨다.
 */
describe('보스 — 전 구간 시뮬레이션 (spawnDue 필드 누락 회귀 방어)', () => {
  function r1Params(): CombatParams {
    return {
      waveTable: STAGES.R1.waveTable,
      waveCount: WAVE_COUNT,
      waveDurationMs: WAVE_DURATION_MS,
      towerSlots: TOWER_SLOTS,
      maxBaseHp: BASE_HP,
      heat: 1,
      aumDropPerWave: 150,
      totalBaseIncome: 195,
    };
  }

  /**
   * 실측으로 클리어가 확인된 로드아웃(기본5 + 대공1, 전부 Lv2)으로 R1을 끝까지 돌린다.
   *
   * ★ 2026-08-05: 기본4+대공2 → **기본5+대공1**로 바꿨다 ★
   * 타워 Lv2 피해량 −15%(`constants.ts TOWER_DAMAGE`) 이후 기본4+대공2는 **보스를 못 잡는다** —
   * 클리어는 하지만(잔여 HP 42) 보스 HP를 218까지만 깎고 본진에 흘려보낸다. 이 describe는
   * 밸런스가 아니라 **`spawnDue`의 `isBoss` 누락 회귀**를 지키는 자리이므로, 보스를 실제로
   * 죽이는 조합으로 옮겼다. 기본 포탑을 한 기 더 쓰면(대공은 1기로 충분) 보스 최저 HP가
   * 218 → 20이 되어 처치가 성립한다(잔여 HP 44로 클리어도 유지).
   *
   * ⚠️ **`combat-sim`의 `보스 ○` 열을 이 판정의 근거로 쓰지 마라.** 그 열은
   * `bossSeen && state.boss == null`이라 **보스가 누출돼 사라진 경우도 ○로 센다.**
   * "실제로 죽였는가"는 여기처럼 `events.deaths`의 `kind === 'boss'`로만 알 수 있다.
   */
  function runR1() {
    const params = r1Params();
    let state = createCombat(params);
    let gold = 2290;
    const kinds = ['basic', 'basic', 'basic', 'basic', 'basic', 'antiair'] as const;
    kinds.forEach((kind, slot) => {
      const built = buildTower(state, slot, kind, gold, params);
      state = built.state;
      gold = built.gold;
    });
    kinds.forEach((_, slot) => {
      const upgraded = upgradeTower(state, slot, gold);
      if (upgraded.ok) {
        state = upgraded.state;
        gold = upgraded.gold;
      }
    });

    let bossMaxHp = 0;
    let sawPhase1 = false;
    let sawPhase2 = false;
    let bossDeaths = 0;
    const totalMs = WAVE_DURATION_MS * (WAVE_COUNT + 3);

    for (let elapsed = 0; elapsed < totalMs && state.phase === 'running'; elapsed += 250) {
      const result = step(state, 250, params);
      state = result.state;
      const boss = state.boss ?? null;
      if (boss !== null) {
        bossMaxHp = boss.maxHp;
        if (bossPhaseOf(boss) === 1) sawPhase1 = true;
        else sawPhase2 = true;
      }
      bossDeaths += result.events.deaths.filter((death) => death.kind === 'boss').length;
    }

    return { state, bossMaxHp, sawPhase1, sawPhase2, bossDeaths };
  }

  test('보스가 실제로 스폰되어 CombatState.boss에 나타난다', () => {
    const run = runR1();
    // 900 = 마지막 웨이브 HP 300 × 3. 0이면 보스가 아예 스폰되지 않은 것이다.
    expect(run.bossMaxHp).toBe(900);
  });

  test('두 페이즈를 모두 거친다 — 2페이즈가 스쳐 지나가지 않는다', () => {
    const run = runR1();
    expect(run.sawPhase1).toBe(true);
    expect(run.sawPhase2).toBe(true);
  });

  test('보스는 정확히 한 번 죽고, 사망 이벤트가 boss 종류로 나온다', () => {
    const run = runR1();
    expect(run.bossDeaths).toBe(1);
    expect(run.state.boss ?? null).toBeNull();
  });

  test('보스를 잡으면 스테이지가 클리어된다', () => {
    expect(runR1().state.phase).toBe('cleared');
  });
});

describe('사망 이벤트 — 연출 배선의 유일한 입력', () => {
  test('아무도 안 죽은 틱에는 같은 빈 배열 참조를 돌려준다 (프레임당 할당 0)', () => {
    const params: CombatParams = {
      waveTable: STAGES.R1.waveTable,
      waveCount: WAVE_COUNT,
      waveDurationMs: WAVE_DURATION_MS,
      towerSlots: TOWER_SLOTS,
      maxBaseHp: BASE_HP,
      heat: 1,
      aumDropPerWave: 150,
      totalBaseIncome: 195,
    };
    const state = createCombat(params);
    const first = step(state, 250, params);
    const second = step(first.state, 250, params);
    expect(first.events.deaths).toHaveLength(0);
    expect(first.events.deaths).toBe(second.events.deaths);
  });

  test('죽은 적은 종류·레인·위치를 달고 나온다', () => {
    const params: CombatParams = {
      waveTable: STAGES.R1.waveTable,
      waveCount: WAVE_COUNT,
      waveDurationMs: WAVE_DURATION_MS,
      towerSlots: TOWER_SLOTS,
      maxBaseHp: BASE_HP,
      heat: 1,
      aumDropPerWave: 150,
      totalBaseIncome: 195,
    };
    let state = createCombat(params);
    const built = buildTower(state, 0, 'basic', 2290, params);
    state = built.state;

    const seen: string[] = [];
    for (let elapsed = 0; elapsed < WAVE_DURATION_MS * 3 && state.phase === 'running'; elapsed += 250) {
      const result = step(state, 250, params);
      state = result.state;
      for (const death of result.events.deaths) {
        seen.push(death.kind);
        expect(death.x).toBeGreaterThanOrEqual(0);
        expect(death.x).toBeLessThanOrEqual(1);
      }
    }
    expect(seen).toContain('enemy');
  });
});
