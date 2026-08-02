/**
 * 전략 레지스트리 — 새 전략은 여기에 한 줄 등록하면 결과 표에 자동으로 나타난다.
 *
 * ★ 투입 비율을 전부 **전액(1.0)**으로 고정한 이유 ★
 * 클리어 판정은 ρ만으로 결정되지 않는다. 총골드는 `S × (1 + ρ) × 0.50`이므로 **세션 총
 * 투입액 S를 얼마나 소진했는가**가 ρ와 같은 비중으로 작용한다. 청산이 AUM을 되돌리지
 * 않기 때문에(FR-5.7), 투입 비율을 낮추면 남은 AUM이 그대로 사장돼 ρ가 아무리 좋아도
 * 필요지출에 닿지 못한다. 전액 투입은 FR-5.1의 정식 프리셋이면서 S 소진율을 최대로
 * 끌어올리는 설정이므로, **각 전략에 가장 유리한 조건**에서 판정을 내리게 된다.
 * (실제 소진율은 결과 표의 `S소진` 열로 확인할 수 있다.)
 */

import type { BotStrategy } from '../types.js';
import { REVIEW_DISCIPLINE, withDiscipline } from './discipline.js';
import { createRandomBot } from './random.js';
import { createTrendBot } from './trend.js';
import { createVolumeBot } from './volume.js';

/** 기본 투입 비율(FR-5.1 프리셋 중 '전액'). `--stake`로 바꿀 수 있다. */
export const DEFAULT_STAKE_RATIO = 1.0;

/** 기본 보유 구간(봉). `sigma30`의 기준 창과 같게 맞춰 z 해석을 단순하게 유지한다. */
const DEFAULT_HOLD_BARS = 30;

/**
 * 급증 임계값 1.20 — 실측으로 정한 값이다.
 *
 * 두 공급원 모두에서 `3봉 평균 / 30봉 평균` 비율의 분포는 p50 ≈ 1.00, p95 ≈ 1.21,
 * 최대 ≈ 1.57이다. 처음에 상식적으로 잡았던 1.5는 **전체 봉의 0.01% 미만**에서만 걸려
 * 봇이 200판 내내 한 번도 진입하지 않았다(측정 후 발견). 1.20은 상위 약 5%에 해당해
 * "가끔 오는 진짜 급증"이라는 의도와 맞고, 판당 진입 기회도 충분히 생긴다.
 */
const VOLUME_SURGE_RATIO = 1.2;

/**
 * 주어진 투입 비율로 전략 세트를 만든다.
 *
 * 투입 비율이 전략 정의의 일부인 이유는 그것이 **결과를 지배하는 변수**이기 때문이다.
 * 전액 투입은 S 소진율을 최대로 끌어올리지만, 시작 AUM이 세션 총 투입의 절반을 넘으므로
 * (R1은 2,000 / 3,950 = 51%) **첫 거래 한 방이 세션 전체의 승패를 결정한다** — 세션 ρ가
 * 사실상 이산 분포가 되어 클리어가 실력이 아니라 분산의 함수가 된다. 낮은 비율은 반대로
 * 거래 수를 늘려 ρ를 안정시키지만 소진하지 못한 AUM이 사장된다. 두 설정을 모두 돌려봐야
 * "목표 ρ에 닿을 수 있는가"를 제대로 판정할 수 있다.
 */
export function createStrategies(stakeRatio: number): readonly BotStrategy[] {
  const randomBot = createRandomBot('random', '무작위', {
    holdBars: DEFAULT_HOLD_BARS,
    stakeRatio,
  });

  const trendBot = createTrendBot('trend', '추세추종', {
    lookbackBars: 30,
    entryZ: 1.0,
    holdBars: DEFAULT_HOLD_BARS,
    stakeRatio,
  });

  const trendHoldBot = createTrendBot('trend-hold', '추세추종(종료보유)', {
    lookbackBars: 60,
    entryZ: 1.0,
    holdBars: null,
    stakeRatio,
  });

  const volumeBot = createVolumeBot('volume', '거래량반응', {
    fastBars: 3,
    slowBars: 30,
    surgeRatio: VOLUME_SURGE_RATIO,
    holdBars: DEFAULT_HOLD_BARS,
    stakeRatio,
  });

  return [
    randomBot,
    withDiscipline(randomBot, REVIEW_DISCIPLINE),
    trendBot,
    withDiscipline(trendBot, REVIEW_DISCIPLINE),
    trendHoldBot,
    volumeBot,
    withDiscipline(volumeBot, REVIEW_DISCIPLINE),
  ];
}

/** 기본 투입 비율의 전략 목록. 순서가 곧 출력 순서다. */
export const STRATEGIES: readonly BotStrategy[] = createStrategies(DEFAULT_STAKE_RATIO);

/** id로 전략을 찾는다. 없으면 `undefined`. */
export function findStrategy(
  id: string,
  strategies: readonly BotStrategy[] = STRATEGIES,
): BotStrategy | undefined {
  return strategies.find((strategy) => strategy.id === id);
}
