import { describe, expect, test } from 'vitest';

import { ANCHOR_JITTER_PX, skillAnchor } from './anchor';
import { SKILL_EFFECT_IDS } from './types';

const WIDTH = 1024;
const HEIGHT = 360;

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

describe('스킬 이펙트 배치 — 가산 합성 포화 방지', () => {
  test('스킬 3종은 서로 다른 자리에서 터진다', () => {
    const anchors = SKILL_EFFECT_IDS.map((id) => skillAnchor(id, WIDTH, HEIGHT, 0));

    for (let i = 0; i < anchors.length; i += 1) {
      for (let j = i + 1; j < anchors.length; j += 1) {
        expect(distance(anchors[i]!, anchors[j]!)).toBeGreaterThan(ANCHOR_JITTER_PX);
      }
    }
  });

  test('같은 스킬을 연달아 쓰면 자리가 밀린다 — 3연타가 한 점에 겹치지 않는다', () => {
    const first = skillAnchor('S-01', WIDTH, HEIGHT, 0);
    const second = skillAnchor('S-01', WIDTH, HEIGHT, 1);
    const third = skillAnchor('S-01', WIDTH, HEIGHT, 2);

    expect(distance(first, second)).toBeGreaterThan(0);
    expect(distance(second, third)).toBeGreaterThan(0);
    expect(distance(first, third)).toBeGreaterThan(0);
  });

  test('오프셋은 3회 주기로 돈다 (같은 자리 재사용까지 최소 두 번의 쿨다운이 낀다)', () => {
    expect(skillAnchor('S-02', WIDTH, HEIGHT, 3)).toEqual(skillAnchor('S-02', WIDTH, HEIGHT, 0));
    expect(skillAnchor('S-02', WIDTH, HEIGHT, 4)).toEqual(skillAnchor('S-02', WIDTH, HEIGHT, 1));
  });

  test('밀림 폭이 지터 상수를 넘지 않는다 (화면 밖으로 새지 않는다)', () => {
    const base = skillAnchor('S-03', WIDTH, HEIGHT, 0);
    for (let i = 1; i < 6; i += 1) {
      expect(distance(base, skillAnchor('S-03', WIDTH, HEIGHT, i))).toBeLessThanOrEqual(
        ANCHOR_JITTER_PX * 2,
      );
    }
  });

  test('S-03 실드는 기지(좌측)에, S-01 폭탄은 전장 중앙에 온다 (시트 §08)', () => {
    const shield = skillAnchor('S-03', WIDTH, HEIGHT, 0);
    const blast = skillAnchor('S-01', WIDTH, HEIGHT, 0);

    expect(shield.x).toBeLessThan(WIDTH * 0.25);
    expect(blast.x).toBeGreaterThan(WIDTH * 0.4);
  });

  test('음수 castIndex도 유효한 슬롯으로 접힌다', () => {
    const anchor = skillAnchor('S-01', WIDTH, HEIGHT, -1);
    expect(Number.isFinite(anchor.x)).toBe(true);
    expect(Number.isFinite(anchor.y)).toBe(true);
  });
});
