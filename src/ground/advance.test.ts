import { describe, expect, test } from 'vitest';

import { classifyGroundState, isLateWave, maxEnemyAdvance } from './advance.js';
import { CRACK_ADVANCE_THRESHOLD, LATE_WAVE_PROGRESS } from './constants.js';
import type { AdvancingEnemy } from './types.js';

function enemy(x: number, hp = 10): AdvancingEnemy {
  return { x, hp };
}

describe('maxEnemyAdvance — 가장 전진한 적 기준', () => {
  test('적이 없으면 전진율 0', () => {
    expect(maxEnemyAdvance([])).toBe(0);
  });

  test('x=1(적 본진)이면 전진율 0, x=0(아군 사옥)이면 1', () => {
    expect(maxEnemyAdvance([enemy(1)])).toBe(0);
    expect(maxEnemyAdvance([enemy(0)])).toBe(1);
  });

  test('가장 전진한(=x가 가장 작은) 적 하나가 전진율을 결정한다', () => {
    // 평균이었다면 (0.1+0.9+0.9)/3 → 0.37 전진에 그쳐 위협이 가려진다.
    expect(maxEnemyAdvance([enemy(0.9), enemy(0.1), enemy(0.9)])).toBeCloseTo(0.9);
  });

  test('죽은 적(hp<=0)은 세지 않는다', () => {
    expect(maxEnemyAdvance([enemy(0.1, 0), enemy(0.8)])).toBeCloseTo(0.2);
  });

  test('범위를 벗어난 x는 0~1로 잘린다', () => {
    expect(maxEnemyAdvance([enemy(-3)])).toBe(1);
    expect(maxEnemyAdvance([enemy(5)])).toBe(0);
  });
});

describe('isLateWave — 후반 웨이브 판정', () => {
  test('진행도가 임계 미만이면 후반이 아니다', () => {
    expect(isLateWave(1, 10)).toBe(false);
  });

  test('진행도가 임계 이상이면 후반이다', () => {
    const lateWave = Math.ceil(10 * LATE_WAVE_PROGRESS);
    expect(isLateWave(lateWave, 10)).toBe(true);
    expect(isLateWave(lateWave - 1, 10)).toBe(false);
  });

  test('웨이브 수가 0이면(비정상 입력) 후반이 아니다', () => {
    expect(isLateWave(3, 0)).toBe(false);
  });
});

describe('classifyGroundState — 발판 3단계', () => {
  test('웨이브 시작(전진 0)은 정상이다', () => {
    expect(classifyGroundState({ maxAdvance: 0, wave: 1, waveCount: 10 })).toBe('intact');
  });

  test('임계 직전까지는 정상이다 (경계값)', () => {
    const justBelow = CRACK_ADVANCE_THRESHOLD - 0.001;
    expect(classifyGroundState({ maxAdvance: justBelow, wave: 1, waveCount: 10 })).toBe('intact');
  });

  test('전진율이 임계와 정확히 같으면 균열이다 (경계값 · 이상 포함)', () => {
    expect(classifyGroundState({ maxAdvance: CRACK_ADVANCE_THRESHOLD, wave: 1, waveCount: 10 })).toBe(
      'cracked',
    );
  });

  test('후반 웨이브에서 임계를 넘으면 함몰이다', () => {
    const lateWave = Math.ceil(10 * LATE_WAVE_PROGRESS);
    expect(classifyGroundState({ maxAdvance: 0.9, wave: lateWave, waveCount: 10 })).toBe('collapsed');
  });

  test('후반 웨이브라도 전진 전이면 정상이다 (정상 = 웨이브 시작 상태)', () => {
    const lateWave = Math.ceil(10 * LATE_WAVE_PROGRESS);
    expect(classifyGroundState({ maxAdvance: 0, wave: lateWave, waveCount: 10 })).toBe('intact');
  });

  test('초반 웨이브에서는 아무리 밀려도 함몰까지 가지 않는다', () => {
    expect(classifyGroundState({ maxAdvance: 1, wave: 1, waveCount: 10 })).toBe('cracked');
  });
});
