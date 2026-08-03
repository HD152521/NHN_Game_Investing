import { describe, expect, test } from 'vitest';

import { SOUND_SPECS } from './catalog';
import { MAX_CONCURRENT_VOICES, admitSound, createPlaybackState, pruneVoices } from './throttle';
import type { PlaybackState } from './throttle';
import type { SoundSpec } from './types';

/**
 * 연타 억제와 동시 재생 상한은 **순수 상태 기계**다. 시계를 읽지 않고 `nowMs`를 받으므로
 * "타워 8기가 초당 수십 회 쏘면 실제로 몇 번 울리는가"를 결정적으로 셀 수 있다.
 */

/** 테스트용 소리. 카탈로그 값이 바뀌어도 이 파일의 산술이 흔들리지 않게 직접 만든다. */
function spec(overrides: Partial<SoundSpec> = {}): SoundSpec {
  return {
    id: 'tower-fire',
    label: '테스트',
    channel: 'combat',
    minGapMs: 100,
    volume: 0.3,
    priority: 1,
    layers: [{ wave: 'sine', startHz: 440, endHz: 440, startMs: 0, durationMs: 50, gain: 0.5 }],
    ...overrides,
  };
}

/** 같은 소리를 `count`번, `stepMs` 간격으로 던져 실제로 통과한 횟수를 센다. */
function playRepeatedly(
  soundSpec: SoundSpec,
  count: number,
  stepMs: number,
): { played: number; state: PlaybackState } {
  let state = createPlaybackState();
  let played = 0;
  for (let index = 0; index < count; index += 1) {
    const result = admitSound(state, soundSpec, index * stepMs);
    state = result.state;
    if (result.admitted) played += 1;
  }
  return { played, state };
}

describe('★ 연타 억제 — 같은 이벤트 N회가 M회로 줄어든다 (M < N)', () => {
  test('최소 간격 안의 반복은 거부된다', () => {
    const state = createPlaybackState();
    const first = admitSound(state, spec({ minGapMs: 130 }), 0);
    expect(first.admitted).toBe(true);

    const tooSoon = admitSound(first.state, spec({ minGapMs: 130 }), 120);
    expect(tooSoon.admitted).toBe(false);
    expect(tooSoon.reason).toBe('throttled');
  });

  test('최소 간격이 지나면 다시 통과한다', () => {
    const first = admitSound(createPlaybackState(), spec({ minGapMs: 130 }), 0);
    const later = admitSound(first.state, spec({ minGapMs: 130 }), 130);
    expect(later.admitted).toBe(true);
  });

  test('★ 타워 8기가 매 프레임(60FPS) 쏴도 초당 8회 이하로 묶인다', () => {
    // 1초 동안 60프레임 × 8기 = 480회 요청. minGapMs=130이면 상한은 ⌈1000/130⌉ = 8회.
    const fire = SOUND_SPECS['tower-fire'];
    let state = createPlaybackState();
    let played = 0;
    for (let frameIndex = 0; frameIndex < 60; frameIndex += 1) {
      const nowMs = frameIndex * (1_000 / 60);
      for (let tower = 0; tower < 8; tower += 1) {
        const result = admitSound(state, fire, nowMs);
        state = result.state;
        if (result.admitted) played += 1;
      }
    }
    expect(played).toBeLessThan(480);
    expect(played).toBeLessThanOrEqual(8);
    // 완전히 죽어서도 안 된다 — 교전이 벌어지는 중이라는 사실은 들려야 한다.
    expect(played).toBeGreaterThanOrEqual(7);
  });

  test('★ 한 웨이브 14마리가 동시에 죽어도 처치음은 1회만 난다', () => {
    const down = SOUND_SPECS['enemy-down'];
    const { played } = playRepeatedly(down, 14, 0);
    expect(played).toBe(1);
  });

  test('억제 파라미터가 소리마다 독립이다 — 다른 소리는 서로를 막지 않는다', () => {
    let state = createPlaybackState();
    const fire = admitSound(state, SOUND_SPECS['tower-fire'], 0);
    state = fire.state;
    const hit = admitSound(state, SOUND_SPECS['base-hit'], 0);
    expect(fire.admitted).toBe(true);
    expect(hit.admitted).toBe(true);
  });
});

describe('★ 동시 재생 수 상한', () => {
  test(`활성 소리가 ${MAX_CONCURRENT_VOICES}개를 넘지 않는다`, () => {
    // 길이 1,000ms짜리 같은 등급 소리를 간격 없이 여러 번 던진다(억제는 minGapMs=0으로 끈다).
    const long = spec({
      minGapMs: 0,
      priority: 5,
      layers: [{ wave: 'sine', startHz: 220, endHz: 220, startMs: 0, durationMs: 1_000, gain: 0.4 }],
    });
    let state = createPlaybackState();
    let played = 0;
    for (let index = 0; index < 20; index += 1) {
      const result = admitSound(state, long, index); // 1ms 간격 — 전부 아직 살아 있다
      state = result.state;
      if (result.admitted) played += 1;
      expect(state.active.length).toBeLessThanOrEqual(MAX_CONCURRENT_VOICES);
    }
    expect(played).toBe(MAX_CONCURRENT_VOICES);
  });

  test('상한에 걸리면 voice-limit으로 거부된다', () => {
    const long = spec({
      minGapMs: 0,
      priority: 5,
      layers: [{ wave: 'sine', startHz: 220, endHz: 220, startMs: 0, durationMs: 1_000, gain: 0.4 }],
    });
    let state = createPlaybackState();
    for (let index = 0; index < MAX_CONCURRENT_VOICES; index += 1) {
      state = admitSound(state, long, index).state;
    }
    const overflow = admitSound(state, long, MAX_CONCURRENT_VOICES);
    expect(overflow.admitted).toBe(false);
    expect(overflow.reason).toBe('voice-limit');
  });

  test('★ 우선순위가 높으면 낮은 것을 밀어낸다 — 보스 등장이 타워 발사에 막히지 않는다', () => {
    const weak = spec({
      id: 'tower-fire',
      minGapMs: 0,
      priority: 1,
      layers: [{ wave: 'sine', startHz: 200, endHz: 200, startMs: 0, durationMs: 1_000, gain: 0.3 }],
    });
    let state = createPlaybackState();
    for (let index = 0; index < MAX_CONCURRENT_VOICES; index += 1) {
      state = admitSound(state, weak, index).state;
    }
    expect(state.active).toHaveLength(MAX_CONCURRENT_VOICES);

    const boss = admitSound(state, SOUND_SPECS['boss-appear'], 10);
    expect(boss.admitted).toBe(true);
    expect(boss.evicted).toHaveLength(1);
    expect(boss.state.active).toHaveLength(MAX_CONCURRENT_VOICES);
    expect(boss.state.active.some((voice) => voice.soundId === 'boss-appear')).toBe(true);
  });

  test('같은 등급끼리는 밀어내지 못한다 (>= 비교)', () => {
    const same = spec({
      minGapMs: 0,
      priority: 4,
      layers: [{ wave: 'sine', startHz: 200, endHz: 200, startMs: 0, durationMs: 1_000, gain: 0.3 }],
    });
    let state = createPlaybackState();
    for (let index = 0; index < MAX_CONCURRENT_VOICES; index += 1) {
      state = admitSound(state, same, index).state;
    }
    expect(admitSound(state, same, 10).admitted).toBe(false);
  });

  test('끝난 소리는 자리를 비운다', () => {
    const short = spec({
      minGapMs: 0,
      priority: 4,
      layers: [{ wave: 'sine', startHz: 200, endHz: 200, startMs: 0, durationMs: 50, gain: 0.3 }],
    });
    let state = createPlaybackState();
    for (let index = 0; index < MAX_CONCURRENT_VOICES; index += 1) {
      state = admitSound(state, short, 0).state;
    }
    expect(state.active).toHaveLength(MAX_CONCURRENT_VOICES);
    // 50ms 뒤에는 전부 끝났다.
    const after = admitSound(state, short, 100);
    expect(after.admitted).toBe(true);
    expect(after.state.active).toHaveLength(1);
  });
});

describe('pruneVoices', () => {
  test('걷어낼 것이 없으면 같은 배열 참조다 (프레임당 할당 0)', () => {
    const state = admitSound(createPlaybackState(), spec(), 0).state;
    expect(pruneVoices(state.active, 10)).toBe(state.active);
  });

  test('전부 끝났으면 빈 배열이다', () => {
    const state = admitSound(createPlaybackState(), spec(), 0).state;
    expect(pruneVoices(state.active, 10_000)).toHaveLength(0);
  });
});

describe('불변성', () => {
  test('입력 상태를 변형하지 않는다', () => {
    const before = createPlaybackState();
    const snapshot = JSON.stringify(before);
    admitSound(before, spec(), 0);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  test('voiceId는 단조 증가한다', () => {
    const first = admitSound(createPlaybackState(), spec({ minGapMs: 0 }), 0);
    const second = admitSound(first.state, spec({ minGapMs: 0 }), 1);
    expect(first.voiceId).not.toBeNull();
    expect(second.voiceId).not.toBeNull();
    expect(second.voiceId!).toBeGreaterThan(first.voiceId!);
  });
});
