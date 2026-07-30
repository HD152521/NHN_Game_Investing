import { angularFigure, icon, roundedFigure, turret } from './shapes.js';
import { renderMagentaSheet } from './synth.js';
import type { SynthSubject } from './synth.js';
import type { Rgba, RgbaImage } from '../types.js';

/**
 * 실제 AI 에셋이 아직 없으므로, 파이프라인이 처리할 입력을 코드로 합성합니다.
 * 아트가이드 §1.3 팔레트를 그대로 씁니다 — 마젠타와 가까운 보라·빨강이 섞여 있어야
 * 키잉이 피사체를 갉아먹지 않는지 확인할 수 있습니다.
 */
const PALETTE = {
  charcoal: { r: 26, g: 34, b: 54, a: 255 },
  navy: { r: 15, g: 21, b: 36, a: 255 },
  paper: { r: 232, g: 236, b: 244, a: 255 },
  up: { r: 255, g: 77, b: 90, a: 255 },
  down: { r: 46, g: 134, b: 255, a: 255 },
  gold: { r: 255, g: 197, b: 61, a: 255 },
  aum: { r: 155, g: 107, b: 255, a: 255 },
  muted: { r: 124, g: 137, b: 163, a: 255 },
} as const satisfies Record<string, Rgba>;

const LINEUP_WIDTH = 768;
const LINEUP_HEIGHT = 256;
const LINEUP_CENTERS = [128, 384, 640] as const;
const GRID_WIDTH = 384;
const GRID_HEIGHT = 256;

export interface FixtureSpec {
  readonly fileName: string;
  readonly description: string;
  readonly build: () => RgbaImage;
}

function lineupSheet(subjects: SynthSubject[]): RgbaImage {
  return renderMagentaSheet({ width: LINEUP_WIDTH, height: LINEUP_HEIGHT, subjects });
}

/** E-01 — 아군 유닛 3종. 발밑 y가 200 / 194 / 206 으로 일부러 어긋나 있습니다. */
function buildAllyLineup(): RgbaImage {
  const baselines = [200, 194, 206];
  const scales = [0.95, 1.1, 1.25];
  const subjects = LINEUP_CENTERS.flatMap((centerX, index) =>
    roundedFigure({
      centerX,
      baselineY: baselines[index] ?? 200,
      scale: scales[index] ?? 1,
      body: PALETTE.navy,
      accent: PALETTE.paper,
    }),
  );
  return lineupSheet(subjects);
}

/** F-01 — 지상 적 3종. 각진 실루엣 + 얇은 창. */
function buildEnemyLineup(): RgbaImage {
  const baselines = [198, 207, 191];
  const scales = [1.0, 1.15, 1.3];
  const subjects = LINEUP_CENTERS.flatMap((centerX, index) =>
    angularFigure({
      centerX,
      baselineY: baselines[index] ?? 200,
      scale: scales[index] ?? 1,
      body: PALETTE.down,
      accent: PALETTE.charcoal,
    }),
  );
  return lineupSheet(subjects);
}

/** D-01 — 타워 3종 티어1. 빨강(#FF4D5A) 패널이 마젠타에 가까운 편입니다. */
function buildTowerLineup(): RgbaImage {
  const baselines = [210, 204, 214];
  const barrels = [
    { barrelLength: 34, barrelThickness: 7 },
    { barrelLength: 44, barrelThickness: 4 },
    { barrelLength: 22, barrelThickness: 12 },
  ];
  const subjects = LINEUP_CENTERS.flatMap((centerX, index) =>
    turret({
      centerX,
      baselineY: baselines[index] ?? 210,
      scale: 1.1,
      body: PALETTE.charcoal,
      accent: PALETTE.up,
      barrelLength: barrels[index]?.barrelLength ?? 30,
      barrelThickness: barrels[index]?.barrelThickness ?? 6,
    }),
  );
  return lineupSheet(subjects);
}

/** G-03 — 재화·상태 아이콘 3x2 그리드. */
function buildIconGrid(): RgbaImage {
  const colors: Rgba[] = [
    PALETTE.gold,
    PALETTE.aum,
    PALETTE.up,
    PALETTE.down,
    PALETTE.paper,
    PALETTE.muted,
  ];
  const subjects: SynthSubject[] = [];
  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      const index = row * 3 + col;
      subjects.push(
        ...icon(64 + col * 128, 64 + row * 128, 34, colors[index] ?? PALETTE.paper, PALETTE.navy),
      );
    }
  }
  return renderMagentaSheet({ width: GRID_WIDTH, height: GRID_HEIGHT, subjects });
}

export const FIXTURE_SPECS: readonly FixtureSpec[] = [
  { fileName: 'E-01.png', description: '아군 유닛 3종 라인업 (baseline 어긋남)', build: buildAllyLineup },
  { fileName: 'F-01.png', description: '지상 적 3종 라인업 (각진 실루엣)', build: buildEnemyLineup },
  { fileName: 'D-01.png', description: '타워 3종 티어1 라인업', build: buildTowerLineup },
  { fileName: 'G-03.png', description: '재화·상태 아이콘 3x2 그리드', build: buildIconGrid },
];
