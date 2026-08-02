/**
 * 손절 규율 데코레이터 — 임의의 기본 전략에 "손실 −0.5σ 컷 / 이익 +1σ 홀드"를 얹는다.
 *
 * ★ 이 파일이 검증하려는 주장 ★
 * 설계 리뷰가 "손절 규율만 있으면 방향 정확도 55%로도 R1(+20%)을 달성할 수 있다"고 판정했다.
 * 데코레이터로 만든 이유는 그 주장을 **같은 진입 신호 위에서** 검증하기 위해서다 —
 * 규율 버전과 무규율 버전이 진입 시점까지 완전히 동일해야 차이가 규율 때문임이 확정된다.
 *
 * ⚠️ 규율은 **청산만** 바꾼다. 진입 판단은 기본 전략에 그대로 위임하며,
 * 기본 전략이 낸 `close` 요청은 무시한다(그게 "이익 +1σ 홀드"의 의미다).
 */

import type { BotAction, BotInstance, BotStrategy } from '../types.js';
import { HOLD } from '../types.js';

export interface DisciplineOptions {
  /** 손절선(σ). `z ≤ −stopZ`면 즉시 청산. */
  readonly stopZ: number;
  /** 익절선(σ). `z ≥ takeZ`가 되기 전에는 이익 청산을 하지 않는다. */
  readonly takeZ: number;
}

/** PRD 설계 리뷰가 명시한 규율 값: 손실 −0.5σ 컷 / 이익 +1σ 홀드. */
export const REVIEW_DISCIPLINE: DisciplineOptions = { stopZ: 0.5, takeZ: 1.0 };

/**
 * `base`에 손절 규율을 씌운 새 전략을 만든다.
 *
 * 청산 판단 순서(먼저 걸리는 것이 이깁니다):
 * 1. `z ≤ −stopZ` → 청산 (강제 청산선 −1.111σ보다 앞서 끊는다)
 * 2. `z ≥ +takeZ` → 청산
 * 3. 그 외 → 보유 (기본 전략의 청산 요청도 무시)
 *
 * `canClose`(최소 보유 2초)가 아직이면 어떤 경우에도 청산할 수 없으므로 보유한다.
 */
export function withDiscipline(base: BotStrategy, options: DisciplineOptions): BotStrategy {
  return {
    id: `${base.id}+stop`,
    label: `${base.label} + 손절규율`,
    rule: `${base.rule} / 손실 −${options.stopZ}σ 즉시 컷, 이익은 +${options.takeZ}σ까지 홀드`,
    create(rng: () => number): BotInstance {
      const inner = base.create(rng);
      return {
        decide(ctx): BotAction {
          if (ctx.position === null || ctx.evaluation === null) {
            const action = inner.decide(ctx);
            // 포지션이 없으면 청산 요청은 의미가 없다 — 진입/대기만 통과시킨다.
            return action.kind === 'close' ? HOLD : action;
          }

          if (!ctx.canClose) {
            return HOLD;
          }

          const { z } = ctx.evaluation;
          if (z <= -options.stopZ || z >= options.takeZ) {
            return { kind: 'close' };
          }
          return HOLD;
        },
      };
    },
  };
}
