/**
 * 전투 시뮬레이터 CLI.
 *
 *     npx tsx tools/combat-sim/bin.ts               # 전체 표
 *     npx tsx tools/combat-sim/bin.ts --stages=R1   # 지역 한정
 *     npx tsx tools/combat-sim/bin.ts --ratios=1    # 예산 100%만
 *
 * 이 도구가 답하는 질문은 `bot-sim`과 **다르다**:
 *   bot-sim    → "필요지출만큼 **벌 수 있는가**" (경제 게이트)
 *   combat-sim → "그 돈으로 산 방어가 **막는가**"  (전투 게이트)
 *
 * 두 게이트는 독립이며, v1.4까지 맞춰져 있던 것은 앞쪽 하나뿐이었다.
 */

import { STAGES } from '../../src/combat/index.js';
import type { StageId } from '../../src/combat/index.js';
import { num, renderTable, type Column } from '../bot-sim/report.js';
import { budgetFor, runCombat, type CombatSimResult, type Loadout } from './engine.js';
import { LOADOUTS, SPEND_RATIOS } from './loadouts.js';

const STAGE_IDS: readonly StageId[] = ['R1', 'R2', 'R3'];

interface Options {
  readonly stages: readonly StageId[];
  readonly ratios: readonly number[];
  readonly loadouts: readonly Loadout[];
}

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

  const stageFilter = raw.get('stages');
  const stages =
    stageFilter === undefined || stageFilter === ''
      ? STAGE_IDS
      : stageFilter.split(',').map((value) => {
          const id = value.trim().toUpperCase();
          if (id !== 'R1' && id !== 'R2' && id !== 'R3') {
            throw new Error(`알 수 없는 스테이지: ${value}`);
          }
          return id;
        });

  const ratioFilter = raw.get('ratios');
  const ratios =
    ratioFilter === undefined || ratioFilter === ''
      ? SPEND_RATIOS
      : ratioFilter.split(',').map((value) => {
          const parsed = Number.parseFloat(value);
          if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) {
            throw new Error(`--ratios 는 0 초과 1 이하여야 합니다: ${value}`);
          }
          return parsed;
        });

  const loadoutFilter = raw.get('loadouts');
  const loadouts =
    loadoutFilter === undefined || loadoutFilter === ''
      ? LOADOUTS
      : loadoutFilter.split(',').map((value) => {
          const found = LOADOUTS.find((entry) => entry.id === value.trim());
          if (!found) {
            throw new Error(`알 수 없는 로드아웃: ${value}`);
          }
          return found;
        });

  return { stages, ratios, loadouts };
}

/** 결과 한 줄을 사람이 읽는 요약으로. */
function verdict(result: CombatSimResult): string {
  if (result.cleared) {
    return `클리어(HP ${result.baseHpLeft})`;
  }
  return `패배(W${result.maxWave})`;
}

function detailRows(stageId: StageId, ratio: number, loadouts: readonly Loadout[]): readonly (readonly string[])[] {
  const budget = budgetFor(stageId, ratio);
  return loadouts.map((loadout) => {
    const result = runCombat(STAGES[stageId], loadout, budget);
    return [
      loadout.label,
      String(result.towersBuilt),
      String(result.unitsSummoned),
      String(result.goldSpent),
      result.firstBreachWave === null ? '—' : `W${result.firstBreachWave}`,
      String(result.baseHpLeft),
      result.bossKilled ? '○' : '×',
      verdict(result),
    ];
  });
}

const DETAIL_COLUMNS: readonly Column[] = [
  { header: '로드아웃' },
  { header: '타워', numeric: true },
  { header: '유닛', numeric: true },
  { header: '지출', numeric: true },
  { header: '첫실점' },
  { header: '잔여HP', numeric: true },
  { header: '보스' },
  { header: '결과' },
];

/** 지역 × 예산비 요약 — 클리어한 로드아웃 비율. 지역 램프를 **실측 클리어율**로 본다. */
function summaryRows(options: Options): readonly (readonly string[])[] {
  const rows: string[][] = [];
  for (const stageId of options.stages) {
    for (const ratio of options.ratios) {
      const budget = budgetFor(stageId, ratio);
      const results = options.loadouts.map((loadout) => runCombat(STAGES[stageId], loadout, budget));
      const cleared = results.filter((result) => result.cleared).length;
      const avgHp = results.reduce((sum, result) => sum + result.baseHpLeft, 0) / results.length;
      rows.push([
        stageId,
        `${Math.round(ratio * 100)}%`,
        String(budget),
        `${cleared}/${results.length}`,
        num(cleared / results.length, 3),
        num(avgHp, 1),
      ]);
    }
  }
  return rows;
}

const SUMMARY_COLUMNS: readonly Column[] = [
  { header: '지역' },
  { header: '예산비' },
  { header: '예산', numeric: true },
  { header: '클리어', numeric: true },
  { header: '클리어율', numeric: true },
  { header: '평균잔여HP', numeric: true },
];

export function main(argv: readonly string[]): number {
  let options: Options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  const lines: string[] = ['', '전투 시뮬레이터 — "그 돈으로 산 방어가 막는가"', ''];

  for (const stageId of options.stages) {
    for (const ratio of options.ratios) {
      lines.push(`■ ${stageId} · 예산 ${Math.round(ratio * 100)}% (${budgetFor(stageId, ratio)} G)`);
      lines.push(renderTable(DETAIL_COLUMNS, detailRows(stageId, ratio, options.loadouts)));
      lines.push('');
    }
  }

  lines.push('■ 요약 — 지역 난이도 램프는 비율이 아니라 실측 클리어율로 본다');
  lines.push(renderTable(SUMMARY_COLUMNS, summaryRows(options)));
  lines.push('');

  process.stdout.write(`${lines.join('\n')}\n`);
  return 0;
}
