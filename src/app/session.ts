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
  SkillId,
  StageConfig,
  StageId,
  TowerKind,
  UnitKind,
} from '../combat';
import { STAGES, totalBaseIncome } from '../combat';
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
import type { ChartSet, Replay } from '../market';
import { createReplay, generateChartSet } from '../market';
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
  /** 골드로 넘어간 금액. **이익분만**이며 원금은 포함하지 않는다 (FR-5.7). */
  readonly goldGained: number;
  /** AUM으로 복귀한 금액. `(원금 + 손실) × REFUND_RATIO`. 강제 청산 시 0. */
  readonly aumReturned: number;
}

/**
 * 점령 지역 수. 0 고정 (FR-6.7 heat / FR-6.8 운영비).
 *
 * 지역 선택이 생겨 R1~R3를 자유롭게 고를 수 있게 됐지만, **점령(진행도) 저장은 아직 없다** —
 * 어느 지역을 이미 클리어했는지 알 수 없으므로 heat는 항상 1이다.
 * TODO: 진행도 저장이 붙으면 클리어한 지역 수를 여기 주입한다.
 */
const TERRITORIES = 0;

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
   * @param stageId 플레이할 지역. 생략하면 R1 — 지역 선택 화면이 붙기 전 호출부와
   *   테스트가 그대로 동작하도록 남긴 기본값이다.
   */
  constructor(seed: number, speed: number, startAtMs: number, stageId: StageId = DEFAULT_STAGE_ID) {
    const stage = STAGES[stageId];
    this.stage = stage;
    this.set = generateChartSet(seed);
    this.replay = createReplay(this.set, { speed, startAtMs });
    this.params = { ...DEFAULT_POSITION_PARAMS, sigma: this.set.sigma30 };
    this.wallet = { gold: stage.startingGold, aum: stage.startingAum };

    this.combatParams = {
      // ★ 지역 난이도가 실제로 반영되는 지점 ★ 생략하면 `DEFAULT_WAVE_TABLE`(=R1)이라
      // R2·R3를 골라도 조용히 R1 난이도가 걸린다.
      waveTable: stage.waveTable,
      waveCount: WAVE_COUNT,
      // 배속을 올리면 차트와 전투가 같은 시계를 써야 한다 — 웨이브도 같이 짧아진다.
      waveDurationMs: WAVE_DURATION_MS / speed,
      towerSlots: TOWER_SLOTS,
      maxBaseHp: BASE_HP,
      heat: 1 + TERRITORIES * HEAT_PER_TERRITORY,
      aumDropPerWave: AUM_DROP_PER_WAVE,
      totalBaseIncome: totalBaseIncome(stage),
    };
    this.combat = createCombat(this.combatParams);
  }

  get combatState(): CombatState {
    return this.combat;
  }

  /**
   * 전투를 한 프레임 진행하고 벌어들인 재화를 지갑에 반영한다.
   *
   * AUM은 적 처치 드롭으로만 늘어난다(FR-6.8-a). 골드는 웨이브 기본 수입과
   * 매매 순이익 두 경로뿐이다 — 여기서 AUM을 골드로 바꾸는 일은 절대 없다.
   */
  stepCombatFrame(dtMs: number): void {
    if (this.combat.phase !== 'running') {
      return;
    }

    const result = stepCombat(this.combat, dtMs, this.combatParams);
    this.combat = result.state;

    const { aumDropped, goldIncome } = result.events;
    if (aumDropped > 0 || goldIncome > 0) {
      this.wallet = {
        gold: this.wallet.gold + goldIncome,
        aum: this.wallet.aum + aumDropped,
      };
    }
  }

  /** 다음 웨이브까지 남은 준비 시간(ms). 0이면 교전 중이다 (HUD 카운트다운용). */
  get prepRemainingMs(): number {
    return this.combat.prepRemainingMs;
  }

  /** 준비 시간을 즉시 끝낸다 (Space). 준비 구간이 아니면 아무 일도 일어나지 않는다. */
  skipPrep(): void {
    this.combat = skipPrep(this.combat);
  }

  build(slot: number, kind: TowerKind): void {
    const result = buildTower(this.combat, slot, kind, this.wallet.gold, this.combatParams);
    if (!result.ok) {
      return;
    }
    this.combat = result.state;
    this.wallet = { ...this.wallet, gold: result.gold };
  }

  upgrade(slot: number): void {
    const result = upgradeTower(this.combat, slot, this.wallet.gold);
    if (!result.ok) {
      return;
    }
    this.combat = result.state;
    this.wallet = { ...this.wallet, gold: result.gold };
  }

  summon(kind: UnitKind): void {
    const result = summonUnit(this.combat, kind, this.wallet.gold);
    if (!result.ok) {
      return;
    }
    this.combat = result.state;
    this.wallet = { ...this.wallet, gold: result.gold };
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
    this.pendingNotice = {
      position: result.result.position,
      goldGained: result.result.goldGained,
      aumReturned: result.result.aumReturned,
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
