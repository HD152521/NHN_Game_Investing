import { describe, expect, test } from 'vitest';

import {
  AUM_DROP_PER_WAVE,
  BASE_HP,
  BASE_INCOME_PER_WAVE,
  TOWER_SLOTS,
  WAVE_COUNT,
  WAVE_DURATION_MS,
  WAVE_PREP_MS,
} from './constants';
import { createCombat, step } from './simulate';
import type { CombatParams } from './types';

function fixtureParams(overrides?: Partial<CombatParams>): CombatParams {
  return {
    waveCount: WAVE_COUNT,
    waveDurationMs: WAVE_DURATION_MS,
    towerSlots: TOWER_SLOTS,
    maxBaseHp: BASE_HP,
    heat: 1,
    aumDropPerWave: AUM_DROP_PER_WAVE,
    totalBaseIncome: BASE_INCOME_PER_WAVE * WAVE_COUNT,
    ...overrides,
  };
}

describe('createCombat', () => {
  test('초기 상태는 wave=0, phase=running, baseHp=maxBaseHp다', () => {
    const params = fixtureParams();
    const state = createCombat(params);

    expect(state.phase).toBe('running');
    expect(state.wave).toBe(0);
    expect(state.baseHp).toBe(params.maxBaseHp);
    expect(state.enemies).toEqual([]);
    expect(state.units).toEqual([]);
    expect(state.towers).toEqual([]);
  });

  test('스테이지는 준비 구간부터 시작한다 (첫 타워를 세울 시간)', () => {
    const state = createCombat(fixtureParams());
    expect(state.prepRemainingMs).toBe(WAVE_PREP_MS);
  });
});

describe('step — 준비 구간 (FR-6 플레이테스트 피드백)', () => {
  /**
   * 예전에는 `createCombat` 직후 첫 `step()`이 곧바로 웨이브 1을 시작했다. 시작 골드가
   * 기본 포탑 정확히 1기라, 고르고 클릭할 틈 없이 적이 이미 행군 중이었다.
   */
  test('준비 구간에는 적이 한 마리도 스폰되지 않는다', () => {
    const params = fixtureParams();
    const { state } = step(createCombat(params), WAVE_PREP_MS - 100, params);

    expect(state.enemies).toHaveLength(0);
    expect(state.wave).toBe(0);
    expect(state.prepRemainingMs).toBeGreaterThan(0);
  });

  test('준비 구간에는 웨이브 기본 수입도 아직 지급되지 않는다', () => {
    const params = fixtureParams();
    const { events } = step(createCombat(params), 1_000, params);

    expect(events.waveStarted).toBeNull();
    expect(events.goldIncome).toBe(0);
  });

  test('준비 시간 5초가 지나면 웨이브 1이 자동으로 시작되고 기본 수입이 지급된다', () => {
    const params = fixtureParams();
    const { state, events } = step(createCombat(params), WAVE_PREP_MS + 250, params);

    expect(state.wave).toBe(1);
    expect(state.prepRemainingMs).toBe(0);
    expect(events.waveStarted).toBe(1);
    expect(events.goldIncome).toBe(Math.floor(params.totalBaseIncome / params.waveCount));
  });

  test('웨이브 1 교전이 끝나면 웨이브 2 전에 다시 준비 구간이 들어온다', () => {
    const params = fixtureParams();
    let state = createCombat(params);
    // 주기(30초)의 끝 = 웨이브 2의 준비 구간 초입.
    for (let i = 0; i < 121; i += 1) {
      state = step(state, 250, params).state;
    }

    expect(state.wave).toBe(1);
    expect(state.prepRemainingMs).toBeGreaterThan(0);
  });

  test('적이 스폰되기 시작하는 것은 준비가 끝난 뒤다', () => {
    const params = fixtureParams();
    const { state } = step(createCombat(params), WAVE_PREP_MS + 1_000, params);

    expect(state.enemies.length).toBeGreaterThan(0);
  });
});

describe('step — 웨이브 진행', () => {
  test('적을 하나도 못 잡으면 이번 스텝의 kills·aumDropped는 0이다', () => {
    const params = fixtureParams();
    const state = createCombat(params);

    // 100ms로는 스폰만 일어날 뿐, 22초가 걸리는 이동/처치가 일어날 수 없다.
    const { events } = step(state, 100, params);

    expect(events.kills).toBe(0);
    expect(events.aumDropped).toBe(0);
  });

  test('준비 시간이 붙어도 스테이지 총 길이(13웨이브 × 30초)는 그대로다', () => {
    // 방어 없이 패배해 시계가 멈추지 않도록 본진 HP만 크게 잡는다(웨이브 진행만 본다).
    const params = fixtureParams({ maxBaseHp: 1_000_000 });
    let state = createCombat(params);
    let lastWaveStarted = 0;

    // 정확히 13 × 30초 = 390초 = 리플레이(STAGE_DURATION_MS) 길이.
    for (let i = 0; i < params.waveCount * (params.waveDurationMs / 1000); i += 1) {
      const result = step(state, 1000, params);
      state = result.state;
      if (result.events.waveStarted !== null) lastWaveStarted = result.events.waveStarted;
    }

    expect(lastWaveStarted).toBe(params.waveCount);
  });
});

describe('step — 패배 조건 (FR-6.9)', () => {
  test('아무 방어도 없이 적이 본진에 도달하면 본진 HP가 0이 되어 phase가 defeated로 전환된다', () => {
    const params = fixtureParams({ maxBaseHp: 5 }); // BASE_DAMAGE_PER_LEAK(6) 한 방으로 확정 패배
    let state = createCombat(params);

    for (let i = 0; i < 30 && state.phase === 'running'; i += 1) {
      state = step(state, 1000, params).state;
    }

    expect(state.phase).toBe('defeated');
    expect(state.baseHp).toBe(0);
  });
});

describe('step — 승리 조건 (FR-6.10)', () => {
  test('13웨이브를 모두 소진하고 적이 남지 않으면 phase가 cleared로 전환된다', () => {
    // 방어 없이도 절대 패배하지 않도록 maxBaseHp를 크게 잡아, "웨이브 소진 + 적 0" 조건만 검증한다.
    const params = fixtureParams({ maxBaseHp: 1_000_000 });
    let state = createCombat(params);

    for (let i = 0; i < 500 && state.phase === 'running'; i += 1) {
      state = step(state, 1000, params).state;
    }

    expect(state.phase).toBe('cleared');
    expect(state.wave).toBe(params.waveCount);
    expect(state.enemies).toHaveLength(0);
  });
});

describe('step — 결정론 및 큰 dtMs 안전성', () => {
  test('같은 상태·같은 dt로 두 번 실행하면 결과가 완전히 같다', () => {
    const params = fixtureParams();
    const base = createCombat(params);

    const first = step(base, 733, params);
    const second = step(base, 733, params);

    expect(first).toEqual(second);
  });

  test('큰 dtMs(5000)를 한 번에 넣어도, 같은 총 시간을 잘게 나눠 호출한 것과 동일한 결과가 나온다(터널링 없음)', () => {
    const params = fixtureParams();

    const bulk = step(createCombat(params), 5000, params);

    let incremental = createCombat(params);
    let kills = 0;
    let aumDropped = 0;
    let goldIncome = 0;
    let baseDamage = 0;
    for (let i = 0; i < 5; i += 1) {
      const result = step(incremental, 1000, params);
      incremental = result.state;
      kills += result.events.kills;
      aumDropped += result.events.aumDropped;
      goldIncome += result.events.goldIncome;
      baseDamage += result.events.baseDamage;
    }

    expect(bulk.state).toEqual(incremental);
    expect(bulk.events.kills).toBe(kills);
    expect(bulk.events.aumDropped).toBe(aumDropped);
    expect(bulk.events.goldIncome).toBe(goldIncome);
    expect(bulk.events.baseDamage).toBe(baseDamage);
  });

  test('큰 dtMs를 넣어도 모든 적의 x는 [0,1] 범위를 벗어나지 않고 본진 HP는 음수가 되지 않는다', () => {
    const params = fixtureParams();
    const { state } = step(createCombat(params), 5000, params);

    for (const enemy of state.enemies) {
      expect(enemy.x).toBeGreaterThanOrEqual(0);
      expect(enemy.x).toBeLessThanOrEqual(1);
      expect(Number.isFinite(enemy.hp)).toBe(true);
    }
    expect(state.baseHp).toBeGreaterThanOrEqual(0);
    expect(state.baseHp).toBeLessThanOrEqual(state.maxBaseHp);
  });

  test('phase가 running이 아니면 더 이상 상태가 바뀌지 않는다', () => {
    const params = fixtureParams({ maxBaseHp: 5 });
    let state = createCombat(params);
    for (let i = 0; i < 30 && state.phase === 'running'; i += 1) {
      state = step(state, 1000, params).state;
    }
    expect(state.phase).toBe('defeated');

    const { state: after, events } = step(state, 1000, params);
    expect(after).toEqual(state);
    expect(events).toEqual({
      kills: 0,
      aumDropped: 0,
      goldIncome: 0,
      baseDamage: 0,
      waveStarted: null,
      deaths: [],
    });
  });
});
