/** Small, allocation-free easing helpers shared by the animation clips. */

export function clamp01(value: number): number {
  if (!(value > 0)) {
    return 0;
  }
  return value < 1 ? value : 1;
}

export function easeInOutSine(t: number): number {
  return 0.5 - 0.5 * Math.cos(Math.PI * clamp01(t));
}

export function easeOutCubic(t: number): number {
  const inverted = 1 - clamp01(t);
  return 1 - inverted * inverted * inverted;
}

/**
 * Wraps a time into [0, period). Keeps long-running units numerically stable:
 * a unit alive for ten minutes samples the same phase values as a fresh one.
 */
export function wrap(value: number, period: number): number {
  const wrapped = value % period;
  return wrapped < 0 ? wrapped + period : wrapped;
}
