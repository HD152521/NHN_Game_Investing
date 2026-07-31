/**
 * 날씨 렌더러 4종이 함께 쓰는 최소 유틸.
 *
 * ★ 전부 스칼라 in / 스칼라 out이다. 여기서 객체를 만들기 시작하면 60 FPS 예산 안에서
 *   프레임당 할당이 생긴다 (PRD §11 — 유닛 60체 + 타워 8기에서 60 FPS).
 */

/** 소수부(0~1). 위상 계산에 쓴다. */
export function frac(value: number): number {
  return value - Math.floor(value);
}

/** 0~1로 자른다. */
export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** `a`→`b`를 `t`(0~1)로 선형 보간. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * 시드를 다른 축으로 흩뿌린다.
 *
 * 같은 시드를 x 위치와 낙하 위상에 그대로 쓰면 광선이 대각선 한 줄로 정렬돼 버린다.
 * 무리수 배수를 곱해 소수부를 취하면 추가 버퍼 없이 두 축을 탈상관시킬 수 있다.
 */
export function decorrelate(seed: number, salt: number): number {
  return frac(seed * salt);
}

/** reduced-motion이면 시간을 0으로 고정해 위상을 멈춘다 (정보는 남고 모션만 사라진다). */
export function motionTime(timeMs: number, reducedMotion: boolean): number {
  return reducedMotion ? 0 : timeMs;
}
