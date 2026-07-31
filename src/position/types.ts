/**
 * 포지션(매매 판정) 공용 타입 — PRD FR-5 자유 매매제.
 *
 * ★ 이 파일은 서버로 그대로 이관될 판정 코어의 인터페이스 계약입니다.
 *   `src/position/` 안의 모든 함수는 이 타입만으로 입출력을 표현해야 하며,
 *   DOM·타이머·전역 상태 등 부수효과를 일으키는 값(예: `Date.now()` 반환값)을
 *   직접 담지 않습니다 — 재생 경과 ms는 항상 호출자가 주입합니다 (FR-5.4).
 */

/** 매매 방향. LONG은 상승에, SHORT은 하락에 베팅한다. */
export type Direction = 'long' | 'short';

/**
 * 청산 사유.
 * - `manual`: 플레이어가 청산 버튼을 눌렀다 (`MIN_HOLD_SEC` 검사 대상).
 * - `liquidated`: 서버가 강제 청산(마진콜)했다 (FR-5.6, 최소 보유시간 검사 면제).
 * - `stage_end`: 스테이지 종료로 서버가 강제 청산했다 (최소 보유시간 검사 면제).
 */
export type CloseReason = 'manual' | 'liquidated' | 'stage_end';

/**
 * 스테이지 1회에 고정되는 매매 파라미터. PRD §9.1 상수표에 대응한다.
 * `sigma`만 스테이지(차트)마다 다르고 나머지는 서버 컨피그 기본값이다.
 */
export interface PositionParams {
  /** 수익배율 상한 B. 기본 0.90 (FR-5.5). */
  readonly payoutBase: number;
  /** z 클램프 범위 [−zMax, +zMax]. 기본 3.0 (FR-5.5). */
  readonly zMax: number;
  /** 진입 시 1회 부과되는 거래 수수료율. 기본 0.01 (FR-5.5). */
  readonly feeRate: number;
  /** 강제 청산 발동선. 기본 1.00, 법무팀 부서가 완화한다 (FR-5.6 / FR-11.2). */
  readonly liquidationLine: number;
  /** 진입 후 청산 금지 시간(ms). 기본 2000 (FR-5.11). */
  readonly minHoldMs: number;
  /** 스테이지당 최대 진입 횟수. 청산은 미포함 (FR-5.3). */
  readonly maxPositions: number;
  /** 해당 스테이지 `ChartSet.sigma30`(%) — 손익 z-score의 분모 (FR-5.5). */
  readonly sigma: number;
}

/** 골드·AUM 지갑. 둘 다 정수 재화로 다룬다 (소수점 재화는 UI에서 지저분해진다). */
export interface Wallet {
  readonly gold: number;
  readonly aum: number;
}

/** 보유 중인 포지션 1건. MVP 규칙상 동시 보유는 1개다 (FR-5.2). */
export interface OpenPosition {
  /** 이 포지션의 일련번호. 호출자(서버)가 발급·관리한다. */
  readonly seq: number;
  readonly direction: Direction;
  /** AUM에서 차감된 원금. */
  readonly stake: number;
  /** `stake × feeRate`, 진입 시 확정되어 청산 때까지 불변이다. */
  readonly fee: number;
  /** 서버가 자기 시계로 계산한 진입 시각의 가격 (FR-5.4). */
  readonly openPrice: number;
  /** 재생 경과 ms 기준 진입 시각. */
  readonly openAtMs: number;
  /**
   * 진입 시점 청산선 스냅샷. 법무팀 부서 레벨업으로 이후 `liquidationLine`이
   * 바뀌어도 이미 보유 중인 포지션은 진입 당시 값으로 판정해야 하므로 별도 보관한다.
   */
  readonly liqLine: number;
}

/** `evaluatePosition`의 순수 계산 결과. 청산 여부와 무관하게 "지금 청산하면?"을 나타낸다. */
export interface PositionEval {
  /** 방향부호가 적용된 등락률(%). LONG +1 / SHORT −1. */
  readonly deltaPct: number;
  /** `deltaPct / sigma`, 부호를 유지한다 (음수 가능). */
  readonly z: number;
  /** `payoutBase × clamp(z, −zMax, +zMax)`. */
  readonly r: number;
  /** `stake × r − fee`, 단 −stake 아래로 내려가지 않는다 (원금 초과 손실 없음). */
  readonly pnl: number;
  /** `r ≤ −liqLine`이면 강제 청산 대상이다 (FR-5.6). */
  readonly liquidated: boolean;
  /** `r ≤ −liqLine × LIQ_WARN_RATIO`이면 경고 상태다 (FR-5.6 80% 경고). */
  readonly warning: boolean;
}
