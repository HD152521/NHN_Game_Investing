/**
 * 웨이브 시계 — "지금이 준비 구간인가 교전 구간인가, 웨이브는 언제 시작하는가"만 아는
 * 순수 상태 기계다 (PRD FR-6, §9.4).
 *
 * ★ 왜 `simulate.ts`에서 떼어냈나 ★
 * 준비 구간이 붙으면서 웨이브 진행이 "경과 시간 누적"에서 **2상태 기계**(prep ↔ battle)로
 * 바뀌었다. 이걸 `substep` 안에 두면 전투 물리(스폰·사격·이동)와 시간 진행 규칙이 한
 * 함수에서 뒤엉켜, "준비 중에 적이 스폰되나?" 같은 질문을 캔버스도 적도 없이 검증할 수
 * 없게 된다. 시계만 따로 떼면 웨이브 전이 규칙을 개체 하나 없이 그대로 테스트할 수 있다.
 *
 * 시간 규약(★ 중요): `waveDurationMs`는 **준비 + 교전의 합**이다. 준비 시간은 주기에
 * 더해지지 않는다 — 이유는 `constants.ts`의 `WAVE_DURATION_MS` 주석 참고(리플레이 390초와
 * 전투 390초가 어긋나면 마지막 웨이브들이 통째로 잘린다).
 */

/** 준비 구간인가 교전 구간인가. `prepRemainingMs`만으로는 "방금 건너뛴 준비"와 구분되지 않는다. */
export type WaveMode = 'prep' | 'battle';

export interface WaveClock {
  readonly mode: WaveMode;
  /** 1-based. 준비 구간에서는 **아직 시작하지 않은 웨이브의 직전 번호**(최초엔 0)다. */
  readonly wave: number;
  /** 교전 구간 경과(ms). 준비 시간은 포함하지 않는다. */
  readonly waveElapsedMs: number;
  /** 남은 준비 시간(ms). 교전 중에는 0. */
  readonly prepRemainingMs: number;
}

export interface WaveClockParams {
  readonly waveCount: number;
  /** 웨이브 1주기(준비 + 교전). */
  readonly waveDurationMs: number;
  /** 주기 중 준비 구간 길이. */
  readonly prepMs: number;
}

/**
 * 한 번의 `advanceWaveClock` 호출에서 허용할 최대 상태 전이 수.
 *
 * `waveDurationMs`가 0이거나 준비 시간이 0인 퇴화 입력에서 while 루프가 시간을 전혀
 * 소비하지 못하고 도는 것을 막는 안전장치다. 정상 입력(주기 30초, 서브스텝 ≤ 250ms)에서는
 * 전이가 한 번을 넘지 않으므로 이 상한에 닿지 않는다.
 */
const MAX_TRANSITIONS = 64;

/** 교전 구간 길이 = 주기 − 준비. 음수가 되지 않게 자른다. */
export function battleDurationMs(params: WaveClockParams): number {
  return Math.max(0, params.waveDurationMs - params.prepMs);
}

/** 스테이지 시작 시계. **웨이브 1도 준비 구간부터 시작한다** — 첫 타워를 세울 틈이 그것이다. */
export function createWaveClock(params: WaveClockParams): WaveClock {
  return {
    mode: 'prep',
    wave: 0,
    waveElapsedMs: 0,
    prepRemainingMs: Math.max(0, params.prepMs),
  };
}

/**
 * 준비 시간을 즉시 끝낸다 (Space 키). 교전 중이면 아무 것도 하지 않는다.
 *
 * 여기서 웨이브를 바로 올리지 않는 이유: 웨이브 시작에는 기본 수입 지급(FR-6.8)과
 * 스폰 계획 확정이 따라붙고, 그건 `simulate.ts`가 이벤트로 내보내야 한다. 남은 시간만
 * 0으로 만들고 전이는 다음 `advanceWaveClock`에 맡겨, 웨이브 시작 경로를 한 곳으로 유지한다.
 */
export function skipPrep(clock: WaveClock): WaveClock {
  if (clock.mode !== 'prep' || clock.prepRemainingMs <= 0) {
    return clock;
  }
  return { ...clock, prepRemainingMs: 0 };
}

export interface WaveClockAdvance {
  readonly clock: WaveClock;
  /** 이번 호출에서 시작된 웨이브 번호들(1-based). 보통 0~1개다. */
  readonly wavesStarted: readonly number[];
}

/**
 * 시계를 `dtMs`만큼 진행한다.
 *
 * 전이 규칙:
 * - `prep`: 남은 준비 시간을 소비한다. 0이 되면 `wave += 1`, 교전 구간 진입(웨이브 시작).
 * - `battle`: 교전 시간을 소비한다. 교전 구간이 끝나고 다음 웨이브가 남아 있으면 다시 `prep`.
 * - 마지막 웨이브의 교전 구간이 끝나면 더 전이하지 않고 `waveElapsedMs`만 계속 쌓는다 —
 *   `simulate.ts`의 클리어 판정(`waveElapsedMs >= 교전 구간`)이 이 누적에 걸린다.
 */
export function advanceWaveClock(clock: WaveClock, dtMs: number, params: WaveClockParams): WaveClockAdvance {
  const battleMs = battleDurationMs(params);
  const wavesStarted: number[] = [];

  let { mode, wave, waveElapsedMs, prepRemainingMs } = clock;
  let remaining = Math.max(0, dtMs);
  let transitions = 0;

  while (remaining > 0 && transitions < MAX_TRANSITIONS) {
    if (mode === 'prep') {
      if (prepRemainingMs <= 0) {
        mode = 'battle';
        wave += 1;
        waveElapsedMs = 0;
        prepRemainingMs = 0;
        wavesStarted.push(wave);
        transitions += 1;
        continue;
      }
      const used = Math.min(prepRemainingMs, remaining);
      prepRemainingMs -= used;
      remaining -= used;
      continue;
    }

    // battle — 마지막 웨이브는 더 전이하지 않고 남은 시간을 전부 흡수한다.
    if (wave >= params.waveCount) {
      waveElapsedMs += remaining;
      remaining = 0;
      break;
    }

    const left = battleMs - waveElapsedMs;
    if (remaining < left) {
      waveElapsedMs += remaining;
      remaining = 0;
      break;
    }

    waveElapsedMs = battleMs;
    remaining -= Math.max(0, left);
    mode = 'prep';
    prepRemainingMs = Math.max(0, params.prepMs);
    transitions += 1;
  }

  return { clock: { mode, wave, waveElapsedMs, prepRemainingMs }, wavesStarted };
}
