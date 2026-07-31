/**
 * 정전(WX-04) 지속 상한을 적용한 최종 종류 판정.
 *
 * `classify.ts`는 "지금 시장이 어떤 상태인가"만 본다. 거래 정지는 몇 분씩 이어질 수
 * 있지만 정전 연출은 시트상 **3프레임 이내**여야 하므로, 시간축 상한은 여기서 건다.
 * 여전히 순수 함수다 — 프레임 카운터를 인자로 받을 뿐 내부에 시계를 두지 않는다.
 */

import { classifyWeatherKind } from './classify.js';
import { BLACKOUT_MAX_FRAMES } from './constants.js';
import type { MarketConditions, WeatherKind } from './types.js';

/** 정전이 시작된 뒤 `framesSinceStart` 프레임째에도 여전히 보이는가. */
export function isBlackoutVisible(framesSinceStart: number): boolean {
  return framesSinceStart >= 0 && framesSinceStart < BLACKOUT_MAX_FRAMES;
}

/** 거래 정지를 무시하고 나머지 규칙만으로 판정한다 (정전이 만료된 뒤 넘어갈 날씨). */
function classifyWithoutHalt(conditions: MarketConditions): WeatherKind {
  if (!conditions.halted) return classifyWeatherKind(conditions);
  return classifyWeatherKind({
    recentChangePct: conditions.recentChangePct,
    sigma30: conditions.sigma30,
    halted: false,
    event: conditions.event,
  });
}

/**
 * 최종 날씨 종류.
 *
 * @param previousKind      직전 프레임의 종류. 정지 구간이 새로 시작됐는지 판별에 쓴다.
 * @param haltedFrames      **현재 거래 정지 구간이 시작된 뒤 지난 프레임 수.**
 *                          정전이 표시된 프레임만이 아니라 정지가 이어지는 동안 계속 증가해야 하며,
 *                          정지가 풀릴 때만 0으로 되돌린다.
 *
 * ⚠️ 카운터를 "정전이 보이는 동안"만 세면 안 된다. 3프레임 뒤 안개로 넘어가는 순간
 * 카운터가 리셋되고 직전 종류가 `blackout`이 아니게 되어, **정지가 이어지는 내내
 * 3프레임마다 정전이 재점멸한다.** 시트 03의 "3프레임 이내로 짧게"가 깨지는 지점이다.
 */
export function resolveWeatherKind(
  conditions: MarketConditions,
  previousKind: WeatherKind,
  haltedFrames: number,
): WeatherKind {
  const raw = classifyWeatherKind(conditions);
  if (raw !== 'blackout') return raw;

  // 정지 구간이 이번 프레임에 새로 시작됐다면 카운터와 무관하게 한 번은 반드시 번쩍인다.
  const isNewHalt = previousKind !== 'blackout' && haltedFrames === 0;
  if (isNewHalt) return 'blackout';

  return isBlackoutVisible(haltedFrames) ? 'blackout' : classifyWithoutHalt(conditions);
}
