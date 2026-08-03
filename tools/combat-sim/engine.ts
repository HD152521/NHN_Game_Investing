/**
 * 전투 시뮬레이터 엔진 — 스테이지 1판을 **헤드리스로 끝까지 방어**시켜 본다.
 *
 * ★ 왜 이 도구가 새로 필요했나 ★
 * `tools/bot-sim`은 **전투를 시뮬레이션하지 않는다.** 자기 주석에 명시돼 있듯 AUM 드롭과
 * 기본 수입을 "13웨이브 전멸 가정"으로 넣고 `totalGold >= requiredSpend`만 본다. 즉 v1.3·v1.4가
 * 맞춘 것은 전부 **경제 게이트**("필요지출만큼 벌 수 있는가")였고, **전투 게이트**("그 돈으로
 * 산 방어가 실제로 막는가")는 한 번도 측정된 적이 없다. `combatLoadPerGold`(8.41/9.48/11.00)도
 * 지역 간 **비율**일 뿐, 절대 난이도가 적정한지는 아무 것도 말하지 않는다.
 *
 * 그 공백에서 나온 실측 피드백이 "포탑만 만들어두면 그냥 다 이김"이다. 이 파일은 그 주장을
 * 재현 가능한 숫자로 만든다.
 *
 * ★ 판정 로직을 다시 구현하지 않는다 ★ (`bot-sim/engine.ts`와 같은 원칙)
 * 건설·소환·전투 진행은 전부 `src/combat`의 공개 함수(`buildTower`/`summonUnit`/`step`)를
 * 그대로 호출한다. 시뮬레이터가 자기 전투 규칙을 갖는 순간 게임이 아니라 시뮬레이터를
 * 검증하게 된다.
 *
 * ★ 예산은 **선지급**한다 — 방어자에게 유리한 상한 가정이다 ★
 * 실제로는 골드가 웨이브마다·청산마다 들어오므로 초반에는 이만큼 못 쓴다. 선지급 모델에서
 * **뚫리는 조합은 실제로는 더 크게 뚫리고**, 선지급으로도 막는 조합만 "막을 수 있다"고
 * 말할 수 있다. `economy-floor.test.ts`가 쓰는 것과 같은 가정이다.
 */

import {
  BASE_HP,
  STAGES,
  TOWER_BUILD_COST,
  TOWER_SLOTS,
  TOWER_UPGRADE_COST,
  UNIT_COST,
  WAVE_COUNT,
  WAVE_DURATION_MS,
  buildTower,
  createCombat,
  step,
  summonUnit,
  totalBaseIncome,
  totalGoldFor,
  upgradeTower,
} from '../../src/combat/index.js';
import type {
  CombatParams,
  CombatState,
  StageConfig,
  TowerKind,
  UnitKind,
} from '../../src/combat/index.js';

/** 시뮬레이션 틱(ms). `MAX_SUBSTEP_MS`와 같아 `step`이 내부에서 더 쪼개지 않는다. */
const TICK_MS = 250;

/**
 * 시계 상한. 13웨이브(390초) + 연장 3주기.
 *
 * 연장이 필요한 이유는 보스다 — 보스는 마지막 웨이브 시작과 함께 출발하지만 완주에 33초가
 * 걸리므로 웨이브 시계가 끝난 뒤에야 결판이 난다(`app/stage-flow.ts`가 실제 게임에서도
 * 전투를 연장에서 계속 돌린다).
 */
const MAX_MS = WAVE_DURATION_MS * (WAVE_COUNT + 3);

/** 한 판의 방어 계획. "무엇을 사서 어떻게 유지하는가"가 전부다. */
export interface Loadout {
  readonly id: string;
  readonly label: string;
  /** 슬롯 0번부터 순서대로 지을 타워. 길이가 곧 타워 수다(최대 `TOWER_SLOTS`). */
  readonly towers: readonly TowerKind[];
  /** 건설 후 남은 골드로 타워를 Lv2로 올릴지. 앞 슬롯부터 올린다. */
  readonly upgrade: boolean;
  /** 전투 중 계속 보충할 유닛 종류. `null`이면 유닛을 쓰지 않는다. */
  readonly unit: UnitKind | null;
  /** 동시에 유지할 유닛 수 상한. 골드를 스테이지 전체에 고르게 퍼뜨리는 장치다. */
  readonly unitCap: number;
}

export interface CombatSimResult {
  readonly cleared: boolean;
  /** 종료 시점 본진 HP. */
  readonly baseHpLeft: number;
  /** 본진이 **처음** 피해를 입은 웨이브(= 방어선이 처음 뚫린 지점). 무실점이면 `null`. */
  readonly firstBreachWave: number | null;
  /** 도달한 최대 웨이브. */
  readonly maxWave: number;
  /** 실제로 쓴 골드. */
  readonly goldSpent: number;
  /** 다 못 쓰고 남은 골드. */
  readonly goldLeft: number;
  /** 세운 타워 수 / 소환한 유닛 수. */
  readonly towersBuilt: number;
  readonly unitsSummoned: number;
  /** 보스를 잡았는가. 마지막까지 살아 있었으면 `false`. */
  readonly bossKilled: boolean;
  /**
   * 웨이브별 본진 실점(인덱스 0 = 웨이브 1).
   *
   * ★ 왜 필요한가 ★ 적 5종이 스탯을 갖게 되면서 웨이브마다 성격이 다르다
   * (`combat/constants.ts WAVE_GROUND_MIX`: 앞은 얇고 빠른 속공, 뒤는 두꺼운 탱커).
   * "타워 종류 선택이 결과를 가르는가"는 총 클리어 여부만 봐서는 알 수 없다 —
   * 어느 **구간**에서 덜 새는지를 봐야 광역이 속공 웨이브에서, 단일이 탱커 웨이브에서
   * 값을 한다는 설계 의도를 확인할 수 있다. `tower-axis.ts`가 이 배열을 구간별로 접는다.
   */
  readonly baseDamageByWave: readonly number[];
}

/** 스테이지 설정 → 전투 파라미터. 실제 셸(`app/session.ts`)과 같은 방식으로 만든다. */
export function paramsFor(stage: StageConfig): CombatParams {
  return {
    waveTable: stage.waveTable,
    waveCount: WAVE_COUNT,
    waveDurationMs: WAVE_DURATION_MS,
    towerSlots: TOWER_SLOTS,
    maxBaseHp: BASE_HP,
    // 지역 캐리오버가 없으므로 실제 런타임과 같이 heat = 1이다(`constants.ts` HEAT_PER_TERRITORY 주석).
    heat: 1,
    aumDropPerWave: 150,
    totalBaseIncome: totalBaseIncome(stage),
  };
}

/**
 * 이 로드아웃의 **고정 지출**(타워 건설 + 업그레이드). 예산이 모자라면 앞에서부터만 지어진다.
 * 유닛은 전투 중 흐름 지출이라 여기 포함되지 않는다.
 */
function buildPhase(
  state: CombatState,
  gold: number,
  params: CombatParams,
  loadout: Loadout,
): { state: CombatState; gold: number; built: number } {
  let current = state;
  let wallet = gold;
  let built = 0;

  for (let slot = 0; slot < loadout.towers.length && slot < TOWER_SLOTS; slot += 1) {
    const kind = loadout.towers[slot];
    if (kind === undefined || wallet < TOWER_BUILD_COST[kind]) {
      break;
    }
    const result = buildTower(current, slot, kind, wallet, params);
    if (!result.ok) {
      break;
    }
    current = result.state;
    wallet = result.gold;
    built += 1;
  }

  if (loadout.upgrade) {
    for (let slot = 0; slot < built; slot += 1) {
      const kind = loadout.towers[slot];
      if (kind === undefined || wallet < TOWER_UPGRADE_COST[kind]) {
        continue;
      }
      const result = upgradeTower(current, slot, wallet);
      if (result.ok) {
        current = result.state;
        wallet = result.gold;
      }
    }
  }

  return { state: current, gold: wallet, built };
}

/**
 * 한 판을 끝까지 돌린다.
 *
 * 유닛 보충 규칙: **전투 중이고, 살아 있는 유닛이 상한 미만이고, 골드가 있으면 한 체 소환**한다.
 * 이 규칙이 있어야 유닛 예산이 웨이브 1에 한꺼번에 증발하지 않고 스테이지 전체에 퍼진다 —
 * 유닛은 소모품이므로, 선지급 예산을 초반에 다 태우는 모델은 유닛 조합을 부당하게 불리하게 만든다.
 */
export function runCombat(stage: StageConfig, loadout: Loadout, budget: number): CombatSimResult {
  const params = paramsFor(stage);
  const setup = buildPhase(createCombat(params), budget, params, loadout);

  let state = setup.state;
  let gold = setup.gold;
  let unitsSummoned = 0;
  let firstBreachWave: number | null = null;
  let maxWave = 0;
  let bossSeen = false;
  const baseDamageByWave: number[] = Array.from({ length: WAVE_COUNT }, () => 0);

  for (let elapsed = 0; elapsed < MAX_MS && state.phase === 'running'; elapsed += TICK_MS) {
    if (loadout.unit !== null && state.prepRemainingMs <= 0 && state.units.length < loadout.unitCap) {
      const cost = UNIT_COST[loadout.unit];
      if (gold >= cost) {
        const result = summonUnit(state, loadout.unit, gold);
        if (result.ok) {
          state = result.state;
          gold = result.gold;
          unitsSummoned += 1;
        }
      }
    }

    const before = state.baseHp;
    const result = step(state, TICK_MS, params);
    state = result.state;

    if (state.baseHp < before) {
      if (firstBreachWave === null) {
        firstBreachWave = state.wave;
      }
      // 웨이브 0(준비 구간)에서는 스폰이 없으므로 실점도 없다 — 인덱스 방어만 해 둔다.
      const index = state.wave - 1;
      if (index >= 0 && index < baseDamageByWave.length) {
        baseDamageByWave[index] = (baseDamageByWave[index] ?? 0) + (before - state.baseHp);
      }
    }
    if (state.wave > maxWave) {
      maxWave = state.wave;
    }
    if (state.boss != null) {
      bossSeen = true;
    }
  }

  return {
    cleared: state.phase === 'cleared',
    baseHpLeft: state.baseHp,
    firstBreachWave,
    maxWave,
    goldSpent: budget - gold,
    goldLeft: gold,
    towersBuilt: setup.built,
    unitsSummoned,
    // 보스를 한 번이라도 봤고 끝에 없으면 잡은 것이다. 아예 못 본 경우(조기 패배)는 false.
    bossKilled: bossSeen && (state.boss ?? null) === null,
    baseDamageByWave,
  };
}

/** ρ=0(본전치기) 플레이가 손에 쥐는 골드 — 전투 예산의 기준선이다. */
export function budgetFor(stageId: keyof typeof STAGES, spendRatio: number): number {
  return Math.round(totalGoldFor(STAGES[stageId], 0) * spendRatio);
}
