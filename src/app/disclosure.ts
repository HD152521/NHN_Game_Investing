/**
 * DISCLOSURE — 판이 끝나고 "그날은 어떤 날이었나 / 나는 어떻게 했나"를 마주 놓는 화면.
 *
 * 목업 `result`(§5)의 구현이다. 예측 vs 실제를 나란히 두고 등급 인장과 보상을 찍는다.
 *
 * ★★ 왜 목업 상단 카드를 그대로 만들지 않았는가 — 지우지 마라 ★★
 * 목업은 상단에 이렇게 규정했다:
 *
 *     2026.07.30 · KRX    정기공시
 *     분기 실적 발표 / 영업이익 +31.4%
 *
 * **만들지 않았다.** 지금 차트는 전부 합성(`generateChartSet`)이라 그런 공시가 **존재하지
 * 않는다.** 종목명·거래소·공시 본문·영업이익을 지어내면, 이 게임이 시작 게이트에서 약속한
 * **"막아내면 이것이 어느 회사의 어떤 날이었는지 공개된다"**(`GATE_HINT`)가 첫 판부터
 * 거짓이 된다. 정체 공개는 이 게임의 **유일한 훅**이고, 그것을 가짜로 채우면 남는 게 없다.
 *
 * 대신 상단 카드는 **"그날의 성격"**으로 채운다 — 아키타입과 시장 이벤트는 합성기가 실제로
 * 정한 값이므로 **지금 말할 수 있는 진실**이다. 실데이터가 붙는 날 이 자리를 진짜 공시로
 * 교체하면 되고, 그때까지 화면은 거짓말을 하지 않는다.
 *
 * ⚠️ **다음 사람에게**: 이 자리가 비어 보인다고 종목명·날짜를 채워 넣지 마라.
 * 빠뜨린 것이 아니라 **일부러 두고 간 것**이다. `reveal.ts`의 `blockedBy`와 같은 이유다.
 *
 * ★ 색 규칙 ★ 팔레트에 **초록이 없다**. 목업에 "상승 녹색"이라 적혀 있어도 따르지 않는다 —
 * 한국식 상승=적(`UP_ALLY`) / 하락=청(`ENEMY_DOWN`)이 이 게임의 어휘다(FR-5.10).
 * 이 파일은 **팔레트 토큰 이름만** 돌려주고 HEX를 만들지 않는다.
 */

import type { PaletteToken } from '../design';
import type { Archetype, MarketEventKind } from '../market';
import type { ClosedPosition, Direction } from '../position';
import type { Settlement, StageOutcome } from './settlement';

/** 상단 카드 — 목업의 "정기공시" 자리에 들어가는 **그날의 성격**. */
export interface DayCharacter {
  /** 머리띠 문구. 실데이터가 붙으면 `2026.07.30 · KRX 정기공시`가 될 자리다. */
  readonly eyebrow: string;
  /** 굵은 한 줄. 아키타입이 규정하는 그날의 이름. */
  readonly headline: string;
  /** 큰 수치 — 그날의 등락률. */
  readonly figure: string;
  readonly figureTone: PaletteToken;
  /** 한 줄 설명. 시장 이벤트가 있었으면 그것까지 말한다. */
  readonly note: string;
}

/** 예측 vs 실제 대조 한 줄. */
export interface DisclosureRow {
  readonly label: string;
  readonly value: string;
  readonly tone?: PaletteToken;
}

export interface DisclosureInput {
  readonly outcome: StageOutcome;
  readonly settlement: Settlement;
  readonly closes: readonly ClosedPosition[];
  readonly archetype: Archetype;
  /** 그날 발동한 시장 이벤트 종류들. 없으면 빈 배열. */
  readonly events: readonly MarketEventKind[];
  /** 시가 → 종가 등락률(%). */
  readonly dayChangePct: number;
  /** 방어에 성공한 웨이브 수와 전체 수. */
  readonly wavesHeld: number;
  readonly waveCount: number;
  /** 이번 판이 발행한 도감 카드 수(0 또는 1). */
  readonly cardsEarned: number;
}

export interface Disclosure {
  readonly character: DayCharacter;
  readonly rows: readonly DisclosureRow[];
  /** 등급 인장. 패배면 등급을 찍지 않는다. */
  readonly seal: string | null;
  readonly sealTone: PaletteToken;
  /** 보상 3종. 받은 것이 없으면 빈 배열이다. */
  readonly rewards: readonly string[];
  /** 하단 안내. */
  readonly footer: string;
}

/** 아키타입 → 그날의 이름. 합성기가 실제로 정한 값이라 지어낸 것이 아니다. */
const ARCHETYPE_NAME: Readonly<Record<Archetype, string>> = {
  surge: '급등한 날',
  plunge: '무너진 날',
  range: '아무 일도 없던 날',
  reversal: '뒤집힌 날',
};

/** 아키타입 → 한 줄 설명. 플레이어가 "그래서 어떤 장이었나"를 읽게 한다. */
const ARCHETYPE_NOTE: Readonly<Record<Archetype, string>> = {
  surge: '장 내내 위로 밀렸다. 따라갔다면 벌었고, 의심했다면 놓쳤다.',
  plunge: '아래로만 흘렀다. 반등을 기다린 쪽이 가장 크게 다쳤다.',
  range: '방향이 없었다. 수수료만 쌓이는 장이다.',
  reversal: '한 번 접혔다. 초반의 확신이 후반에 벌을 받는 모양이다.',
};

const EVENT_NOTE: Readonly<Record<MarketEventKind, string>> = {
  panic_sell: '투매가 한 번 지나갔다.',
  fomo_rally: '추격 매수가 한 번 붙었다.',
};

function signedPercent(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

/** 등락률의 색 — 한국식. 상승 `UP_ALLY`(적) / 하락 `ENEMY_DOWN`(청). */
function changeTone(pct: number): PaletteToken {
  return pct >= 0 ? 'UP_ALLY' : 'ENEMY_DOWN';
}

/**
 * 그날의 성격 카드.
 *
 * 실데이터가 없어도 **전부 참인 정보**다: 아키타입은 합성기가 고른 값이고, 이벤트는
 * `ChartSet.events`에 실제로 들어 있으며, 등락률은 봉에서 계산한 것이다.
 */
export function dayCharacterOf(input: DisclosureInput): DayCharacter {
  const eventNotes = input.events.map((kind) => EVENT_NOTE[kind]).filter((note) => note !== undefined);
  return {
    // 실데이터가 붙으면 여기가 `2026.07.30 · KRX · 정기공시`가 된다.
    eyebrow: '그날의 성격',
    headline: ARCHETYPE_NAME[input.archetype],
    figure: signedPercent(input.dayChangePct),
    figureTone: changeTone(input.dayChangePct),
    note: [ARCHETYPE_NOTE[input.archetype], ...eventNotes].join(' '),
  };
}

/**
 * 플레이어가 실제로 건 방향 — **가장 크게 걸었던 포지션**의 방향으로 본다.
 *
 * 여러 번 매매하면 방향이 섞인다. 횟수로 세면 "잽만 여러 번 날린 쪽"이 대표가 되므로,
 * **투입 원금 합계**가 큰 쪽을 그 사람의 판단으로 읽는다. 동률이면 판단이 없었던 것이다.
 */
export function dominantDirectionOf(closes: readonly ClosedPosition[]): Direction | null {
  let long = 0;
  let short = 0;
  for (const close of closes) {
    if (close.direction === 'long') {
      long += close.stake;
    } else {
      short += close.stake;
    }
  }
  if (long === short) {
    return null;
  }
  return long > short ? 'long' : 'short';
}

function directionLabel(direction: Direction | null): string {
  if (direction === null) {
    return '판단 없음';
  }
  return direction === 'long' ? '▲ 상승 · LONG' : '▼ 하락 · SHORT';
}

/** 등급 인장 색. 패배는 등급과 무관하게 `ENEMY_DOWN`이다 — 진 판이 금색이면 거짓말이다. */
function sealToneOf(outcome: StageOutcome, grade: string): PaletteToken {
  if (outcome !== 'cleared') {
    return 'ENEMY_DOWN';
  }
  return grade === 'S' || grade === 'A' ? 'GOLD' : 'TEXT';
}

/**
 * 화면에 찍을 내용 전부.
 *
 * ★ FR-9.5 — 패배해도 보여준다 ★ 실패해도 정체를 알려줘야 재도전 동기가 생긴다.
 * `cleared`/`defeated`/`unresolved` 셋 다 화면이 뜨고, 문구와 인장만 달라진다.
 */
export function buildDisclosure(input: DisclosureInput): Disclosure {
  const character = dayCharacterOf(input);
  const predicted = dominantDirectionOf(input.closes);
  const actualUp = input.dayChangePct >= 0;

  const rows: DisclosureRow[] = [
    {
      label: '당신의 예측',
      value: directionLabel(predicted),
      // 방향을 걸지 않았으면 색으로 강조하지 않는다 — 성취도 실패도 아니다.
      ...(predicted === null ? {} : { tone: predicted === 'long' ? 'UP_ALLY' : 'ENEMY_DOWN' }),
    },
    {
      label: '실제 결과',
      value: `${actualUp ? '▲' : '▼'} ${signedPercent(input.dayChangePct)}`,
      tone: changeTone(input.dayChangePct),
    },
  ];

  // 맞췄는지는 **방향을 걸었을 때만** 말한다. 안 걸었는데 "틀렸다"고 하면 거짓이다.
  if (predicted !== null) {
    const hit = (predicted === 'long') === actualUp;
    rows.push({
      label: '적중',
      value: hit ? '방향을 맞췄다' : '방향이 어긋났다',
      tone: hit ? 'GOLD' : 'MUTED',
    });
  }

  rows.push({
    label: '방어한 웨이브',
    value: `${input.wavesHeld} / ${input.waveCount}`,
    tone: input.wavesHeld >= input.waveCount ? 'GOLD' : 'MUTED',
  });

  // 매매를 한 판에서만 적중률을 싣는다 — "0번 중 0번"은 성적이 아니라 오류로 읽힌다.
  if (input.closes.length > 0) {
    rows.push({
      label: '적중률',
      value: `${(input.settlement.accuracy * 100).toFixed(1)}%`,
      tone: 'GOLD',
    });
  }

  const rewards: string[] = [];
  if (input.settlement.capital > 0) {
    rewards.push(`자본금 +${input.settlement.capital}`);
  }
  if (input.settlement.aumCredit > 0) {
    rewards.push(`AUM 크레딧 +${input.settlement.aumCredit}`);
  }
  if (input.cardsEarned > 0) {
    rewards.push(`도감 카드 ${input.cardsEarned}장`);
  }

  return {
    character,
    rows,
    // 패배한 판에 등급 인장을 찍지 않는다. 자본금이 0인데 S가 박혀 있으면 안 된다.
    seal: input.outcome === 'cleared' ? input.settlement.grade : null,
    sealTone: sealToneOf(input.outcome, input.settlement.grade),
    rewards,
    footer:
      input.outcome === 'cleared'
        ? '방어에 성공했다 — 이 판은 도감에 남는다'
        : '이번엔 지켜내지 못했다 — 그래도 그날이 어떤 날이었는지는 남는다',
  };
}
