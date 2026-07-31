/**
 * 날씨 시스템 공용 타입.
 *
 * ★ 이 파일은 **판정(순수 함수)** 과 **렌더(Canvas)** 사이의 인터페이스 계약이다.
 *   판정 쪽은 Canvas/DOM/타이머를 전혀 모르고, 렌더 쪽은 시장 지표를 전혀 모른다.
 *   구현 세부를 여기에 넣지 마라.
 */

import type { MarketEventKind } from '../market/types.js';

/**
 * 날씨 4종 + 맑음. ID는 아트-프로덕션시트 §03과 1:1 대응한다.
 *
 * - `panic_rain`    = `WX-01` 패닉 셀 — 청색 폭우
 * - `fomo_updraft`  = `WX-02` FOMO 랠리 — 적색 상승기류
 * - `range_fog`     = `WX-03` 횡보 안개
 * - `blackout`      = `WX-04` 서킷브레이커 정전
 * - `clear`         = 표시할 시장 상태 없음 (오버레이 미출력)
 */
export const WEATHER_KINDS = ['clear', 'panic_rain', 'fomo_updraft', 'range_fog', 'blackout'] as const;

export type WeatherKind = (typeof WEATHER_KINDS)[number];

/**
 * 판정 입력 — 차트에서 뽑은 시장 지표만 담는다.
 *
 * 여기에 화면 크기·시각·재생 상태 같은 렌더 관심사를 넣지 마라. 이 구조체가
 * 순수하게 유지되는 한 날씨 판정은 Canvas 없이 전부 테스트할 수 있다.
 */
export interface MarketConditions {
  /** 최근 구간 등락률(%). 음수 = 하락. */
  readonly recentChangePct: number;
  /** 30분 구간 수익률 표준편차(%) — `ChartSet.sigma30`. */
  readonly sigma30: number;
  /** 거래 정지(서킷브레이커) 구간인가. */
  readonly halted: boolean;
  /** 지금 활성인 시장 이벤트(FR-7). 없으면 `null`. */
  readonly event: MarketEventKind | null;
}

/**
 * 렌더가 받는 최종 뷰 — 판정 결과 + 연출 파라미터.
 *
 * `intensity`는 **반드시 연속값(0~1)** 이다. 단계형(약/중/강)으로 양자화하면
 * "색 자체가 게임 정보"(아트가이드 §1.3)라는 전제가 무너진다.
 */
export interface WeatherView {
  readonly kind: WeatherKind;
  /** 0~1 연속 강도. 급락이 심할수록 폭우가 굵어진다. */
  readonly intensity: number;
  /** 애니메이션 위상용 시각(ms). */
  readonly timeMs: number;
  /** `prefers-reduced-motion`. 모션은 멈추되 시장 상태 정보는 그대로 전달한다. */
  readonly reducedMotion: boolean;
}

/**
 * 오버레이가 그려질 화면 영역.
 *
 * `src/battle/layout.ts`의 `BattleLayout`을 그대로 받지 않고 필요한 4개만 좁혀 받는다 —
 * 이 방향이면 `src/weather`가 `src/battle`에 의존하지 않아 순환이 생기지 않는다.
 */
export interface WeatherViewport {
  readonly width: number;
  readonly height: number;
  /** 전장 상단 y (HUD 아래). */
  readonly top: number;
  /** 지상 레인(발판) 중심 y. 안개는 이 아래로만 깔린다. */
  readonly groundY: number;
}
