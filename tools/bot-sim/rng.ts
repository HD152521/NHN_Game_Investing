/**
 * 결정론적 PRNG — 봇 시뮬레이터 전용.
 *
 * `src/market/synth.ts`가 같은 mulberry32를 쓰지만 **export되어 있지 않다**(내부 함수).
 * `src/`는 읽기 전용이므로 여기서 같은 구현을 다시 둔다. 두 곳이 같은 상수를 쓰는 것은
 * 의도된 것이며, 시뮬레이터가 차트 생성기와 독립적으로 재현 가능해야 하기 때문이다.
 */

/** mulberry32 — 32비트 정수 시드 하나로 결정론적 [0, 1) 스트림을 만든다. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Box–Muller 변환으로 표준정규 난수를 뽑는다.
 *
 * `rng()`가 정확히 0을 낼 수 있으므로 `Math.log(0) = -Infinity`를 막기 위해
 * 0인 표본은 다시 뽑는다(균등분포에서 0이 나올 확률은 2^-32이지만 시드가 고정되면
 * 반드시 재현되는 결함이 된다).
 */
export function gaussian(rng: () => number): number {
  let u = rng();
  while (u === 0) {
    u = rng();
  }
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
