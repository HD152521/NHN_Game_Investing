import { describe, expect, test } from 'vitest';

import { advanceWaveClock, battleDurationMs, createWaveClock, skipPrep } from './wave-clock';
import type { WaveClockParams } from './wave-clock';

const PARAMS: WaveClockParams = { waveCount: 3, waveDurationMs: 30_000, prepMs: 5_000 };

/** 시계를 `totalMs`만큼, 서브스텝 크기로 잘게 나눠 굴린다(시뮬레이터의 호출 패턴 재현). */
function run(totalMs: number, stepMs = 250, params: WaveClockParams = PARAMS) {
  let clock = createWaveClock(params);
  const started: number[] = [];
  for (let elapsed = 0; elapsed < totalMs; elapsed += stepMs) {
    const advance = advanceWaveClock(clock, stepMs, params);
    clock = advance.clock;
    started.push(...advance.wavesStarted);
  }
  return { clock, started };
}

describe('createWaveClock — 스테이지는 준비 구간부터 시작한다', () => {
  test('초기 시계는 준비 모드이고 웨이브는 아직 0이다', () => {
    const clock = createWaveClock(PARAMS);

    expect(clock.mode).toBe('prep');
    expect(clock.wave).toBe(0);
    expect(clock.prepRemainingMs).toBe(PARAMS.prepMs);
  });
});

describe('battleDurationMs — 준비 시간은 주기에 더해지지 않고 주기에서 빠진다', () => {
  test('교전 구간 = 주기 − 준비', () => {
    expect(battleDurationMs(PARAMS)).toBe(25_000);
  });

  test('준비가 주기보다 길어도 음수가 되지 않는다', () => {
    expect(battleDurationMs({ ...PARAMS, prepMs: 40_000 })).toBe(0);
  });
});

describe('advanceWaveClock — 준비 → 교전 전이', () => {
  test('준비 시간이 남아 있는 동안에는 웨이브가 시작되지 않는다', () => {
    const { clock, started } = run(4_000);

    expect(clock.mode).toBe('prep');
    expect(clock.wave).toBe(0);
    expect(started).toEqual([]);
    expect(clock.prepRemainingMs).toBe(1_000);
  });

  test('준비 시간이 끝나면 웨이브 1이 자동으로 시작된다', () => {
    const { clock, started } = run(5_250);

    expect(started).toEqual([1]);
    expect(clock.mode).toBe('battle');
    expect(clock.wave).toBe(1);
    expect(clock.prepRemainingMs).toBe(0);
  });

  test('웨이브 1 교전이 끝나면 다시 준비 구간에 들어간다', () => {
    // 준비 5초 + 교전 25초 = 30초. 30.25초 시점은 웨이브 2의 준비 구간이다.
    const { clock } = run(30_250);

    expect(clock.mode).toBe('prep');
    expect(clock.wave).toBe(1);
    expect(clock.prepRemainingMs).toBeGreaterThan(0);
  });

  test('웨이브 주기는 준비+교전 = 30초로, 준비가 붙어도 총 길이가 늘어나지 않는다', () => {
    // 3웨이브 × 30초 = 90초. 그 안에 웨이브 1·2·3이 모두 시작되어야 한다.
    const { clock, started } = run(90_000);

    expect(started).toEqual([1, 2, 3]);
    expect(clock.wave).toBe(3);
  });

  test('마지막 웨이브 이후에는 더 전이하지 않고 교전 경과만 쌓인다', () => {
    const { clock, started } = run(120_000);

    expect(started).toEqual([1, 2, 3]);
    expect(clock.mode).toBe('battle');
    expect(clock.wave).toBe(3);
    expect(clock.waveElapsedMs).toBeGreaterThan(battleDurationMs(PARAMS));
  });

  test('서브스텝 크기를 바꿔도 같은 시각에 같은 웨이브가 시작된다(결정론)', () => {
    const fine = run(60_000, 100);
    const coarse = run(60_000, 250);

    expect(fine.started).toEqual(coarse.started);
    expect(fine.clock.wave).toBe(coarse.clock.wave);
    expect(fine.clock.mode).toBe(coarse.clock.mode);
  });
});

describe('skipPrep — Space로 준비 즉시 종료', () => {
  test('준비 중에 건너뛰면 남은 준비 시간이 0이 된다', () => {
    const clock = skipPrep(createWaveClock(PARAMS));

    expect(clock.prepRemainingMs).toBe(0);
    expect(clock.mode).toBe('prep'); // 웨이브 시작 자체는 다음 advance가 처리한다
  });

  test('건너뛴 직후 한 틱만 진행해도 웨이브 1이 시작된다', () => {
    const skipped = skipPrep(createWaveClock(PARAMS));
    const advance = advanceWaveClock(skipped, 16, PARAMS);

    expect(advance.wavesStarted).toEqual([1]);
    expect(advance.clock.mode).toBe('battle');
    expect(advance.clock.wave).toBe(1);
  });

  test('교전 중에 건너뛰기를 눌러도 아무 것도 바뀌지 않는다', () => {
    const battle = advanceWaveClock(createWaveClock(PARAMS), 6_000, PARAMS).clock;
    expect(battle.mode).toBe('battle');

    expect(skipPrep(battle)).toEqual(battle);
  });
});

describe('advanceWaveClock — 퇴화 입력 방어', () => {
  test('주기가 0이어도 무한 루프에 빠지지 않는다', () => {
    const degenerate: WaveClockParams = { waveCount: 3, waveDurationMs: 0, prepMs: 0 };
    expect(() => advanceWaveClock(createWaveClock(degenerate), 1_000, degenerate)).not.toThrow();
  });

  test('dt가 0이거나 음수면 시계가 그대로다', () => {
    const clock = createWaveClock(PARAMS);
    expect(advanceWaveClock(clock, 0, PARAMS).clock).toEqual(clock);
    expect(advanceWaveClock(clock, -100, PARAMS).clock).toEqual(clock);
  });
});
