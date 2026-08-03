/**
 * 믹서 — 판정층(`events`·`throttle`)과 재생층(`engine`)과 설정(`settings`)을 잇는 얇은 층.
 *
 * ★ 여기에 규칙을 새로 만들지 마라 ★ 이 파일이 하는 일은 셋뿐이다:
 *   ① 이벤트를 소리 ID로 바꾸고(= `soundForEvent` 호출)
 *   ② 울려도 되는지 물어보고(= `admitSound` 호출)
 *   ③ 통과한 것만 재생층에 넘긴다.
 * 주파수·간격·볼륨 판단이 여기 들어오면 단일 출처가 깨진다.
 *
 * ⚠️ **시계를 읽지 않는다.** `emit`은 `nowMs`를 받는다 — 셸의 프레임 루프가 이미 갖고
 * 있는 `performance.now()` 값을 그대로 넘기면 된다(§17-2 "시계는 주입한다").
 */

import { SOUND_SPECS } from './catalog';
import { createAudioEngine } from './engine';
import type { AudioEngine, AudioVoice } from './engine';
import { soundForEvent } from './events';
import {
  clampVolume,
  defaultAudioStorage,
  effectiveVolume,
  loadAudioSettings,
  saveAudioSettings,
} from './settings';
import type { AudioSettings, AudioStorage } from './settings';
import { admitSound, createPlaybackState } from './throttle';
import type { PlaybackState } from './throttle';
import type { GameEvent } from './types';

export interface GameAudioOptions {
  /** 재생층. 생략하면 브라우저 Web Audio. 테스트는 가짜를 끼운다. */
  readonly engine?: AudioEngine;
  /** 설정 저장소. `null`이면 저장하지 않는다(SSR·테스트). */
  readonly storage?: AudioStorage | null;
  /** 설정이 바뀔 때마다 불린다 — UI가 슬라이더·버튼을 되맞추는 용도다. */
  readonly onSettingsChange?: (settings: AudioSettings) => void;
}

export interface GameAudio {
  /** 현재 설정 (읽기 전용 스냅샷). */
  readonly settings: AudioSettings;
  /** 소리를 낼 수 있는 환경인가. UI가 컨트롤을 흐리게 표시하는 데 쓴다. */
  readonly available: boolean;
  /**
   * 이벤트 하나를 울린다.
   *
   * @returns 실제로 소리가 났는가. 음소거·연타 억제·동시 재생 상한·매핑 없음이면 `false`.
   */
  emit(event: GameEvent, nowMs: number): boolean;
  /** 이벤트 여러 개. `diffCombatEvents`의 결과를 그대로 넘기는 자리다. */
  emitAll(events: readonly GameEvent[], nowMs: number): void;
  setVolume(volume: number): void;
  setMuted(muted: boolean): void;
  /** @returns 바뀐 뒤의 음소거 상태. */
  toggleMuted(): boolean;
  /** 자동재생 정책 해제 — **사용자 제스처 핸들러 안에서** 불러라. */
  resume(): void;
  destroy(): void;
}

/**
 * 게임 오디오를 만든다. **앱 수명 동안 하나만 만든다** — `AudioContext`는 브라우저당
 * 개수 제한이 있고(대개 6개), 판마다 새로 만들면 몇 판 뒤에 소리가 통째로 사라진다.
 */
export function createGameAudio(options: GameAudioOptions = {}): GameAudio {
  const storage = options.storage === undefined ? defaultAudioStorage() : options.storage;
  const engine = options.engine ?? createAudioEngine();
  const notify = options.onSettingsChange;

  let settings: AudioSettings = loadAudioSettings(storage);
  let playback: PlaybackState = createPlaybackState();
  /** 재생 중인 소리의 손잡이. 동시 재생 상한에 밀려난 것을 끊는 데만 쓴다. */
  const voices = new Map<number, AudioVoice>();

  function commit(next: AudioSettings): void {
    settings = next;
    saveAudioSettings(next, storage);
    notify?.(next);
  }

  /**
   * 이미 끝난 손잡이를 버린다. **타이머를 걸지 않는다** — 시계를 읽지 않기 위해서다.
   * 억제 상태가 이미 "언제 끝나는가"를 알고 있으므로 그것을 진실로 삼는다.
   */
  function pruneHandles(): void {
    if (voices.size === 0) return;
    for (const id of [...voices.keys()]) {
      if (!playback.active.some((voice) => voice.voiceId === id)) {
        voices.delete(id);
      }
    }
  }

  function emit(event: GameEvent, nowMs: number): boolean {
    /*
     * ★ 음소거는 재생층에 닿기 전에 걸러진다 ★
     * "볼륨 0으로 재생"이 아니라 **재생 자체를 하지 않는다.** 오실레이터를 만들어 0을
     * 곱하면 음소거 상태에서도 CPU가 그대로 나가고, 무엇보다 "음소거인데 소리가 났는가"를
     * 테스트로 고정할 수 없다.
     *
     * 억제 상태(`playback`)도 건드리지 않는다 — 음소거 중에 흘려보낸 이벤트가 소리를 켠
     * 직후의 억제 창을 먹어 버리면 안 된다.
     */
    const master = effectiveVolume(settings);
    if (master <= 0) return false;

    const soundId = soundForEvent(event);
    if (soundId === null) return false;

    const spec = SOUND_SPECS[soundId];
    const verdict = admitSound(playback, spec, nowMs);
    playback = verdict.state;

    for (const voiceId of verdict.evicted) {
      voices.get(voiceId)?.stop();
      voices.delete(voiceId);
    }
    pruneHandles();

    if (!verdict.admitted) return false;

    const voice = engine.play(spec, master * spec.volume);
    if (voice && verdict.voiceId !== null) {
      voices.set(verdict.voiceId, voice);
    }
    return voice !== null;
  }

  return {
    get settings(): AudioSettings {
      return settings;
    },

    get available(): boolean {
      return engine.available;
    },

    emit,

    emitAll(events: readonly GameEvent[], nowMs: number): void {
      for (const event of events) {
        emit(event, nowMs);
      }
    },

    setVolume(volume: number): void {
      const next = clampVolume(volume);
      if (next === settings.volume) return;
      commit({ ...settings, volume: next });
    },

    setMuted(muted: boolean): void {
      if (muted === settings.muted) return;
      commit({ ...settings, muted });
    },

    toggleMuted(): boolean {
      commit({ ...settings, muted: !settings.muted });
      return settings.muted;
    },

    resume(): void {
      engine.resume();
    },

    destroy(): void {
      for (const voice of voices.values()) voice.stop();
      voices.clear();
      engine.destroy();
    },
  };
}
