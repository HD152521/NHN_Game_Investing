/**
 * 그리드 → 캔버스 1회 굽기. **프레임당 실행되지 않는다** — 캐시가 비었을 때만 돈다.
 *
 * 원본 `paint()` 는 픽셀마다 `fillRect(x, y, 1, 1)` 이었다. 여기서는 같은 색이 이어지는
 * 가로 구간을 하나의 `fillRect` 로 합친다(그림은 동일, 호출 수만 줄어든다).
 */

import { parseHex } from '../../design/color';
import type { Palette } from '../../design/theme';
import type { SpriteGrid } from '../grid';
import { SPRITE_CHARS, SPRITE_PALETTE, TRANSPARENT, type SpriteChar } from '../palette';
import type { CompositeSpec } from './composite';
import type { RasterContext2D } from './surface';

/** 최대 채널값(0-255). 가산 합성에서 "이 색이 화면을 밝힐 수 있는가" 의 척도다. */
function brightestChannel(hex: string): number {
  const { r, g, b } = parseHex(hex);
  return Math.max(r, g, b);
}

/**
 * 이 합성 분류에서 **알파 0 으로 굽는** 문자들.
 * 그리드 데이터는 그대로 두고 래스터 결과에서만 빠진다(원본 대조 테스트 불변).
 */
export function droppedChars(palette: Palette, spec: CompositeSpec): readonly SpriteChar[] {
  const floor = spec.inkFloor;
  if (floor === null) return [];
  return SPRITE_CHARS.filter((char) => brightestChannel(palette[SPRITE_PALETTE[char]]) < floor);
}

/** 굽는 시점에 살아남는 문자인지. `null` 이면 그리지 않는다. */
function inkOf(cell: string | undefined, dropped: ReadonlySet<string>): SpriteChar | null {
  if (cell === undefined || cell === TRANSPARENT || dropped.has(cell)) return null;
  return cell as SpriteChar;
}

/**
 * 그리드를 컨텍스트에 1:1 픽셀로 굽는다. 컨텍스트는 그리드와 같은 크기여야 한다.
 * 반환값은 실제로 발생한 `fillRect` 호출 수 — 캐시 구축 비용을 테스트로 감시하기 위한 것이다.
 */
export function rasterizeGrid(
  ctx: RasterContext2D,
  grid: SpriteGrid,
  palette: Palette,
  spec: CompositeSpec,
): number {
  const dropped = new Set<string>(droppedChars(palette, spec));
  let calls = 0;

  for (let y = 0; y < grid.length; y += 1) {
    const row = grid[y];
    if (row === undefined) continue;

    let runChar: SpriteChar | null = null;
    let runStart = 0;

    for (let x = 0; x <= row.length; x += 1) {
      const char = x < row.length ? inkOf(row[x], dropped) : null;
      if (char === runChar) continue;
      if (runChar !== null) {
        ctx.fillStyle = palette[SPRITE_PALETTE[runChar]];
        ctx.fillRect(runStart, y, x - runStart, 1);
        calls += 1;
      }
      runChar = char;
      runStart = x;
    }
  }

  return calls;
}
