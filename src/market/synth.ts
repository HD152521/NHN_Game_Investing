/**
 * 합성 1분봉 생성기 — 실제 종목 데이터가 준비되기 전까지 리플레이 엔진을 구동한다.
 *
 * 시드 기반 결정론적 PRNG(mulberry32)만 사용한다. `Math.random()`을 쓰면 같은 입력이
 * 매번 다른 결과를 내서 헤드리스 테스트와 리플레이 재현이 불가능해진다.
 * 새 의존성 추가도 금지되어 있어 PRNG는 직접 구현한다.
 */

import { BASELINE_DAILY_AVG_VOLUME, sigma30, volumeMultiple } from './stats';
import type { Archetype, Bar, ChartSet, MarketEvent, MarketEventKind } from './types';
import { BARS_PER_DAY, STAGE_DURATION_MS } from './types';

const ARCHETYPES: readonly Archetype[] = ['surge', 'plunge', 'range', 'reversal'];

/** 시가 기준값(원). 게임 화면은 시가 대비 %만 보여주므로(FR-4.1) 절대값 자체는 중요하지 않다. */
const DEFAULT_START_PRICE = 50_000;
/** 시작가를 매 시드마다 조금씩 흔드는 폭(%). 완전히 같은 시작가만 나오면 재미가 없다. */
const START_PRICE_JITTER_PCT = 5;

/**
 * 봉 1개당 곱셈 잡음 스텝의 절반 폭(%). 매 봉마다 이 스텝을 누적 곱셈으로 쌓아
 * 진짜 랜덤워크를 만든다(과거에는 매 봉이 기준선 대비 독립 잡음을 얹는 방식이라
 * "k봉 이동폭이 k에 따라 커진다"는 랜덤워크의 기본 성질이 깨져 있었다).
 *
 * 균등분포 [-A, A]의 표준편차는 A/√3 이므로, 1봉 표준편차 std1 ≈ NOISE_STEP_PCT/√3 이고
 * k봉 누적 표준편차는 독립 증분의 합이라 std1 × √k 로 커진다. 이 값은 40개 시드 ×
 * 아키타입 4종에 대해 (1) k=2/10/30/60 이동폭 표준편차가 단조증가하고 (2) 2봉 |z|
 * 중앙값이 0.4 미만이며 (3) 30봉 |z| 중앙값이 0.6~1.8 범위에 들고 (4) classifyArchetype
 * 오분류가 없는 지점을 찾아 정한 값이다(.tmp 스윕 스크립트로 검증, 보고서 참고).
 */
const NOISE_STEP_PCT = 0.2;

/** 급등/급락 하루 총 등락 목표치(%). 누적 잡음의 하루치 표준편차(약 2%대)보다 한참 커서 방향성이 항상 보존된다. */
const SURGE_TOTAL_PCT = 18;
const PLUNGE_TOTAL_PCT = -18;

/** 횡보 아키타입의 진동 폭(%)과 하루 동안 왕복 횟수. 시가로 되돌아오도록 정수 사이클을 쓴다. */
const RANGE_AMPLITUDE_PCT = 4;
const RANGE_OSCILLATIONS = 2;

/** 반전 아키타입의 중반 피크 진폭(%). 전반부·후반부가 반대 부호를 갖도록 사인 곡선을 쓴다. */
const REVERSAL_AMPLITUDE_PCT = 12;

/** 캔들 꼬리(위/아래 wick) 최대 길이 — 몸통(시가·종가 중 큰/작은 값) 대비 비율(%). */
const WICK_MAX_PCT = 0.3;

/** 거래량 잡음 폭 (±%). 기준 거래량은 stats.ts의 20일 평균 기준선과 동일 값을 공유한다. */
const VOLUME_JITTER_PCT = 40;
const BASE_VOLUME = BASELINE_DAILY_AVG_VOLUME;

/** 이벤트가 발동할 수 있는 구간(하루 진행률 기준). 초반·막판은 제외해 급발진처럼 보이지 않게 한다. */
const EVENT_WINDOW_START_FRACTION = 0.3;
const EVENT_WINDOW_END_FRACTION = 0.8;

/**
 * mulberry32 시드 PRNG. 32비트 정수 시드 하나로 결정론적 [0, 1) 실수 스트림을 만든다.
 * 표준 공개 구현체와 동일한 상수를 쓴다 — 품질이 검증된 조합이라 임의로 바꾸지 않는다.
 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** rng() 결과를 [-1, 1) 범위로 펼친다. 대칭 잡음을 만들 때 반복 등장하는 패턴이라 뽑아냈다. */
function signedUnit(rng: () => number): number {
  return rng() * 2 - 1;
}

function pickArchetype(rng: () => number): Archetype {
  const index = Math.min(Math.floor(rng() * ARCHETYPES.length), ARCHETYPES.length - 1);
  return ARCHETYPES[index] ?? 'range';
}

/**
 * 하루 진행률 `f`(0~1) 시점의 목표 등락률(%). 아키타입별 "모양"이 실제로 갈리는 지점이다.
 *
 * - surge/plunge: 시가부터 선형으로 벌어지는 단일 방향 추세.
 * - range: 정수 사이클 사인파라 f=0과 f=1에서 모두 0으로 돌아온다 (평균회귀).
 * - reversal: f=0.5(중반)에서 피크를 찍고 f=1에서 다시 0으로 — 전반부·후반부 부호가 반대가 된다.
 */
function trendPercentAt(archetype: Archetype, f: number, reversalSign: number): number {
  switch (archetype) {
    case 'surge':
      return SURGE_TOTAL_PCT * f;
    case 'plunge':
      return PLUNGE_TOTAL_PCT * f;
    case 'range':
      return RANGE_AMPLITUDE_PCT * Math.sin(2 * Math.PI * RANGE_OSCILLATIONS * f);
    case 'reversal':
      return reversalSign * REVERSAL_AMPLITUDE_PCT * Math.sin(Math.PI * f);
    default:
      return 0;
  }
}

/**
 * 하루 진행률 `f` 시점의 거래량 배율. 급등/급락은 후반부로 갈수록(추격매수·패닉 심리),
 * 반전은 방향이 꺾이는 중반에 거래량이 몰리도록 설계했다. 횡보는 특별한 굴곡이 없다.
 */
function volumeBoostAt(archetype: Archetype, f: number): number {
  switch (archetype) {
    case 'surge':
    case 'plunge':
      return 1 + 1.5 * f;
    case 'reversal':
      return 1 + Math.sin(Math.PI * f);
    case 'range':
    default:
      return 1;
  }
}

/**
 * 블라인드 규칙(FR-4.5)을 지키는 불투명 ID를 만든다. seed를 그대로 문자열화하면
 * 봇이 조합을 브루트포스로 역추적할 실마리가 되므로, PRNG를 한 번 더 통과시켜
 * seed와 직접 대응되지 않는 16진수 문자열로 흩뿌린다.
 */
function createOpaqueId(rng: () => number): string {
  const part1 = Math.floor(rng() * 0xffffffff).toString(16).padStart(8, '0');
  const part2 = Math.floor(rng() * 0xffffffff).toString(16).padStart(8, '0');
  return `cs_${part1}${part2}`;
}

/**
 * FR-7 시장 이벤트(패닉셀/FOMO 랠리)의 최소 골격만 채운다.
 * 실제 이벤트 밸런싱·최대 4개 배치는 오프라인 파이프라인(§10 ④)의 몫이며,
 * 여기서는 아키타입과 어울리는 이벤트 1개를 대표로 심어 데이터 계약을 만족시킨다.
 */
function generateEvents(archetype: Archetype, rng: () => number): MarketEvent[] {
  const kind: MarketEventKind | null =
    archetype === 'plunge' ? 'panic_sell' : archetype === 'surge' ? 'fomo_rally' : null;

  if (!kind) {
    return [];
  }

  const fraction =
    EVENT_WINDOW_START_FRACTION + rng() * (EVENT_WINDOW_END_FRACTION - EVENT_WINDOW_START_FRACTION);
  const atMs = Math.round(fraction * STAGE_DURATION_MS);
  return [{ atMs, kind }];
}

/**
 * 시드 기반 결정론적 합성 1분봉 세트를 만든다.
 *
 * `archetype`을 생략하면 시드로부터 결정론적으로 하나를 골라 배정한다
 * (같은 시드 → 같은 아키타입 → 같은 결과).
 */
export function generateChartSet(seed: number, archetype?: Archetype): ChartSet {
  const rng = mulberry32(seed);
  const resolvedArchetype = archetype ?? pickArchetype(rng);
  const startPrice = DEFAULT_START_PRICE * (1 + (signedUnit(rng) * START_PRICE_JITTER_PCT) / 100);
  const reversalSign = rng() < 0.5 ? 1 : -1;

  const bars: Bar[] = [];
  let previousClose = startPrice;
  // 잡음 누적 계수. 매 봉마다 독립적인 작은 스텝을 곱해 나가는 진짜 랜덤워크다.
  // (봉 t까지의 표준편차가 √t로 커지므로, 오래 들고 있을수록 가격이 더 크게 움직인다.)
  let noiseFactor = 1;

  for (let t = 0; t < BARS_PER_DAY; t += 1) {
    const f = t / (BARS_PER_DAY - 1);
    const trendPct = trendPercentAt(resolvedArchetype, f, reversalSign);
    noiseFactor *= 1 + (signedUnit(rng) * NOISE_STEP_PCT) / 100;
    const close = startPrice * (1 + trendPct / 100) * noiseFactor;
    const open = t === 0 ? startPrice : previousClose;

    const bodyHigh = Math.max(open, close);
    const bodyLow = Math.min(open, close);
    // wick 계수는 항상 1 미만이라 high는 몸통보다 크고, low는 몸통보다 작으면서도 항상 양수다.
    const high = bodyHigh + bodyHigh * ((rng() * WICK_MAX_PCT) / 100);
    const low = bodyLow - bodyLow * ((rng() * WICK_MAX_PCT) / 100);

    const volume = Math.max(
      1,
      Math.round(
        BASE_VOLUME * (1 + (signedUnit(rng) * VOLUME_JITTER_PCT) / 100) * volumeBoostAt(resolvedArchetype, f),
      ),
    );

    bars.push({ t, o: open, h: high, l: low, c: close, v: volume });
    previousClose = close;
  }

  const id = createOpaqueId(rng);
  const events = generateEvents(resolvedArchetype, rng);

  return {
    id,
    bars,
    sigma30: sigma30(bars),
    archetype: resolvedArchetype,
    events,
    volumeMultiple: volumeMultiple(bars),
  };
}
