/**
 * 결과 카드 — 한 장으로 공유되는 성적표.
 *
 * ★ 왜 이것이 싼가 ★ 그릴 소재가 전부 이미 있다. 차트 렌더러(`src/chart`), 공개 연출의
 * 매매 마커(`reveal.ts`), 정산 결과(`settlement.ts`), 팔레트(`design/palette.ts`).
 * 이 파일은 **카드에 무엇이 들어가는지**만 정하고 픽셀은 셸이 찍는다.
 *
 * ★ 티커가 없다 ★ 원래 구상은 "무채색 차트 + 티커 + 등급"이었는데, 블라인드 규칙상
 * `ChartSet`에 **종목·날짜 필드 자체가 없다**(실데이터 미연결). 그래서 정체 자리에는
 * **지역 + 시드**를 넣는다. 이게 오히려 공유에 더 맞는다 — 시드를 본 사람이 **정확히 같은
 * 판을 열 수 있기** 때문이다. 실데이터가 붙으면 이 자리에 종목·날짜가 들어간다.
 *
 * ★ 색 규칙 ★ 이익 `GOLD` / 손실 `ENEMY_DOWN` / 강제 청산 `UP_ALLY`. **초록은 없다.**
 * 팔레트 토큰 이름만 돌려주고 HEX를 만들지 않는다(`no-hardcoded-hex.test.ts`).
 */

import type { PaletteToken } from '../design';
import type { ChallengeMode } from './challenge';
import { challengeLabelOf, shareLineOf } from './challenge';
import type { Settlement, SettlementGrade, StageOutcome } from './settlement';

/** 카드 한 줄. */
export interface ResultCardStat {
  readonly label: string;
  readonly value: string;
  readonly tone?: PaletteToken;
}

export interface ResultCardInput {
  readonly outcome: StageOutcome;
  readonly settlement: Settlement;
  readonly stageId: string;
  /** 지역 표시 이름 (`REGION_IDENTITY`에서 온다 — 여기서 이름을 다시 적지 마라). */
  readonly stageName: string;
  readonly seed: number;
  readonly mode: ChallengeMode;
  readonly closeCount: number;
  readonly liquidatedCount: number;
  readonly remainingBaseHp: number;
  readonly maxBaseHp: number;
}

export interface ResultCard {
  /** 큰 글씨 한 줄 — 등급. */
  readonly grade: SettlementGrade;
  readonly gradeTone: PaletteToken;
  /** 결과 문구. 패배도 숨기지 않는다. */
  readonly headline: string;
  /** 정체 자리 — 지금은 지역 + 시드. 실데이터가 붙으면 종목·날짜가 온다. */
  readonly identity: string;
  readonly modeLabel: string;
  readonly stats: readonly ResultCardStat[];
  /** 공유 문자열. 시드가 반드시 들어간다 — 받는 사람이 같은 판을 열 수 있어야 한다. */
  readonly shareLine: string;
  /** 파일명 (확장자 제외). 공백·특수문자 없이. */
  readonly fileName: string;
}

/**
 * 등급 색.
 *
 * S·A는 `GOLD`(성취), B는 기본 텍스트, C는 `MUTED`. **패배는 등급과 무관하게 `ENEMY_DOWN`**이다 —
 * 자본금이 0인데 카드가 금색이면 거짓말이 된다.
 */
export function gradeToneOf(grade: SettlementGrade, outcome: StageOutcome): PaletteToken {
  if (outcome !== 'cleared') {
    return 'ENEMY_DOWN';
  }
  if (grade === 'S' || grade === 'A') {
    return 'GOLD';
  }
  return grade === 'B' ? 'TEXT' : 'MUTED';
}

function headlineOf(outcome: StageOutcome): string {
  switch (outcome) {
    case 'cleared':
      return '방어 성공';
    case 'defeated':
      return '본진 함락';
    default:
      return '결론 없음';
  }
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * 카드 내용.
 *
 * 수치는 전부 `Settlement`와 입력에서 온다 — 여기서 계산을 새로 하지 않는다(단일 출처).
 */
export function buildResultCard(input: ResultCardInput): ResultCard {
  const { settlement, outcome } = input;

  const stats: ResultCardStat[] = [
    {
      label: '자본금',
      value: `${settlement.capital}`,
      tone: settlement.capital > 0 ? 'GOLD' : 'MUTED',
    },
    {
      label: '적중률',
      value: input.closeCount === 0 ? '매매 없음' : percent(settlement.accuracy),
      tone: input.closeCount === 0 ? 'MUTED' : 'GOLD',
    },
    // 만피면 강조한다 — 무실점은 이 게임에서 가장 읽기 쉬운 성취다.
    // `exactOptionalPropertyTypes`가 켜져 있어 `tone: undefined`를 못 넣는다. 조건부로 붙인다.
    input.remainingBaseHp >= input.maxBaseHp
      ? {
          label: '본진',
          value: `${input.remainingBaseHp} / ${input.maxBaseHp}`,
          tone: 'GOLD' as const,
        }
      : { label: '본진', value: `${input.remainingBaseHp} / ${input.maxBaseHp}` },
  ];

  // 강제 청산은 있을 때만 싣는다. 0을 보여주면 "실수 안 함"이 아니라 잡음이 된다.
  if (input.liquidatedCount > 0) {
    stats.push({
      label: '강제 청산',
      value: `${input.liquidatedCount}번`,
      tone: 'UP_ALLY',
    });
  }

  return {
    grade: settlement.grade,
    gradeTone: gradeToneOf(settlement.grade, outcome),
    headline: headlineOf(outcome),
    identity: `${input.stageId} ${input.stageName} · 시드 ${input.seed}`,
    modeLabel: challengeLabelOf(input.mode, input.seed),
    stats,
    shareLine: shareLineOf(input.mode, input.seed, input.stageId),
    fileName: `ticker-front_${input.stageId}_${input.seed}_${settlement.grade}`,
  };
}
