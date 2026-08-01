/**
 * 타워 3종 실루엣 구분 검사 (아트 프로덕션 시트 v1.1 §06 합격 조건:
 * "세 실루엣이 한눈에 구분돼야 한다").
 *
 * 장식이 다른 것만으로는 축소된 전투 화면에서 구분되지 않는다. 그래서 **바운딩 박스 비율**로
 * 검증한다: 리피터가 가장 높고 얇고, 살포기가 가장 낮고 뭉툭하다.
 */

import { describe, expect, test } from 'vitest';

import { createTheme } from '../../design/index.js';
import { createFakeBattleCtx } from '../fake-ctx.js';
import type { FakeBattleCtx } from '../fake-ctx.js';
import { computeBattleLayout, slotRect } from '../layout.js';
import { aspectRatio, boundsOf, hasArc } from './bbox-probe.js';
import { TOWER_SHAPES } from './index.js';
import { basePlateRect } from './tower-shapes.js';
import type { TowerKind } from '../../combat/types.js';

const { palette } = createTheme();
const layout = computeBattleLayout(1024, 320);
const rect = slotRect(0, layout, 6);
const EPSILON = 0.001;

function drawTower(kind: TowerKind): FakeBattleCtx {
  const ctx = createFakeBattleCtx();
  TOWER_SHAPES[kind].draw(ctx, rect, palette.BG_2, palette.UP_ALLY, palette.UP_DEEP, palette.LINE);
  return ctx;
}

describe('타워 3종 — 실루엣 비율이 서로 다르다', () => {
  test('공시 리피터(T-02)가 가장 높고 얇다', () => {
    const repeater = aspectRatio(boundsOf(drawTower('antiair').calls));
    const anchor = aspectRatio(boundsOf(drawTower('basic').calls));
    const spray = aspectRatio(boundsOf(drawTower('splash').calls));

    expect(repeater).toBeGreaterThan(anchor);
    expect(repeater).toBeGreaterThan(spray);
  });

  test('물타기 살포기(T-03)가 가장 뭉툭하다(가장 낮은 세로/가로 비)', () => {
    const spray = aspectRatio(boundsOf(drawTower('splash').calls));
    const anchor = aspectRatio(boundsOf(drawTower('basic').calls));
    const repeater = aspectRatio(boundsOf(drawTower('antiair').calls));

    expect(spray).toBeLessThan(anchor);
    expect(spray).toBeLessThan(repeater);
  });

  test('리피터는 슬롯 위로 솟고(대공), 앵커포는 슬롯 아래로 쐐기를 박는다', () => {
    expect(boundsOf(drawTower('antiair').calls).minY).toBeLessThan(rect.y);
    expect(boundsOf(drawTower('basic').calls).maxY).toBeGreaterThan(rect.y + rect.h);
  });

  test('살포기의 총구가 세 종류 중 가장 넓게 벌어진다', () => {
    const spray = boundsOf(drawTower('splash').calls).width;
    const repeater = boundsOf(drawTower('antiair').calls).width;

    expect(spray).toBeGreaterThan(repeater);
  });
});

describe('타워 3종 — 공통 규약', () => {
  test('셋 다 동일한 정사각 베이스 플레이트 위에 선다', () => {
    const plate = basePlateRect(rect);
    expect(Math.abs(plate.w - plate.h)).toBeLessThan(EPSILON);

    for (const kind of ['basic', 'antiair', 'splash'] as const) {
      const startsOnPlate = drawTower(kind).calls.some(
        (call) => call.kind === 'moveTo' && Math.abs(call.x - plate.x) < EPSILON && Math.abs(call.y - plate.y) < EPSILON,
      );
      expect(startsOnPlate).toBe(true);
    }
  });

  test('셋 다 원형 부품(앵커 릴 · 접시 · 탄통)을 하나씩 가진다 — 아군 진영 신호', () => {
    expect(hasArc(drawTower('basic').calls)).toBe(true);
    expect(hasArc(drawTower('antiair').calls)).toBe(true);
    expect(hasArc(drawTower('splash').calls)).toBe(true);
  });

  test('차콜 본체와 적색 장갑을 각각 다른 색으로 칠한다(조종사 없음, 시트 §06)', () => {
    const fills = drawTower('basic').calls.filter((c) => c.kind === 'fill').map((c) => (c.kind === 'fill' ? c.fillStyle : ''));

    expect(fills).toContain(palette.BG_2);
    expect(fills).toContain(palette.UP_ALLY);
  });
});
