/**
 * 보스(B-03 마진콜 심판관) — 등장 판정 · 체력 투영 · 페이즈 판정.
 *
 * ★ 이 파일이 소유하는 것은 "보스에 대한 **질문**"뿐이다 ★
 * 스탯은 `constants.ts`(+ `stages.ts`의 HP 배수), 스폰은 `waves.ts`, 이동·교전·처치는
 * `mechanics.ts`가 그대로 담당한다 — 보스는 `Enemy` 하나로 표현되므로 물리를 새로 쓰지
 * 않는다. 여기 모인 것은 그 개체를 화면·HUD가 읽을 수 있는 형태로 바꾸는 얇은 층이다.
 *
 * ⚠️ 렌더러(`src/battle`)가 페이즈 규칙을 자기 버전으로 갖지 않게 하려고 `bossPhaseOf`를
 *    여기서 내보낸다. 두 계층이 각자 0.5를 하드코딩하면 상수를 바꿔도 그림만 안 바뀐다 —
 *    이 프로젝트에서 실제로 났던 사고(`entity-sprites.ts` 머리말)와 같은 종류다.
 */

import { BOSS_PHASE2_HP_RATIO } from './constants';
import { BOSS_IDENTITY } from './identity';
import type { BossState, Enemy } from './types';

/** 1 = 기본 패턴(`tf-boss-p1`), 2 = 포신 패턴(`tf-boss-p2`). */
export type BossPhase = 1 | 2;

/** 이 웨이브에 보스가 등장하는가. 등장 웨이브의 단일 출처는 정체성 데이터(시트 §07)다. */
export function isBossWave(wave: number): boolean {
  return wave === BOSS_IDENTITY.appearWave;
}

/**
 * 살아 있는 보스 개체 → `CombatState.boss`. 없으면 `null`.
 *
 * 매 서브스텝 호출되므로 **보스가 없을 때는 객체를 만들지 않는다**(프레임당 할당 0).
 * 적 배열은 길어야 20체 남짓이라 선형 탐색으로 충분하다.
 */
export function bossViewOf(enemies: readonly Enemy[]): BossState | null {
  for (const enemy of enemies) {
    if (enemy.isBoss === true) {
      return { hp: enemy.hp, maxHp: enemy.maxHp };
    }
  }
  return null;
}

/**
 * 남은 체력 비율로 페이즈를 가른다. `maxHp`가 0 이하인 비정상 입력은 1페이즈로 본다 —
 * 연출이 상태 이상 때문에 갑자기 최종 패턴으로 뛰는 것보다 낫다.
 */
export function bossPhaseOf(boss: BossState): BossPhase {
  if (!Number.isFinite(boss.hp) || !Number.isFinite(boss.maxHp) || boss.maxHp <= 0) {
    return 1;
  }
  return boss.hp / boss.maxHp < BOSS_PHASE2_HP_RATIO ? 2 : 1;
}
