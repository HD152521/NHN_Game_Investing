/**
 * 무작위 봇 — 기준선(baseline).
 *
 * 방향을 동전 던지기로 정한다. 마팅게일 차트에서 이 봇의 기대 z는 **정확히 0**이므로
 * `ρ ≈ −FEE_RATE`가 이론값이고, 시뮬레이터가 그 값을 재현하는지가 곧 엔진 자체의
 * 검산이다(엔진에 손익 부호 버그가 있으면 여기서 먼저 드러난다).
 */

import type { BotAction, BotInstance, BotStrategy } from '../types.js';
import { HOLD } from '../types.js';

export interface RandomBotOptions {
  /** 보유 봉 수. 이만큼 지나면 무조건 청산한다. */
  readonly holdBars: number;
  /** 진입 시 AUM 대비 투입 비율. */
  readonly stakeRatio: number;
}

/**
 * 동전 던지기 봇을 만든다.
 *
 * 진입 조건은 "비어 있고 진입 가능하면 즉시"이며, 스테이지 막판에 `holdBars`를 채우지
 * 못할 자리에서는 진입하지 않는다 — 강제 `stage_end` 청산이 섞이면 보유 구간 길이가
 * 들쭉날쭉해져 z 분포 해석이 흐려지기 때문이다.
 */
export function createRandomBot(id: string, label: string, options: RandomBotOptions): BotStrategy {
  return {
    id,
    label,
    rule: `동전 던지기로 방향 결정, ${options.holdBars}봉 보유 후 청산 (투입 ${Math.round(options.stakeRatio * 100)}%)`,
    create(rng: () => number): BotInstance {
      return {
        decide(ctx): BotAction {
          if (ctx.position === null) {
            if (!ctx.canOpen || ctx.barsRemaining < options.holdBars) {
              return HOLD;
            }
            return {
              kind: 'open',
              direction: rng() < 0.5 ? 'long' : 'short',
              stakeRatio: options.stakeRatio,
            };
          }

          const heldBars = ctx.heldMs / 1000;
          if (heldBars >= options.holdBars && ctx.canClose) {
            return { kind: 'close' };
          }
          return HOLD;
        },
      };
    },
  };
}
