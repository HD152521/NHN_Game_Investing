import { describe, expect, test } from 'vitest';

import { MAX_CONCURRENT_VOICES } from './throttle';
import { createGameAudio } from './mixer';
import { AUDIO_STORAGE_KEY, DEFAULT_VOLUME, loadAudioSettings } from './settings';
import type { AudioStorage } from './settings';
import type { AudioEngine, AudioVoice } from './engine';
import type { GameEvent, SoundSpec } from './types';

/**
 * 믹서 통합 — **가짜 재생층**으로 "실제로 소리가 났는가"를 셀 수 있다.
 *
 * 여기서 검증하는 것: 음소거가 재생층에 닿기 전에 걸린다 · 억제가 실제로 재생 횟수를
 * 줄인다 · 동시 재생 상한이 지켜진다 · 설정이 저장·복원된다.
 */

interface Played {
  readonly id: string;
  readonly gain: number;
}

function fakeEngine(available = true): AudioEngine & {
  readonly played: Played[];
  readonly stopped: string[];
  resumeCount: number;
} {
  const played: Played[] = [];
  const stopped: string[] = [];
  const engine = {
    available,
    resumeCount: 0,
    played,
    stopped,
    resume(): void {
      engine.resumeCount += 1;
    },
    play(spec: SoundSpec, gain: number): AudioVoice | null {
      if (!available) return null;
      played.push({ id: spec.id, gain });
      return {
        stop(): void {
          stopped.push(spec.id);
        },
      };
    },
    destroy(): void {
      /* no-op */
    },
  };
  return engine;
}

function memoryStorage(seed: Record<string, string> = {}): AudioStorage & {
  readonly data: Record<string, string>;
} {
  const data: Record<string, string> = { ...seed };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

describe('★ 음소거 상태에서 재생 호출이 실제로 소리를 내지 않는다', () => {
  test('음소거면 재생층이 한 번도 불리지 않는다', () => {
    const engine = fakeEngine();
    const audio = createGameAudio({ engine, storage: memoryStorage() });
    audio.setMuted(true);

    for (let index = 0; index < 20; index += 1) {
      expect(audio.emit({ kind: 'trade-open' }, index * 1_000)).toBe(false);
    }
    expect(engine.played).toHaveLength(0);
  });

  test('볼륨 0도 같다 — 0으로 곱해 재생하지 않는다', () => {
    const engine = fakeEngine();
    const audio = createGameAudio({ engine, storage: memoryStorage() });
    audio.setVolume(0);
    expect(audio.emit({ kind: 'boss-appear' }, 0)).toBe(false);
    expect(engine.played).toHaveLength(0);
  });

  test('★ 음소거 중에 흘려보낸 이벤트가 억제 창을 먹지 않는다', () => {
    const engine = fakeEngine();
    const audio = createGameAudio({ engine, storage: memoryStorage() });
    audio.setMuted(true);
    audio.emit({ kind: 'boss-appear' }, 0);
    audio.setMuted(false);
    // 방금 음소거로 흘려보낸 것 때문에 소리를 켠 직후가 막히면 안 된다.
    expect(audio.emit({ kind: 'boss-appear' }, 1)).toBe(true);
  });

  test('음소거를 풀면 원래 볼륨으로 돌아온다', () => {
    const engine = fakeEngine();
    const audio = createGameAudio({ engine, storage: memoryStorage() });
    audio.setVolume(0.8);
    audio.setMuted(true);
    audio.setMuted(false);
    audio.emit({ kind: 'wave-start', wave: 1 }, 0);
    expect(engine.played[0]?.gain).toBeCloseTo(0.8 * 0.32, 5);
  });
});

describe('★ 연타 억제가 실제 재생 횟수를 줄인다', () => {
  test('타워 발사 100회 요청 → 1회 재생 (같은 시각)', () => {
    const engine = fakeEngine();
    const audio = createGameAudio({ engine, storage: memoryStorage() });
    for (let index = 0; index < 100; index += 1) {
      audio.emit({ kind: 'tower-fire' }, 0);
    }
    expect(engine.played).toHaveLength(1);
  });

  test('★ 60프레임 × 8기 = 480회 요청이 8회 이하로 재생된다', () => {
    const engine = fakeEngine();
    const audio = createGameAudio({ engine, storage: memoryStorage() });
    for (let frameIndex = 0; frameIndex < 60; frameIndex += 1) {
      const events: GameEvent[] = Array.from({ length: 8 }, () => ({ kind: 'tower-fire' }));
      audio.emitAll(events, frameIndex * (1_000 / 60));
    }
    expect(engine.played.length).toBeLessThanOrEqual(8);
    expect(engine.played.length).toBeGreaterThan(0);
  });

  test('한 웨이브 14마리 동시 사망 → 처치음 1회', () => {
    const engine = fakeEngine();
    const audio = createGameAudio({ engine, storage: memoryStorage() });
    const deaths: GameEvent[] = Array.from({ length: 14 }, () => ({
      kind: 'enemy-down',
      boss: false,
    }));
    audio.emitAll(deaths, 500);
    expect(engine.played).toHaveLength(1);
  });
});

describe('★ 동시 재생 수 상한', () => {
  test('긴 소리를 몰아쳐도 재생층 호출이 상한을 넘지 않는다', () => {
    const engine = fakeEngine();
    const audio = createGameAudio({ engine, storage: memoryStorage() });
    // 서로 다른 긴 소리를 같은 순간에 몰아친다 (억제는 소리별이라 걸리지 않는다).
    const burst: GameEvent[] = [
      { kind: 'boss-appear' },
      { kind: 'stage-end', outcome: 'cleared' },
      { kind: 'enemy-down', boss: true },
      { kind: 'skill-cast', skill: 'S-03' },
      { kind: 'trade-close', pnl: -80, reason: 'liquidated' },
      { kind: 'skill-cast', skill: 'S-01' },
      { kind: 'wave-start', wave: 13 },
      { kind: 'base-hit', damage: 9 },
      { kind: 'tower-build' },
    ];
    audio.emitAll(burst, 0);
    expect(engine.played.length).toBeLessThanOrEqual(MAX_CONCURRENT_VOICES);
  });

  test('★ 밀려난 소리는 재생층에서 실제로 정지된다 — 가장 약한 것부터', () => {
    const engine = fakeEngine();
    const audio = createGameAudio({ engine, storage: memoryStorage() });
    // 서로 다른 낮은 우선순위 소리로 자리를 채운다(같은 소리를 반복하면 억제에 먼저 걸린다).
    const weak: GameEvent[] = [
      { kind: 'tower-fire' }, // priority 1 — 가장 먼저 밀려나야 한다
      { kind: 'prep-tick' }, // 2
      { kind: 'enemy-down', boss: false }, // 2
      { kind: 'unit-summon' }, // 3
      { kind: 'trade-add' }, // 3
      { kind: 'trade-open' }, // 4
    ];
    audio.emitAll(weak, 0);
    expect(engine.played).toHaveLength(MAX_CONCURRENT_VOICES);
    expect(engine.stopped).toHaveLength(0);

    // 보스 등장(priority 9)은 자리가 없어도 반드시 들려야 한다.
    expect(audio.emit({ kind: 'boss-appear' }, 0)).toBe(true);
    expect(engine.stopped).toEqual(['tower-fire']);
  });
});

describe('볼륨·음소거가 localStorage에 저장·복원된다', () => {
  test('설정을 바꾸면 즉시 저장된다', () => {
    const storage = memoryStorage();
    const audio = createGameAudio({ engine: fakeEngine(), storage });
    audio.setVolume(0.2);
    audio.setMuted(true);

    expect(storage.data[AUDIO_STORAGE_KEY]).toBeDefined();
    expect(loadAudioSettings(storage)).toEqual({ volume: 0.2, muted: true });
  });

  test('★ 새 인스턴스가 저장된 설정을 그대로 복원한다', () => {
    const storage = memoryStorage();
    const first = createGameAudio({ engine: fakeEngine(), storage });
    first.setVolume(0.15);
    first.setMuted(true);

    const second = createGameAudio({ engine: fakeEngine(), storage });
    expect(second.settings).toEqual({ volume: 0.15, muted: true });
  });

  test('저장소가 없어도 동작한다 (설정만 휘발된다)', () => {
    const engine = fakeEngine();
    const audio = createGameAudio({ engine, storage: null });
    audio.setVolume(0.3);
    expect(audio.settings.volume).toBe(0.3);
    expect(audio.emit({ kind: 'trade-open' }, 0)).toBe(true);
  });

  test('기본값은 음소거가 아니다', () => {
    const audio = createGameAudio({ engine: fakeEngine(), storage: memoryStorage() });
    expect(audio.settings).toEqual({ volume: DEFAULT_VOLUME, muted: false });
  });

  test('toggleMuted가 바뀐 상태를 돌려준다', () => {
    const audio = createGameAudio({ engine: fakeEngine(), storage: memoryStorage() });
    expect(audio.toggleMuted()).toBe(true);
    expect(audio.toggleMuted()).toBe(false);
  });

  test('설정 변경 콜백이 UI를 되맞추라고 알린다', () => {
    const seen: number[] = [];
    const audio = createGameAudio({
      engine: fakeEngine(),
      storage: memoryStorage(),
      onSettingsChange: (settings) => seen.push(settings.volume),
    });
    audio.setVolume(0.7);
    audio.setVolume(0.7); // 같은 값 — 알리지 않는다
    audio.setVolume(0.1);
    expect(seen).toEqual([0.7, 0.1]);
  });
});

describe('★ 소리를 못 내는 환경에서도 게임이 굴러간다', () => {
  test('재생층이 없어도 emit이 던지지 않는다', () => {
    const engine = fakeEngine(false);
    const audio = createGameAudio({ engine, storage: memoryStorage() });
    expect(audio.available).toBe(false);
    expect(() => audio.emit({ kind: 'stage-end', outcome: 'cleared' }, 0)).not.toThrow();
    expect(audio.emit({ kind: 'stage-end', outcome: 'cleared' }, 1_000)).toBe(false);
  });

  test('기본 옵션(브라우저 API 없음)으로 만들어도 죽지 않는다', () => {
    // node 환경 — AudioContext도 localStorage도 없다. 실제 CI가 타는 경로다.
    const audio = createGameAudio();
    expect(() => {
      audio.resume();
      audio.emit({ kind: 'tower-fire' }, 0);
      audio.setVolume(0.5);
      audio.toggleMuted();
      audio.destroy();
    }).not.toThrow();
  });

  test('resume이 재생층으로 전달된다 (자동재생 정책)', () => {
    const engine = fakeEngine();
    const audio = createGameAudio({ engine, storage: memoryStorage() });
    audio.resume();
    expect(engine.resumeCount).toBe(1);
  });
});

describe('볼륨이 실제 출력에 곱해진다', () => {
  test('마스터 볼륨 × 소리별 볼륨', () => {
    const engine = fakeEngine();
    const audio = createGameAudio({ engine, storage: memoryStorage() });
    audio.setVolume(0.5);
    audio.emit({ kind: 'base-hit', damage: 9 }, 0);
    // base-hit의 상대 볼륨은 0.4다.
    expect(engine.played[0]?.gain).toBeCloseTo(0.5 * 0.4, 5);
  });

  test('매핑이 없는 이벤트는 재생하지 않는다', () => {
    const engine = fakeEngine();
    const audio = createGameAudio({ engine, storage: memoryStorage() });
    expect(audio.emit({ kind: 'base-hit', damage: 0 }, 0)).toBe(false);
    expect(engine.played).toHaveLength(0);
  });
});
