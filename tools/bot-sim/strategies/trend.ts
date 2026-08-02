/**
 * 추세 추종 봇 — 최근 N봉의 기울기 방향으로 진입한다.
 *
 * 임계값을 절대 퍼센트가 아니라 **그 창 길이의 σ 배수**로 잡는 것이 핵심이다.
 * 변동성이 큰 차트에서는 같은 1%가 잡음이고 조용한 차트에서는 신호이므로,
 * 고정 퍼센트 임계값을 쓰면 차트마다 진입 빈도가 제멋대로 달라져 결과를 비교할 수 없다.
 */

import type { BotAction, BotInstance, BotStrategy } from '../types.js';
import { HOLD } from '../types.js';
import { changeOverPct, sigmaForWindow } from './signals.js';

export interface TrendBotOptions {
  /** 기울기를 재는 창 길이(봉). */
  readonly lookbackBars: number;
  /** 진입 임계값 — 창 길이 기준 σ의 배수. */
  readonly entryZ: number;
  /** 보유 봉 수. `null`이면 스테이지 종료까지 들고 간다. */
  readonly holdBars: number | null;
  readonly stakeRatio: number;
}

/**
 * 추세 추종 봇을 만든다.
 *
 * 판단 규칙:
 * 1. 최근 `lookbackBars`봉 등락률을 그 창의 σ로 나눈 값 `s`를 구한다.
 * 2. `s ≥ entryZ`면 LONG, `s ≤ −entryZ`면 SHORT, 그 사이면 대기.
 * 3. `holdBars`가 지나면 청산(`null`이면 종료까지 보유).
 */
export function createTrendBot(id: string, label: string, options: TrendBotOptions): BotStrategy {
  const holdLabel = options.holdBars === null ? '종료까지 보유' : `${options.holdBars}봉 보유`;
  return {
    id,
    label,
    rule: `최근 ${options.lookbackBars}봉 등락률이 ±${options.entryZ}σ를 넘으면 그 방향으로 진입, ${holdLabel}`,
    create(): BotInstance {
      return {
        decide(ctx): BotAction {
          if (ctx.position === null) {
            if (!ctx.canOpen || ctx.bars.length <= options.lookbackBars) {
              return HOLD;
            }
            if (options.holdBars !== null && ctx.barsRemaining < options.holdBars) {
              return HOLD;
            }
            const changePct = changeOverPct(ctx.bars, options.lookbackBars);
            const windowSigma = sigmaForWindow(ctx.sigma, options.lookbackBars);
            const score = windowSigma <= 0 ? 0 : changePct / windowSigma;

            if (score >= options.entryZ) {
              return { kind: 'open', direction: 'long', stakeRatio: options.stakeRatio };
            }
            if (score <= -options.entryZ) {
              return { kind: 'open', direction: 'short', stakeRatio: options.stakeRatio };
            }
            return HOLD;
          }

          if (options.holdBars === null) {
            return HOLD; // 스테이지 종료 시 엔진이 stage_end로 정리한다.
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
