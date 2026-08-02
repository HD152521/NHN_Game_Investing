/**
 * 봇 시뮬레이터 CLI — PRD §10 ⑥.
 *
 * `npm run bot-sim` 으로 실행한다.
 *
 * ★ 이 도구가 묻는 질문이 v1.4에서 바뀌었다 ★
 * 원래 질문은 **"블라인드 차트에서 R1/R2/R3의 목표 수익률(+20/+30/+45%)에 닿을 수 있는가"**
 * 였고, 이 도구가 그 답을 **"닿을 수 없다"**로 확정했다(RK-2 현실화). 목표는 전 지역 0으로
 * 내려갔고 난이도는 전투로 이전됐다(PRD §16 결정 기록 2026-08-02).
 *
 * 그래서 지금의 질문은 **"게이트가 전략을 판별하는가"**다 — 본전치기가 통과하고
 * 원금을 태우는 플레이가 떨어지는지. 판정표 두 개 중 뒤쪽(`renderSpread`)이 그것이다.
 */

import { STAGES, type StageConfig, type StageId } from '../../src/combat/index.js';
import { DEFAULT_POSITION_PARAMS } from '../../src/position/index.js';
import { CHART_REGIMES, makeChart, type ChartRegime } from './charts.js';
import { runSession } from './engine.js';
import { mulberry32 } from './rng.js';
import { num, pct, renderTable, signedPct, type Column } from './report.js';
import {
  aggregate,
  requiredAccuracy,
  requiredReturnRate,
  requiredZ,
  type Aggregate,
} from './stats.js';
import { DEFAULT_STAKE_RATIO, createStrategies, findStrategy } from './strategies/index.js';
import type { BotStrategy, SessionResult } from './types.js';

const STAGE_IDS: readonly StageId[] = ['R1', 'R2', 'R3'];

/** PRD §10 ⑥이 요구하는 조합당 최소 시행 횟수. */
const DEFAULT_RUNS = 200;

/** 기본 시드. 고정값이라 같은 명령이 항상 같은 표를 낸다. */
const DEFAULT_SEED = 20260731;

/** 판정 안정성을 보기 위해 전체 시행을 이 개수의 블록으로 쪼개 클리어율 편차를 본다. */
const VERDICT_BLOCKS = 4;

interface Options {
  readonly runs: number;
  readonly seed: number;
  readonly stakeRatio: number;
  readonly stages: readonly StageId[];
  readonly regimes: readonly ChartRegime[];
  readonly strategies: readonly BotStrategy[];
}

/** `--key=value` / `--key value` 둘 다 받는다. 알 수 없는 키는 조용히 무시하지 않고 던진다. */
function parseArgs(argv: readonly string[]): Options {
  const raw = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === undefined || !token.startsWith('--')) {
      continue;
    }
    const body = token.slice(2);
    const eq = body.indexOf('=');
    if (eq >= 0) {
      raw.set(body.slice(0, eq), body.slice(eq + 1));
    } else {
      raw.set(body, argv[i + 1] ?? '');
      i += 1;
    }
  }

  const runs = readInt(raw.get('runs'), DEFAULT_RUNS);
  const seed = readInt(raw.get('seed'), DEFAULT_SEED);
  const stakeRatio = readRatio(raw.get('stake'), DEFAULT_STAKE_RATIO);
  const available = createStrategies(stakeRatio);

  const stageFilter = raw.get('stages');
  const stages =
    stageFilter === undefined || stageFilter === ''
      ? STAGE_IDS
      : stageFilter.split(',').map(toStageId);

  const regimeFilter = raw.get('regimes');
  const regimes =
    regimeFilter === undefined || regimeFilter === ''
      ? CHART_REGIMES
      : regimeFilter.split(',').map(toRegime);

  const strategyFilter = raw.get('strategies');
  const strategies =
    strategyFilter === undefined || strategyFilter === ''
      ? available
      : strategyFilter.split(',').map((id) => {
          const found = findStrategy(id.trim(), available);
          if (!found) {
            throw new Error(`알 수 없는 전략: ${id} (사용 가능: ${available.map((s) => s.id).join(', ')})`);
          }
          return found;
        });

  return { runs, seed, stakeRatio, stages, regimes, strategies };
}

/** `--stake` 값 파싱. FR-5.1 규칙과 같게 `0 < r <= 1`만 허용한다. */
function readRatio(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') {
    return fallback;
  }
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) {
    throw new Error(`--stake 는 0 초과 1 이하여야 합니다: ${value}`);
  }
  return parsed;
}

function readInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toStageId(value: string): StageId {
  const id = value.trim().toUpperCase();
  if (id === 'R1' || id === 'R2' || id === 'R3') {
    return id;
  }
  throw new Error(`알 수 없는 스테이지: ${value}`);
}

function toRegime(value: string): ChartRegime {
  const id = value.trim();
  if (id === 'synth' || id === 'martingale') {
    return id;
  }
  throw new Error(`알 수 없는 차트 공급원: ${value}`);
}

/**
 * 조합 하나(전략 × 스테이지 × 공급원)를 `runs`회 돌린다.
 *
 * 차트 시드는 `seed + i`로 **모든 조합에서 동일**하게 재사용한다 — 같은 차트 200장에
 * 모든 전략을 붙여야 전략 간 차이가 차트 운이 아니라 전략 때문임이 확정된다(짝지은 비교).
 */
function runCombo(
  strategy: BotStrategy,
  stage: StageConfig,
  regime: ChartRegime,
  options: Options,
): SessionResult[] {
  const results: SessionResult[] = [];
  for (let i = 0; i < options.runs; i += 1) {
    const chartSeed = options.seed + i;
    const set = makeChart(regime, chartSeed);
    // 봇 난수는 차트 시드와 분리한다. 같은 차트에 여러 봇이 붙어도 서로 간섭하지 않는다.
    const botRng = mulberry32((chartSeed * 2654435761) >>> 0);
    results.push(runSession({ stage, set, strategy, botRng }));
  }
  return results;
}

/** 차트 공급원 자체의 통계 — 판정의 전제를 드러내는 진단표다. */
function renderRegimeDiagnostics(options: Options): string {
  const columns: Column[] = [
    { header: '공급원' },
    { header: '차트수', numeric: true },
    { header: '평균 sigma30(%)', numeric: true },
    { header: '하루등락 |z| 평균', numeric: true },
    { header: '하루등락 |z| 중앙', numeric: true },
  ];

  const rows = options.regimes.map((regime) => {
    const absZ: number[] = [];
    let sigmaSum = 0;
    for (let i = 0; i < options.runs; i += 1) {
      const set = makeChart(regime, options.seed + i);
      const first = set.bars[0];
      const last = set.bars[set.bars.length - 1];
      sigmaSum += set.sigma30;
      if (first && last && first.o !== 0) {
        absZ.push(Math.abs(((last.c - first.o) / first.o) * 100) / set.sigma30);
      }
    }
    const sorted = [...absZ].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    const mean = absZ.reduce((a, b) => a + b, 0) / Math.max(absZ.length, 1);
    return [regime, String(options.runs), num(sigmaSum / options.runs, 3), num(mean, 2), num(median, 2)];
  });

  return renderTable(columns, rows);
}

/** 스테이지별 게이트 — "얼마를 벌어야 클리어인가"를 먼저 못 박는다. */
function renderGateTable(options: Options): string {
  const columns: Column[] = [
    { header: '스테이지' },
    { header: '기획 목표 ρ', numeric: true },
    { header: '실제 필요 ρ*', numeric: true },
    { header: '필요 E[z]', numeric: true },
    { header: '필요 정확도', numeric: true },
    { header: 'S', numeric: true },
    { header: '필요지출', numeric: true },
  ];

  const rows = options.stages.map((stageId) => {
    const stage = STAGES[stageId];
    const rhoStar = requiredReturnRate(stage);
    const z = requiredZ(rhoStar, DEFAULT_POSITION_PARAMS.payoutBase, DEFAULT_POSITION_PARAMS.feeRate);
    return [
      stageId,
      signedPct(stage.targetReturnRate, 0),
      signedPct(rhoStar, 2),
      num(z, 3),
      pct(requiredAccuracy(z)),
      String(stage.startingAum + 1950),
      String(stage.requiredSpend),
    ];
  });

  return renderTable(columns, rows);
}

/** 전략 × 스테이지 결과 표 (공급원 1개분). */
function renderResultTable(
  stageResults: ReadonlyMap<string, Aggregate>,
  options: Options,
): string {
  const columns: Column[] = [
    { header: '전략' },
    { header: '지역' },
    { header: '거래/판', numeric: true },
    { header: '방향정확도', numeric: true },
    { header: '가중 E[z]', numeric: true },
    { header: 'ρ', numeric: true },
    { header: 'S소진', numeric: true },
    { header: '총골드', numeric: true },
    { header: '필요지출대비', numeric: true },
    { header: '클리어율', numeric: true },
    { header: '강제청산율', numeric: true },
    { header: 'z p10/p50/p90' },
    { header: '세션ρ p10/p50/p90' },
  ];

  const rows: string[][] = [];
  for (const strategy of options.strategies) {
    for (const stageId of options.stages) {
      const agg = stageResults.get(`${strategy.id}|${stageId}`);
      if (!agg) {
        continue;
      }
      const [p10, p50, p90] = agg.zPercentiles;
      const [r10, r50, r90] = agg.rhoPercentiles;
      rows.push([
        strategy.label,
        stageId,
        num(agg.tradesPerRun, 1),
        pct(agg.accuracy),
        num(agg.weightedZ, 3),
        signedPct(agg.rho, 1),
        pct(agg.deployment, 0),
        num(agg.avgGold, 0),
        pct(agg.goldRatio, 0),
        pct(agg.clearRate, 1),
        pct(agg.liquidationRate),
        `${num(p10, 2)} / ${num(p50, 2)} / ${num(p90, 2)}`,
        `${signedPct(r10, 0)} / ${signedPct(r50, 0)} / ${signedPct(r90, 0)}`,
      ]);
    }
  }

  return renderTable(columns, rows);
}

interface Verdict {
  readonly stageId: StageId;
  readonly bestStrategy: string;
  readonly bestRho: number;
  readonly requiredRho: number;
  readonly clearRate: number;
  readonly blockClearRange: readonly [number, number];
  readonly reachable: boolean;
  /** 최악(클리어율 최저) 전략 — 판별력을 재려면 하한도 같이 봐야 한다. */
  readonly worstStrategy: string;
  readonly worstRho: number;
  readonly worstClearRate: number;
}

/**
 * ★ 핵심 판정 ★ 한 공급원에서 스테이지별 "도달 가능/불가능"을 정한다.
 *
 * 판정 기준은 **클리어율**이다(ρ가 아니라). ρ는 투입액 가중이라 소진율이 낮으면 좋게 나와도
 * 골드가 모자랄 수 있고, 반대로 목표 ρ에 못 미쳐도 소진율이 높으면 닿을 수 있기 때문이다.
 * 클리어율 50% 이상 = "그 전략을 쓰면 절반 이상의 차트에서 통과한다"를 도달 가능으로 본다.
 *
 * ⚠️ `[v1.4]` **이 "가능/불가능" 축은 이제 부차적이다.** 그건 "목표 ρ에 닿는가"라는
 * v1.3의 질문이었고, 그 질문의 답은 이미 "아니오"로 확정돼 목표 자체를 0으로 내렸다.
 * v1.4가 묻는 것은 **"게이트가 전략을 판별하는가"**이며, 그 답은 아래 `judgeSpread`가
 * 내는 최선−최악 격차에 있다. 통과선이 본전(ρ=0)인 이상 유능한 플레이의 클리어율은
 * 마팅게일의 성질상 50% 근처에 붙박이고, 그 절대값이 아니라 **하한과의 거리**가 설계 지표다.
 */
function judge(
  stageId: StageId,
  perStrategy: ReadonlyMap<string, readonly SessionResult[]>,
  options: Options,
): Verdict {
  const stage = STAGES[stageId];
  let best: { strategy: BotStrategy; agg: Aggregate; results: readonly SessionResult[] } | null = null;
  let worst: { strategy: BotStrategy; agg: Aggregate } | null = null;

  for (const strategy of options.strategies) {
    const results = perStrategy.get(`${strategy.id}|${stageId}`);
    if (!results) {
      continue;
    }
    const agg = aggregate(results, stage);
    if (best === null || agg.clearRate > best.agg.clearRate) {
      best = { strategy, agg, results };
    }
    if (worst === null || agg.clearRate < worst.agg.clearRate) {
      worst = { strategy, agg };
    }
  }

  if (best === null || worst === null) {
    return {
      stageId,
      bestStrategy: '-',
      bestRho: 0,
      requiredRho: requiredReturnRate(stage),
      clearRate: 0,
      blockClearRange: [0, 0],
      reachable: false,
      worstStrategy: '-',
      worstRho: 0,
      worstClearRate: 0,
    };
  }

  // 시드 블록별 클리어율 — 단일 시드 조합에 판정이 좌우되지 않는지 확인한다.
  const blockSize = Math.max(1, Math.floor(best.results.length / VERDICT_BLOCKS));
  const blockRates: number[] = [];
  for (let start = 0; start + blockSize <= best.results.length; start += blockSize) {
    const block = best.results.slice(start, start + blockSize);
    blockRates.push(block.filter((r) => r.cleared).length / block.length);
  }

  return {
    stageId,
    bestStrategy: best.strategy.label,
    bestRho: best.agg.rho,
    requiredRho: requiredReturnRate(stage),
    clearRate: best.agg.clearRate,
    blockClearRange: [Math.min(...blockRates), Math.max(...blockRates)],
    reachable: best.agg.clearRate >= 0.5,
    worstStrategy: worst.strategy.label,
    worstRho: worst.agg.rho,
    worstClearRate: worst.agg.clearRate,
  };
}

/**
 * ★ v1.4 핵심 지표 ★ 게이트가 전략을 판별하는가.
 *
 * 통과선을 본전(ρ=0)으로 내린 뒤로 "최선 전략이 목표에 닿는가"는 의미가 없다 — 목표가 0이니
 * 마팅게일에서 웬만한 전략은 다 근처에 온다. 설계가 실제로 요구하는 것은
 * **"원금을 태우는 플레이가 확실히 떨어지는가"**이고, 그 척도가 최선−최악 클리어율 격차다.
 * 격차 20%p 이상을 판별력 있음으로 본다(v1.3 마팅게일 실측 격차는 전액 투입 기준
 * 18~20%p였고, 투입을 낮추면 최선 전략까지 같이 무너져 격차가 오히려 줄었다).
 */
function renderSpread(verdicts: readonly Verdict[]): string {
  const columns: Column[] = [
    { header: '스테이지' },
    { header: '최선 전략' },
    { header: '최선 ρ', numeric: true },
    { header: '최선 클리어율', numeric: true },
    { header: '최악 전략' },
    { header: '최악 ρ', numeric: true },
    { header: '최악 클리어율', numeric: true },
    { header: '격차(%p)', numeric: true },
    { header: '판별력' },
  ];

  const rows = verdicts.map((v) => {
    const spread = v.clearRate - v.worstClearRate;
    return [
      v.stageId,
      v.bestStrategy,
      signedPct(v.bestRho, 1),
      pct(v.clearRate, 1),
      v.worstStrategy,
      signedPct(v.worstRho, 1),
      pct(v.worstClearRate, 1),
      num(spread * 100, 1),
      spread >= 0.2 ? '있음' : '★ 없음',
    ];
  });

  return renderTable(columns, rows);
}

function renderVerdicts(verdicts: readonly Verdict[]): string {
  const columns: Column[] = [
    { header: '스테이지' },
    { header: '목표' },
    { header: '최선 전략' },
    { header: '달성 ρ', numeric: true },
    { header: '필요 ρ*', numeric: true },
    { header: '클리어율', numeric: true },
    { header: '블록별 최소~최대' },
    { header: '판정' },
  ];

  const rows = verdicts.map((v) => [
    v.stageId,
    signedPct(STAGES[v.stageId].targetReturnRate, 0),
    v.bestStrategy,
    signedPct(v.bestRho, 1),
    signedPct(v.requiredRho, 1),
    pct(v.clearRate, 1),
    `${pct(v.blockClearRange[0], 0)} ~ ${pct(v.blockClearRange[1], 0)}`,
    v.reachable ? '가능' : '★ 불가능',
  ]);

  return renderTable(columns, rows);
}

/** 손절 규율 데코레이터의 실제 효과 — 같은 진입 신호 위에서의 짝지은 비교. */
function renderDisciplineEffect(
  aggregates: ReadonlyMap<string, Aggregate>,
  options: Options,
): string {
  const columns: Column[] = [
    { header: '기본 전략' },
    { header: '지역' },
    { header: 'ρ (규율 없음)', numeric: true },
    { header: 'ρ (규율 있음)', numeric: true },
    { header: 'Δρ', numeric: true },
    { header: '클리어율 없음', numeric: true },
    { header: '클리어율 있음', numeric: true },
    { header: '강제청산 없음', numeric: true },
    { header: '강제청산 있음', numeric: true },
  ];

  const rows: string[][] = [];
  for (const strategy of options.strategies) {
    if (strategy.id.endsWith('+stop')) {
      continue;
    }
    const disciplined = options.strategies.find((s) => s.id === `${strategy.id}+stop`);
    if (!disciplined) {
      continue;
    }
    for (const stageId of options.stages) {
      const plain = aggregates.get(`${strategy.id}|${stageId}`);
      const withStop = aggregates.get(`${disciplined.id}|${stageId}`);
      if (!plain || !withStop) {
        continue;
      }
      rows.push([
        strategy.label,
        stageId,
        signedPct(plain.rho, 1),
        signedPct(withStop.rho, 1),
        signedPct(withStop.rho - plain.rho, 1),
        pct(plain.clearRate, 1),
        pct(withStop.clearRate, 1),
        pct(plain.liquidationRate),
        pct(withStop.liquidationRate),
      ]);
    }
  }

  return renderTable(columns, rows);
}

/** 전략 목록과 판단 규칙 — 표만 봐도 무엇을 측정했는지 알 수 있게 같이 찍는다. */
function renderStrategyList(options: Options): string {
  const columns: Column[] = [{ header: 'id' }, { header: '이름' }, { header: '판단 규칙' }];
  const rows = options.strategies.map((s) => [s.id, s.label, s.rule]);
  return renderTable(columns, rows);
}

/** CLI 본체. 종료 코드를 반환한다(0 = 정상). */
export function main(argv: readonly string[]): number {
  let options: Options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`[bot-sim] 인자 오류: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  const lines: string[] = [];
  lines.push('═'.repeat(96));
  lines.push('  TICKER FRONT 봇 시뮬레이터 — PRD §10 ⑥ / RK-2 검증');
  lines.push(
    `  시행 ${options.runs}회/조합 · 기준시드 ${options.seed} · 투입비율 ${Math.round(options.stakeRatio * 100)}% · ` +
      `전략 ${options.strategies.length}종 · 스테이지 ${options.stages.join('/')} · 공급원 ${options.regimes.join('/')}`,
  );
  lines.push('═'.repeat(96));

  lines.push('');
  lines.push('■ 전략 목록');
  lines.push(renderStrategyList(options));

  lines.push('');
  lines.push('■ 클리어 게이트 (총골드 = noTradeGold + S × (1 + ρ) × 0.50 ≥ 필요지출)');
  lines.push(renderGateTable(options));

  lines.push('');
  lines.push('■ 차트 공급원 진단 — 판정의 전제');
  lines.push(renderRegimeDiagnostics(options));

  const verdictsByRegime = new Map<ChartRegime, Verdict[]>();

  for (const regime of options.regimes) {
    const rawResults = new Map<string, readonly SessionResult[]>();
    const aggregates = new Map<string, Aggregate>();

    for (const strategy of options.strategies) {
      for (const stageId of options.stages) {
        const stage = STAGES[stageId];
        const results = runCombo(strategy, stage, regime, options);
        rawResults.set(`${strategy.id}|${stageId}`, results);
        aggregates.set(`${strategy.id}|${stageId}`, aggregate(results, stage));
      }
    }

    lines.push('');
    lines.push('─'.repeat(96));
    lines.push(`■ 결과 — 차트 공급원: ${regime}`);
    lines.push('─'.repeat(96));
    lines.push(renderResultTable(aggregates, options));

    lines.push('');
    lines.push(`■ 손절 규율 효과 (${regime}) — 설계 리뷰 주장 검증`);
    lines.push(renderDisciplineEffect(aggregates, options));

    verdictsByRegime.set(
      regime,
      options.stages.map((stageId) => judge(stageId, rawResults, options)),
    );
  }

  for (const [regime, verdicts] of verdictsByRegime) {
    lines.push('');
    lines.push('★'.repeat(48));
    lines.push(`★ 핵심 판정 — 차트 공급원: ${regime}`);
    lines.push('★'.repeat(48));
    lines.push('· 참고 축(v1.3의 질문): 최선 전략이 목표 ρ에 닿는가');
    lines.push(renderVerdicts(verdicts));
    lines.push('');
    lines.push('· ★ 설계 축(v1.4의 질문): 게이트가 전략을 판별하는가');
    lines.push(renderSpread(verdicts));
  }

  console.log(lines.join('\n'));
  return 0;
}
