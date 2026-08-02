/**
 * 봇 시뮬레이터 공용 타입 — PRD §10 ⑥ 검증 도구.
 *
 * ★ 블라인드 규칙(FR-4)이 이 파일의 존재 이유다 ★
 * `BotContext`는 봇이 볼 수 있는 것 **전부**이며, 확정된 봉(`bars`)만 들어 있다.
 * `ChartSet.archetype` · 미래 봉 · `events`를 여기 노출하면 시뮬레이터가 측정하려던
 * "블라인드 차트에서 방향을 맞출 수 있는가"라는 질문 자체가 무의미해진다.
 * 전략 구현체에 `ChartSet`을 통째로 넘기지 마라.
 */

import type { Bar } from '../../src/market/index.js';
import type { Direction, OpenPosition, PositionEval } from '../../src/position/index.js';

/** 봇이 매 봉마다 관측하는 상태. 미래 정보는 한 필드도 들어 있지 않다. */
export interface BotContext {
  /** 현재 확정된 봉의 인덱스(0-based). */
  readonly barIndex: number;
  /** 재생 경과(ms). `barIndex × MS_PER_BAR`. */
  readonly elapsedMs: number;
  /** 현재가 = `bars[barIndex].c`. */
  readonly price: number;
  /** **확정된 봉만.** `bars.length === barIndex + 1`이 항상 성립한다. */
  readonly bars: readonly Bar[];
  /** 이 차트의 `sigma30`(%). 게임 UI도 z를 보여주므로 봇이 알아도 되는 값이다. */
  readonly sigma: number;
  /** 보유 중인 포지션. 없으면 null. */
  readonly position: OpenPosition | null;
  /** 보유 포지션의 현재 평가. 포지션이 없으면 null. */
  readonly evaluation: PositionEval | null;
  /** 현재 AUM(매매 원금). */
  readonly aum: number;
  /** 포지션 보유 시간(ms). 포지션이 없으면 0. */
  readonly heldMs: number;
  /** 신규 진입이 가능한가 (`MAX_POSITIONS` · AUM 잔량 반영). */
  readonly canOpen: boolean;
  /** 수동 청산이 가능한가 (`MIN_HOLD_SEC` 반영). */
  readonly canClose: boolean;
  /** 남은 봉 수. 스테이지 종료가 임박하면 진입을 접는 판단에 쓴다. */
  readonly barsRemaining: number;
}

/** 봇이 한 봉에 낼 수 있는 행동. `src/position`의 공개 API 3종에 1:1 대응한다. */
export type BotAction =
  | { readonly kind: 'hold' }
  | { readonly kind: 'open'; readonly direction: Direction; readonly stakeRatio: number }
  | { readonly kind: 'add'; readonly stakeRatio: number }
  | { readonly kind: 'close' };

/** 아무것도 하지 않는 행동. 매번 객체를 새로 만들 이유가 없어 공유 상수로 둔다. */
export const HOLD: BotAction = { kind: 'hold' };

/** 세션 1회 동안 살아 있는 봇 인스턴스. 내부 상태를 가져도 된다. */
export interface BotInstance {
  decide(ctx: BotContext): BotAction;
}

/**
 * 전략 플러그인. 새 전략은 이 인터페이스만 구현하고
 * `strategies/index.ts`의 `STRATEGIES`에 등록하면 표에 자동으로 나타난다.
 */
export interface BotStrategy {
  /** CLI `--strategies` 필터에 쓰이는 식별자. */
  readonly id: string;
  /** 결과 표에 출력되는 이름. */
  readonly label: string;
  /** 한 줄 판단 규칙 요약 — 보고서에 그대로 실린다. */
  readonly rule: string;
  /** 세션마다 새 인스턴스를 만든다. `rng`는 세션별로 결정론적으로 시드된다. */
  create(rng: () => number): BotInstance;
}

/** 청산된 포지션 1건의 기록. 집계는 전부 이 배열에서 파생된다. */
export interface TradeRecord {
  readonly direction: Direction;
  /** 방향부호가 적용된 등락률(%). 양수면 방향이 맞았다는 뜻이다. */
  readonly deltaPct: number;
  /** 클램프 **전** z. 분포 보고용이라 원값을 남긴다. */
  readonly z: number;
  readonly pnl: number;
  /** 이 포지션에 최종적으로 들어간 원금(추가 매수 누적 포함). */
  readonly stake: number;
  readonly liquidated: boolean;
  readonly heldBars: number;
}

/** 세션 1회의 결과. */
export interface SessionResult {
  readonly trades: readonly TradeRecord[];
  /** 스테이지 종료 시점의 총 골드(시작 골드 + 기본 수입 + 청산 대금). */
  readonly totalGold: number;
  /** 세션 동안 실제로 투입된 원금 총액. */
  readonly totalStake: number;
  /** 청산 pnl 합계. */
  readonly totalPnl: number;
  /** 쓰지 못하고 남은 AUM. 클리어에는 기여하지 않는다(정산 계수 0.15는 자본금이지 골드가 아니다). */
  readonly unusedAum: number;
  readonly cleared: boolean;
}
