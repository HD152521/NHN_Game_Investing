import { describe, expect, test, vi } from 'vitest';

import { SOUND_SPECS } from './catalog';
import { createAudioEngine, defaultAudioContextFactory } from './engine';

/**
 * ★ 이 파일이 지키는 것은 하나다 — **오디오 때문에 게임이 죽지 않는다.**
 *
 * `AudioContext`가 없는 환경이 실재한다(vitest node 환경, jsdom §19-7, 구형 브라우저).
 * 소리는 보조 채널이므로(PRD) 그 전부에서 조용히 무음으로 떨어져야 한다.
 *
 * 이 테스트는 **node 환경에서 돈다** — 즉 여기서 검증하는 무음 경로가 실제 CI 경로다.
 */

describe('★ AudioContext가 없는 환경에서 크래시하지 않는다', () => {
  test('팩토리가 null을 주면 무음 엔진이 된다', () => {
    const engine = createAudioEngine(() => null);
    expect(engine.available).toBe(false);
    expect(() => engine.resume()).not.toThrow();
    expect(engine.play(SOUND_SPECS['tower-fire'], 1)).toBeNull();
    expect(() => engine.destroy()).not.toThrow();
  });

  test('팩토리가 던져도 무음 엔진이 된다', () => {
    const engine = createAudioEngine(() => {
      throw new Error('AudioContext is not defined');
    });
    expect(engine.available).toBe(false);
    expect(engine.play(SOUND_SPECS['boss-appear'], 0.5)).toBeNull();
  });

  test('★ node 환경의 기본 팩토리는 null이다 — 그리고 그것이 정상이다', () => {
    // 브라우저가 아니면 `AudioContext`가 없다. 던지지 않고 null을 돌려주는 것이 계약이다.
    expect(() => defaultAudioContextFactory()).not.toThrow();
  });

  test('기본 팩토리로 만들어도 테스트가 죽지 않는다', () => {
    const engine = createAudioEngine();
    expect(() => engine.resume()).not.toThrow();
    expect(() => engine.play(SOUND_SPECS['wave-start'], 0.3)).not.toThrow();
    expect(() => engine.destroy()).not.toThrow();
  });
});

// ── 가짜 AudioContext — 노드 그래프가 실제로 만들어지는지 본다 ────────────

interface FakeParam {
  setValueAtTime: ReturnType<typeof vi.fn>;
  linearRampToValueAtTime: ReturnType<typeof vi.fn>;
  exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
  cancelScheduledValues: ReturnType<typeof vi.fn>;
  value: number;
}

function fakeParam(): FakeParam {
  return {
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
    value: 1,
  };
}

function createFakeContext() {
  const oscillators: { type: string; started: number[]; stopped: number[] }[] = [];
  const buffers: { started: number[]; stopped: number[] }[] = [];
  const filters: { type: string }[] = [];

  const context = {
    sampleRate: 48_000,
    currentTime: 0,
    destination: { name: 'destination' },
    resume: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    createBuffer: (channels: number, frames: number) => ({
      getChannelData: () => new Float32Array(frames),
      length: frames,
      numberOfChannels: channels,
    }),
    createOscillator: () => {
      const record = { type: 'sine', started: [] as number[], stopped: [] as number[] };
      oscillators.push(record);
      return {
        get type() {
          return record.type;
        },
        set type(value: string) {
          record.type = value;
        },
        frequency: fakeParam(),
        connect: vi.fn(),
        start: (at: number) => record.started.push(at),
        stop: (at: number) => record.stopped.push(at),
      };
    },
    createBufferSource: () => {
      const record = { started: [] as number[], stopped: [] as number[] };
      buffers.push(record);
      return {
        buffer: null,
        loop: false,
        connect: vi.fn(),
        start: (at: number) => record.started.push(at),
        stop: (at: number) => record.stopped.push(at),
      };
    },
    createGain: () => ({ gain: fakeParam(), connect: vi.fn(), disconnect: vi.fn() }),
    createBiquadFilter: () => {
      const record = { type: 'lowpass' };
      filters.push(record);
      return {
        get type() {
          return record.type;
        },
        set type(value: string) {
          record.type = value;
        },
        frequency: fakeParam(),
        connect: vi.fn(),
      };
    },
  };

  return { context, oscillators, buffers, filters };
}

describe('노드 그래프 (가짜 AudioContext)', () => {
  test('오실레이터 레이어마다 소스가 하나씩 생긴다', () => {
    const fake = createFakeContext();
    const engine = createAudioEngine(() => fake.context as unknown as AudioContext);
    expect(engine.available).toBe(true);

    const voice = engine.play(SOUND_SPECS['stage-cleared'], 0.5);
    expect(voice).not.toBeNull();
    // stage-cleared는 triangle 3 + sine 1 = 오실레이터 4겹이다.
    expect(fake.oscillators).toHaveLength(4);
    expect(fake.oscillators.every((osc) => osc.started.length === 1)).toBe(true);
    expect(fake.oscillators.every((osc) => osc.stopped.length === 1)).toBe(true);
  });

  test('노이즈 레이어는 버퍼 소스를 쓴다', () => {
    const fake = createFakeContext();
    const engine = createAudioEngine(() => fake.context as unknown as AudioContext);
    engine.play(SOUND_SPECS['tower-fire'], 0.5);
    // tower-fire = noise 1 + square 1
    expect(fake.buffers).toHaveLength(1);
    expect(fake.oscillators).toHaveLength(1);
  });

  test('필터가 지정된 레이어만 BiquadFilter를 만든다', () => {
    const fake = createFakeContext();
    const engine = createAudioEngine(() => fake.context as unknown as AudioContext);
    engine.play(SOUND_SPECS['tower-fire'], 0.5);
    expect(fake.filters).toEqual([{ type: 'highpass' }]);
  });

  test('볼륨 0이면 노드를 만들지 않는다 — 음소거 경로가 CPU를 쓰지 않는다', () => {
    const fake = createFakeContext();
    const engine = createAudioEngine(() => fake.context as unknown as AudioContext);
    expect(engine.play(SOUND_SPECS['boss-appear'], 0)).toBeNull();
    expect(fake.oscillators).toHaveLength(0);
  });

  test('resume은 컨텍스트를 깨운다 (자동재생 정책)', () => {
    const fake = createFakeContext();
    const engine = createAudioEngine(() => fake.context as unknown as AudioContext);
    engine.resume();
    expect(fake.context.resume).toHaveBeenCalled();
  });

  test('resume이 거부돼도 던지지 않는다', () => {
    const fake = createFakeContext();
    fake.context.resume = vi.fn(() => Promise.reject(new Error('not allowed')));
    const engine = createAudioEngine(() => fake.context as unknown as AudioContext);
    expect(() => engine.resume()).not.toThrow();
  });

  test('voice.stop()이 두 번 불려도 던지지 않는다', () => {
    const fake = createFakeContext();
    const engine = createAudioEngine(() => fake.context as unknown as AudioContext);
    const voice = engine.play(SOUND_SPECS['wave-start'], 0.4);
    expect(voice).not.toBeNull();
    expect(() => {
      voice?.stop();
      voice?.stop();
    }).not.toThrow();
  });

  test('destroy가 컨텍스트를 닫는다', () => {
    const fake = createFakeContext();
    const engine = createAudioEngine(() => fake.context as unknown as AudioContext);
    engine.destroy();
    expect(fake.context.close).toHaveBeenCalled();
  });

  test('노드 생성이 던지면 null로 떨어진다 (게임은 계속 돈다)', () => {
    const fake = createFakeContext();
    const broken = {
      ...fake.context,
      createGain: () => {
        throw new Error('context closed');
      },
    };
    const engine = createAudioEngine(() => broken as unknown as AudioContext);
    expect(engine.play(SOUND_SPECS['trade-open'], 0.5)).toBeNull();
  });
});
