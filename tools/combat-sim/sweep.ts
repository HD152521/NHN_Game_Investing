/**
 * 지역 HP 계수 스윕 — R2/R3의 `waveTable.baseHp` 배율을 바꿔가며 실측 클리어율을 본다.
 *
 * ★ 왜 손으로 정할 수 없는가 ★
 * v1.4는 R2/R3 배율(×1.62 / ×2.68)을 `combatLoadPerGold`(골드당 적 HP)가 단조 증가하도록
 * **비율만 보고** 정했다. 그런데 그 지표는 **골드가 방어로 선형 변환된다**고 가정하는데,
 * 실제로는 타워 슬롯이 6개로 고정이라 골드 → 방어가 **위로 꺾인 곡선**이다: 6기를 Lv2까지
 * 채우고 나면 남는 골드는 효율이 훨씬 낮은 유닛으로만 갈 수 있다.
 *
 * 그래서 "지역 예산이 2.05배니 적 HP도 2.68배면 비율상 맞다"가 실전에서는 성립하지 않았고,
 * 실측 클리어율이 R3에서 **모든 예산·모든 로드아웃 0%**로 나왔다. 배율은 비율이 아니라
 * 이 스윕의 실측으로 정한다.
 *
 *     npx tsx tools/combat-sim/sweep.ts
 */

import { STAGES, scaleWaveHp, WAVE_BASE_HP_R1 } from '../../src/combat/index.js';
import type { StageConfig, StageId } from '../../src/combat/index.js';
import { num, renderTable, type Column } from '../bot-sim/report.js';
import { budgetFor, runCombat } from './engine.js';
import { LOADOUTS, SPEND_RATIOS } from './loadouts.js';

/** 원본 스테이지의 HP 곡선만 배율로 갈아끼운 사본. 다른 값(예산·수입)은 건드리지 않는다. */
function withFactor(stage: StageConfig, factor: number): StageConfig {
  return {
    ...stage,
    waveTable: { ...stage.waveTable, baseHp: scaleWaveHp(WAVE_BASE_HP_R1, factor) },
  };
}

function clearRate(stage: StageConfig, stageId: StageId, ratio: number): number {
  const budget = budgetFor(stageId, ratio);
  const cleared = LOADOUTS.filter((loadout) => runCombat(stage, loadout, budget).cleared).length;
  return cleared / LOADOUTS.length;
}

const COLUMNS: readonly Column[] = [
  { header: '지역' },
  { header: '배율', numeric: true },
  { header: '총적HP', numeric: true },
  ...SPEND_RATIOS.map((ratio) => ({ header: `${Math.round(ratio * 100)}%`, numeric: true })),
];

const FACTORS: Readonly<Record<'R2' | 'R3', readonly number[]>> = {
  R2: [1.05, 1.1, 1.15, 1.2, 1.3],
  R3: [1.1, 1.15, 1.2, 1.3, 1.4],
};

const rows: string[][] = [];

// R1은 배율 1.0 고정 — 기준선이다.
rows.push([
  'R1',
  '1.00',
  String(STAGES.R1.waveTable.baseHp.reduce((s, hp, i) => s + hp * (STAGES.R1.waveTable.baseCount[i] ?? 0), 0)),
  ...SPEND_RATIOS.map((ratio) => num(clearRate(STAGES.R1, 'R1', ratio), 3)),
]);

for (const stageId of ['R2', 'R3'] as const) {
  for (const factor of FACTORS[stageId]) {
    const stage = withFactor(STAGES[stageId], factor);
    const totalHp = stage.waveTable.baseHp.reduce(
      (sum, hp, i) => sum + hp * (stage.waveTable.baseCount[i] ?? 0),
      0,
    );
    rows.push([
      stageId,
      factor.toFixed(2),
      String(totalHp),
      ...SPEND_RATIOS.map((ratio) => num(clearRate(stage, stageId, ratio), 3)),
    ]);
  }
}

process.stdout.write(`\n지역 HP 배율 스윕 — 셀 값은 로드아웃 ${LOADOUTS.length}종의 실측 클리어율\n\n`);
process.stdout.write(`${renderTable(COLUMNS, rows)}\n\n`);
