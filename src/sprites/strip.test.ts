import { describe, expect, test } from 'vitest';

import {
  ANIM_FRAMES,
  canFrame,
  CAN_SPIN_ORIGIN_X,
  CAN_SPIN_ORIGIN_Y,
  CAN_SPIN_PITCH_X,
  meleeFrame,
  shieldFrame,
  throwFrame,
  type AnimFrame,
} from './anim';
import { FX_FRAMES, fxBomb, fxHeal, fxShield } from './fx-seq';
import { mk, type SpriteGrid } from './grid';
import { spriteGrid } from './index';
import { TRANSPARENT } from './palette';
import { stampGrid } from './scene-wide';
import { SPRITE_STRIPS, STRIP_SPRITE_KEYS, stripFrameGrid, stripFrameRect, type StripSpriteKey } from './strip';

/**
 * 스트립 프레임 절단 검사.
 *
 * 스트립은 `stamp` 를 거치며 팔레트 문자가 HEX 로 구워지므로, 프레임 생성기의 출력과 직접
 * 비교하려면 같은 방식으로 한 번 구워야 한다. 아래 `bake()` 가 그 역할이고, 이 검사가
 * "잘라낸 프레임 = 생성기가 만든 프레임" 을 픽셀 단위로 고정한다.
 */
function bake(grid: SpriteGrid): SpriteGrid {
  const out = mk(grid[0]?.length ?? 0, grid.length);
  stampGrid(out.g, grid, 0, 0);
  return out.g;
}

function render(grid: readonly (readonly string[])[]): string {
  return grid.map((row) => row.join('')).join('\n');
}

/** 스트립 키 → 프레임 생성기. 인덱스가 곧 프레임 번호다. */
const STRIP_FRAME_BUILDER: Readonly<Record<StripSpriteKey, (index: number) => SpriteGrid>> = {
  'tf-melee-loop': (i) => meleeFrame(ANIM_FRAMES[i] as AnimFrame),
  'tf-throw-loop': (i) => throwFrame(ANIM_FRAMES[i] as AnimFrame),
  'tf-shield-loop': (i) => shieldFrame(ANIM_FRAMES[i] as AnimFrame),
  'tf-fx-seq-01': (i) => fxBomb(FX_FRAMES[i] ?? 0),
  'tf-fx-seq-02': (i) => fxHeal(FX_FRAMES[i] ?? 0),
  'tf-fx-seq-03': (i) => fxShield(FX_FRAMES[i] ?? 0),
};

describe('stripFrameRect — 원본 `strip(frames, gap)` 배치', () => {
  test('여백은 프레임 사이가 아니라 양끝까지 n+1 개다', () => {
    // 원본: w = Σ프레임폭 + gap × (n + 1). melee 는 4 × 30 + 5 × 5 = 145.
    const sheet = spriteGrid('tf-melee-loop');
    const meta = SPRITE_STRIPS['tf-melee-loop'];
    const width = sheet[0]?.length ?? 0;

    expect(width).toBe(145);
    expect(sheet).toHaveLength(36);

    const rects = [0, 1, 2, 3].map((i) => stripFrameRect(meta, width, sheet.length, i));
    expect(rects.map((r) => r.x)).toEqual([5, 40, 75, 110]);
    expect(rects.map((r) => r.w)).toEqual([30, 30, 30, 30]);
    // 세로는 위아래 1px 여백(h = frameH + 2) — 프레임 y 는 항상 1 이다.
    expect(rects.map((r) => r.y)).toEqual([1, 1, 1, 1]);
    expect(rects.map((r) => r.h)).toEqual([34, 34, 34, 34]);
  });

  test.each(STRIP_SPRITE_KEYS)('%s 의 프레임 폭이 정수이고 여백까지 합이 시트 폭과 같다', (key) => {
    const sheet = spriteGrid(key);
    const meta = SPRITE_STRIPS[key];
    const width = sheet[0]?.length ?? 0;
    const first = stripFrameRect(meta, width, sheet.length, 0);

    expect(Number.isInteger(first.w)).toBe(true);
    expect(first.w * meta.frames + meta.gap * (meta.frames + 1)).toBe(width);
  });

  test.each(STRIP_SPRITE_KEYS)('%s 의 프레임 경계 픽셀 — 여백 열은 완전히 비어 있다', (key) => {
    const sheet = spriteGrid(key);
    const meta = SPRITE_STRIPS[key];
    const width = sheet[0]?.length ?? 0;

    for (let i = 0; i < meta.frames; i += 1) {
      const rect = stripFrameRect(meta, width, sheet.length, i);
      for (const row of sheet) {
        expect(row[rect.x - 1], `${key} 프레임 ${i} 왼쪽 여백`).toBe(TRANSPARENT);
        expect(row[rect.x + rect.w], `${key} 프레임 ${i} 오른쪽 여백`).toBe(TRANSPARENT);
      }
    }
    // 위아래 1px 여백도 비어 있다.
    for (const cell of sheet[0] ?? []) expect(cell).toBe(TRANSPARENT);
    for (const cell of sheet[sheet.length - 1] ?? []) expect(cell).toBe(TRANSPARENT);
  });

  test.each(STRIP_SPRITE_KEYS)('%s 에서 잘라낸 프레임이 생성기 출력과 픽셀 단위로 같다', (key) => {
    const sheet = spriteGrid(key);
    const meta = SPRITE_STRIPS[key];
    const build = STRIP_FRAME_BUILDER[key];

    for (let i = 0; i < meta.frames; i += 1) {
      expect(render(stripFrameGrid(sheet, meta, i)), `${key} 프레임 ${i}`).toBe(render(bake(build(i))));
    }
  });

  test('프레임 인덱스는 범위 밖이면 양끝으로 잘린다', () => {
    const meta = SPRITE_STRIPS['tf-melee-loop'];
    expect(stripFrameRect(meta, 145, 36, -3).x).toBe(stripFrameRect(meta, 145, 36, 0).x);
    expect(stripFrameRect(meta, 145, 36, 99).x).toBe(stripFrameRect(meta, 145, 36, 3).x);
  });

  test('프레임마다 그림이 실제로 다르다 (같은 프레임을 4번 붙인 시트가 아니다)', () => {
    for (const key of STRIP_SPRITE_KEYS) {
      const sheet = spriteGrid(key);
      const meta = SPRITE_STRIPS[key];
      const seen = new Set<string>();
      for (let i = 0; i < meta.frames; i += 1) seen.add(render(stripFrameGrid(sheet, meta, i)));
      expect(seen.size, key).toBe(meta.frames);
    }
  });
});

describe('canSpin — `strip()` 이 아니라 자체 배치(원점 3, 피치 20)', () => {
  /**
   * ★ 프레임 사이에 여백이 없다: 캔 폭 16 < 피치 20 이라 3칸이 남는데, 원본이 그 자리에
   *   **잔상 점**(`px(1 + i*20 - k, …, 'd')`, k = 0..3 → x = 20i−2 … 20i+1)을 찍는다.
   *   k = 3 인 점만 x = 20i−2 = 앞 프레임의 마지막 열(20(i−1)+18)에 **한 칸 겹친다.**
   *   그래서 프레임 0~2 는 마지막 열 하나를 빼고 비교한다 — 겹친 칸은 아래에서 따로 본다.
   */
  test('프레임 4장이 원본 좌표에서 캔 생성기 출력과 일치한다 (잔상 겹침 1열 제외)', () => {
    const sheet = spriteGrid('tf-can-spin');
    expect(sheet[0]?.length).toBe(84);
    expect(sheet).toHaveLength(22);

    for (let i = 0; i < ANIM_FRAMES.length; i += 1) {
      const frame = ANIM_FRAMES[i] as AnimFrame;
      const expected = bake(canFrame(frame));
      const fullWidth = expected[0]?.length ?? 0;
      const compareWidth = i < ANIM_FRAMES.length - 1 ? fullWidth - 1 : fullWidth;
      const x0 = CAN_SPIN_ORIGIN_X + i * CAN_SPIN_PITCH_X;

      const cut: SpriteGrid = [];
      for (let y = 0; y < expected.length; y += 1) {
        const row = sheet[CAN_SPIN_ORIGIN_Y + y];
        if (row === undefined) continue;
        cut.push(row.slice(x0, x0 + compareWidth));
      }
      const want = expected.map((row) => row.slice(0, compareWidth));
      expect(render(cut), `캔 프레임 ${i}`).toBe(render(want));
    }
  });

  test('잔상 점은 팔레트 문자 그대로다 (`px` 는 굽지 않는다)', () => {
    const sheet = spriteGrid('tf-can-spin');
    // i = 1 의 잔상 4점: x = 21, 20, 19, 18 / y = 11, 12, 11, 12.
    expect(sheet[11]?.[21]).toBe('d');
    expect(sheet[12]?.[20]).toBe('d');
    expect(sheet[11]?.[19]).toBe('d');
    expect(sheet[12]?.[18]).toBe('d');
  });
});
