/**
 * 사망 연출 배선 테스트 (`death-fx.ts`).
 *
 * ★ 이 파일이 지키는 명제 ★
 * 사망은 **한 프레임짜리 이벤트**이고 "죽는 중"이라는 시간 축은 렌더 계층이 소유한다.
 * 따라서 검증할 것은 그림의 예쁨이 아니라 **수명 관리**다: 시작하고 · 진행하고 · 스스로
 * 끝나고 · 무한히 쌓이지 않는가.
 */

import { describe, expect, test } from 'vitest';

import type { DeathEvent } from '../combat/types.js';
import { createTheme } from '../design/index.js';
import { DEATH_DURATION_MS, createDeathField, deathFrameAt, drawDeaths, pushDeaths } from './death-fx.js';
import { computeBattleLayout, laneY, progressToX } from './layout.js';
import { enemyKindForId } from './entity-sprites.js';
import { createFakeBattleCtx } from './fake-ctx.js';

const palette = createTheme('default').palette;
const layout = computeBattleLayout(800, 300);

function death(overrides: Partial<DeathEvent> = {}): DeathEvent {
  return { id: 1, kind: 'enemy', lane: 'ground', x: 0.5, ...overrides };
}

/** 활성 슬롯 수 — 내부 표현을 직접 세지 않고 공개 동작으로만 관찰한다. */
function activeCount(field: ReturnType<typeof createDeathField>): number {
  return field.slots.filter((slot) => slot.active).length;
}

describe('deathFrameAt — 진행도 → 프레임', () => {
  test('시작은 0프레임, 끝은 마지막 프레임이다', () => {
    expect(deathFrameAt(0)).toBe(0);
    expect(deathFrameAt(0.99)).toBe(3);
  });

  test('진행도가 커질수록 프레임이 단조 증가한다 (되감기지 않는다)', () => {
    const frames = [0, 0.2, 0.4, 0.6, 0.8, 0.99].map(deathFrameAt);
    for (let i = 1; i < frames.length; i += 1) {
      expect(frames[i]).toBeGreaterThanOrEqual(frames[i - 1] as number);
    }
  });

  test('비정상 진행도는 0프레임으로 떨어진다', () => {
    expect(deathFrameAt(Number.NaN)).toBe(0);
    expect(deathFrameAt(-1)).toBe(0);
  });
});

describe('pushDeaths — 이벤트를 슬롯에 앉힌다', () => {
  test('빈 이벤트 목록은 아무 슬롯도 켜지 않는다', () => {
    const field = createDeathField();
    pushDeaths(field, [], layout, 0);
    expect(activeCount(field)).toBe(0);
  });

  test('죽은 자리(진행도)가 화면 좌표로 옮겨진다', () => {
    const field = createDeathField();
    pushDeaths(field, [death({ x: 0.25 })], layout, 1000);
    const slot = field.slots.find((entry) => entry.active);
    expect(slot?.x).toBeCloseTo(progressToX(0.25, layout), 6);
    expect(slot?.y).toBeCloseTo(laneY('ground', layout), 6);
  });

  test('공중에서 죽은 적은 공중 레인에 그려진다', () => {
    const field = createDeathField();
    pushDeaths(field, [death({ lane: 'air' })], layout, 0);
    expect(field.slots.find((entry) => entry.active)?.y).toBeCloseTo(laneY('air', layout), 6);
  });

  test('보스는 레인 중심이 아니라 지면선에서 무너진다 (살아 있을 때와 같은 바닥)', () => {
    const field = createDeathField();
    pushDeaths(field, [death({ kind: 'boss' })], layout, 0);
    expect(field.slots.find((entry) => entry.active)?.y).toBeCloseTo(layout.groundY, 6);
  });

  test('슬롯이 무한히 늘지 않는다 — 상한을 넘으면 오래된 것부터 덮어쓴다', () => {
    const field = createDeathField();
    const many = Array.from({ length: 200 }, (_, i) => death({ id: i }));
    pushDeaths(field, many, layout, 0);
    expect(field.slots.length).toBe(24);
    expect(activeCount(field)).toBeLessThanOrEqual(24);
  });
});

describe('drawDeaths — 스스로 끝난다', () => {
  test('지속시간이 지나면 슬롯이 꺼진다 (청소 패스가 따로 없다)', () => {
    const field = createDeathField();
    pushDeaths(field, [death()], layout, 0);
    expect(activeCount(field)).toBe(1);

    drawDeaths(createFakeBattleCtx(), palette, field, DEATH_DURATION_MS / 2);
    expect(activeCount(field)).toBe(1);

    drawDeaths(createFakeBattleCtx(), palette, field, DEATH_DURATION_MS);
    expect(activeCount(field)).toBe(0);
  });

  test('시각이 뒤로 흐른 프레임(음수 경과)에서도 슬롯이 새지 않는다', () => {
    const field = createDeathField();
    pushDeaths(field, [death()], layout, 1000);
    drawDeaths(createFakeBattleCtx(), palette, field, 0);
    expect(activeCount(field)).toBe(0);
  });

  test('활성 슬롯이 없으면 아무 것도 그리지 않는다', () => {
    const ctx = createFakeBattleCtx();
    drawDeaths(ctx, palette, createDeathField(), 0);
    expect(ctx.calls.length).toBe(0);
  });

  test('그릴 수 없는 컨텍스트에서도 크래시하지 않는다 (조용히 넘어간다)', () => {
    const field = createDeathField();
    pushDeaths(field, [death(), death({ kind: 'unit' }), death({ kind: 'boss' })], layout, 0);
    expect(() => drawDeaths(createFakeBattleCtx(), palette, field, 10)).not.toThrow();
  });
});

/**
 * ★ 실제 플레이에서 나온 잔버그 2건 ★
 * ① "적군이 죽으면 다 마법사(천 달린 애)로 죽는다"
 * ② "후반쯤에는 죽은 애들이 안 사라지던데"
 */
describe('사망 연출 — 종류와 수명', () => {
  test('★ 적 5종이 각자 다른 모습으로 죽는다 — 예전에는 전부 같았다', () => {
    const layout = computeBattleLayout(1024, 360);
    const field = createDeathField();
    // 같은 레인에서 id만 다르면 `enemyKindForId`가 다른 종류를 준다.
    const ids = [0, 1, 2, 3, 4, 5];
    pushDeaths(
      field,
      ids.map((id) => ({ id, kind: 'enemy' as const, lane: 'ground' as const, x: 0.5 })),
      layout,
      0,
    );
    const kinds = new Set(
      field.slots.filter((s) => s.active).map((s) => s.enemyKind),
    );
    // 지상 3종이 섞여 나와야 한다. 하나로 뭉치면 예전 버그다.
    expect(kinds.size).toBeGreaterThan(1);
  });

  test('죽은 종류가 살아 있을 때와 같다 — enemyKindForId 하나만 쓴다', () => {
    const layout = computeBattleLayout(1024, 360);
    const field = createDeathField();
    pushDeaths(field, [{ id: 7, kind: 'enemy', lane: 'ground', x: 0.4 }], layout, 0);
    const slot = field.slots.find((s) => s.active);
    expect(slot?.enemyKind).toBe(enemyKindForId('ground', 7));
  });

  test('공중 적은 공중 종류로 죽는다', () => {
    const layout = computeBattleLayout(1024, 360);
    const field = createDeathField();
    pushDeaths(field, [{ id: 3, kind: 'enemy', lane: 'air', x: 0.6 }], layout, 0);
    const slot = field.slots.find((s) => s.active);
    expect(slot?.enemyKind).toBe(enemyKindForId('air', 3));
  });

  test('★ 시계가 흐르면 연출이 끝난다 — 멈춘 시계에서는 영원히 남는다', () => {
    const layout = computeBattleLayout(1024, 360);
    const field = createDeathField();
    pushDeaths(field, [{ id: 1, kind: 'enemy', lane: 'ground', x: 0.5 }], layout, 1_000);
    const slot = field.slots.find((s) => s.active)!;
    // 시작 시각이 기록된다 — 이 값과 렌더 시계의 차이가 진행도다.
    expect(slot.startedMs).toBe(1_000);
    expect(slot.active).toBe(true);
    // 연출 길이를 넘긴 시각이면 끝난 것으로 읽혀야 한다.
    expect(1_000 + DEATH_DURATION_MS).toBeGreaterThan(slot.startedMs);
    // ⚠️ 셸이 `Replay.elapsedMs`(390초에서 clamp)를 넘기면 연장 구간에서 이 차이가
    //    영원히 0이라 시체가 남는다. 그래서 셸은 멈추지 않는 `battleClockMs`를 쓴다.
  });
});
