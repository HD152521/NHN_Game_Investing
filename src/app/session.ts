/**
 * 스테이지 세션 상태 — 리플레이 · 지갑 · 포지션을 한 덩어리로 묶는다.
 *
 * 판정 로직 자체는 `src/position`(순수 함수)에 있다. 여기는 **상태 보관과 호출 순서만**
 * 책임진다. 이 분리를 지켜야 나중에 판정을 서버로 들어낼 때 이 파일만 얇게 바뀐다.
 *
 * ⚠️ 로컬 단독 실행이므로 지금은 클라이언트가 판정을 겸한다. 실제 배포에서는
 * `openTrade` / `closeTrade` / `syncLiquidation` 이 서버 왕복으로 바뀌어야 하며,
 * 그 전까지 블라인드 규칙(FR-4)은 강제되지 않는다.
 */

import type {
  CombatParams,
  CombatState,
  DeathEvent,
  SkillId,
  StageConfig,
  StageId,
  TowerKind,
  UnitKind,
} from '../combat';
import { STAGES, totalBaseIncome } from '../combat';

/** 사망이 없는 프레임이 공유하는 빈 목록. 프레임당 할당 0(PRD §11). */
const NO_DEATHS: readonly DeathEvent[] = Object.freeze([]);
import {
  AUM_DROP_PER_WAVE,
  BASE_HP,
  HEAT_PER_TERRITORY,
  TOWER_SLOTS,
  WAVE_COUNT,
  WAVE_DURATION_MS,
  buildTower,
  castSkill,
  createCombat,
  skillCooldownOf,
  skipPrep,
  step as stepCombat,
  summonUnit,
  upgradeTower,
} from '../combat';
import type { DepartmentLevels } from './departments';
import {
  baseDepartments,
  liquidationLineFor,
  tradeFeeRateFor,
  startingAumFor,
  towerDamageMultiplier,
  unitHpMultiplier,
} from './departments';
import type { ChartSet, Replay, ReplayState } from '../market';
import { createReplay, generateChartSet } from '../market';
import type { MarketConditions, WeatherKind, WeatherView } from '../weather';
import {
  activeEventAt,
  recentChangePct,
  resolveWeatherKind,
  weatherIntensity,
} from '../weather';
import type {
  ClosedPosition,
  Direction,
  OpenPosition,
  PositionEval,
  PositionParams,
  Wallet,
} from '../position';
import {
  DEFAULT_POSITION_PARAMS,
  addToPosition,
  closePosition,
  evaluatePosition,
  openPosition,
} from '../position';

/**
 * PRD §9.2 — 스테이지 시작 재화.
 *
 * 값을 여기 직접 쓰지 마라. `src/combat/stages.ts`의 `STAGES`가 단일 출처다 —
 * 예전에는 이 파일이 자체 상수(200/2000)를 들고 있어서, 밸런스 상수를 고쳐도
 * 런타임은 계속 옛 값을 읽는 이중 출처 상태였다.
 *
 * ⚠️ 아래 두 상수는 **R1 값의 별칭**이다. 지역 선택(`region-select.ts`)이 붙은 뒤로
 * 세션의 실제 시작 재화는 고른 지역의 `StageConfig`에서 온다 — 마크업의 HUD 초기값처럼
 * "세션이 아직 없을 때 보여줄 자리값"으로만 써라.
 */
export const DEFAULT_STAGE_ID: StageId = 'R1';
export const STARTING_GOLD = STAGES[DEFAULT_STAGE_ID].startingGold;
export const STARTING_AUM = STAGES[DEFAULT_STAGE_ID].startingAum;

export interface SessionSnapshot {
  readonly wallet: Wallet;
  readonly position: OpenPosition | null;
  readonly evaluation: PositionEval | null;
  readonly openCount: number;
  readonly maxPositions: number;
  /** 청산선까지 남은 거리(σ 단위). 미보유면 0. */
  readonly distanceToLiquidation: number;
}

/** 방금 일어난 청산을 UI가 한 번만 연출할 수 있도록 물고 있는 큐. */
export interface CloseNotice {
  readonly position: ClosedPosition;
  /**
   * 골드로 넘어간 금액 = `floor(max(원금 + 손익, 0) × GOLD_CONVERSION)` (FR-5.7).
   * **AUM 복귀분은 존재하지 않는다** — 청산은 AUM을 늘리지 않으므로 알릴 것이 없다.
   */
  readonly goldGained: number;
}

/**
 * 점령 지역 수의 기본값 (FR-6.7 heat).
 *
 * 예전에는 `const TERRITORIES = 0` 고정이었다 — 진행도 저장이 없어 어느 지역을 클리어했는지
 * 알 수 없었고, 그래서 `HEAT_PER_TERRITORY`가 코드에만 있고 **런타임 효과가 0**이었다.
 * 이제 셸이 `progress.ts`에서 읽은 점령 수를 생성자로 주입한다.
 *
 * ⚠️ **heat가 살아나면 난이도가 실제로 올라간다.** `heat = 1 + 점령 수 × 0.04`이므로
 * 2지역 점령 후에는 적 HP가 8% 높아진 판을 만난다. 의도된 설계지만(뒤로 갈수록 압력이
 * 커진다), 밸런스를 측정할 때는 **어느 점령 수에서 잰 값인지**를 함께 적어야 한다.
 * 시뮬레이터 2종은 점령 0을 가정한다.
 */
const DEFAULT_TERRITORIES = 0;

export class StageSession {
  readonly set: ChartSet;
  readonly replay: Replay;
  readonly params: PositionParams;
  readonly combatParams: CombatParams;
  /** 이 세션이 굴리는 지역의 밸런스 설정. 시작 재화·웨이브 테이블의 단일 출처다. */
  readonly stage: StageConfig;

  private wallet: Wallet;
  private position: OpenPosition | null = null;
  private openCount = 0;
  private seq = 0;
  private pendingNotice: CloseNotice | null = null;
  private combat: CombatState;
  /**
   * 직전 프레임의 사망 이벤트. **상태가 아니라 프레임 버퍼**다 — 매 `stepCombatFrame`에서
   * 통째로 교체되고, 전투가 끝나면 빈 목록으로 되돌아간다.
   */
  private lastDeaths: readonly DeathEvent[] = NO_DEATHS;

  /**
   * ── 날씨 판정의 시간축 상태 (`stepWeather`가 소유한다) ──────────
   *
   * 판정 자체는 `src/weather`(순수 함수)가 전부 한다. 다만 정전(WX-04)은 **직전 종류**와
   * **정지 구간이 시작된 뒤 지난 프레임 수**라는 두 개의 시간축 입력을 요구하는데,
   * 순수 함수는 시계를 가질 수 없으므로 그 둘을 들고 있는 자리가 필요하다. 여기가 그 자리다.
   *
   * ⚠️ `haltedFrames`는 "정전이 보이는 동안"이 아니라 **정지 구간 전체**를 센다.
   *    정전이 3프레임 뒤 다른 날씨로 넘어갈 때 카운터를 되돌리면 정지가 이어지는 내내
   *    3프레임마다 정전이 재점멸한다 (`weather/resolve.ts` 머리말).
   */
  private weatherKind: WeatherKind = 'clear';
  private haltedFrames = 0;

  /**
   * FR-8.1 정산 분모 — **총 획득 골드**.
   *
   * 시작 골드(FR-6.8-b가 명시적으로 포함하라고 못박은 값) + 웨이브 기본 수입 + 청산 대금.
   * 골드가 들어오는 경로는 이 셋뿐이므로(FR-5.7) 여기 세 군데만 더하면 총액이 확정된다.
   */
  private goldEarned: number;
  /** 총 청산 수 / 그중 `pnl > 0`인 수 — FR-8.1 적중률과 `aumGate`의 입력이다. */
  private closeCount = 0;
  private profitCloseCount = 0;
  /**
   * 이번 스테이지의 청산 기록 전부 (FR-9.2 공개 연출 4단계).
   *
   * 예전에는 `closeCount`/`profitCloseCount` **스칼라 두 개만** 남겼다. 정산에는 그것으로
   * 충분했지만, "내가 어떻게 매매했는지"를 차트 위에 되짚어 보여주려면 진입·청산 시각과
   * 가격이 필요하다 — 집계에서는 복원할 수 없다.
   *
   * 진입 24회가 상한이라(`maxPositions`) 배열이 무한정 자라지 않는다.
   */
  private readonly closes: ClosedPosition[] = [];

  /** 진입 시점에 확정된 부서 레벨. 세션이 도는 동안 바뀌지 않는다 (FR-11 스냅샷 요구). */
  private readonly departments: DepartmentLevels;

  /**
   * @param stageId 플레이할 지역. 생략하면 R1 — 지역 선택 화면이 붙기 전 호출부와
   *   테스트가 그대로 동작하도록 남긴 기본값이다.
   */
  constructor(
    seed: number,
    speed: number,
    startAtMs: number,
    stageId: StageId = DEFAULT_STAGE_ID,
    /** 이미 점령한 지역 수 (FR-6.7 heat). 셸이 `clearedCount(progress)`를 넘긴다. */
    territories: number = DEFAULT_TERRITORIES,
    /**
     * 부서 레벨 (FR-11). 셸이 `progress.departments`를 넘긴다.
     *
     * ★ 진입 시점에 한 번 받아 세션이 물고 있는다 ★ PRD가 "진입 시점에 확정된 파라미터
     * 스냅샷(중간에 부서 업글해도 영향 없게)"을 명시한다(§DB 스키마 주석). 세션이 매번
     * 저장소를 다시 읽으면 그 보장이 깨진다.
     */
    departments: DepartmentLevels = baseDepartments(),
  ) {
    const stage = STAGES[stageId];
    this.stage = stage;
    this.set = generateChartSet(seed);
    this.replay = createReplay(this.set, { speed, startAtMs });
    this.departments = departments;
    // 법무팀이 강제 청산선을 완화한다 (FR-11.2 · O-8).
    this.params = {
      ...DEFAULT_POSITION_PARAMS,
      sigma: this.set.sigma30,
      liquidationLine: liquidationLineFor(departments),
      /*
       * ★ 법무팀의 두 번째 축 — 수수료 감면 (§16-6) ★
       * 청산선 완화만으로는 **손절을 익힌 플레이어에게 효과가 정확히 0**이었다(실측:
       * 강제청산율 0%면 청산선이 손익식에 등장하지 않는다). 수수료는 `Σstake × feeRate`라
       * 손절 여부와 무관하게 발생하므로, 실력이 늘어도 값이 남는다.
       * ⚠️ 이 줄이 없으면 `tradeFeeRateFor`가 트리셰이킹으로 통째로 빠진다(§19-5).
       */
      feeRate: tradeFeeRateFor(departments),
    };
    // 트레이딩 데스크가 시작 AUM을 더한다 (지역 기본값 위에 얹힌다).
    this.wallet = { gold: stage.startingGold, aum: startingAumFor(stageId, departments) };
    this.goldEarned = stage.startingGold;

    this.combatParams = {
      // ★ 지역 난이도가 실제로 반영되는 지점 ★ 생략하면 `DEFAULT_WAVE_TABLE`(=R1)이라
      // R2·R3를 골라도 조용히 R1 난이도가 걸린다.
      waveTable: stage.waveTable,
      waveCount: WAVE_COUNT,
      // 배속을 올리면 차트와 전투가 같은 시계를 써야 한다 — 웨이브도 같이 짧아진다.
      waveDurationMs: WAVE_DURATION_MS / speed,
      towerSlots: TOWER_SLOTS,
      maxBaseHp: BASE_HP,
      // 음수·NaN이 새면 heat가 1 미만이 되어 난이도가 조용히 내려간다 — 하한을 건다.
      heat: 1 + Math.max(0, territories) * HEAT_PER_TERRITORY,
      aumDropPerWave: AUM_DROP_PER_WAVE,
      totalBaseIncome: totalBaseIncome(stage),
    };
    this.combat = createCombat(this.combatParams);
  }

  get combatState(): CombatState {
    return this.combat;
  }

  /**
   * 직전 `stepCombatFrame`에서 죽은 개체들 (사망 연출용, FR-6 연출).
   *
   * 전투 상태가 아니라 **이벤트**라서 `CombatState`에 담기지 않는다(`combat/types.ts`
   * `DeathEvent` 주석). 셸이 한 프레임 동안만 들고 있다가 렌더러에 넘긴다.
   */
  get lastCombatDeaths(): readonly DeathEvent[] {
    return this.lastDeaths;
  }

  /**
   * 전투를 한 프레임 진행하고 벌어들인 재화를 지갑에 반영한다.
   *
   * ★ AUM이 늘어나는 **유일한** 경로가 여기다 ★ 청산(`settle`)은 AUM을 되돌리지 않으므로
   * (FR-5.7), 적 처치 드롭(FR-6.8-a)이 끊기면 매매 실탄도 같이 끊긴다.
   * 골드는 웨이브 기본 수입과 청산 대금 두 경로뿐이며, 여기서 AUM을 골드로 바꾸는 일은 없다.
   */
  stepCombatFrame(dtMs: number): void {
    if (this.combat.phase !== 'running') {
      this.lastDeaths = NO_DEATHS;
      return;
    }

    const result = stepCombat(this.combat, dtMs, this.combatParams);
    this.combat = result.state;
    // 사망 연출은 **이번 프레임에만** 유효한 신호다. 다음 프레임에 같은 배열을 다시
    // 넘기면 같은 시체가 계속 다시 태어난다 — 그래서 매 호출 통째로 교체한다.
    this.lastDeaths = result.events.deaths;

    const { aumDropped, goldIncome } = result.events;
    if (aumDropped > 0 || goldIncome > 0) {
      this.wallet = {
        gold: this.wallet.gold + goldIncome,
        aum: this.wallet.aum + aumDropped,
      };
      this.goldEarned += goldIncome;
    }
  }

  /**
   * 이번 프레임의 날씨(= 시장 상태 표시)를 판정한다. **프레임당 정확히 한 번** 불러야 한다.
   *
   * ★ 왜 세션이 이걸 하는가 ★ 날씨는 "차트 → 화면"을 잇는 네 갈래 중 하나이고, 그 입력
   *   (`bars` · `sigma30` · `events`)은 전부 이 세션이 들고 있는 `ChartSet`에 있다. 전장
   *   렌더러는 시장 지표를 알면 안 되므로(§17-2 경계 규칙), 지표를 `WeatherView`로 바꾸는
   *   일은 차트를 소유한 쪽이 해야 한다. 판정 규칙 자체는 한 줄도 여기 없다 —
   *   전부 `src/weather`의 순수 함수 호출이며, 이 메서드는 **호출 순서와 시간축 상태**만 맡는다.
   *
   * ⚠️ 이 배선이 오래 비어 있었다 (§19-5). `src/weather`와 `src/battle/draw-weather-*`가
   *   양쪽 다 구현·테스트를 끝냈는데도 셸이 잇지 않아, 트리셰이킹으로 통째로 빠진 채
   *   **게임 중 날씨가 한 번도 뜨지 않았다.** 테스트는 모듈을 직접 import하므로 전부 통과했다.
   *
   * @param state         리플레이 상태. 필드를 손으로 옮겨 적지 않고 통째로 받는다 (§19-10).
   * @param halted        거래가 멈춰 있는가 → WX-04 정전. 합성 차트에는 서킷브레이커가
   *                      없으므로, 실제로 매매가 잠기는 유일한 구간인 **장 마감**을 셸이
   *                      넘긴다. 정전은 3프레임 상한이라 마감 순간 한 번 번쩍이고 끝난다.
   * @param reducedMotion `prefers-reduced-motion`. 모션만 멈추고 **시장 상태 정보(색)는
   *                      그대로 남는다** — 날씨는 장식이 아니므로 (`weather/signature.ts`).
   */
  stepWeather(state: ReplayState, halted: boolean, reducedMotion: boolean): WeatherView {
    const conditions: MarketConditions = {
      recentChangePct: recentChangePct(this.set.bars, state.barIndex),
      sigma30: this.set.sigma30,
      halted,
      event: activeEventAt(this.set.events, state.elapsedMs),
    };

    const kind = resolveWeatherKind(conditions, this.weatherKind, this.haltedFrames);
    // 카운터는 **판정 뒤에** 움직인다. 정지가 시작된 첫 프레임은 `haltedFrames === 0`이어야
    // `resolveWeatherKind`가 "새 정지"로 보고 반드시 한 번 번쩍인다.
    this.haltedFrames = halted ? this.haltedFrames + 1 : 0;
    this.weatherKind = kind;

    return {
      kind,
      intensity: weatherIntensity(conditions, kind),
      // 재생 시각을 쓴다 — 배속을 올리면 시장이 빨리 흐르는 만큼 날씨도 같이 빨라진다.
      // 발판 맥동(`drawBattle`의 `timeMs`)이 이미 같은 시계를 쓰고 있어 연출이 어긋나지 않는다.
      timeMs: state.elapsedMs,
      reducedMotion,
    };
  }

  /** FR-8.1 정산에 필요한 누적 수치. 계산은 `src/app/settlement.ts`가 한다. */
  get settlementFacts(): {
    readonly totalGoldEarned: number;
    readonly closeCount: number;
    readonly profitCloseCount: number;
  } {
    return {
      totalGoldEarned: this.goldEarned,
      closeCount: this.closeCount,
      profitCloseCount: this.profitCloseCount,
    };
  }

  /**
   * 청산 기록 전부 — 공개 연출이 차트 위에 되짚어 그릴 원본이다.
   *
   * 내부 배열을 그대로 넘기지 않는다(불변 규율). 호출부가 밀어 넣으면 세션 상태가
   * 조용히 오염된다.
   */
  get closedPositions(): readonly ClosedPosition[] {
    return [...this.closes];
  }

  /** 다음 웨이브까지 남은 준비 시간(ms). 0이면 교전 중이다 (HUD 카운트다운용). */
  get prepRemainingMs(): number {
    return this.combat.prepRemainingMs;
  }

  /** 준비 시간을 즉시 끝낸다 (Space). 준비 구간이 아니면 아무 일도 일어나지 않는다. */
  skipPrep(): void {
    this.combat = skipPrep(this.combat);
  }

  /**
   * ★ 세 액션 모두 **성공 여부를 돌려준다** ★
   *
   * 예전에는 `void`였다. 골드가 모자라 조용히 실패해도 셸은 성공 로그를 찍었고
   * (CLICK-PATH-003), 화면은 있지도 않은 지출을 사실로 말했다. `useSkill`이 이미
   * 불리언을 돌려주고 셸이 그것만 믿는 구조였으니, 나머지 셋을 같은 계약으로 맞춘다.
   */
  build(slot: number, kind: TowerKind): boolean {
    const result = buildTower(
      this.combat,
      slot,
      kind,
      this.wallet.gold,
      this.combatParams,
      towerDamageMultiplier(this.departments),
    );
    if (!result.ok) {
      return false;
    }
    this.combat = result.state;
    this.wallet = { ...this.wallet, gold: result.gold };
    return true;
  }

  upgrade(slot: number): boolean {
    const result = upgradeTower(this.combat, slot, this.wallet.gold);
    if (!result.ok) {
      return false;
    }
    this.combat = result.state;
    this.wallet = { ...this.wallet, gold: result.gold };
    return true;
  }

  summon(kind: UnitKind): boolean {
    const result = summonUnit(this.combat, kind, this.wallet.gold, unitHpMultiplier(this.departments));
    if (!result.ok) {
      return false;
    }
    this.combat = result.state;
    this.wallet = { ...this.wallet, gold: result.gold };
    return true;
  }

  /**
   * 스킬을 시전한다 (FR-6.6). 성공 여부를 돌려준다 — 셸이 이펙트를 재생할지 판단해야 한다.
   *
   * ★ AUM이 지갑에서 빠지는 유일한 전투 경로가 여기다 ★
   * `castSkill`은 순수 계산기라 "시전 후 잔액"만 돌려준다(전투는 지갑을 모른다).
   * 골드든 AUM이든 **지갑에 반영하는 곳은 이 메서드 한 곳뿐**이며, 그래서 두 재화가
   * 정확히 같은 경로를 탄다 — `S-03`만 특별 취급하는 분기가 어디에도 없다.
   */
  useSkill(id: SkillId): boolean {
    const result = castSkill(this.combat, id, this.wallet.gold, this.wallet.aum);
    if (!result.ok) {
      return false;
    }
    this.combat = result.state;
    this.wallet = { gold: result.gold, aum: result.aum };
    return true;
  }

  /** 스킬 버튼의 남은 쿨다운(ms). 0이면 시전 가능 상태다. */
  skillCooldownMs(id: SkillId): number {
    return skillCooldownOf(this.combat, id);
  }

  /** 지갑 잔액 스냅샷 — 버튼 활성 판정용(포지션 평가 없이 읽고 싶을 때). */
  get walletSnapshot(): Wallet {
    return this.wallet;
  }

  /**
   * 청산선까지 남은 거리를 σ 단위로 환산한다.
   *
   * 청산은 `r ≤ −liqLine`에서 걸리고 `r = B × z`이므로, 임계 z는 `−liqLine / B`다.
   * 따라서 남은 거리 = `z − (−liqLine / B)`. 0 아래로는 내려가지 않게 자른다.
   */
  private distanceFor(evaluation: PositionEval, liqLine: number): number {
    const thresholdZ = -liqLine / this.params.payoutBase;
    return Math.max(0, evaluation.z - thresholdZ);
  }

  snapshot(elapsedMs: number): SessionSnapshot {
    const position = this.position;
    if (!position) {
      return {
        wallet: this.wallet,
        position: null,
        evaluation: null,
        openCount: this.openCount,
        maxPositions: this.params.maxPositions,
        distanceToLiquidation: 0,
      };
    }

    const evaluation = evaluatePosition(position, this.replay.priceAt(elapsedMs), this.params);
    return {
      wallet: this.wallet,
      position,
      evaluation,
      openCount: this.openCount,
      maxPositions: this.params.maxPositions,
      distanceToLiquidation: this.distanceFor(evaluation, position.liqLine),
    };
  }

  /**
   * 강제 청산 감시. 매 프레임 불린다.
   *
   * 서버 이관 시 이 판정은 서버가 소유해야 한다 — 클라이언트가 청산을 미루면
   * 손실 상한이 무너지기 때문이다 (FR-5.6).
   */
  syncLiquidation(elapsedMs: number): void {
    const position = this.position;
    if (!position) {
      return;
    }

    const price = this.replay.priceAt(elapsedMs);
    const evaluation = evaluatePosition(position, price, this.params);
    if (evaluation.liquidated) {
      this.settle(price, elapsedMs, 'liquidated');
    }
  }

  openTrade(direction: Direction, stakeRatio: number, elapsedMs: number): void {
    const result = openPosition({
      wallet: this.wallet,
      existingPosition: this.position,
      openCount: this.openCount,
      direction,
      stakeRatio,
      openPrice: this.replay.priceAt(elapsedMs),
      openAtMs: elapsedMs,
      seq: this.seq,
      params: this.params,
    });

    if (!result.ok) {
      return; // 버튼이 이미 비활성이므로 사용자에게 다시 알릴 것이 없다.
    }

    this.position = result.position;
    this.wallet = result.wallet;
    this.openCount += 1;
    this.seq += 1;
  }

  /**
   * 추가 매수 (물타기·불타기).
   *
   * 평균 단가가 움직이면 강제 청산선도 함께 밀린다 — 이건 부작용이 아니라 설계 목적이다.
   * 대신 여기 들어간 AUM은 골드로 바꿔 타워를 세울 수 있었던 자원이므로,
   * 버티는 대가로 방어가 얇아진다. 이 트레이드오프가 매매와 전투를 맞물리게 한다.
   */
  addTrade(stakeRatio: number, elapsedMs: number): void {
    const result = addToPosition({
      wallet: this.wallet,
      position: this.position,
      openCount: this.openCount,
      stakeRatio,
      price: this.replay.priceAt(elapsedMs),
      atMs: elapsedMs,
      params: this.params,
    });

    if (!result.ok) {
      return;
    }

    this.position = result.position;
    this.wallet = result.wallet;
    this.openCount += 1;
  }

  /** 추가 매수가 가능한 상태인가 (버튼 활성 판정용). */
  canAdd(): boolean {
    return (
      this.position !== null && this.openCount < this.params.maxPositions && this.wallet.aum > 0
    );
  }

  /** 현재 재생 시각의 가격. UI가 평균 단가와 나란히 보여준다. */
  priceAt(elapsedMs: number): number {
    return this.replay.priceAt(elapsedMs);
  }

  closeTrade(elapsedMs: number): void {
    this.settle(this.replay.priceAt(elapsedMs), elapsedMs, 'manual');
  }

  /** 스테이지가 끝날 때 열려 있던 포지션을 정리한다 (FR-8.1). */
  closeAtStageEnd(elapsedMs: number): void {
    if (this.position) {
      this.settle(this.replay.priceAt(elapsedMs), elapsedMs, 'stage_end');
    }
  }

  private settle(price: number, elapsedMs: number, reason: 'manual' | 'liquidated' | 'stage_end'): void {
    const result = closePosition({
      wallet: this.wallet,
      position: this.position,
      closePrice: price,
      closeAtMs: elapsedMs,
      reason,
      params: this.params,
    });

    if (!result.ok) {
      return; // MIN_HOLD_NOT_MET 등 — 버튼 비활성으로 이미 막고 있다.
    }

    this.wallet = result.result.wallet;
    this.position = null;
    this.goldEarned += result.result.goldGained;
    this.closeCount += 1;
    // 공개 연출(FR-9.2 4단계)이 차트 위에 되짚어 그릴 원본이다. 집계값만으로는
    // "언제 어느 가격에 들어가 언제 나왔는지"를 복원할 수 없어 기록 자체를 남긴다.
    // push는 청산 시점에만 일어나므로 프레임당 할당 0 규율을 깨지 않는다.
    this.closes.push(result.result.position);
    if (result.result.position.pnl > 0) {
      this.profitCloseCount += 1;
    }
    this.pendingNotice = {
      position: result.result.position,
      goldGained: result.result.goldGained,
    };
  }

  /** 청산 연출을 한 번만 소비한다. */
  takeNotice(): CloseNotice | null {
    const notice = this.pendingNotice;
    this.pendingNotice = null;
    return notice;
  }

  /** 수동 청산이 가능한 시점인가 (FR-5.11 최소 보유 시간). */
  canCloseAt(elapsedMs: number): boolean {
    const position = this.position;
    return position !== null && elapsedMs - position.openAtMs >= this.params.minHoldMs;
  }

  canOpen(): boolean {
    return this.position === null && this.openCount < this.params.maxPositions && this.wallet.aum > 0;
  }
}
