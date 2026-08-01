/**
 * 발판 상태 판정 — 전황(적 전진율 · 웨이브 번호) → 발판 3단계.
 *
 * ★ Canvas를 모른다. 여기에 그리기 관심사(색·좌표·시각)가 들어오면 판정/렌더 분리가
 *   무너진다. `src/weather/classify.ts`와 같은 자리다.
 */

import { CRACK_ADVANCE_THRESHOLD, LATE_WAVE_PROGRESS } from './constants.js';
import type { AdvancingEnemy, GroundConditions, GroundState } from './types.js';

/** 0~1로 자른다. NaN은 0으로 떨어뜨린다. */
function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * 가장 전진한 적의 전진율(0~1)을 구한다.
 *
 * 적의 `x`는 1(적 본진) → 0(아군 사옥)으로 감소하므로 전진율은 `1 - x`다.
 * 살아있는 적이 없으면 0(=전진 없음)이다. 상세한 근거는 `CRACK_ADVANCE_THRESHOLD` 주석 참고.
 *
 * 배열을 새로 만들지 않고 한 번만 순회한다 — 매 프레임 호출되므로 할당이 없어야 한다.
 */
export function maxEnemyAdvance(enemies: readonly AdvancingEnemy[]): number {
  let best = 0;
  for (const enemy of enemies) {
    if (enemy.hp <= 0) continue;
    const advance = 1 - clamp01(enemy.x);
    if (advance > best) best = advance;
  }
  return best;
}

/**
 * 후반 웨이브인가 — `wave / waveCount >= LATE_WAVE_PROGRESS`.
 *
 * `waveCount`가 0 이하이면(스테이지 미시작 등 비정상 입력) 항상 false다.
 */
export function isLateWave(wave: number, waveCount: number): boolean {
  if (waveCount <= 0 || !Number.isFinite(wave)) return false;
  return wave >= Math.ceil(waveCount * LATE_WAVE_PROGRESS);
}

/**
 * 전황 → 발판 3단계.
 *
 * ★ 함몰이 균열 **위에** 얹히는 이유: 시트는 "정상 = 웨이브 시작 상태"라고 못 박는다.
 *   후반 웨이브라는 사실만으로 곧장 함몰로 보내면 후반 웨이브가 시작되는 순간부터
 *   발판이 이미 무너져 있어 그 규칙과 충돌하고, 웨이브 안에서 정상→균열→함몰로
 *   악화되는 "같은 타일 3단계"라는 연출 의도도 사라진다. 그래서 균열 조건을 먼저
 *   통과해야 하고, 후반 웨이브는 그 균열을 함몰로 **격상**시키는 조건으로 쓴다.
 */
export function classifyGroundState(conditions: GroundConditions): GroundState {
  if (clamp01(conditions.maxAdvance) < CRACK_ADVANCE_THRESHOLD) return 'intact';
  return isLateWave(conditions.wave, conditions.waveCount) ? 'collapsed' : 'cracked';
}
