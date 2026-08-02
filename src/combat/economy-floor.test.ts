/**
 * 검산 4 — "매매를 한 번도 하지 않는" 플레이의 상한이 R1 클리어에 못 미친다는 회귀 테스트.
 *
 * 정산식 개정(`src/position/trade.ts`)으로 **골드는 청산 이익에서만 나온다.** 따라서 매매를
 * 안 하면 플레이어가 쓸 수 있는 골드는 `STARTING_GOLD` + 웨이브 기본 수입이 전부다.
 * 이 파일은 그 상한을 수치로 못박고, 그 예산으로 살 수 있는 **어떤 조합으로도 13웨이브를
 * 막지 못한다**는 것을 실제 시뮬레이션으로 보인다.
 *
 * 이 테스트가 깨진다면 "차트를 안 봐도 클리어 가능"해진 것이다 — PRD §9.3의 코어 보증
 * ("예측을 건너뛴 플레이는 존재할 수 없다") 위반이므로 밸런스를 되돌려야 한다.
 */

import { describe, expect, test } from 'vitest';

import { buildTower, summonUnit, upgradeTower } from './actions';
import {
  BASE_HP,
  BASE_INCOME_PER_WAVE,
  HEAT_PER_TERRITORY,
  STARTING_GOLD,
  TOWER_BUILD_COST,
  TOWER_SLOTS,
  UNIT_COST,
  WAVE_COUNT,
  WAVE_DURATION_MS,
} from './constants';
import { createCombat, step } from './simulate';
import type { CombatParams, CombatState } from './types';

/**
 * PRD §9.3 기준 R1 필요지출 — 한 스테이지를 클리어하려면 써야 하는 골드 총량.
 * `[v1.4]` 2,700 → 2,130. 목표 ρ가 0으로 내려가면서 총골드가 같이 내려간 결과다.
 */
const R1_REQUIRED_SPEND = 2130;

/** 매매를 한 번도 하지 않았을 때 스테이지 전체에서 손에 들어오는 골드 총액. */
const NO_TRADE_GOLD = STARTING_GOLD + BASE_INCOME_PER_WAVE * WAVE_COUNT;

function r1Params(): CombatParams {
  return {
    waveCount: WAVE_COUNT,
    waveDurationMs: WAVE_DURATION_MS,
    towerSlots: TOWER_SLOTS,
    maxBaseHp: BASE_HP,
    heat: 1 + 0 * HEAT_PER_TERRITORY, // R1: 점령 지역 0개
    aumDropPerWave: 150,
    totalBaseIncome: BASE_INCOME_PER_WAVE * WAVE_COUNT,
  };
}

/**
 * 13웨이브를 끝까지 돌린다. **예산은 시작 시점에 전액 지급한 것으로 취급한다** — 실제로는
 * 기본 수입이 웨이브마다 나눠 들어오므로, 이 시뮬레이션은 플레이어에게 유리한 상한이다.
 * 여기서도 못 막으면 실제 플레이에서는 더 못 막는다.
 */
function runStage(build: (state: CombatState, gold: number, params: CombatParams) => { state: CombatState; gold: number }) {
  const params = r1Params();
  const initial = createCombat(params);
  const setup = build(initial, NO_TRADE_GOLD, params);

  let state = setup.state;
  const totalMs = WAVE_DURATION_MS * (WAVE_COUNT + 1);
  for (let elapsed = 0; elapsed < totalMs && state.phase === 'running'; elapsed += 250) {
    state = step(state, 250, params).state;
  }
  return { state, goldLeft: setup.gold };
}

describe('검산 4 — 매매 미실행 플레이의 골드 상한', () => {
  test('매매를 안 하면 스테이지 전체 골드는 315 G뿐이다 (시작 120 + 기본수입 15×13)', () => {
    expect(STARTING_GOLD).toBe(120);
    expect(BASE_INCOME_PER_WAVE).toBe(15);
    expect(NO_TRADE_GOLD).toBe(315);
  });

  test('그 315 G는 PRD §9.3 R1 필요지출(2,130 G)의 15%에 불과하다', () => {
    expect(NO_TRADE_GOLD).toBeLessThan(R1_REQUIRED_SPEND);
    expect(NO_TRADE_GOLD / R1_REQUIRED_SPEND).toBeLessThan(0.15);
  });

  test('315 G로는 6개 슬롯 중 2개만 채울 수 있다 (기본 포탑 120 G 기준)', () => {
    const affordableTowers = Math.floor(NO_TRADE_GOLD / TOWER_BUILD_COST.basic);
    expect(affordableTowers).toBe(2);
    expect(affordableTowers).toBeLessThan(TOWER_SLOTS);
  });

  test('시작 골드 120 G는 기본 포탑을 정확히 1기만 지을 수 있다 (FR-6.8-b 제약 유지)', () => {
    // "타워 최소 1기는 웨이브 1 이전에 반드시 건설 가능"은 지키되, 2기째 여유는 없다 —
    // 두 번째 타워 자금은 첫 청산 이익에서만 나온다.
    expect(STARTING_GOLD).toBeGreaterThanOrEqual(TOWER_BUILD_COST.basic);
    expect(STARTING_GOLD).toBeLessThan(TOWER_BUILD_COST.basic * 2);
  });
});

describe('검산 4 — 매매 미실행으로는 R1을 클리어할 수 없다 (시뮬레이션)', () => {
  /** 315 G 예산으로 짤 수 있는 대표 조합들. 전부 패배해야 한다. */
  const loadouts: ReadonlyArray<{
    readonly name: string;
    readonly build: (state: CombatState, gold: number, params: CombatParams) => { state: CombatState; gold: number };
  }> = [
    {
      name: '기본 포탑 2기 (240 G)',
      build: (state, gold, params) => {
        let s = state;
        let g = gold;
        for (const slot of [0, 1]) {
          const r = buildTower(s, slot, 'basic', g, params);
          s = r.state;
          g = r.gold;
        }
        return { state: s, gold: g };
      },
    },
    {
      name: '기본 + 대공 (240 G) — 공중 웨이브 대비',
      build: (state, gold, params) => {
        const a = buildTower(state, 0, 'basic', gold, params);
        const b = buildTower(a.state, 1, 'antiair', a.gold, params);
        return { state: b.state, gold: b.gold };
      },
    },
    {
      name: '기본 포탑 1기 Lv2 업그레이드 (300 G)',
      build: (state, gold, params) => {
        const a = buildTower(state, 0, 'basic', gold, params);
        const b = upgradeTower(a.state, 0, a.gold);
        return { state: b.state, gold: b.gold };
      },
    },
    {
      name: '기본 포탑 2기 + 인턴 2기 (300 G)',
      build: (state, gold, params) => {
        let s = state;
        let g = gold;
        for (const slot of [0, 1]) {
          const r = buildTower(s, slot, 'basic', g, params);
          s = r.state;
          g = r.gold;
        }
        for (let i = 0; i < 2; i += 1) {
          const r = summonUnit(s, 'intern', g);
          s = r.state;
          g = r.gold;
        }
        return { state: s, gold: g };
      },
    },
  ];

  for (const loadout of loadouts) {
    test(`${loadout.name} → 본진이 무너진다 (phase = defeated)`, () => {
      const { state, goldLeft } = runStage(loadout.build);

      expect(goldLeft).toBeGreaterThanOrEqual(0); // 예산을 초과해 산 것이 없다
      expect(goldLeft).toBeLessThan(TOWER_BUILD_COST.basic); // 남은 돈으로 타워를 더 못 짓는다
      expect(state.phase).toBe('defeated');
      expect(state.baseHp).toBe(0);
    });
  }

  test('인턴 소환 비용(30 G)까지 남김없이 털어도 결과는 같다 — 예산 자체가 부족하다', () => {
    const { state } = runStage((s, gold, params) => {
      let cur = s;
      let g = gold;
      const first = buildTower(cur, 0, 'basic', g, params);
      cur = first.state;
      g = first.gold;
      // 남은 195 G를 전부 인턴에 쏟는다(6기).
      while (g >= UNIT_COST.intern) {
        const r = summonUnit(cur, 'intern', g);
        if (!r.ok) break;
        cur = r.state;
        g = r.gold;
      }
      return { state: cur, gold: g };
    });

    expect(state.phase).toBe('defeated');
  });
});
