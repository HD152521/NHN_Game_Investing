import { describe, expect, test } from 'vitest';

import { formatPrepCountdown } from './stage-dom';

describe('formatPrepCountdown — 준비 시간 카운트다운 문구', () => {
  test('남은 시간을 0.1초 단위로 보여준다', () => {
    expect(formatPrepCountdown(5_000)).toContain('5.0');
    expect(formatPrepCountdown(1_250)).toContain('1.3');
  });

  test('Space 안내를 같은 줄에 붙인다 (기다릴지 건너뛸지 한 번에 알게)', () => {
    expect(formatPrepCountdown(5_000)).toContain('Space');
  });

  test('준비가 끝났으면 빈 문자열이다 (= 오버레이를 숨긴다)', () => {
    expect(formatPrepCountdown(0)).toBe('');
    expect(formatPrepCountdown(-1)).toBe('');
  });
});
