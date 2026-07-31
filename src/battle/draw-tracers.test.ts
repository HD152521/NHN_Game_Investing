import { describe, expect, test } from 'vitest';

import { TOWER_COOLDOWN_MS } from '../combat/index.js';
import { createTheme } from '../design/index.js';
import { makeCombatState as combatState, makeEnemy as enemy, makeTower as tower } from './combat-fixtures.js';
import { drawTracers } from './draw-tracers.js';
import { computeBattleLayout } from './layout.js';
import { createFakeBattleCtx } from './fake-ctx.js';

const { palette } = createTheme();
const layout = computeBattleLayout(1024, 300);

function hasTracerLine(ctx: ReturnType<typeof createFakeBattleCtx>): boolean {
  return ctx.calls.some((c) => c.kind === 'lineTo');
}

describe('drawTracers — 방금 발사한 타워의 예광선', () => {
  test('쿨다운이 막 리셋된(=방금 발사한) 타워는 예광선을 그린다', () => {
    const ctx = createFakeBattleCtx();
    const justFiredCooldown = TOWER_COOLDOWN_MS.basic * 0.9;
    const state = combatState({
      towers: [tower({ kind: 'basic', cooldownMs: justFiredCooldown })],
      enemies: [enemy({ lane: 'ground', x: 0.3 })],
    });

    drawTracers(ctx, palette, layout, state);

    expect(hasTracerLine(ctx)).toBe(true);
  });

  test('재장전 중(쿨다운이 낮은) 타워는 예광선을 그리지 않는다', () => {
    const ctx = createFakeBattleCtx();
    const reloadingCooldown = TOWER_COOLDOWN_MS.basic * 0.1;
    const state = combatState({
      towers: [tower({ kind: 'basic', cooldownMs: reloadingCooldown })],
      enemies: [enemy({ lane: 'ground', x: 0.3 })],
    });

    drawTracers(ctx, palette, layout, state);

    expect(hasTracerLine(ctx)).toBe(false);
  });

  test('사거리 내 표적이 없으면 방금 발사한 타워라도 예광선을 그리지 않는다', () => {
    const ctx = createFakeBattleCtx();
    const justFiredCooldown = TOWER_COOLDOWN_MS.basic * 0.9;
    const state = combatState({
      // basic 사거리(0.42) 밖의 적만 존재.
      towers: [tower({ kind: 'basic', cooldownMs: justFiredCooldown })],
      enemies: [enemy({ lane: 'ground', x: 0.9 })],
    });

    drawTracers(ctx, palette, layout, state);

    expect(hasTracerLine(ctx)).toBe(false);
  });

  test('대공 포대의 예광선은 공중 레인(airY) 쪽을 향한다', () => {
    const ctx = createFakeBattleCtx();
    const justFiredCooldown = TOWER_COOLDOWN_MS.antiair * 0.9;
    const state = combatState({
      towers: [tower({ kind: 'antiair', cooldownMs: justFiredCooldown })],
      enemies: [enemy({ lane: 'air', x: 0.2 })],
    });

    drawTracers(ctx, palette, layout, state);

    const reachesAirY = ctx.calls.some((c) => c.kind === 'lineTo' && Math.abs(c.y - layout.airY) < 1);
    expect(reachesAirY).toBe(true);
  });

  test('antiair 타워는 지상 적이 있어도 예광선을 그리지 않는다(레인 불일치)', () => {
    const ctx = createFakeBattleCtx();
    const justFiredCooldown = TOWER_COOLDOWN_MS.antiair * 0.9;
    const state = combatState({
      towers: [tower({ kind: 'antiair', cooldownMs: justFiredCooldown })],
      enemies: [enemy({ lane: 'ground', x: 0.1 })],
    });

    drawTracers(ctx, palette, layout, state);

    expect(hasTracerLine(ctx)).toBe(false);
  });

  test('splash 타워는 사거리 내 여러 표적 모두에게 예광선을 그린다', () => {
    const ctx = createFakeBattleCtx();
    const justFiredCooldown = TOWER_COOLDOWN_MS.splash * 0.9;
    const state = combatState({
      towers: [tower({ kind: 'splash', cooldownMs: justFiredCooldown })],
      enemies: [
        enemy({ id: 1, lane: 'ground', x: 0.1 }),
        enemy({ id: 2, lane: 'ground', x: 0.2 }),
      ],
    });

    drawTracers(ctx, palette, layout, state);

    const lineToCalls = ctx.calls.filter((c) => c.kind === 'lineTo');
    expect(lineToCalls.length).toBeGreaterThanOrEqual(2);
  });

  test('타워 슬롯이 0이면 크래시하지 않는다', () => {
    const ctx = createFakeBattleCtx();
    const state = combatState({ towerSlots: 0, towers: [] });

    expect(() => drawTracers(ctx, palette, layout, state)).not.toThrow();
  });
});
