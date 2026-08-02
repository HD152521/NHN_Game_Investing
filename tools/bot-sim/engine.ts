/**
 * 세션 실행 엔진 — 봇 1개 × 차트 1개를 스테이지 1회 끝까지 돌린다.
 *
 * ★ 판정 로직을 절대 다시 구현하지 않는다 ★
 * 진입·추가·청산·평가는 전부 `src/position`의 공개 함수를 그대로 호출한다. 시뮬레이터가
 * 손익 공식을 자기 버전으로 갖는 순간 "게임을 검증한 것"이 아니라 "시뮬레이터를 검증한 것"이
 * 되어버린다. 이 파일은 시계를 돌리고 봇의 결정을 그 함수들에 넘기는 배관일 뿐이다.
 *
 * ★ 봉 단위로 강제 청산을 확인해도 되는 이유 ★
 * `createReplay`의 가격 경로는 봉 종가들을 잇는 **구간별 선형** 함수다. 포지션이 열려 있는
 * 동안 `openPrice`는 고정이므로 `r`은 가격의 단조 함수이고, 따라서 한 봉 구간 안에서 `r`의
 * 최소값은 항상 구간의 양 끝점 중 하나에서 나온다. 즉 매 봉 종가에서만 확인해도
 * **청산선 교차를 하나도 놓치지 않는다**(중간에 스쳤다가 돌아오는 경우가 존재할 수 없다).
 *
 * ★ 그러나 청산 **가격**은 봉 종가가 아니라 교차점이어야 한다 ★
 * 실제 게임은 매 프레임(약 60fps) `syncLiquidation`을 돌리므로 `r`이 −`liqLine`에 닿는
 * **바로 그 가격**에서 청산된다. 시뮬레이터가 봉 종가로 청산하면 청산선을 지나친 가격이
 * 쓰이는데, `pnl`은 −stake로 바닥이 잡혀 있으므로(FR-5.6) 그 초과분이 **공짜 이익**이 된다.
 * 실측에서 이 편향만으로 동전 던지기 봇의 ρ가 +2%p 넘게 부풀었다. 그래서 청산 시에는
 * 교차 가격·교차 시각을 선형 보간으로 역산해 실제 게임과 같은 지점에서 정산한다.
 */

import {
  AUM_DROP_PER_WAVE,
  WAVE_DURATION_MS,
  totalBaseIncome,
  type StageConfig,
} from '../../src/combat/index.js';
import type { ChartSet } from '../../src/market/index.js';
import { BARS_PER_DAY, MS_PER_BAR, createReplay } from '../../src/market/index.js';
import type { OpenPosition, PositionParams, Wallet } from '../../src/position/index.js';
import {
  DEFAULT_POSITION_PARAMS,
  addToPosition,
  closePosition,
  evaluatePosition,
  openPosition,
} from '../../src/position/index.js';
import type { BotContext, BotStrategy, SessionResult, TradeRecord } from './types.js';

/**
 * 웨이브 1개 길이에 해당하는 봉 수 (30_000ms / 1_000ms = 30봉).
 * 스테이지 총 길이 390봉 = 13웨이브 × 30봉으로 정확히 나눠떨어진다.
 */
const BARS_PER_WAVE = WAVE_DURATION_MS / MS_PER_BAR;

/**
 * 봉 1개마다 들어오는 AUM 드롭(= 150 / 30 = 5).
 *
 * 실제 게임에서 드롭은 적 처치 시점마다 발생하므로(FR-6.8-a) 웨이브 동안 흩어져 들어온다.
 * 여기서는 그것을 균등 분배로 근사한다. 총액은 `AUM_DROP_PER_WAVE × 13 = 1,950`으로
 * `sessionTotalStake()`와 정확히 일치한다.
 *
 * ⚠️ 이 근사는 **13웨이브를 전부 전멸시킨 완벽한 방어**를 가정한다 — `sessionTotalStake()`의
 * 주석이 명시한 것과 같은 상한 가정이다. 방어가 무너지면 실제 S는 이보다 작아지므로,
 * 이 시뮬레이터의 클리어율은 **낙관적 상한**이다.
 */
const AUM_DROP_PER_BAR = AUM_DROP_PER_WAVE / BARS_PER_WAVE;

export interface SessionInput {
  readonly stage: StageConfig;
  readonly set: ChartSet;
  readonly strategy: BotStrategy;
  /** 봇 내부 난수의 시드. 차트 시드와 분리해야 같은 차트에 여러 봇을 붙일 수 있다. */
  readonly botRng: () => number;
}

/** 세션 진행 중 변하는 상태를 한 곳에 모은다. */
interface SessionState {
  wallet: Wallet;
  position: OpenPosition | null;
  openCount: number;
  seq: number;
  totalStake: number;
  totalPnl: number;
  goldFromTrades: number;
}

/**
 * 세션 1회를 끝까지 돌리고 결과를 낸다.
 *
 * 골드 수입은 두 갈래다 — 웨이브 기본 수입(`totalBaseIncome`)과 청산 대금. 전투 시뮬레이션은
 * 돌리지 않으므로 기본 수입은 전액 획득을 가정하고 마지막에 한 번 더한다(AUM 드롭과 같은
 * "완벽한 방어" 가정이며, 두 가정 모두 봇에게 유리한 쪽이다).
 */
export function runSession(input: SessionInput): SessionResult {
  const { stage, set, strategy } = input;
  const replay = createReplay(set, { speed: 1, startAtMs: 0 });
  const params: PositionParams = { ...DEFAULT_POSITION_PARAMS, sigma: set.sigma30 };
  const bot = strategy.create(input.botRng);

  const state: SessionState = {
    wallet: { gold: stage.startingGold, aum: stage.startingAum },
    position: null,
    openCount: 0,
    seq: 0,
    totalStake: 0,
    totalPnl: 0,
    goldFromTrades: 0,
  };
  const trades: TradeRecord[] = [];
  /** 드롭 소수점 누적분. AUM은 정수 재화이므로 정수분만 지갑에 넣고 나머지는 이월한다. */
  let dropCarry = 0;
  /** 직전 봉의 가격. 청산선 교차 지점을 선형 보간으로 역산할 때 시작점이 된다. */
  let previousPrice: number | null = null;

  for (let barIndex = 0; barIndex < BARS_PER_DAY; barIndex += 1) {
    const elapsedMs = barIndex * MS_PER_BAR;
    const price = replay.priceAt(elapsedMs);

    // ① 적 처치 드롭 (FR-6.8-a). 전투 시뮬 대신 균등 분배로 근사한다.
    dropCarry += AUM_DROP_PER_BAR;
    const dropNow = Math.floor(dropCarry);
    if (dropNow > 0) {
      dropCarry -= dropNow;
      state.wallet = { gold: state.wallet.gold, aum: state.wallet.aum + dropNow };
    }

    // ② 서버 강제 청산 감시 (FR-5.6). 봇의 의사보다 항상 먼저다.
    if (state.position !== null) {
      const evaluation = evaluatePosition(state.position, price, params);
      if (evaluation.liquidated) {
        const barrier = liquidationPrice(state.position, params);
        const crossMs = crossingMs(state.position, previousPrice, price, barrier, elapsedMs);
        settle(state, trades, barrier, crossMs, 'liquidated', params);
      }
    }

    previousPrice = price;

    const isLastBar = barIndex === BARS_PER_DAY - 1;
    if (isLastBar) {
      break;
    }

    // ③ 봇 판단.
    const action = bot.decide(buildContext(state, set, barIndex, elapsedMs, price, params));
    applyAction(state, action, price, elapsedMs, params, trades);
  }

  // ④ 스테이지 종료 — 열려 있던 포지션을 서버가 정리한다 (FR-8.1).
  const endMs = (BARS_PER_DAY - 1) * MS_PER_BAR;
  if (state.position !== null) {
    settle(state, trades, replay.priceAt(endMs), endMs, 'stage_end', params);
  }

  const totalGold = stage.startingGold + totalBaseIncome(stage) + state.goldFromTrades;

  return {
    trades,
    totalGold,
    totalStake: state.totalStake,
    totalPnl: state.totalPnl,
    unusedAum: state.wallet.aum,
    cleared: totalGold >= stage.requiredSpend,
  };
}

/**
 * `r`이 정확히 −`liqLine`이 되는 가격 — 실제 게임이 강제 청산을 발동시키는 그 지점.
 *
 * ```
 * r = payoutBase × deltaPct / sigma  ,  deltaPct = sign × (P − openPrice) / openPrice × 100
 * r = −liqLine  ⇒  P = openPrice × (1 + sign × (−liqLine × sigma / payoutBase) / 100)
 * ```
 * `sigma`나 `payoutBase`가 0이면 나눗셈이 새므로 그때는 교차 가격을 정의할 수 없다고 보고
 * 진입가를 그대로 돌려준다(그 입력은 애초에 `liquidated`가 뜨지 않는 구성이다).
 */
function liquidationPrice(position: OpenPosition, params: PositionParams): number {
  if (params.sigma === 0 || params.payoutBase === 0) {
    return position.openPrice;
  }
  const sign = position.direction === 'long' ? 1 : -1;
  const deltaPctAtLine = (-position.liqLine * params.sigma) / params.payoutBase;
  return position.openPrice * (1 + (sign * deltaPctAtLine) / 100);
}

/**
 * 직전 봉가와 현재 봉가 사이를 선형 보간해 `barrier`에 닿은 시각(ms)을 역산한다.
 * 리플레이 가격 경로가 두 종가 사이를 선형으로 잇기 때문에(`createReplay`) 이 보간은
 * 근사가 아니라 **정확한 값**이다.
 */
function crossingMs(
  position: OpenPosition,
  previousPrice: number | null,
  price: number,
  barrier: number,
  elapsedMs: number,
): number {
  const start = previousPrice ?? position.openPrice;
  const span = price - start;
  const fraction = span === 0 ? 0 : Math.min(Math.max((barrier - start) / span, 0), 1);
  const crossed = elapsedMs - MS_PER_BAR + fraction * MS_PER_BAR;
  // 진입 이전으로 거슬러 올라갈 수는 없고, 현재 봉을 넘어설 수도 없다.
  return Math.min(Math.max(crossed, position.openAtMs), elapsedMs);
}

/** 봇이 볼 수 있는 상태만 모아 `BotContext`를 만든다. 미래 봉은 여기서 잘린다. */
function buildContext(
  state: SessionState,
  set: ChartSet,
  barIndex: number,
  elapsedMs: number,
  price: number,
  params: PositionParams,
): BotContext {
  const position = state.position;
  const evaluation = position === null ? null : evaluatePosition(position, price, params);
  const heldMs = position === null ? 0 : elapsedMs - position.openAtMs;

  return {
    barIndex,
    elapsedMs,
    price,
    // ★ 블라인드 규칙(FR-4) ★ 확정된 봉까지만 넘긴다.
    bars: set.bars.slice(0, barIndex + 1),
    sigma: set.sigma30,
    position,
    evaluation,
    aum: state.wallet.aum,
    heldMs,
    canOpen: position === null && state.openCount < params.maxPositions && state.wallet.aum > 0,
    canClose: position !== null && heldMs >= params.minHoldMs,
    barsRemaining: BARS_PER_DAY - 1 - barIndex,
  };
}

/** 봇의 행동을 `src/position` 호출로 옮긴다. 실패한 요청은 게임과 똑같이 조용히 무시된다. */
function applyAction(
  state: SessionState,
  action: ReturnType<ReturnType<BotStrategy['create']>['decide']>,
  price: number,
  elapsedMs: number,
  params: PositionParams,
  trades: TradeRecord[],
): void {
  switch (action.kind) {
    case 'open': {
      const result = openPosition({
        wallet: state.wallet,
        existingPosition: state.position,
        openCount: state.openCount,
        direction: action.direction,
        stakeRatio: action.stakeRatio,
        openPrice: price,
        openAtMs: elapsedMs,
        seq: state.seq,
        params,
      });
      if (result.ok) {
        state.position = result.position;
        state.wallet = result.wallet;
        state.openCount += 1;
        state.seq += 1;
        state.totalStake += result.position.stake;
      }
      return;
    }
    case 'add': {
      const before = state.position?.stake ?? 0;
      const result = addToPosition({
        wallet: state.wallet,
        position: state.position,
        openCount: state.openCount,
        stakeRatio: action.stakeRatio,
        price,
        atMs: elapsedMs,
        params,
      });
      if (result.ok) {
        state.totalStake += result.position.stake - before;
        state.position = result.position;
        state.wallet = result.wallet;
        state.openCount += 1;
      }
      return;
    }
    case 'close':
      settle(state, trades, price, elapsedMs, 'manual', params);
      return;
    case 'hold':
    default:
      return;
  }
}

/** 청산을 실행하고 거래 기록을 남긴다. 실패(최소 보유 미달 등)하면 아무 일도 없다. */
function settle(
  state: SessionState,
  trades: TradeRecord[],
  price: number,
  elapsedMs: number,
  reason: 'manual' | 'liquidated' | 'stage_end',
  params: PositionParams,
): void {
  const position = state.position;
  const result = closePosition({
    wallet: state.wallet,
    position,
    closePrice: price,
    closeAtMs: elapsedMs,
    reason,
    params,
  });
  if (!result.ok || position === null) {
    return;
  }

  const { evaluation, goldGained } = result.result;
  state.wallet = result.result.wallet;
  state.position = null;
  state.totalPnl += evaluation.pnl;
  state.goldFromTrades += goldGained;

  trades.push({
    direction: position.direction,
    deltaPct: evaluation.deltaPct,
    z: evaluation.z,
    pnl: evaluation.pnl,
    stake: position.stake,
    liquidated: reason === 'liquidated',
    heldBars: (elapsedMs - position.openAtMs) / MS_PER_BAR,
  });
}
