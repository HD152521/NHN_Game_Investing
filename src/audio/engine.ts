/**
 * 재생층 — **여기만 `AudioContext`를 안다.** 판정은 한 줄도 없다.
 *
 * ★ 이 파일의 유일한 책임 ★ `SoundSpec`(데이터)을 Web Audio 노드 그래프로 옮기는 것.
 * 무엇을 언제 울릴지는 `events.ts`·`throttle.ts`가 이미 정해서 넘긴다.
 *
 * ★ 절대 규칙 — 크래시하지 않는다 ★
 * `AudioContext`가 없는 환경이 실재한다: vitest의 node 환경, jsdom(§19-7), 구형 브라우저,
 * 자동재생을 강하게 막는 설정. 그 전부에서 **조용히 무음으로 떨어진다.** 소리는 보조
 * 채널이므로(PRD) 오디오 때문에 게임이 죽는 경로가 있으면 그것 자체가 결함이다.
 * 그래서 모든 Web Audio 호출이 try로 감싸여 있고, 실패는 `available = false`로 수렴한다.
 *
 * ★ 자동재생 정책 ★
 * 브라우저는 **첫 사용자 제스처 전까지 `AudioContext`를 `suspended`로 만든다.** 생성은
 * 되지만 소리가 나지 않는다. 그래서 `resume()`을 따로 두고, 셸이 시작 버튼 클릭에서
 * 부른다(`stage.ts`). 여기서 자동으로 부르지 않는 이유는 클릭 밖에서 호출하면 브라우저가
 * 거부하고 콘솔에 경고를 남기기 때문이다.
 */

import type { SoundLayer, SoundSpec } from './types';

/** 재생 중인 소리 하나의 손잡이. 동시 재생 상한에 걸려 밀려날 때 끊는 데 쓴다. */
export interface AudioVoice {
  stop(): void;
}

export interface AudioEngine {
  /** 소리를 낼 수 있는 환경인가. `false`면 모든 호출이 무해한 no-op이다. */
  readonly available: boolean;
  /** 자동재생 정책 해제 — **사용자 제스처 핸들러 안에서** 불러야 한다. */
  resume(): void;
  /**
   * 소리 하나를 지금 시작한다.
   *
   * @param gain 0~1. 마스터 볼륨 × 소리 볼륨이 이미 곱해진 최종값이다.
   * @returns 끊을 수 있는 손잡이. 재생하지 못했으면 `null`(호출부는 무시해도 된다).
   */
  play(spec: SoundSpec, gain: number): AudioVoice | null;
  /** 컨텍스트를 닫는다. 마운트 해제 경로에서 부른다. */
  destroy(): void;
}

/** `AudioContext`를 만드는 방법. 테스트가 가짜를 끼우거나 `null`로 무음을 강제한다. */
export type AudioContextFactory = () => AudioContext | null;

/** 페이드아웃 하한 — 지수 램프는 0에 닿을 수 없으므로 들리지 않는 값으로 수렴시킨다. */
const SILENCE = 0.000_1;

/**
 * 어택 시간(초). 0에서 곧바로 목표 진폭으로 뛰면 **클릭 노이즈**(딱 소리)가 난다.
 * 3ms면 사람 귀에는 즉시로 들리면서 그 잡음이 사라진다.
 */
const ATTACK_S = 0.003;

/** 노이즈 버퍼 길이(초). 가장 긴 노이즈 레이어(260ms)보다 넉넉하면 된다. */
const NOISE_SECONDS = 1;

/**
 * 표준 `AudioContext`를 찾는다. 없으면 `null`.
 *
 * `webkitAudioContext`까지 보는 이유는 구형 사파리다. 타입이 없으므로 좁은 캐스트를
 * 쓰되, 실패는 전부 `null`로 떨어뜨린다.
 */
export function defaultAudioContextFactory(): AudioContext | null {
  try {
    const scope = globalThis as unknown as {
      AudioContext?: new () => AudioContext;
      webkitAudioContext?: new () => AudioContext;
    };
    const Ctor = scope.AudioContext ?? scope.webkitAudioContext;
    if (!Ctor) return null;
    return new Ctor();
  } catch {
    return null;
  }
}

/** 화이트노이즈 한 덩이. 매 발사마다 새로 만들면 GC가 갈리므로 컨텍스트당 하나만 굽는다. */
function bakeNoise(ctx: AudioContext): AudioBuffer | null {
  try {
    const frames = Math.floor(ctx.sampleRate * NOISE_SECONDS);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // 시드 PRNG를 쓸 필요가 없다 — 노이즈는 판정에 쓰이지 않는 순수 연출이라
    // 재현성 요구(§19-16 `Math.random()` 금지)의 대상이 아니다. 그래도 결정적인 편이
    // 디버깅에 낫고 비용도 같으므로 간단한 LCG를 돌린다.
    let state = 0x2f6e_2b1;
    for (let index = 0; index < frames; index += 1) {
      state = (state * 1_664_525 + 1_013_904_223) >>> 0;
      data[index] = (state / 0xffff_ffff) * 2 - 1;
    }
    return buffer;
  } catch {
    return null;
  }
}

/** 레이어 한 겹을 노드 그래프로 만든다. 실패하면 아무 것도 붙이지 않는다. */
function scheduleLayer(
  ctx: AudioContext,
  destination: AudioNode,
  layer: SoundLayer,
  noise: AudioBuffer | null,
  startAt: number,
  stopHandles: AudioScheduledSourceNode[],
): void {
  const begin = startAt + layer.startMs / 1_000;
  const end = begin + layer.durationMs / 1_000;
  if (end <= begin) return;

  let source: AudioScheduledSourceNode;
  if (layer.wave === 'noise') {
    if (!noise) return;
    const node = ctx.createBufferSource();
    node.buffer = noise;
    node.loop = true;
    source = node;
  } else {
    const node = ctx.createOscillator();
    node.type = layer.wave;
    node.frequency.setValueAtTime(Math.max(1, layer.startHz), begin);
    if (layer.endHz !== layer.startHz) {
      // 선형 램프를 쓴다 — 지수 램프는 저음에서 곡선이 급해 "미끄러지는" 느낌이 난다.
      node.frequency.linearRampToValueAtTime(Math.max(1, layer.endHz), end);
    }
    source = node;
  }

  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(SILENCE, begin);
  envelope.gain.linearRampToValueAtTime(Math.max(SILENCE, layer.gain), begin + ATTACK_S);
  // 지수 감쇠 — 타악기의 자연스러운 꼬리다. 선형으로 줄이면 끝에서 뚝 끊긴 것처럼 들린다.
  envelope.gain.exponentialRampToValueAtTime(SILENCE, end);

  let tail: AudioNode = envelope;
  if (layer.filter) {
    const filter = ctx.createBiquadFilter();
    filter.type = layer.filter.type;
    filter.frequency.setValueAtTime(layer.filter.hz, begin);
    envelope.connect(filter);
    tail = filter;
  }

  source.connect(envelope);
  tail.connect(destination);
  source.start(begin);
  source.stop(end);
  stopHandles.push(source);
}

/**
 * 재생 엔진을 만든다.
 *
 * @param factory `AudioContext` 생성기. 생략하면 브라우저 표준을 찾는다.
 *   `() => null`을 넘기면 **명시적 무음 엔진**이 되며 테스트가 이 경로를 쓴다.
 */
export function createAudioEngine(
  factory: AudioContextFactory = defaultAudioContextFactory,
): AudioEngine {
  let ctx: AudioContext | null = null;
  try {
    ctx = factory();
  } catch {
    ctx = null;
  }

  if (!ctx) {
    // 무음 엔진 — 호출부가 분기하지 않아도 되도록 같은 모양을 돌려준다.
    return {
      available: false,
      resume: () => undefined,
      play: () => null,
      destroy: () => undefined,
    };
  }

  const context = ctx;
  const noise = bakeNoise(context);

  return {
    available: true,

    resume(): void {
      try {
        // `suspended`가 아닐 때 불러도 해롭지 않지만, 프라미스 거부가 나올 수 있으므로 삼킨다.
        void context.resume?.()?.catch?.(() => undefined);
      } catch {
        // 자동재생 정책·닫힌 컨텍스트 — 조용히 무음으로 남는다.
      }
    },

    play(spec: SoundSpec, gain: number): AudioVoice | null {
      if (gain <= 0 || spec.layers.length === 0) return null;
      try {
        const master = context.createGain();
        master.gain.setValueAtTime(gain, context.currentTime);
        master.connect(context.destination);

        const startAt = context.currentTime;
        const sources: AudioScheduledSourceNode[] = [];
        for (const layer of spec.layers) {
          scheduleLayer(context, master, layer, noise, startAt, sources);
        }
        if (sources.length === 0) {
          master.disconnect();
          return null;
        }

        return {
          stop(): void {
            try {
              // 즉시 끊으면 클릭이 나므로 아주 짧게 접는다(동시 재생 상한에 밀려난 경우).
              const now = context.currentTime;
              master.gain.cancelScheduledValues(now);
              master.gain.setValueAtTime(Math.max(SILENCE, master.gain.value), now);
              master.gain.exponentialRampToValueAtTime(SILENCE, now + 0.02);
              for (const source of sources) source.stop(now + 0.025);
            } catch {
              // 이미 끝난 소스를 다시 멈추면 던진다 — 무해하다.
            }
          },
        };
      } catch {
        return null;
      }
    },

    destroy(): void {
      try {
        void context.close?.();
      } catch {
        // 이미 닫힌 컨텍스트 — 무해하다.
      }
    },
  };
}
