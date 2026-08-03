import { describe, expect, test } from 'vitest';

/**
 * 지역 선택 화면의 **데이터 계약과 마크업 계약**을 검증한다.
 *
 * 여기서 가장 중요한 단언은 "카드의 숫자가 `STAGES`와 같다"이다. 이 화면은 밸런스 표를
 * 그대로 읽어 보여주는 창이므로, 값이 어긋나면 플레이어가 잘못된 기준으로 지역을 고른다.
 * (jsdom이 없으므로 마크업은 순수 문자열 함수로 검증한다 — `start-gate.test.ts`와 같은 방식)
 */
import { STAGES } from '../combat';
import { formatAmount } from '../ui';
import {
  REGION_BACK_ACTION,
  REGION_BACK_LABEL,
  REGION_ORDER,
  REGION_SELECT_ACTION,
  buildRegionSelectMarkup,
  formatTargetReturn,
  isRegionLocked,
  lockedNoticeFor,
  regionCards,
  regionStats,
  stageIdFor,
} from './region-select';
import { emptyProgress, withCleared } from './progress';

describe('regionCards — STAGES 단일 출처', () => {
  test('지역 3종을 R1 → R2 → R3 순서로 만든다', () => {
    expect(regionCards().map((card) => card.id)).toEqual(['R1', 'R2', 'R3']);
  });

  test('모든 수치가 STAGES 값과 정확히 일치한다 (하드코딩 금지)', () => {
    for (const card of regionCards()) {
      const stage = STAGES[card.id];
      expect(card.startingAum).toBe(stage.startingAum);
      expect(card.startingGold).toBe(stage.startingGold);
      expect(card.targetReturnRate).toBe(stage.targetReturnRate);
      expect(card.requiredSpend).toBe(stage.requiredSpend);
    }
  });

  test('지역마다 다른 정체성 카피를 갖는다', () => {
    const names = regionCards().map((card) => card.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(['여의도', '판교', '울산']);
  });

  /**
   * PRD §4 인접 점령 — R1만 활성이고 R2·R3는 **선행 클리어로 열린다.**
   *
   * 예전에는 "진행도 저장이 없으니 셋 다 열어 둔다"였고 그 임시 상태를 이 테스트가
   * 고정하고 있었다. `progress.ts`가 붙으면서 잠금이 실제로 걸린다.
   */
  test('진행도가 없으면 R1만 열려 있다', () => {
    const locked = Object.fromEntries(regionCards().map((card) => [card.id, card.locked]));
    expect(locked).toEqual({ R1: false, R2: true, R3: true });
  });

  test('R1을 클리어하면 R2가 열리고 R3는 아직 잠겨 있다 — 인접 점령', () => {
    const progress = withCleared(emptyProgress(), 'R1');
    const locked = Object.fromEntries(
      regionCards(progress).map((card) => [card.id, card.locked]),
    );
    expect(locked).toEqual({ R1: false, R2: false, R3: true });
  });

  test('R2까지 클리어하면 셋 다 열린다', () => {
    const progress = withCleared(withCleared(emptyProgress(), 'R1'), 'R2');
    expect(regionCards(progress).every((card) => card.locked === false)).toBe(true);
  });

  test('R1은 어떤 진행도에서도 잠기지 않는다 — 잠그면 시작할 방법이 없다', () => {
    expect(isRegionLocked('R1', emptyProgress())).toBe(false);
  });

  test('앞 지역을 건너뛰고 R3만 클리어한 진행도에서도 R3 잠금은 R2 기준이다', () => {
    // 저장 파일을 손으로 고친 경우 등. 규칙은 "바로 앞 지역" 하나뿐이라 흔들리지 않는다.
    const progress = withCleared(emptyProgress(), 'R3');
    expect(isRegionLocked('R3', progress)).toBe(true);
  });

  test('잠금 문구는 어느 지역을 깨야 하는지 말한다', () => {
    expect(lockedNoticeFor('R2')).toContain('R1');
    expect(lockedNoticeFor('R3')).toContain('R2');
    expect(lockedNoticeFor('R1')).toBe('');
  });

  test('카드 배경 씬은 원본이 실제로 구운 지역×시간대 조합만 쓴다', () => {
    // R3에는 밤이 없다(원본이 세 번째 칸을 황사로 썼다) — night를 쓰면 별도 굽기가 발생한다.
    const r3 = regionCards().find((card) => card.id === 'R3');
    expect(r3?.timeOfDay).not.toBe('night');
    for (const card of regionCards()) {
      expect(['noon', 'dusk']).toContain(card.timeOfDay);
    }
  });
});

describe('formatTargetReturn', () => {
  test('비율을 부호 붙은 퍼센트로 바꾼다', () => {
    expect(formatTargetReturn(0.2)).toBe('+20%');
    expect(formatTargetReturn(0.3)).toBe('+30%');
    expect(formatTargetReturn(0.45)).toBe('+45%');
  });

  test('0이면 부호를 붙이지 않는다', () => {
    expect(formatTargetReturn(0)).toBe('0%');
  });
});

describe('stageIdFor', () => {
  test('지역 ID만 통과시킨다', () => {
    expect(stageIdFor('R1')).toBe('R1');
    expect(stageIdFor('R3')).toBe('R3');
  });

  test('알 수 없는 값과 undefined는 null이다', () => {
    expect(stageIdFor('R9')).toBeNull();
    expect(stageIdFor(undefined)).toBeNull();
  });
});

describe('buildRegionSelectMarkup', () => {
  const markup = buildRegionSelectMarkup();

  test('지역 3종 카드를 문서 순서대로 렌더한다', () => {
    const positions = REGION_ORDER.map((id) => markup.indexOf(`data-region="${id}"`));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  test('각 카드가 선택 버튼이다', () => {
    const matches = markup.match(new RegExp(`data-action="${REGION_SELECT_ACTION}"`, 'g'));
    expect(matches).toHaveLength(REGION_ORDER.length);
  });

  /**
   * ★ 검수 지적("플레이어가 왜 졌는지 모른다")의 답 ★
   * 목표 수익률은 지역 속성이라 블라인드 규칙(FR-4)과 충돌하지 않는다. 반드시 보여야 한다.
   */
  test('목표 수익률을 지역마다 노출한다', () => {
    expect(markup).toContain('목표 수익률');
    for (const card of regionCards()) {
      expect(markup).toContain(formatTargetReturn(card.targetReturnRate));
    }
  });

  test('시작 AUM · 시작 골드 · 필요 지출을 STAGES 값 그대로 노출한다', () => {
    for (const card of regionCards()) {
      expect(markup).toContain(formatAmount(card.startingAum));
      expect(markup).toContain(`${formatAmount(card.requiredSpend)} G`);
      expect(markup).toContain(`${formatAmount(card.startingGold)} G`);
    }
    expect(markup).toContain('시작 AUM');
    expect(markup).toContain('필요 지출');
  });

  test('네 가지 수치가 카드마다 같은 순서로 들어간다', () => {
    for (const card of regionCards()) {
      expect(regionStats(card).map((stat) => stat.label)).toEqual([
        '시작 AUM',
        '시작 골드',
        '목표 수익률',
        '필요 지출',
      ]);
    }
  });

  test('시작 게이트로 돌아가는 버튼이 있다', () => {
    expect(markup).toContain(`data-action="${REGION_BACK_ACTION}"`);
    expect(markup).toContain(REGION_BACK_LABEL);
  });

  test('오버레이가 다이얼로그로 읽힌다 (스크린리더)', () => {
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('aria-labelledby="region-title"');
  });

  /** 게이트가 먼저다 — 이 화면은 [스테이지 시작]을 누른 뒤에 열린다. */
  test('숨겨진 상태로 태어난다', () => {
    expect(markup).toContain('hidden');
  });

  test('생짜 색을 쓰지 않는다 (팔레트 토큰만)', () => {
    expect(markup).not.toMatch(/#[0-9A-Fa-f]{6}/);
  });
});
