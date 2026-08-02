/**
 * 프레임 스트립 — 원본 `ticker-front-sprites.js` 의 `strip(frames, gap)` 이식 +
 * "프레임 인덱스로 잘라 쓰기" 메타데이터.
 *
 * ★ 원본 레이아웃(추측 금지 — 원본 코드 그대로다)
 *
 *     strip(frames, gap):
 *       w = frames.reduce((a, g) => a + g[0].length + gap, gap)   // = Σw + gap × (n + 1)
 *       h = max(frame.length) + 2
 *       x = gap;  각 프레임을 (x, h - frameH - 1) 에 stamp 하고 x += frameW + gap
 *
 *   즉 간격은 프레임 **사이**뿐 아니라 **양끝에도** 들어간다(n−1 이 아니라 n+1 개다).
 *   세로는 아래로 1픽셀 여백, 위로 1픽셀 여백(h = frameH + 2)이라 프레임의 y 는 항상 1 이다.
 *   실측: melee 4프레임 × 30px + 5 × 5 = 145, h = 34 + 2 = 36 — `grids.json` 과 일치한다.
 *
 * ★ `stamp` 는 팔레트 문자를 그 시점의 기본 팔레트 HEX 로 **굽는다**(원본 `this.PAL[v]`).
 *   그래서 스트립 시트의 셀은 생 색이고 색약 모드를 따라가지 않는다 — `tf-sky-wide` 와 같은
 *   성질이다. 게임 화면에 얹을 때는 스트립을 자르지 말고 프레임 생성기(`anim.ts` 의
 *   `meleeFrame` 등)를 직접 써라. 그러면 팔레트 문자가 살아 있어 색약 모드가 정상 동작한다.
 *   (두 경로가 같은 그림인지는 `strip.test.ts` 가 픽셀 단위로 고정한다.)
 */

import type { SpriteGrid } from './grid';
import { mk } from './grid';
import { stampGrid } from './scene-wide';

/** 스트립 한 장의 배치 규칙. 프레임 수·간격을 **데이터로** 둔다(하드코딩 금지). */
export interface StripMeta {
  readonly frames: number;
  /** 프레임 사이와 양끝에 들어가는 여백(px). 원본 `strip(frames, gap)` 의 `gap`. */
  readonly gap: number;
}

/** 스트립 안 프레임 하나의 사각형(1× 픽셀 기준). */
export interface FrameRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** 원본 `strip(frames, gap)`. 프레임을 가로로 늘어놓고 아래를 맞춘다. */
export function strip(frames: readonly SpriteGrid[], gap: number): SpriteGrid {
  const width = frames.reduce((acc, g) => acc + (g[0]?.length ?? 0) + gap, gap);
  const height = Math.max(...frames.map((g) => g.length)) + 2;
  const c = mk(width, height);
  let x = gap;
  for (const frame of frames) {
    stampGrid(c.g, frame, x, height - frame.length - 1);
    x += (frame[0]?.length ?? 0) + gap;
  }
  return c.g;
}

/** 유닛 공격 스트립 3종의 간격. 원본 `strip([...], 5)`. */
export const UNIT_STRIP_GAP = 5;

/** 스킬 FX 5프레임 시퀀스의 간격. 원본 `fxSeq()` 의 `strip([...], 4)`. */
export const FX_SEQ_STRIP_GAP = 4;

/** 유닛 공격 스트립의 프레임 수. 원본 `[0, 1, 2, 3].map(...)`. */
export const UNIT_STRIP_FRAMES = 4;

/** 스킬 FX 시퀀스의 프레임 수. 원본 `[0, 1, 2, 3, 4].map(...)`. */
export const FX_SEQ_STRIP_FRAMES = 5;

/**
 * 스트립 키 → 배치 메타데이터.
 *
 * 시트를 만드는 쪽(`index.ts` 의 빌더)도 이 표의 `gap`/`frames` 를 읽으므로, 표와 실제
 * 시트가 어긋날 수 없다.
 */
export const SPRITE_STRIPS = {
  'tf-melee-loop': { frames: UNIT_STRIP_FRAMES, gap: UNIT_STRIP_GAP },
  'tf-throw-loop': { frames: UNIT_STRIP_FRAMES, gap: UNIT_STRIP_GAP },
  'tf-shield-loop': { frames: UNIT_STRIP_FRAMES, gap: UNIT_STRIP_GAP },
  'tf-fx-seq-01': { frames: FX_SEQ_STRIP_FRAMES, gap: FX_SEQ_STRIP_GAP },
  'tf-fx-seq-02': { frames: FX_SEQ_STRIP_FRAMES, gap: FX_SEQ_STRIP_GAP },
  'tf-fx-seq-03': { frames: FX_SEQ_STRIP_FRAMES, gap: FX_SEQ_STRIP_GAP },
} as const satisfies Record<string, StripMeta>;

/** `strip()` 으로 만들어진 시트 키. */
export type StripSpriteKey = keyof typeof SPRITE_STRIPS;

export const STRIP_SPRITE_KEYS = Object.keys(SPRITE_STRIPS) as readonly StripSpriteKey[];

function clampIndex(index: number, count: number): number {
  if (!Number.isFinite(index)) return 0;
  const floored = Math.floor(index);
  if (floored < 0) return 0;
  return floored > count - 1 ? count - 1 : floored;
}

/**
 * 스트립 안 `index` 번째 프레임의 사각형.
 *
 * 폭은 시트 폭에서 여백(gap × (frames + 1))을 뺀 나머지를 프레임 수로 나눈 값이다 —
 * 프레임 폭을 상수로 박아두지 않으므로, 시트가 바뀌어도 이 함수는 그대로 맞는다.
 * (원본 `strip` 은 프레임마다 폭이 달라도 되지만, 실제 6장은 전부 등폭이다.)
 */
export function stripFrameRect(meta: StripMeta, sheetWidth: number, sheetHeight: number, index: number): FrameRect {
  const frames = Math.max(1, meta.frames);
  const frameW = (sheetWidth - meta.gap * (frames + 1)) / frames;
  const frameH = sheetHeight - 2;
  const i = clampIndex(index, frames);
  return { x: meta.gap + i * (frameW + meta.gap), y: sheetHeight - frameH - 1, w: frameW, h: frameH };
}

/** 스트립 그리드에서 프레임 하나를 잘라 새 그리드로 돌려준다(테스트·오프라인 도구용). */
export function stripFrameGrid(sheet: SpriteGrid, meta: StripMeta, index: number): SpriteGrid {
  const rect = stripFrameRect(meta, sheet[0]?.length ?? 0, sheet.length, index);
  const out: SpriteGrid = [];
  for (let y = rect.y; y < rect.y + rect.h; y += 1) {
    const row = sheet[y];
    if (row === undefined) continue;
    out.push(row.slice(rect.x, rect.x + rect.w));
  }
  return out;
}
