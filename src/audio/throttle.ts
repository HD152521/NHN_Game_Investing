/**
 * 연타 억제 · 동시 재생 상한 — **순수 상태 기계.** `AudioContext`를 모른다.
 *
 * ★ 왜 이것이 반드시 필요한가 ★
 * 타워 6기가 각자 600~1,000ms 쿨다운으로 쏘면 **초당 10회 이상**이다. 여기에 한 웨이브
 * 14마리의 처치음과 본진 피격이 겹친다. 억제 없이 전부 내보내면:
 *   ① 소리가 벽처럼 뭉쳐 개별 사건을 구분할 수 없고,
 *   ② 오실레이터 수십 개가 동시에 살아 있어 저사양 기기에서 프레임이 떨어지고,
 *   ③ 진폭이 합산되어 클리핑(찢어지는 소리)이 난다.
 *
 * 그래서 장치가 둘이다:
 *   · **소리별 최소 간격**(`SoundSpec.minGapMs`) — 같은 소리의 반복을 묶는다.
 *   · **동시 재생 상한**(`MAX_CONCURRENT_VOICES`) — 서로 다른 소리의 총량을 묶는다.
 *     상한에 걸리면 `priority`가 낮은 것이 밀려난다. 타워 발사(1)가 보스 등장(9)을
 *     밀어내는 일은 구조적으로 일어나지 않는다.
 */

import { soundDurationMs } from './catalog';
import type { GameSoundId, SoundSpec } from './types';

/**
 * 동시에 살아 있을 수 있는 소리의 수.
 *
 * ★ 6인 이유 ★ 이 게임이 한 순간에 내야 하는 **의미 있는** 소리의 최대 조합이 대략
 * 이 크기다: 웨이브 시작 + 본진 피격 + 처치 + 발사 + 스킬 + 매매 청산. 그 이상은
 * 사람이 분간하지 못하고 진폭만 올라간다. 8 이상으로 올리면 다시 뭉치기 시작한다.
 */
export const MAX_CONCURRENT_VOICES = 6;

/** 지금 울리고 있는 소리 하나. */
export interface ActiveVoice {
  /** 재생층이 이 소리를 되찾는 손잡이. 단조 증가한다. */
  readonly voiceId: number;
  readonly soundId: GameSoundId;
  /** 이 시각(ms)이 지나면 스스로 끝난다. */
  readonly endsAtMs: number;
  readonly priority: number;
}

/**
 * 억제 상태. **불변이다** — 모든 갱신이 새 객체를 돌려준다(§17-2).
 *
 * `lastPlayedAtMs`를 `Map`이 아니라 레코드로 두는 이유는 스냅샷 비교(`toEqual`)가
 * 테스트에서 그대로 되기 때문이다.
 */
export interface PlaybackState {
  readonly lastPlayedAtMs: Readonly<Partial<Record<GameSoundId, number>>>;
  readonly active: readonly ActiveVoice[];
  /** 다음에 발급할 `voiceId`. */
  readonly nextVoiceId: number;
}

/** 거부 사유. `ok`만 실제로 소리가 난다. */
export type AdmitReason = 'ok' | 'throttled' | 'voice-limit' | 'silent';

export interface AdmitResult {
  readonly state: PlaybackState;
  readonly admitted: boolean;
  readonly reason: AdmitReason;
  /** 통과했을 때 발급된 손잡이. 거부면 `null`. */
  readonly voiceId: number | null;
  /** 자리를 비우려고 끊어야 하는 소리들. 재생층이 실제로 정지시킨다. */
  readonly evicted: readonly number[];
}

const NO_EVICTED: readonly number[] = [];
const NO_ACTIVE: readonly ActiveVoice[] = [];

export function createPlaybackState(): PlaybackState {
  return { lastPlayedAtMs: {}, active: NO_ACTIVE, nextVoiceId: 1 };
}

/**
 * 이미 끝난 소리를 걷어낸다. **걷어낼 것이 없으면 같은 배열 참조를 돌려준다.**
 *
 * 프레임마다 불리므로 할당이 없어야 한다(§17-2 "프레임당 할당 0").
 */
export function pruneVoices(
  active: readonly ActiveVoice[],
  nowMs: number,
): readonly ActiveVoice[] {
  let expired = 0;
  for (const voice of active) {
    if (voice.endsAtMs <= nowMs) expired += 1;
  }
  if (expired === 0) return active;
  if (expired === active.length) return NO_ACTIVE;
  return active.filter((voice) => voice.endsAtMs > nowMs);
}

/**
 * 가장 밀려나기 쉬운 소리의 인덱스 — 우선순위가 최하, 같으면 **가장 먼저 끝날 것**.
 *
 * tie-break를 "먼저 끝날 것"으로 잡는 이유: 어차피 곧 사라질 소리를 끊는 편이
 * 방금 시작한 같은 등급의 소리를 잘라내는 것보다 덜 어색하다.
 */
function weakestIndex(active: readonly ActiveVoice[]): number {
  let index = 0;
  for (let candidate = 1; candidate < active.length; candidate += 1) {
    const current = active[index];
    const other = active[candidate];
    if (current === undefined || other === undefined) continue;
    if (
      other.priority < current.priority ||
      (other.priority === current.priority && other.endsAtMs < current.endsAtMs)
    ) {
      index = candidate;
    }
  }
  return index;
}

/**
 * 이 소리를 지금 울려도 되는가 — **이 모듈의 대표 진입점.**
 *
 * 판정 순서가 곧 규칙이다:
 *   1. 끝난 소리를 걷어낸다.
 *   2. **같은 소리**가 `minGapMs` 안에 울렸으면 거부(`throttled`). ← 연타 억제
 *   3. 자리가 없으면, 나보다 약한 소리를 찾아 밀어낸다. 없으면 거부(`voice-limit`).
 *   4. 통과 — 손잡이를 발급하고 마지막 재생 시각을 기록한다.
 *
 * 길이가 0인 소리는 자리를 차지하지 않는다(레이어가 비어 있는 경우).
 *
 * @param nowMs 셸이 넘기는 시각. **이 모듈은 시계를 읽지 않는다**(§17-2).
 */
export function admitSound(
  state: PlaybackState,
  spec: SoundSpec,
  nowMs: number,
): AdmitResult {
  const active = pruneVoices(state.active, nowMs);
  const pruned: PlaybackState = active === state.active ? state : { ...state, active };

  const last = state.lastPlayedAtMs[spec.id];
  if (last !== undefined && nowMs - last < spec.minGapMs) {
    return { state: pruned, admitted: false, reason: 'throttled', voiceId: null, evicted: NO_EVICTED };
  }

  const durationMs = soundDurationMs(spec);
  const lastPlayedAtMs = { ...state.lastPlayedAtMs, [spec.id]: nowMs };

  // 길이가 없는 소리는 재생 자리를 쓰지 않는다 — 상한 계산에서 빼야 한다.
  if (durationMs <= 0) {
    return {
      state: { ...pruned, lastPlayedAtMs },
      admitted: true,
      reason: 'ok',
      voiceId: null,
      evicted: NO_EVICTED,
    };
  }

  let survivors = active;
  let evicted: readonly number[] = NO_EVICTED;
  while (survivors.length >= MAX_CONCURRENT_VOICES) {
    const index = weakestIndex(survivors);
    const weakest = survivors[index];
    if (weakest === undefined || weakest.priority >= spec.priority) {
      // 나보다 약한 것이 없다 — 새 소리가 포기한다. 잦고 사소한 소리가 여기서 걸린다.
      return {
        state: { ...pruned, active: survivors },
        admitted: false,
        reason: 'voice-limit',
        voiceId: null,
        evicted,
      };
    }
    evicted = [...evicted, weakest.voiceId];
    survivors = survivors.filter((_, at) => at !== index);
  }

  const voiceId = state.nextVoiceId;
  return {
    state: {
      lastPlayedAtMs,
      active: [
        ...survivors,
        { voiceId, soundId: spec.id, endsAtMs: nowMs + durationMs, priority: spec.priority },
      ],
      nextVoiceId: voiceId + 1,
    },
    admitted: true,
    reason: 'ok',
    voiceId,
    evicted,
  };
}
