import { ATLAS_PADDING, DEFAULT_MAX_ATLAS_WIDTH } from './constants.js';
import { AssetPipelineError } from './errors.js';
import { ImageBuilder } from './image.js';
import type { Rect, RgbaImage } from './types.js';

export interface PackInput {
  readonly name: string;
  readonly image: RgbaImage;
  /** 프레임 내부에서의 발밑 y좌표. 매니페스트로 그대로 넘어갑니다. */
  readonly baselineY: number;
}

export interface Placement {
  readonly name: string;
  readonly rect: Rect;
}

export interface PackResult {
  readonly width: number;
  readonly height: number;
  readonly placements: readonly Placement[];
}

export interface PackOptions {
  readonly maxWidth?: number;
  readonly padding?: number;
}

function assertUniqueNames(inputs: readonly PackInput[]): void {
  const seen = new Set<string>();
  for (const item of inputs) {
    if (seen.has(item.name)) {
      throw new AssetPipelineError(
        '아틀라스 프레임 이름이 중복됩니다.',
        `"${item.name}" — 매니페스트가 이름으로 색인되므로 중복은 허용되지 않습니다.`,
      );
    }
    seen.add(item.name);
  }
}

/**
 * 선반(shelf) 방식 패킹.
 * 높이 내림차순으로 정렬해 한 줄씩 채우고, 줄이 차면 다음 선반으로 내려갑니다.
 * 스프라이트 수가 수백 장 규모라 이 정도면 충분합니다.
 */
export function packShelves(inputs: readonly PackInput[], options: PackOptions = {}): PackResult {
  if (inputs.length === 0) {
    throw new AssetPipelineError('패킹할 프레임이 없습니다.', '최소 1개가 필요합니다.');
  }
  assertUniqueNames(inputs);

  const maxWidth = options.maxWidth ?? DEFAULT_MAX_ATLAS_WIDTH;
  const padding = options.padding ?? ATLAS_PADDING;

  const ordered = [...inputs].sort(
    (a, b) => b.image.height - a.image.height || b.image.width - a.image.width,
  );

  const placements: Placement[] = [];
  let cursorX = 0;
  let shelfY = 0;
  let shelfHeight = 0;
  let usedWidth = 0;

  for (const item of ordered) {
    const { width, height } = item.image;
    if (width > maxWidth) {
      throw new AssetPipelineError(
        '프레임이 아틀라스 최대 폭보다 넓습니다.',
        `"${item.name}" ${width}px > maxWidth ${maxWidth}px — 원본을 축소하거나 maxWidth 를 올리세요.`,
      );
    }
    if (cursorX > 0 && cursorX + width > maxWidth) {
      shelfY += shelfHeight + padding;
      cursorX = 0;
      shelfHeight = 0;
    }

    placements.push({ name: item.name, rect: { x: cursorX, y: shelfY, width, height } });
    cursorX += width + padding;
    usedWidth = Math.max(usedWidth, cursorX - padding);
    shelfHeight = Math.max(shelfHeight, height);
  }

  return { width: usedWidth, height: shelfY + shelfHeight, placements };
}

/** 패킹 결과대로 프레임들을 한 장의 아틀라스 이미지로 합칩니다. */
export function composeAtlas(inputs: readonly PackInput[], result: PackResult): RgbaImage {
  const byName = new Map(inputs.map((item) => [item.name, item]));
  const builder = new ImageBuilder(result.width, result.height);

  for (const placement of result.placements) {
    const item = byName.get(placement.name);
    if (item === undefined) {
      throw new AssetPipelineError(
        '패킹 결과에 있는 프레임이 입력 목록에 없습니다.',
        `"${placement.name}" — packShelves 에 넘긴 것과 같은 목록을 넘겨야 합니다.`,
      );
    }
    builder.draw(item.image, placement.rect.x, placement.rect.y);
  }

  return builder.toImage();
}
