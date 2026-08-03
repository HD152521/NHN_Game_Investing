/**
 * 타워 종류 축 측정 — **"무엇을 짓는가"가 결과를 가르는가.**
 *
 *     npx tsx tools/combat-sim/tower-axis.ts
 *     npx tsx tools/combat-sim/tower-axis.ts --stages=R1
 *
 * ★ 왜 `bin.ts`와 따로 있는가 ★
 * `LOADOUTS`(loadouts.ts)는 **19종 고정**이며 그 개수가 요약표 클리어율의 분모다. 밸런스
 * 이력이 전부 "19개 중 몇 개"로 기록돼 있어(GAME.md §13-2), 여기에 로드아웃을 추가하면
 * 과거 수치와 비교가 불가능해진다. 그래서 종류 축 측정은 **분모를 건드리지 않는 별도 도구**로
 * 뽑는다.
 *
 * ★ 무엇을 비교하는가 ★
 * 기존 표의 종류 비교는 **투자액이 달라 공정하지 않았다**: `기본4+대공2`는 Lv2(1,800 G)로
 * 재는데 `광역4+대공2`는 Lv1(880 G)로만 잰다. 당연히 광역이 진다. 여기서는 **같은 슬롯 수 ·
 * 같은 대공 기수 · 같은 업그레이드 단계**로 지상 타워 종류만 바꾼다.
 *
 * ★ 웨이브 구간을 나눠 보는 이유 ★
 * 적 5종이 스탯을 갖게 되면서 웨이브마다 성격이 다르다(`constants.ts WAVE_GROUND_MIX`):
 * 앞은 얇고 빠른 속공(E-01)이 몰려오고 뒤는 두꺼운 탱커(E-03)가 버틴다. 종류 선택의 값어치는
 * **총 클리어 여부**보다 "어느 구간에서 덜 새는가"에 먼저 나타나므로, 구간별 누적 실점을 같이 잰다.
 */

import { BASE_HP, STAGES, TOWER_SLOTS } from '../../src/combat/index.js';
import type { StageId, TowerKind } from '../../src/combat/index.js';
import { num, renderTable, type Column } from '../bot-sim/report.js';
import { budgetFor, runCombat, type Loadout } from './engine.js';

const STAGE_IDS: readonly StageId[] = ['R1', 'R2', 'R3'];

/** 지상 4기 + 대공 2기. 대공은 뒤 슬롯(적 본진 쪽)에 둔다 — `loadouts.ts mixed()`와 같은 규칙. */
function groundPlusAA(ground: readonly TowerKind[]): readonly TowerKind[] {
  const towers: TowerKind[] = [...ground];
  while (towers.length < TOWER_SLOTS) {
    towers.push('antiair');
  }
  return towers;
}

/** 지상 4기 종류 구성 4종. 이름표는 표에 그대로 나간다. */
const GROUND_MIXES: readonly { readonly key: string; readonly label: string; readonly ground: readonly TowerKind[] }[] = [
  { key: 'basic', label: '단일4', ground: ['basic', 'basic', 'basic', 'basic'] },
  { key: 'splash', label: '광역4', ground: ['splash', 'splash', 'splash', 'splash'] },
  { key: 'half', label: '단일2+광역2', ground: ['basic', 'basic', 'splash', 'splash'] },
  { key: 'front', label: '광역2(앞)+단일2', ground: ['splash', 'splash', 'basic', 'basic'] },
];

/**
 * 같은 투자(6슬롯 · 대공 2기)에서 **지상 4기의 종류만** 바꾼 비교군을 Lv1/Lv2 두 단계로 낸다.
 *
 * ★ Lv1 단계가 반드시 필요하다 ★ Lv2 6기는 속공·방패 구간(W1~8)을 **무실점으로 막아 버려서**
 * 구간별 차이가 전부 0이 된다 — 즉 "어느 종류가 어느 웨이브에 강한가"를 잴 수 없다.
 * 방어가 실제로 새는 압력 구간에서만 종류 선택이 관측된다.
 */
const AXIS: readonly Loadout[] = [
  ...GROUND_MIXES.map((mix) => ({
    id: `ax-${mix.key}-lv1`,
    label: `Lv1 · ${mix.label}`,
    towers: groundPlusAA(mix.ground),
    upgrade: false,
    unit: null,
    unitCap: 0,
  })),
  ...GROUND_MIXES.map((mix) => ({
    id: `ax-${mix.key}-lv2`,
    label: `Lv2 · ${mix.label}`,
    towers: groundPlusAA(mix.ground),
    upgrade: true,
    unit: null,
    unitCap: 0,
  })),
];

/**
 * 웨이브 구간 — `constants.ts WAVE_GROUND_MIX`가 만드는 성격 구간과 같은 경계다.
 * 속공 구간(W1~5) · 방패 구간(W6~8) · 탱커 구간(W9~13).
 */
const SEGMENTS: readonly { readonly label: string; readonly from: number; readonly to: number }[] = [
  { label: 'W1-8', from: 1, to: 8 },
  { label: 'W9혼합', from: 9, to: 9 },
  { label: 'W10대군', from: 10, to: 10 },
  { label: 'W11탱커', from: 11, to: 11 },
  { label: 'W12탱커', from: 12, to: 12 },
  { label: 'W13보스', from: 13, to: 13 },
];

function segmentDamage(byWave: readonly number[], from: number, to: number): number {
  let sum = 0;
  for (let wave = from; wave <= to; wave += 1) {
    sum += byWave[wave - 1] ?? 0;
  }
  return sum;
}

const COLUMNS: readonly Column[] = [
  { header: '지상 구성' },
  { header: '지출', numeric: true },
  ...SEGMENTS.map((segment) => ({ header: segment.label, numeric: true })),
  { header: '총실점', numeric: true },
  { header: '잔여HP', numeric: true },
  { header: '결과' },
];

function parseStages(argv: readonly string[]): readonly StageId[] {
  const arg = argv.find((token) => token.startsWith('--stages='));
  if (arg === undefined) {
    return STAGE_IDS;
  }
  return arg
    .slice('--stages='.length)
    .split(',')
    .map((value) => {
      const id = value.trim().toUpperCase();
      if (id !== 'R1' && id !== 'R2' && id !== 'R3') {
        throw new Error(`알 수 없는 스테이지: ${value}`);
      }
      return id;
    });
}

export function main(argv: readonly string[]): number {
  let stages: readonly StageId[];
  try {
    stages = parseStages(argv);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  const lines: string[] = [
    '',
    '타워 종류 축 — 같은 슬롯 수 · 같은 대공 2기 · 전부 Lv2에서 지상 4기의 종류만 바꾼다',
    '',
  ];

  for (const stageId of stages) {
    const budget = budgetFor(stageId, 1);
    lines.push(`■ ${stageId} · 예산 100% (${budget} G)`);
    lines.push(
      renderTable(
        COLUMNS,
        AXIS.map((loadout) => {
          const result = runCombat(STAGES[stageId], loadout, budget);
          return [
            loadout.label,
            String(result.goldSpent),
            ...SEGMENTS.map((segment) =>
              num(segmentDamage(result.baseDamageByWave, segment.from, segment.to), 0),
            ),
            num(BASE_HP - result.baseHpLeft, 0),
            String(result.baseHpLeft),
            result.cleared ? '클리어' : `패배(W${result.maxWave})`,
          ];
        }),
      ),
    );
    lines.push('');
  }

  process.stdout.write(`${lines.join('\n')}\n`);
  return 0;
}

main(process.argv.slice(2));
