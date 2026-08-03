/**
 * 공개 연출 (FR-9) — "그것은 어느 회사의 어떤 날이었는가" (GAME.md §15-2).
 *
 * ★ 왜 이것이 MVP의 존재 이유인가 ★
 * PRD가 **가설 H2의 검증 대상**이라고 못 박은 화면이다. "막아내면 정체가 공개된다"는
 * 이 게임을 다른 타워디펜스와 구분하는 **유일한 훅**이고, 시작 게이트가 이미 그것을
 * 약속하고 있다(`GATE_HINT`). 지금까지 그 약속이 지켜지지 않았다.
 *
 * ★ 6단계 골격을 다 잡되, 지금 구현하는 것은 4·5단계뿐이다 ★
 * 나머지 넷은 **실데이터(종목명·날짜·뉴스·일봉)가 없으면 원천적으로 만들 수 없다.**
 * 가짜로 채우면 H2 검증이 오염된다 — "정체가 공개된다"는 약속의 핵심이 진짜라는 점이다.
 * 그래서 자리는 만들어 두고 `available: false`로 두어 **건너뛴다**. 실데이터가 붙는 날
 * 이 파일에서 바뀌는 것은 각 단계의 `available`과 렌더 데이터뿐이고, 시퀀스 구조·시간
 * 배분·스킵 규칙은 그대로다.
 *
 * ★ 색 규칙 — 초록을 쓰지 마라 ★
 * 팔레트에 초록이 **없다**. 이익 = `GOLD`, 손실 = `ENEMY_DOWN`, 강제 청산 = `UP_ALLY`.
 * 한국식 상승=적/하락=청 체계를 쓰기 때문이고(PRD FR-5.10), 초록을 끼우면 "차트색 =
 * 진영색"이라는 전제가 무너진다(§11-2). 이 파일은 팔레트 **토큰 이름만** 돌려주고
 * HEX를 만들지 않는다 — `no-hardcoded-hex.test.ts`가 감시하는 규율이다.
 *
 * ★ 픽셀을 계산하지 않는다 ★
 * 마커 좌표는 **정규화 진행도(0~1)와 원본 가격**으로만 돌려준다. 픽셀은 렌더러가 정한다
 * (§17-4: 판정은 화면 크기를 몰라야 한다).
 *
 * ⚠️ `tf-reveal` 스프라이트는 **화면 목업이라 전장 캔버스에 blit 금지 키**다
 * (`SCREEN_ONLY_SPRITE_KEYS`). 화면 단위 배경으로 쓰는 것은 괜찮지만 전장에 겹치지 마라.
 * 배경은 `src/ui/reveal-backdrop.ts`의 `drawRevealBackdrop`을 쓴다.
 */

import type { PaletteToken } from '../design';
import type { ClosedPosition } from '../position';
import type { Settlement, StageOutcome } from './settlement';
import type { CodexCard } from './codex';
import { CODEX_CAPACITY, RARITY_LABEL, cardTitle, dateLabelFromSeed, rarityOf } from './codex';

/** 시퀀스 단계. 순서는 PRD FR-9.2를 그대로 따른다. */
export type RevealStageId =
  | 'zoomout'
  | 'identity'
  | 'headlines'
  | 'trades'
  | 'summary'
  | 'codex';

export interface RevealStageSpec {
  readonly id: RevealStageId;
  /** 이 단계에 배정된 시간(ms). PRD FR-9.2의 배분을 그대로 쓴다. */
  readonly durationMs: number;
  /**
   * 지금 만들 수 있는가.
   *
   * `false`인 단계는 시퀀스에서 **통째로 건너뛴다** — 시간도 소비하지 않는다.
   * 빈 화면을 1.5초 보여주는 것은 연출이 아니라 버그로 읽힌다.
   */
  readonly available: boolean;
  /** 왜 아직 못 만드는가. 다음 사람이 이유를 다시 조사하지 않게 남긴다. */
  readonly blockedBy?: string;
}

/**
 * FR-9.2 시퀀스 6단계 (총 10초).
 *
 * 4·5단계만 `available`이다. 실데이터 없이도 **"내가 어떻게 매매했는지"를 차트 위에
 * 되짚어 보여주는 것만으로 H2의 절반은 검증된다**는 판단이다.
 */
export const REVEAL_STAGES: readonly RevealStageSpec[] = [
  {
    id: 'zoomout',
    durationMs: 1_500,
    available: false,
    blockedBy: '전후 60거래일 일봉 데이터가 없다 (합성기는 당일 1분봉만 만든다)',
  },
  {
    id: 'identity',
    durationMs: 1_500,
    available: false,
    blockedBy: '실데이터 미연결 — ChartSet에 종목·날짜 필드 자체가 없다(블라인드 규칙의 결과)',
  },
  {
    id: 'headlines',
    durationMs: 2_000,
    available: false,
    blockedBy: '실데이터 미연결 — 뉴스 소스가 없다',
  },
  { id: 'trades', durationMs: 1_500, available: true },
  { id: 'summary', durationMs: 2_000, available: true },
  // ★ 도감이 구현되면서 이 단계의 차단 사유가 사라졌다 ★
  // 예전 blockedBy는 '차트 도감 미구현 (§15-6)'이었다. 이제 클리어가 카드를 발행하므로
  // 마지막 단계가 그 카드를 보여준다 — 연출이 "이 판이 무엇으로 남는가"로 닫힌다.
  { id: 'codex', durationMs: 1_500, available: true },
];

/** 실제로 재생되는 단계들. `available: false`는 시간도 소비하지 않는다. */
export const PLAYABLE_STAGES: readonly RevealStageSpec[] = REVEAL_STAGES.filter(
  (stage) => stage.available,
);

/** 시퀀스 총 길이(ms). 건너뛰는 단계는 빠져 있다. */
export const REVEAL_TOTAL_MS: number = PLAYABLE_STAGES.reduce(
  (sum, stage) => sum + stage.durationMs,
  0,
);

/** 매매 한 건이 차트 위에 남기는 자국. */
export interface RevealTradeMarker {
  /** 몇 번째 진입인가 (`ClosedPosition.seq`). */
  readonly seq: number;
  readonly direction: 'long' | 'short';
  /** 진입 시점의 재생 진행도 `0~1`. 픽셀은 렌더러가 정한다. */
  readonly openAt: number;
  /** 청산 시점의 재생 진행도 `0~1`. */
  readonly closeAt: number;
  readonly openPrice: number;
  readonly closePrice: number;
  readonly pnl: number;
  /** 강제 청산이었는가 — 마커 모양이 ✕로 바뀐다. */
  readonly liquidated: boolean;
  /**
   * 이 마커의 색 토큰. **초록은 없다.**
   * 이익 `GOLD` / 손실 `ENEMY_DOWN` / 강제 청산 `UP_ALLY`.
   */
  readonly tone: PaletteToken;
  /** 진입 방향 표식. LONG ▲ / SHORT ▼. */
  readonly glyph: '▲' | '▼';
}

/** 공개 연출이 받는 입력. 셸이 세션·정산에서 모아 넘긴다. */
export interface RevealInput {
  readonly outcome: StageOutcome;
  readonly settlement: Settlement;
  /** 이번 스테이지의 청산 기록 전부. 비어 있을 수 있다(한 번도 매매하지 않은 판). */
  readonly closes: readonly ClosedPosition[];
  /** 재생 총 길이(ms). 진행도 정규화의 분모다. */
  readonly stageDurationMs: number;
  /** 그날의 시가·종가·고가·저가·거래량 배수 — 5단계 요약용. */
  readonly ohlcv: RevealOhlcv;
  /**
   * 이 판이 남긴 도감 카드 — 6단계용. 클리어가 아니면 `undefined`다.
   *
   * 카드를 여기서 만들지 않고 **받는** 이유: 발행은 셸이 `recordCard`로 이미 한 번
   * 했고, 연출이 두 번째로 만들면 두 카드가 어긋날 수 있다(등급·시각이 다른 계산에서 온다).
   */
  readonly card?: CodexCard;
  /** 지금까지 모은 카드 수 — 6단계의 진척 표시. */
  readonly collected?: number;
}

export interface RevealOhlcv {
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  /** 평균 대비 거래량 배수. `ChartSet.volumeMultiple`. */
  readonly volumeMultiple: number;
}

/** `0~1`로 자른다. 재생 밖(연장 중 강제 청산 등)의 시각이 새어 들어올 수 있다. */
function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * 청산 기록 → 차트 위 마커.
 *
 * `ClosedPosition`이 이미 필요한 것을 전부 갖고 있다 — `direction` / `openPrice` /
 * `openAtMs` / `closePrice` / `closeAtMs` / `pnl` / `reason`. 그래서 이 단계는
 * **실데이터 없이 지금 당장 만들 수 있다.**
 */
export function tradeMarkers(
  closes: readonly ClosedPosition[],
  stageDurationMs: number,
): readonly RevealTradeMarker[] {
  const span = stageDurationMs > 0 ? stageDurationMs : 1;
  return closes.map((close) => {
    const liquidated = close.reason === 'liquidated';
    return {
      seq: close.seq,
      direction: close.direction,
      openAt: clamp01(close.openAtMs / span),
      closeAt: clamp01(close.closeAtMs / span),
      openPrice: close.openPrice,
      closePrice: close.closePrice,
      pnl: close.pnl,
      liquidated,
      // 강제 청산은 손실이기도 하지만 **별도 색**을 준다 — "졌다"와 "터졌다"는 다른 사건이다.
      tone: liquidated ? 'UP_ALLY' : close.pnl > 0 ? 'GOLD' : 'ENEMY_DOWN',
      glyph: close.direction === 'long' ? '▲' : '▼',
    };
  });
}

/** 5단계 요약 한 줄들. 값은 전부 입력에서만 온다 — 여기서 계산을 새로 하지 않는다. */
export interface RevealSummaryLine {
  readonly label: string;
  readonly value: string;
  /** 강조 색 토큰. 없으면 기본 텍스트색. */
  readonly tone?: PaletteToken;
}

function signedPercent(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

/**
 * OHLCV 요약 + "N번 중 M번 적중".
 *
 * 등락률의 색도 한국식이다: 상승 `UP_ALLY`(적), 하락 `ENEMY_DOWN`(청).
 * 적중률은 **성적**이지 방향이 아니므로 `GOLD`를 쓴다.
 */
export function summaryLines(input: RevealInput): readonly RevealSummaryLine[] {
  const { ohlcv, settlement, closes } = input;
  const changePct = ohlcv.open > 0 ? ((ohlcv.close - ohlcv.open) / ohlcv.open) * 100 : 0;
  const profitCount = closes.filter((close) => close.pnl > 0).length;
  const liquidatedCount = closes.filter((close) => close.reason === 'liquidated').length;

  const lines: RevealSummaryLine[] = [
    {
      label: '그날의 등락',
      value: signedPercent(changePct),
      tone: changePct >= 0 ? 'UP_ALLY' : 'ENEMY_DOWN',
    },
    { label: '고가 / 저가', value: `${ohlcv.high.toFixed(0)} / ${ohlcv.low.toFixed(0)}` },
    { label: '거래량', value: `${ohlcv.volumeMultiple.toFixed(1)}×` },
  ];

  if (closes.length === 0) {
    // 한 번도 매매하지 않은 판. "0번 중 0번 적중"은 성적이 아니라 오류로 읽힌다.
    lines.push({ label: '매매', value: '한 번도 진입하지 않았다' });
    return lines;
  }

  lines.push({
    label: '적중',
    value: `${closes.length}번 중 ${profitCount}번`,
    tone: 'GOLD',
  });
  lines.push({
    label: '적중률',
    value: `${(settlement.accuracy * 100).toFixed(1)}%`,
    tone: 'GOLD',
  });
  if (liquidatedCount > 0) {
    // 강제 청산은 리스크 관리 실패의 직접 지표다 — 있을 때만 보여준다(O-15 ④안의 싹).
    lines.push({
      label: '강제 청산',
      value: `${liquidatedCount}번`,
      tone: 'UP_ALLY',
    });
  }
  return lines;
}

/** 현재 재생 위치가 어느 단계인지 + 그 단계 안에서의 진행도. */
export interface RevealFrame {
  /** 재생 중인 단계. 끝났으면 `null`. */
  readonly stage: RevealStageId | null;
  /** 그 단계 안에서의 진행도 `0~1`. */
  readonly stageProgress: number;
  /** 시퀀스 전체 진행도 `0~1`. */
  readonly progress: number;
  readonly finished: boolean;
  /** 4단계에서 그릴 마커들. 다른 단계에서는 빈 배열. */
  readonly markers: readonly RevealTradeMarker[];
  /** 5단계에서 그릴 요약. 다른 단계에서는 빈 배열. */
  readonly summary: readonly RevealSummaryLine[];
  /** 화면 제목. 결과에 따라 달라진다. */
  readonly title: string;
  /** 부제 — 왜 이 화면을 보고 있는지. */
  readonly subtitle: string;
}

/**
 * 결과별 제목.
 *
 * ★ FR-9.5: 패배해도 공개 연출은 보여준다 ★ 실패해도 정체는 알려줘야 재도전 동기가
 * 생긴다. 그래서 `defeated`·`unresolved`에서도 화면이 뜬다 — 문구만 달라진다.
 */
export function revealTitleFor(outcome: StageOutcome): string {
  switch (outcome) {
    case 'cleared':
      return '막아냈다 — 그날을 되짚는다';
    case 'defeated':
      return '뚫렸다 — 그래도 그날은 알려준다';
    default:
      return '결론이 나지 않았다 — 그날을 되짚는다';
  }
}

function revealSubtitleFor(stage: RevealStageId | null): string {
  switch (stage) {
    case 'trades':
      return '차트 위에 남은 당신의 매매';
    case 'summary':
      return '그날의 수치와 당신의 성적';
    case 'codex':
      return '이 판이 무엇으로 남는가';
    default:
      return '';
  }
}

/**
 * 6단계 — 도감에 남은 기록.
 *
 * ★ 카드가 없어도 빈 화면을 내지 않는다 ★ 패배한 판은 카드를 남기지 않는데, 그
 * 사실 자체가 정보다. "기록으로 남지 않는다"고 말하는 것이 아무것도 없는 1.5초보다 낫다
 * (`available: false`는 시간도 소비하지 않지만, 이 단계는 판마다 달라서 상수로 끌 수 없다).
 */
export function codexLines(input: RevealInput): readonly RevealSummaryLine[] {
  const card = input.card;
  if (card === undefined) {
    return [
      { label: '도감', value: '이 판은 기록으로 남지 않는다' },
      { label: '조건', value: '13웨이브 방어 완료', tone: 'GOLD' },
    ];
  }

  const lines: RevealSummaryLine[] = [
    { label: '기록', value: cardTitle(card), tone: 'GOLD' },
    { label: '등급', value: `${RARITY_LABEL[rarityOf(card.grade)]} · RANK ${card.grade}`, tone: 'GOLD' },
    { label: '날짜', value: dateLabelFromSeed(card.seed) },
  ];
  if (input.collected !== undefined) {
    lines.push({ label: '수집', value: `${input.collected} / ${codexTotalOf(input.collected)}` });
  }
  return lines;
}

/** 분모는 도감 화면과 같은 규칙을 쓴다 — 정원을 넘기면 분모가 따라 올라간다. */
function codexTotalOf(collected: number): number {
  return Math.max(CODEX_CAPACITY, collected);
}

/**
 * 경과 시간 → 화면에 그릴 내용.
 *
 * 건너뛰는 단계(`available: false`)는 시간 축에서 아예 빠져 있으므로 여기서 다시
 * 검사할 필요가 없다 — `PLAYABLE_STAGES`가 이미 걸러 냈다.
 */
export function revealFrame(input: RevealInput, elapsedMs: number): RevealFrame {
  const markers = tradeMarkers(input.closes, input.stageDurationMs);
  const summary = summaryLines(input);
  const title = revealTitleFor(input.outcome);
  const clamped = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0);

  let remaining = clamped;
  for (const stage of PLAYABLE_STAGES) {
    if (remaining < stage.durationMs) {
      return {
        stage: stage.id,
        stageProgress: clamp01(remaining / stage.durationMs),
        progress: REVEAL_TOTAL_MS > 0 ? clamp01(clamped / REVEAL_TOTAL_MS) : 1,
        finished: false,
        markers: stage.id === 'trades' ? markers : [],
        summary:
          stage.id === 'summary' ? summary : stage.id === 'codex' ? codexLines(input) : [],
        title,
        subtitle: revealSubtitleFor(stage.id),
      };
    }
    remaining -= stage.durationMs;
  }

  return {
    stage: null,
    stageProgress: 1,
    progress: 1,
    finished: true,
    markers: [],
    summary: [],
    title,
    subtitle: '',
  };
}

/**
 * 다음 단계로 건너뛰기 위한 경과 시간.
 *
 * 각 단계는 **개별적으로 스킵 가능**하다(FR-9.2). 마지막 단계에서 스킵하면 시퀀스가 끝난다.
 */
export function skipToNextStage(elapsedMs: number): number {
  let boundary = 0;
  for (const stage of PLAYABLE_STAGES) {
    boundary += stage.durationMs;
    if (elapsedMs < boundary) {
      return boundary;
    }
  }
  return REVEAL_TOTAL_MS;
}

/**
 * 아직 만들지 못한 단계들 — 화면 하단에 "곧 온다"로 알릴 때 쓴다.
 *
 * 숨기지 않고 노출하는 이유: 시작 게이트가 약속한 것은 **정체 공개**인데 지금 보여주는
 * 것은 매매 되짚기뿐이라, 아무 말도 없으면 약속이 지켜지지 않은 것으로 읽힌다.
 */
export function pendingStageNotices(): readonly string[] {
  return REVEAL_STAGES.filter((stage) => !stage.available).map(
    (stage) => stage.blockedBy ?? '준비 중',
  );
}
