/**
 * 거래량 반응 봇 — 거래량이 급증한 봉의 가격 방향으로 진입한다.
 *
 * "거래가 붙은 쪽으로 따라붙는다"는 실제 단타의 통념을 그대로 옮긴 것이며,
 * RK-2가 묻는 "블라인드 차트에서 쓸 수 있는 정보가 가격 말고 또 있는가"에 대한
 * 직접적인 대답이다 — 게임이 화면에 거래량 배수(`2.4×`)를 노출하기 때문이다(FR-4.1).
 */

import type { BotAction, BotInstance, BotStrategy } from '../types.js';
import { HOLD } from '../types.js';
import { changeOverPct, volumeSurgeRatio } from './signals.js';

export interface VolumeBotOptions {
  /** 급증 판정용 단기 창(봉). */
  readonly fastBars: number;
  /** 비교 기준 장기 창(봉). */
  readonly slowBars: number;
  /** 이 배수를 넘으면 "급증"으로 본다. */
  readonly surgeRatio: number;
  readonly holdBars: number;
  readonly stakeRatio: number;
}

/**
 * 거래량 반응 봇을 만든다.
 *
 * 판단 규칙:
 * 1. 최근 `fastBars` 평균 거래량 ÷ 최근 `slowBars` 평균 거래량 ≥ `surgeRatio` 인가?
 * 2. 그렇다면 같은 `fastBars` 구간의 가격 등락 **부호** 방향으로 진입한다.
 *    (등락이 정확히 0이면 방향을 정할 근거가 없으므로 진입하지 않는다.)
 * 3. `holdBars` 후 청산.
 */
export function createVolumeBot(id: string, label: string, options: VolumeBotOptions): BotStrategy {
  return {
    id,
    label,
    rule: `최근 ${options.fastBars}봉 거래량이 ${options.slowBars}봉 평균의 ${options.surgeRatio}배를 넘으면 그 구간 등락 방향으로 진입, ${options.holdBars}봉 보유`,
    create(): BotInstance {
      return {
        decide(ctx): BotAction {
          if (ctx.position === null) {
            if (!ctx.canOpen || ctx.bars.length < options.slowBars) {
              return HOLD;
            }
            if (ctx.barsRemaining < options.holdBars) {
              return HOLD;
            }
            const ratio = volumeSurgeRatio(ctx.bars, options.fastBars, options.slowBars);
            if (ratio < options.surgeRatio) {
              return HOLD;
            }
            const changePct = changeOverPct(ctx.bars, options.fastBars);
            if (changePct === 0) {
              return HOLD;
            }
            return {
              kind: 'open',
              direction: changePct > 0 ? 'long' : 'short',
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
