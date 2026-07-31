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

import type { CombatParams, CombatState, TowerKind, UnitKind } from '../combat';
import {
  AUM_DROP_PER_WAVE,
  BASE_HP,
  BASE_INCOME_PER_WAVE,
  HEAT_PER_TERRITORY,
  TOWER_SLOTS,
  WAVE_COUNT,
  WAVE_DURATION_MS,
  buildTower,
  castSkill,
  createCombat,
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

/** PRD §9.2 — 스테이지 시작 재화. */
export const STARTING_GOLD = 200;
export const STARTING_AUM = 2000;

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
  readonly goldGained: number;
}

/** 점령 지역 수. MVP 1지역만 있으므로 0 고정 (FR-6.7 heat / FR-6.8 운영비). */
const TERRITORIES = 0;

export class StageSession {
  readonly set: ChartSet;
  readonly replay: Replay;
  readonly params: PositionParams;
  readonly combatParams: CombatParams;

  private wallet: Wallet = { gold: STARTING_GOLD, aum: STARTING_AUM };
  private position: OpenPosition | null = null;
  private openCount = 0;
  private seq = 0;
  private pendingNotice: CloseNotice | null = null;
  private combat: CombatState;

  constructor(seed: number, speed: number, startAtMs: number) {
    this.set = generateChartSet(seed);
    this.replay = createReplay(this.set, { speed, startAtMs });
    this.params = { ...DEFAULT_POSITION_PARAMS, sigma: this.set.sigma30 };

    this.combatParams = {
      waveCount: WAVE_COUNT,
      // 배속을 올리면 차트와 전투가 같은 시계를 써야 한다 — 웨이브도 같이 짧아진다.
      waveDurationMs: WAVE_DURATION_MS / speed,
      towerSlots: TOWER_SLOTS,
      maxBaseHp: BASE_HP,
      heat: 1 + TERRITORIES * HEAT_PER_TERRITORY,
      aumDropPerWave: AUM_DROP_PER_WAVE,
      totalBaseIncome: BASE_INCOME_PER_WAVE * WAVE_COUNT - TERRITORIES * BASE_INCOME_PER_WAVE,
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

  useSkill(): void {
    const result = castSkill(this.combat, this.wallet.gold);
    if (!result.ok) {
      return;
    }
    this.combat = result.state;
    this.wallet = { ...this.wallet, gold: result.gold };
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
