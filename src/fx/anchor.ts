/**
 * 스킬 이펙트를 **어디에 찍을지** 정하는 순수 계산 (아트 시트 §08).
 *
 * ★ 왜 위치 계산이 별도 모듈인가 ★
 * 시트 §08의 이펙트는 전부 **가산 합성(additive)** 소재다. 같은 좌표에 세 번 겹쳐 찍으면
 * 채널이 255로 포화해 형태가 흰 덩어리로 뭉개진다(Step 2 실측). 스킬은 쿨다운이 길어
 * 같은 스킬이 겹칠 일은 드물지만, **서로 다른 스킬 세 개를 연달아 쓰면 기본 위치가 겹친다** —
 * 그래서 위치를 "스킬마다 다른 자리 + 연타할수록 밀리는 오프셋"으로 정해 둔다.
 *
 * 전투 상태를 참조하지 않는다. 화면 크기와 시전 횟수만 받는다.
 */

import type { SkillEffectId } from './types.js';

/** 이펙트별 기본 자리 — 캔버스 폭·높이에 대한 비율. */
interface AnchorRatio {
  readonly x: number;
  readonly y: number;
}

/**
 * 스킬별 기본 위치. **셋이 서로 다른 자리를 쓴다**는 것 자체가 이 표의 존재 이유다.
 *
 * - `S-01` 공시 폭탄: 광역 즉발이라 전장 한가운데(교전선)에서 터져야 범위가 읽힌다.
 * - `S-02` 배당 살포: 아군 회복이라 아군이 나오는 좌측(사옥 쪽)에 뿌린다.
 * - `S-03` 서킷브레이커: "기지 앞 반원 돔"이므로 가장 왼쪽, 사옥 바로 앞이다(시트 §08 명시).
 */
const ANCHOR_RATIO: Readonly<Record<SkillEffectId, AnchorRatio>> = {
  'S-01': { x: 0.55, y: 0.5 },
  'S-02': { x: 0.28, y: 0.46 },
  'S-03': { x: 0.12, y: 0.54 },
};

/**
 * 연타 시 자리를 밀어내는 간격(px)과 주기.
 *
 * 같은 스킬을 연속 시전하면 `castIndex`가 1씩 늘어 **작은 삼각형을 그리며 자리를 옮긴다.**
 * 3회 주기인 이유는 3회 중첩부터 포화가 눈에 띄기 시작하기 때문이다 — 3자리를 돌면 같은
 * 좌표가 다시 쓰이기까지 최소 두 번의 시전 간격이 확보되고, 그 사이 앞 이펙트는 이미
 * 만료된다(`SKILL_EFFECT_DURATION_MS` 최대 1.1초 < 최단 쿨다운 30초).
 */
export const ANCHOR_JITTER_PX = 26;
const JITTER_PERIOD = 3;

/** 삼각 배치 오프셋 3자리. 단위원 위의 3점(0°, 120°, 240°)을 반올림한 값이다. */
const JITTER_OFFSETS: readonly AnchorRatio[] = [
  { x: 0, y: 0 },
  { x: 0.87, y: -0.5 },
  { x: -0.87, y: -0.5 },
];

export interface SkillAnchor {
  readonly x: number;
  readonly y: number;
}

/**
 * 이펙트 중심 좌표(px)를 정한다.
 *
 * @param castIndex 이 스킬이 지금까지 몇 번 시전됐는지(0-based). 같은 값이면 같은 자리다.
 */
export function skillAnchor(
  id: SkillEffectId,
  width: number,
  height: number,
  castIndex: number,
): SkillAnchor {
  const base = ANCHOR_RATIO[id];
  const slot = ((castIndex % JITTER_PERIOD) + JITTER_PERIOD) % JITTER_PERIOD;
  const offset = JITTER_OFFSETS[slot] ?? JITTER_OFFSETS[0];

  return {
    x: width * base.x + (offset?.x ?? 0) * ANCHOR_JITTER_PX,
    y: height * base.y + (offset?.y ?? 0) * ANCHOR_JITTER_PX,
  };
}
