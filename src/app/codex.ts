/**
 * 차트 도감 — "시장의 기록" (PRD P1 #10, GAME.md §15 로드맵).
 *
 * ★ 이 화면이 존재하는 이유 ★
 * 이 게임의 훅은 **"막아내면 이것이 어느 회사의 어떤 날이었는지 공개된다"**(`GATE_HINT`)이고,
 * 공개 연출(FR-9)이 그 약속을 한 판 안에서 지킨다. 그런데 연출은 10초 뒤 사라진다 —
 * 지금까지 **깨고 나면 아무것도 남지 않았다.** 도감은 그 공개를 영구화하는 장치다:
 * 한 판을 이길 때마다 그날의 차트가 카드 한 장으로 남고, 그것이 수집 축이 된다.
 *
 * ★ 블라인드 규칙(FR-4)과 충돌하지 않는 이유 ★
 * `ChartSet`에는 종목·날짜 필드가 **자체가 없다**(`market/types.ts`가 명시적으로 금지한다).
 * 도감 카드의 `dateLabel`은 그 필드를 읽은 것이 아니라 **시드에서 파생시킨 합성 날짜**다
 * (`dateLabelFromSeed`). 즉 도감은 숨겨진 진실을 유출하는 것이 아니라, 애초에 합성인
 * 차트에 사후적으로 이름표를 붙이는 것이다. 실데이터(601조합)가 붙는 날 이 함수 하나만
 * 실제 거래일로 바꾸면 되고, **나머지 코드는 건드릴 필요가 없다.**
 *
 * ★ 구조 — 순수 판정 + 마크업 문자열 ★
 * `region-select.ts`·`start-gate.ts`와 같은 패턴이다. 이 파일은 DOM을 만들지 않고
 * 문자열만 만든다. 배선은 `stage.ts`가 맡는다. 카드 저장은 `progress.ts`가 맡는다 —
 * 여기서 `localStorage`를 부르지 않는다.
 */

import type { Bar, ChartSet } from '../market';
import { changePercent } from '../market';
import type { StageId } from '../combat';
import type { SettlementGrade } from './settlement';

/** `stage.ts`가 이 값으로 도감 버튼/카드를 찾는다. */
export const CODEX_OPEN_ACTION = 'open-codex';
export const CODEX_BACK_ACTION = 'codex-back';
export const CODEX_FILTER_ACTION = 'codex-filter';

export const CODEX_TITLE = '도감 · 시장의 기록';
export const CODEX_BACK_LABEL = '← 타이틀로';

/**
 * 도감 정원. 목업의 "수집 37 / 120"이 이 숫자다.
 *
 * 왜 120인가: 실데이터 파이프라인(PRD §10)의 목표가 601조합이고, 그중 MVP 배포분을
 * 120으로 잡았다. **정원을 넘겨도 카드를 버리지 않는다** — 정원은 진척 표시용 분모일 뿐이고,
 * 넘치면 분모가 올라간다(`codexTotal`). 수집물을 조용히 삭제하는 것이 더 나쁘다.
 */
export const CODEX_CAPACITY = 120;

/** 카드 썸네일에 남기는 압축 봉 개수. 목업 카드가 8~10개라 그 사이로 잡았다. */
export const THUMBNAIL_BARS = 9;

/** 등급 → 희귀도. 정산 등급(`SettlementGrade`)이 유일한 입력이다. */
export type CodexRarity = 'legendary' | 'epic' | 'rare' | 'common';

/** 필터 탭. 목업의 [전체 · 급등 · 급락 · 공시]와 1:1이다. */
export type CodexCategory = 'surge' | 'plunge' | 'disclosure';
export type CodexFilter = 'all' | CodexCategory;

/**
 * 썸네일 봉 하나. 시가·종가만 남긴다.
 *
 * 고가·저가를 버리는 이유는 저장 크기다 — 120장 × 9봉 × 4값이면 `localStorage`에서
 * 무시할 수 없는 덩어리가 된다. 목업 썸네일은 **채움(상승) / 테두리(하락)** 두 상태만
 * 쓰므로 시가·종가면 충분하다.
 */
export interface CodexBar {
  readonly o: number;
  readonly c: number;
}

/**
 * 도감 카드 한 장 — **한 번의 클리어가 남긴 기록**.
 *
 * ⚠️ 표시 문구(제목·설명)를 여기 저장하지 않는다. 문구는 아래 순수 함수가 수치에서
 * 파생시킨다 — 저장해 버리면 문구를 고칠 때 옛 카드가 조용히 옛 문장을 말하는
 * 이중 출처가 된다(`skill-tooltip-logic.ts`와 같은 규칙).
 */
export interface CodexCard {
  /** 결정론적 ID. 같은 시드·같은 지역이면 같은 카드다(중복 수집을 막는 키). */
  readonly id: string;
  readonly stageId: StageId;
  readonly seed: number;
  readonly grade: SettlementGrade;
  /** 종가 등락률(%). `changePercent`가 단일 출처다. */
  readonly changeRate: number;
  /** 시장 이벤트가 있었는가 — 카드 분류의 '공시' 축. */
  readonly hasEvent: boolean;
  /** 방어에 걸린 시간(ms). 목업의 `DURATION`. */
  readonly durationMs: number;
  readonly baseHp: number;
  readonly maxBaseHp: number;
  readonly accuracy: number;
  readonly bars: readonly CodexBar[];
}

// ── 파생 함수 — 저장하지 않고 매번 계산한다 ──────────────────────

export function rarityOf(grade: SettlementGrade): CodexRarity {
  if (grade === 'S') return 'legendary';
  if (grade === 'A') return 'epic';
  if (grade === 'B') return 'rare';
  return 'common';
}

export const RARITY_LABEL: Readonly<Record<CodexRarity, string>> = {
  legendary: 'LEGENDARY',
  epic: 'EPIC',
  rare: 'RARE',
  common: 'COMMON',
};

/**
 * 카드 분류. **공시가 등락을 이긴다.**
 *
 * 시장 이벤트(패닉 셀 / FOMO 랠리)는 그날을 규정하는 사건이므로, 등락 방향보다 먼저
 * 읽혀야 한다. 이벤트가 없을 때만 등락 부호로 나눈다 — 보합(±1% 미만)도 부호를 따라가되
 * 제목이 '보합'이 되므로 화면에서는 구분된다.
 */
export function categoryOf(card: CodexCard): CodexCategory {
  if (card.hasEvent) return 'disclosure';
  return card.changeRate < 0 ? 'plunge' : 'surge';
}

/** 등락 크기 구간. 제목이 여기서 갈린다. */
const LIMIT_MOVE = 10;
const STRONG_MOVE = 3;
const FLAT_MOVE = 1;

/**
 * 카드 제목 — **차트가 정한다. 등급이 아니라.**
 *
 * 목업의 네 장이 이 규칙의 근거다: 상한가의 날(+29.8) · 패닉 셀(−18.2) ·
 * 완만한 회복(+6.4) · 보합(+0.3). 등급(S/A/B/C)은 같은 차트라도 플레이가 달라지면
 * 바뀌므로 제목의 입력이 될 수 없다 — 제목은 **그날의 시장**을 말해야 한다.
 */
export function cardTitle(card: CodexCard): string {
  const change = card.changeRate;
  if (card.hasEvent) {
    return change < 0 ? '패닉 셀' : 'FOMO 랠리';
  }
  if (change >= LIMIT_MOVE) return '상한가의 날';
  if (change <= -LIMIT_MOVE) return '하한가의 날';
  if (change >= STRONG_MOVE) return '완만한 회복';
  if (change <= -STRONG_MOVE) return '흘러내린 하루';
  if (Math.abs(change) < FLAT_MOVE) return '보합';
  return change < 0 ? '약보합' : '강보합';
}

/**
 * 카드 설명 — **플레이가 정한다.** 제목이 시장을 말했으니 여기는 그날의 방어를 말한다.
 *
 * 우선순위는 "가장 특이했던 것" 하나다. 여러 문장을 이어붙이면 카드가 읽히지 않는다.
 */
export function cardDescription(card: CodexCard): string {
  if (card.baseHp >= card.maxBaseHp) {
    return '한 번도 내주지 않고 막아낸 날.';
  }
  const hpRatio = card.maxBaseHp > 0 ? card.baseHp / card.maxBaseHp : 0;
  if (hpRatio <= 0.1) {
    return `사옥 체력 ${card.baseHp}를 남기고 버텼다.`;
  }
  if (card.accuracy >= 0.9) {
    return '지루했지만 정확했던 하루.';
  }
  if (card.accuracy <= 0.4) {
    return '판단은 어긋났지만 방어선이 버텼다.';
  }
  if (Math.abs(card.changeRate) < FLAT_MOVE) {
    return '아무 일도 일어나지 않았다.';
  }
  return '장 마감까지 밀리지 않았다.';
}

/**
 * 시드 → 표시용 날짜 `YYYY.MM.DD`.
 *
 * ⚠️ **실제 거래일이 아니다.** 지금 차트는 전부 합성(`generateChartSet`)이라 진짜 날짜가
 * 존재하지 않는다. 그럼에도 날짜를 붙이는 이유는 도감이 "기록"이라는 성격을 가지려면
 * 시간 축이 필요하기 때문이다. 실데이터가 붙는 날 **이 함수만** 실제 거래일로 바꾼다.
 *
 * 결정론적이어야 한다 — 같은 시드는 언제 어디서 열어도 같은 날짜여야 카드가 안정적이다.
 * 주말·공휴일을 걸러내지는 않는다(합성 날짜에 달력 정합성을 요구할 이유가 없다).
 */
export function dateLabelFromSeed(seed: number): string {
  const normalized = Math.abs(Math.floor(seed));
  const year = 2024 + (normalized % 3);
  const month = 1 + (Math.floor(normalized / 3) % 12);
  const day = 1 + (Math.floor(normalized / 36) % 28);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${year}.${pad(month)}.${pad(day)}`;
}

/** `483000` → `08:03`. 목업의 `DURATION` 표기다. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** `+29.8%` / `-18.2%`. 부호를 항상 붙인다 — 방향이 카드의 첫 정보다. */
export function formatChange(rate: number): string {
  const sign = rate >= 0 ? '+' : '';
  return `${sign}${rate.toFixed(1)}%`;
}

// ── 카드 생성 ────────────────────────────────────────────────

/**
 * 390봉을 썸네일용 `THUMBNAIL_BARS`개로 압축한다.
 *
 * 구간 평균이 아니라 **구간의 시가와 종가**를 취한다 — 평균을 내면 장중 방향이 뭉개져
 * 모든 카드가 비슷하게 보인다. 목업의 카드들이 서로 다르게 읽히는 것은 구간 방향이
 * 살아 있기 때문이다.
 */
export function compressBars(
  bars: readonly Bar[],
  count: number = THUMBNAIL_BARS,
): readonly CodexBar[] {
  if (bars.length === 0 || count <= 0) return [];
  const size = bars.length / count;
  const out: CodexBar[] = [];
  for (let i = 0; i < count; i += 1) {
    const start = Math.floor(i * size);
    const end = Math.max(start, Math.floor((i + 1) * size) - 1);
    const first = bars[start];
    const last = bars[end] ?? first;
    if (!first || !last) continue;
    out.push({ o: first.o, c: last.c });
  }
  return out;
}

export interface MintCardInput {
  readonly stageId: StageId;
  readonly seed: number;
  readonly grade: SettlementGrade;
  readonly chart: ChartSet;
  readonly durationMs: number;
  readonly baseHp: number;
  readonly maxBaseHp: number;
  readonly accuracy: number;
}

/**
 * 클리어 1회 → 카드 1장. **순수 함수다** — 저장은 호출부(`progress.ts`)가 한다.
 *
 * ID를 `시드-지역`으로 잡는 이유: 같은 판을 다시 깨도 카드가 늘어나면 안 된다. 도감은
 * "몇 판 했는가"가 아니라 "몇 개의 서로 다른 날을 봤는가"를 세는 물건이다.
 */
export function mintCard(input: MintCardInput): CodexCard {
  const bars = input.chart.bars;
  return {
    id: `${input.seed}-${input.stageId}`,
    stageId: input.stageId,
    seed: input.seed,
    grade: input.grade,
    changeRate: changePercent(bars, bars.length - 1),
    hasEvent: input.chart.events.length > 0,
    durationMs: Math.max(0, Math.floor(input.durationMs)),
    baseHp: Math.max(0, Math.floor(input.baseHp)),
    maxBaseHp: Math.max(1, Math.floor(input.maxBaseHp)),
    accuracy: Math.min(1, Math.max(0, input.accuracy)),
    bars: compressBars(bars),
  };
}

// ── 컬렉션 질의 ──────────────────────────────────────────────

/** 수집 분모. 정원을 넘기면 분모가 따라 올라간다(카드를 버리지 않는다). */
export function codexTotal(cards: readonly CodexCard[]): number {
  return Math.max(CODEX_CAPACITY, cards.length);
}

/** 전설(= S등급) 카드 수. 목업 헤더의 "전설 2". */
export function legendaryCount(cards: readonly CodexCard[]): number {
  return cards.filter((card) => rarityOf(card.grade) === 'legendary').length;
}

export function filterCards(
  cards: readonly CodexCard[],
  filter: CodexFilter,
): readonly CodexCard[] {
  if (filter === 'all') return cards;
  return cards.filter((card) => categoryOf(card) === filter);
}

/**
 * 화면에 놓는 순서 — **희귀도 내림차순, 같으면 최근 시드 먼저**.
 *
 * 목업이 전설 카드를 왼쪽 큰 자리에 두는 이유가 이것이다: 도감을 열었을 때 가장 먼저
 * 보여야 하는 것은 "내가 제일 잘한 판"이다.
 */
const RARITY_RANK: Readonly<Record<CodexRarity, number>> = {
  legendary: 0,
  epic: 1,
  rare: 2,
  common: 3,
};

export function sortCards(cards: readonly CodexCard[]): readonly CodexCard[] {
  return [...cards].sort((a, b) => {
    const rank = RARITY_RANK[rarityOf(a.grade)] - RARITY_RANK[rarityOf(b.grade)];
    if (rank !== 0) return rank;
    return b.seed - a.seed;
  });
}

/** 필터 문자열 검증 (버튼 `dataset` 값용). 모르는 값은 `all`로 떨어진다. */
export function codexFilterFor(value: string | undefined): CodexFilter {
  if (value === 'surge' || value === 'plunge' || value === 'disclosure') return value;
  return 'all';
}

// ── 마크업 ───────────────────────────────────────────────────

const TITLE_ID = 'codex-title';

const FILTER_TABS: readonly { readonly id: CodexFilter; readonly label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'surge', label: '급등' },
  { id: 'plunge', label: '급락' },
  { id: 'disclosure', label: '공시' },
];

/** 미획득 자리에 뜨는 문구. 어느 지역에서 나오는지까지 말한다. */
export function lockedSlotLabel(stageId: StageId | 'boss'): string {
  return stageId === 'boss' ? '미획득 · 보스전' : `미획득 · ${stageId}`;
}

function thumbnailMarkup(card: CodexCard): string {
  const values = card.bars.flatMap((bar) => [bar.o, bar.c]);
  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 1;
  const span = max - min || 1;

  const bars = card.bars
    .map((bar) => {
      const up = bar.c >= bar.o;
      const top = Math.max(bar.o, bar.c);
      const bottom = Math.min(bar.o, bar.c);
      // 높이는 실제 몸통, 바닥은 최저가 기준 오프셋. 둘 다 0~100%로 정규화한다.
      const height = Math.max(4, ((top - bottom) / span) * 100);
      const offset = ((bottom - min) / span) * 100;
      return `<span class="codex-bar${up ? ' codex-bar--up' : ' codex-bar--down'}"
              style="height:${height.toFixed(1)}%;bottom:${offset.toFixed(1)}%"></span>`;
    })
    .join('');

  return `<span class="codex-card__chart" aria-hidden="true">${bars}</span>`;
}

function statRow(label: string, value: string): string {
  return `
          <div class="codex-card__stat">
            <span class="codex-card__stat-label">${label}</span>
            <span class="codex-card__stat-value">${value}</span>
          </div>`;
}

/** 카드 한 장의 마크업. 목업 카드의 정보 순서를 그대로 따른다. */
export function cardMarkup(card: CodexCard): string {
  const rarity = rarityOf(card.grade);
  const up = card.changeRate >= 0;
  return `
      <li class="codex-card codex-card--${rarity}" data-category="${categoryOf(card)}">
        <div class="codex-card__head">
          <span class="codex-card__rarity">${RARITY_LABEL[rarity]}</span>
          <span class="codex-card__date">${dateLabelFromSeed(card.seed)}</span>
        </div>
        <div class="codex-card__figure">
          ${thumbnailMarkup(card)}
          <span class="codex-card__change codex-card__change--${up ? 'up' : 'down'}">
            ${up ? '▲' : '▼'} ${formatChange(card.changeRate)}
          </span>
        </div>
        <div class="codex-card__body">
          <h3 class="codex-card__title">${cardTitle(card)}</h3>
          <p class="codex-card__desc">${cardDescription(card)}</p>
          <div class="codex-card__stats">
            ${statRow('DURATION', formatDuration(card.durationMs))}
            ${statRow('HP LEFT', `${card.baseHp} / ${card.maxBaseHp}`)}
            ${statRow('ACCURACY', `${(card.accuracy * 100).toFixed(1)}%`)}
          </div>
          <div class="codex-card__foot">
            <span class="codex-card__region">${card.stageId}</span>
            <span class="codex-card__rank">RANK ${card.grade}</span>
          </div>
        </div>
      </li>`;
}

/** 미획득 슬롯. 목업 아래줄의 점선 카드다. */
export function emptySlotMarkup(label: string): string {
  return `
      <li class="codex-card codex-card--empty" aria-hidden="true">
        <span class="codex-card__lock"></span>
        <span class="codex-card__empty-label">${label}</span>
      </li>`;
}

export interface CodexViewOptions {
  readonly filter?: CodexFilter;
  /** 빈 슬롯을 몇 개까지 채울지. 그리드가 휑해 보이지 않게 하는 장치다. */
  readonly minSlots?: number;
}

export const CODEX_MIN_SLOTS = 4;

/**
 * 도감 본문(헤더 + 그리드). **`stage.ts`가 필터를 바꿀 때마다 이 함수를 다시 부른다** —
 * 카드 수가 적어 전체를 다시 그리는 편이 부분 갱신보다 단순하고 어긋날 여지가 없다.
 */
export function buildCodexBodyMarkup(
  cards: readonly CodexCard[],
  options: CodexViewOptions = {},
): string {
  const filter = options.filter ?? 'all';
  const minSlots = options.minSlots ?? CODEX_MIN_SLOTS;
  const visible = sortCards(filterCards(cards, filter));

  const filled = visible.map(cardMarkup).join('');
  const missing = Math.max(0, minSlots - visible.length);
  const empties = Array.from({ length: missing }, () =>
    emptySlotMarkup(cards.length === 0 ? '미획득 · 첫 클리어로 획득' : '미획득'),
  ).join('');

  const tabs = FILTER_TABS.map(
    (tab) => `
          <button class="codex__tab${tab.id === filter ? ' codex__tab--on' : ''}" type="button"
                  data-action="${CODEX_FILTER_ACTION}" data-filter="${tab.id}"
                  aria-pressed="${tab.id === filter}">${tab.label}</button>`,
  ).join('');

  return `
      <div class="codex__head">
        <div class="codex__heading">
          <h2 class="codex__title" id="${TITLE_ID}">${CODEX_TITLE}</h2>
          <p class="codex__count">수집 ${cards.length} / ${codexTotal(cards)} · 전설 ${legendaryCount(cards)}</p>
        </div>
        <div class="codex__tabs" role="group" aria-label="분류">${tabs}</div>
      </div>
      <ul class="codex__grid">${filled}${empties}</ul>`;
}

/**
 * 도감 오버레이 껍데기. **`hidden`으로 태어난다** — 타이틀에서 [도감]을 눌러야 열린다.
 * 본문은 열 때 `buildCodexBodyMarkup`으로 채운다(수집물이 플레이 중 늘어나기 때문).
 */
export function buildCodexMarkup(): string {
  return `
    <div class="codex" data-ref="codex" role="dialog" aria-modal="true"
         aria-labelledby="${TITLE_ID}" hidden>
      <div class="codex__panel">
        <div data-ref="codex-body"></div>
        <button class="codex__back" type="button" data-action="${CODEX_BACK_ACTION}">
          ${CODEX_BACK_LABEL}
        </button>
      </div>
    </div>
  `;
}
