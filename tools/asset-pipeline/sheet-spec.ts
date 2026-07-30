import { basename, extname } from 'node:path';
import { AssetPipelineError } from './errors.js';

/**
 * 시트 한 장이 어떻게 잘려야 하는지에 대한 선언.
 * 아트가이드 R3 — 비교될 에셋은 한 장에 나란히 뽑고 나중에 자릅니다.
 */
export type SheetLayout =
  | { readonly kind: 'single' }
  | { readonly kind: 'lineup'; readonly count: number }
  | { readonly kind: 'grid'; readonly columns: number; readonly rows: number };

export interface SheetSpec {
  readonly id: string;
  readonly layout: SheetLayout;
  readonly frameNames: readonly string[];
  /** 지면에 서는 에셋만 baseline 을 맞춥니다. HUD 아이콘은 발밑이 없습니다. */
  readonly alignBaselines: boolean;
}

type RegisteredSpec = Omit<SheetSpec, 'id'>;

const REGISTRY: ReadonlyMap<string, RegisteredSpec> = new Map<string, RegisteredSpec>([
  [
    'E-01',
    {
      layout: { kind: 'lineup', count: 3 },
      frameNames: ['unit/intern', 'unit/analyst', 'unit/trader'],
      alignBaselines: true,
    },
  ],
  [
    'F-01',
    {
      layout: { kind: 'lineup', count: 3 },
      frameNames: ['enemy/short-seller', 'enemy/margin-caller', 'enemy/bear-brute'],
      alignBaselines: true,
    },
  ],
  [
    'D-01',
    {
      layout: { kind: 'lineup', count: 3 },
      frameNames: ['tower/basic', 'tower/anti-air', 'tower/splash'],
      alignBaselines: true,
    },
  ],
  [
    'G-03',
    {
      layout: { kind: 'grid', columns: 3, rows: 2 },
      frameNames: ['icon/gold', 'icon/aum', 'icon/hp', 'icon/wave', 'icon/accuracy', 'icon/upkeep'],
      alignBaselines: false,
    },
  ],
]);

const ASSET_ID_PATTERN = /^([A-Z])-(\d{2})/;

/** 파일명에서 에셋 ID(`E-01` 등)를 뽑아 분할 규칙을 찾습니다. */
export function resolveSheetSpec(fileName: string): SheetSpec {
  if (extname(fileName).toLowerCase() !== '.png') {
    throw new AssetPipelineError(
      '파이프라인 입력은 PNG 만 지원합니다.',
      `${fileName} — 아트가이드 R2대로 마젠타 배경 PNG 로 내보내세요.`,
    );
  }

  const stem = basename(fileName, extname(fileName));
  const match = ASSET_ID_PATTERN.exec(stem.toUpperCase());
  const id = match === null ? stem : `${match[1]}-${match[2]}`;

  const registered = REGISTRY.get(id);
  if (registered === undefined) {
    return { id: stem, layout: { kind: 'single' }, frameNames: [stem], alignBaselines: true };
  }
  return { id, ...registered };
}

/** 해당 레이아웃이 만들어낼 프레임 수. */
export function frameCountOf(layout: SheetLayout): number {
  switch (layout.kind) {
    case 'single':
      return 1;
    case 'lineup':
      return layout.count;
    case 'grid':
      return layout.columns * layout.rows;
  }
}
