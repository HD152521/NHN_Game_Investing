/**
 * 시장 데이터 · 리플레이 엔진 공개 API.
 *
 * PRD §5 FR-3(차트 리플레이 엔진) / FR-4(블라인드 규칙) / §10(콘텐츠 파이프라인).
 *
 * 사용 예:
 * ```ts
 * const set = generateChartSet(1234, 'surge');
 * const replay = createReplay(set, { speed: 1 });
 * const state = replay.tick(nowMs); // 서버가 자기 시계로 호출
 * ```
 */

export type {
  Archetype,
  Bar,
  ChartSet,
  MarketEvent,
  MarketEventKind,
  Replay,
  ReplayState,
} from './types';
export { BARS_PER_DAY, MS_PER_BAR, STAGE_DURATION_MS } from './types';

export { generateChartSet } from './synth';

export { BASELINE_DAILY_AVG_VOLUME, SIGMA_FLOOR_PCT, changePercent, classifyArchetype, sigma30, volumeMultiple } from './stats';

export { createReplay } from './replay';
export type { ReplayOptions } from './replay';
