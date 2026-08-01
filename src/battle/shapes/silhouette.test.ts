/**
 * 정체성 데이터(`src/combat/identity.ts`)와 실제 드로잉이 갈라지지 않는지 전수 검사한다.
 *
 * 이 프로젝트에서 실제로 났던 사고: 이름·실루엣 **분류값**만 데이터로 들어가고, 화면은
 * 예전 도형 그대로여서 "시트가 하나도 반영이 안 됐다"는 상태가 됐다. 분류값과 그림을
 * 잇는 검사가 없으면 같은 일이 반복된다.
 */

import { describe, expect, test } from 'vitest';

import { identityForCode } from '../../combat/identity.js';
import { createTheme } from '../../design/index.js';
import { createFakeBattleCtx } from '../fake-ctx.js';
import { computeBattleLayout, slotRect } from '../layout.js';
import { hasArc } from './bbox-probe.js';
import { ALLY_SHAPES, ENEMY_SHAPES, TOWER_SHAPES } from './index.js';

const { palette } = createTheme();
const layout = computeBattleLayout(1024, 320);
const rect = slotRect(0, layout, 6);

const UNIT_ENTRIES = [...Object.values(ALLY_SHAPES), ...Object.values(ENEMY_SHAPES)];

describe('실루엣 레지스트리 — 시트 자산 코드가 정체성 데이터와 1:1로 맞는다', () => {
  test.each(UNIT_ENTRIES.map((entry) => [entry.codeId] as const))('%s 는 정체성 표에 존재한다', (codeId) => {
    expect(identityForCode(codeId)).not.toBeNull();
  });

  test.each(Object.values(TOWER_SHAPES).map((entry) => [entry.codeId] as const))(
    '%s(타워) 는 정체성 표에 존재한다',
    (codeId) => {
      expect(identityForCode(codeId)).not.toBeNull();
    },
  );
});

describe('이중 인코딩 — rounded 는 원을 그리고 angular 는 원을 그리지 않는다', () => {
  test.each(UNIT_ENTRIES.map((entry) => [entry.codeId, entry] as const))(
    '%s 의 그림이 분류값과 일치한다',
    (codeId, entry) => {
      const identity = identityForCode(codeId);
      const ctx = createFakeBattleCtx();
      entry.draw(ctx, palette, 200, 200);

      expect(identity).not.toBeNull();
      expect(hasArc(ctx.calls)).toBe(identity?.silhouette === 'rounded');
    },
  );

  test.each(Object.values(TOWER_SHAPES).map((entry) => [entry.codeId, entry] as const))(
    '%s(타워) 의 그림이 분류값과 일치한다',
    (codeId, entry) => {
      const identity = identityForCode(codeId);
      const ctx = createFakeBattleCtx();
      entry.draw(ctx, rect, palette.BG_2, palette.UP_ALLY, palette.UP_DEEP, palette.LINE);

      expect(identity).not.toBeNull();
      expect(hasArc(ctx.calls)).toBe(identity?.silhouette === 'rounded');
    },
  );
});

describe('극단 입력에서 크래시하지 않는다', () => {
  test('반지름 0에 수렴하는 극소 슬롯에서도 타워를 그린다', () => {
    const tiny = slotRect(0, computeBattleLayout(2, 2), 6);
    for (const entry of Object.values(TOWER_SHAPES)) {
      const ctx = createFakeBattleCtx();
      expect(() => entry.draw(ctx, tiny, palette.BG_2, palette.UP_ALLY, palette.UP_DEEP, palette.LINE)).not.toThrow();
    }
  });

  test('폭·높이가 0인 캔버스에서도 유닛 실루엣이 예외를 던지지 않는다', () => {
    for (const entry of UNIT_ENTRIES) {
      const ctx = createFakeBattleCtx();
      expect(() => entry.draw(ctx, palette, 0, 0)).not.toThrow();
    }
  });
});
