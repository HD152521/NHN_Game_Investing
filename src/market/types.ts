/**
 * 시장 데이터 · 리플레이 공용 타입 (PRD §5 리플레이 / FR-3 / FR-4).
 *
 * ★ 이 파일은 리플레이 엔진(`src/market`)과 차트 렌더러(`src/chart`)가 공유하는
 *   **인터페이스 계약**입니다. 양쪽이 이 파일만 보고 독립적으로 구현할 수 있어야 하므로
 *   구현 세부를 여기에 넣지 마세요.
 */

/** 1분봉 1개. `t`는 장중 분 인덱스(0 = 09:00, 389 = 15:29). */
export interface Bar {
  readonly t: number;
  readonly o: number;
  readonly h: number;
  readonly l: number;
  readonly c: number;
  readonly v: number;
}

/** 하루 거래일의 1분봉 개수 (09:00~15:30). PRD §5.1 */
export const BARS_PER_DAY = 390;

/** 1봉이 재생되는 실시간 길이(ms). 390봉 × 1000ms = 390초 = 6분 30초. PRD §5.1 */
export const MS_PER_BAR = 1000;

/** 스테이지 1회의 총 재생 길이(ms). */
export const STAGE_DURATION_MS = BARS_PER_DAY * MS_PER_BAR;

/** 차트 성격 분류. PRD §10 ③ */
export type Archetype = 'surge' | 'plunge' | 'range' | 'reversal';

/** 시장 이벤트 2종. PRD FR-7 (패닉 셀 / FOMO 랠리) */
export type MarketEventKind = 'panic_sell' | 'fomo_rally';

export interface MarketEvent {
  /** 세션 시작 기준 발동 시각(ms). */
  readonly atMs: number;
  readonly kind: MarketEventKind;
}

/**
 * 스테이지 1회에 배정되는 차트 데이터 묶음.
 *
 * 블라인드 규칙(FR-4)에 따라 **종목명·날짜 필드를 두지 않는다.** 여기에 필드를
 * 추가하면 개발자 도구로 정체가 노출되어 제품의 핵심 가치가 무너집니다.
 */
export interface ChartSet {
  /** 불투명 ID. 종목·날짜를 유추할 수 없어야 한다 (FR-4.5). */
  readonly id: string;
  /** 정확히 `BARS_PER_DAY`개. */
  readonly bars: readonly Bar[];
  /** 30분 구간 수익률 표준편차(%). 손익 z-score의 분모 (FR-5.5). */
  readonly sigma30: number;
  readonly archetype: Archetype;
  readonly events: readonly MarketEvent[];
  /** 20일 평균 대비 거래량 배수. 화면에는 `2.4×` 형태로만 노출 (FR-4.1). */
  readonly volumeMultiple: number;
}

/** 리플레이가 매 프레임 내보내는 상태. */
export interface ReplayState {
  /** 세션 시작 이후 재생 경과(ms). 배속이 반영된 값. */
  readonly elapsedMs: number;
  /** 현재 확정된 봉의 인덱스(0-based). 마지막 봉 이후에는 `BARS_PER_DAY - 1`. */
  readonly barIndex: number;
  /** 봉 사이를 선형 보간한 현재가. */
  readonly price: number;
  /** 0~1 진행률. */
  readonly progress: number;
  /** 재생이 끝났는가. */
  readonly finished: boolean;
}

/**
 * 리플레이 인스턴스.
 *
 * 시계를 주입받는다(`tick(nowMs)`). 내부에서 `Date.now()`를 부르면 헤드리스 테스트가
 * 불가능해지므로 **절대 내부 시계를 쓰지 마세요.**
 */
export interface Replay {
  /** 외부 시계를 먹여 현재 상태를 계산한다. 순수 함수처럼 동작해야 한다. */
  tick(nowMs: number): ReplayState;
  /** 임의 경과 시각의 보간가. 서버 권위 판정이 이 함수를 쓴다 (FR-5.4). */
  priceAt(elapsedMs: number): number;
  /** 배속을 반영한 총 재생 시간(ms). */
  readonly durationMs: number;
  readonly speed: number;
  readonly set: ChartSet;
}
