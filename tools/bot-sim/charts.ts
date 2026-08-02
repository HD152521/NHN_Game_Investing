/**
 * 차트 공급원(regime) — 봇에게 먹일 `ChartSet`을 만든다.
 *
 * ★ 왜 공급원이 둘인가 ★
 * `src/market/synth.ts`의 `generateChartSet`은 아키타입별 **결정론적 추세**(surge = 하루 +18%
 * 선형)를 깔고 그 위에 작은 랜덤워크 잡음을 얹는다. 그 결과 surge/plunge 차트의 하루 등락은
 * `sigma30` 대비 **±31σ**에 달한다(측정값, `probe` 참고). 이런 차트에서는 "추세를 감지해서
 * 따라간다"가 사실상 정답지를 읽는 것과 같아, 봇이 목표 수익률을 몇 배로 넘겨버린다.
 *
 * 그러면 RK-2("블라인드 차트에서 승률 50%를 넘길 방법이 없다")를 **검증할 수 없다** —
 * 통과해도 그건 합성기의 성질이지 게임의 성질이 아니기 때문이다. 그래서 실제 장중 1분봉의
 * 통계적 성질(무추세 마팅게일 + 변동성 군집 + U자 거래량)에 맞춘 `martingale` 공급원을
 * 함께 두고, **두 공급원 모두에서 판정을 낸다.**
 *
 * `martingale`은 `src/`를 수정하지 않고 만들 수 있다 — `ChartSet`은 인터페이스일 뿐이고
 * `sigma30`/`volumeMultiple`/`classifyArchetype`이 전부 공개돼 있기 때문이다.
 */

import type { Bar, ChartSet } from '../../src/market/index.js';
import { BARS_PER_DAY, classifyArchetype, generateChartSet, sigma30, volumeMultiple } from '../../src/market/index.js';
import { gaussian, mulberry32 } from './rng.js';

/** 차트 공급원 식별자. */
export type ChartRegime = 'synth' | 'martingale';

export const CHART_REGIMES: readonly ChartRegime[] = ['synth', 'martingale'];

/** 시가 기준값(원). 화면은 시가 대비 %만 쓰므로 절대값 자체는 의미가 없다. */
const START_PRICE = 50_000;

/**
 * 1분봉 로그수익률의 기본 표준편차(%). 국내 대형주 장중 1분봉의 실측 대역(0.08~0.20%)
 * 가운데를 잡았다. 이 값이 곧 `sigma30 ≈ BASE_VOL × √30 ≈ 0.66%`를 결정한다.
 */
const BASE_VOL_PCT = 0.12;

/** 종목마다 변동성이 다르므로 차트별 배율을 로그정규(σ = 0.35)로 흔든다. */
const VOL_DISPERSION = 0.35;

/** 변동성 군집(GARCH 유사) — 직전 봉의 충격이 다음 봉 변동성에 남는 정도. */
const VOL_PERSISTENCE = 0.94;
const VOL_SHOCK = 0.06;

/** 장 시작·마감에 변동성과 거래량이 몰리는 U자 강도. 1.0이면 U자 없음. */
const U_SHAPE_STRENGTH = 1.6;

/** 20일 평균 거래량 기준선(`src/market/stats.ts`와 같은 값). */
const BASE_VOLUME = 100_000;
const VOLUME_NOISE = 0.35;

/** 캔들 꼬리 최대 길이 — 몸통 대비 비율(%). */
const WICK_MAX_PCT = 0.3;

/**
 * 장중 U자 곡선. `f`는 하루 진행률(0~1)이고 개장·마감에서 최대, 정오 부근에서 1이 된다.
 * 실측 장중 변동성·거래량 프로파일의 표준적인 근사다.
 */
function uShape(f: number): number {
  const centered = 2 * f - 1; // -1(개장) ~ +1(마감)
  return 1 + (U_SHAPE_STRENGTH - 1) * centered * centered;
}

/**
 * 무추세(마팅게일) 1분봉 세트를 만든다 — **실제 블라인드 차트의 대역**.
 *
 * 드리프트를 정확히 0으로 두는 것이 핵심이다. 아무리 작은 드리프트라도 하루 390봉에
 * 누적되면 "그냥 그 방향으로 걸면 이긴다"가 성립해서 검증이 다시 무의미해진다.
 * 여기서 나오는 가격 경로는 정의상 마팅게일이므로, **어떤 전략도 기대 z를 0 위로
 * 올릴 수 없다**는 것이 이론적 상한이고, 시뮬레이터는 그 상한을 실측으로 재현한다.
 */
function generateMartingaleChart(seed: number): ChartSet {
  const rng = mulberry32(seed ^ 0x5f3759df);
  const volScale = Math.exp(gaussian(rng) * VOL_DISPERSION);
  const bars: Bar[] = [];

  let price = START_PRICE;
  let previousClose = START_PRICE;
  // 변동성 상태(분산 배율). 1에서 시작해 충격을 받으며 군집을 만든다.
  let volState = 1;

  for (let t = 0; t < BARS_PER_DAY; t += 1) {
    const f = t / (BARS_PER_DAY - 1);
    const shock = gaussian(rng);
    volState = VOL_PERSISTENCE * volState + VOL_SHOCK * shock * shock;
    const stepPct = BASE_VOL_PCT * volScale * Math.sqrt(Math.max(volState, 0.1)) * Math.sqrt(uShape(f));

    const open = t === 0 ? START_PRICE : previousClose;
    // 로그수익률로 굴려야 가격이 음수로 내려갈 수 없고 수익률 대칭성도 유지된다.
    price = price * Math.exp((stepPct / 100) * gaussian(rng));
    const close = price;

    const bodyHigh = Math.max(open, close);
    const bodyLow = Math.min(open, close);
    const high = bodyHigh + bodyHigh * ((rng() * WICK_MAX_PCT) / 100);
    const low = bodyLow - bodyLow * ((rng() * WICK_MAX_PCT) / 100);

    // 거래량은 U자 프로파일 × |수익률|(큰 움직임에 거래가 붙는다) × 잡음.
    const moveIntensity = 1 + Math.abs((close - open) / open) * 100;
    const volume = Math.max(
      1,
      Math.round(BASE_VOLUME * uShape(f) * moveIntensity * (1 + (rng() * 2 - 1) * VOLUME_NOISE)),
    );

    bars.push({ t, o: open, h: high, l: low, c: close, v: volume });
    previousClose = close;
  }

  const idPart = Math.floor(rng() * 0xffffffff).toString(16).padStart(8, '0');
  return {
    id: `bm_${idPart}`,
    bars,
    sigma30: sigma30(bars),
    archetype: classifyArchetype(bars),
    events: [],
    volumeMultiple: volumeMultiple(bars),
  };
}

/** 공급원 이름과 시드로 `ChartSet` 하나를 만든다. */
export function makeChart(regime: ChartRegime, seed: number): ChartSet {
  return regime === 'synth' ? generateChartSet(seed) : generateMartingaleChart(seed);
}
