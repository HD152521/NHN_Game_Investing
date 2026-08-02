import { describe, expect, test } from 'vitest';

import {
  SKILL_DAMAGE,
  SKILL_HEAL,
  SKILL_IDS,
  SKILL_SHIELD_DURATION_MS,
  SKILL_SPECS,
} from '../combat';
import {
  SKILL_TOOLTIPS,
  buildSkillTooltipMarkup,
  clampTooltipLeft,
  formatSeconds,
  resolveTooltipTop,
  skillTooltipContent,
} from './skill-tooltip-logic';

/** 툴팁의 모든 값 문자열을 하나로 이어 붙인다 — "어딘가에 적혀 있는가"를 보는 용도. */
function allText(id: (typeof SKILL_IDS)[number]): string {
  const content = skillTooltipContent(id);
  return [
    content.title,
    content.flavor,
    content.caution ?? '',
    ...content.rows.map((row) => `${row.label} ${row.value}`),
  ].join(' | ');
}

describe('스킬 툴팁 — 3종 전부 설명이 있다', () => {
  test('스킬마다 이름·효과·수치·범위·비용·쿨다운·쓸 때가 모두 있다', () => {
    for (const id of SKILL_IDS) {
      const content = skillTooltipContent(id);
      expect(content.title).toBe(SKILL_SPECS[id].displayName);

      const labels = content.rows.map((row) => row.label);
      expect(labels).toEqual(['효과', '수치', '범위', '비용', '쿨다운', '쓸 때']);

      for (const row of content.rows) {
        expect(row.value.length).toBeGreaterThan(0);
      }
    }
  });

  test('SKILL_TOOLTIPS 는 화면 순서와 같다', () => {
    expect(SKILL_TOOLTIPS.map((content) => content.id)).toEqual([...SKILL_IDS]);
  });
});

describe('스킬 툴팁 수치 — 전부 src/combat 상수에서 파생된다 (하드코딩 0)', () => {
  test('비용과 쿨다운이 SKILL_SPECS 를 그대로 따른다', () => {
    for (const id of SKILL_IDS) {
      const spec = SKILL_SPECS[id];
      const text = allText(id);
      expect(text).toContain(String(spec.cost));
      expect(text).toContain(`${Math.round(spec.cooldownMs / 1000)}초`);
    }
  });

  test('S-01 은 SKILL_DAMAGE 를, S-02 는 SKILL_HEAL 을 그대로 보여준다', () => {
    expect(allText('S-01')).toContain(String(SKILL_DAMAGE));
    expect(allText('S-02')).toContain(String(SKILL_HEAL));
  });

  test('S-03 은 SKILL_SHIELD_DURATION_MS 를 초로 보여준다', () => {
    expect(allText('S-03')).toContain(`${SKILL_SHIELD_DURATION_MS / 1000}초`);
  });

  test('formatSeconds 는 ms 를 초로 반올림한다', () => {
    expect(formatSeconds(45_000)).toBe('45초');
    expect(formatSeconds(8_000)).toBe('8초');
    expect(formatSeconds(0)).toBe('0초');
  });
});

describe('스킬 툴팁 재화 — S-03 만 AUM 을 태운다', () => {
  test('S-03 에만 경고 줄이 붙는다', () => {
    expect(skillTooltipContent('S-01').caution).toBeNull();
    expect(skillTooltipContent('S-02').caution).toBeNull();
    expect(skillTooltipContent('S-03').caution).not.toBeNull();
  });

  test('S-03 경고가 AUM 소모와 트레이드오프를 함께 말한다', () => {
    const caution = skillTooltipContent('S-03').caution ?? '';
    expect(caution).toContain('AUM');
    expect(caution).toContain(String(SKILL_SPECS['S-03'].cost));
    // "매매할 돈이 줄어든다"는 트레이드오프가 문장에 있어야 한다.
    expect(caution).toContain('굴릴 돈이 줄어');
  });

  test('골드 스킬은 비용 표기에 G 를, AUM 스킬은 AUM 을 단다', () => {
    const gold = skillTooltipContent('S-01').rows.find((row) => row.label === '비용');
    const aum = skillTooltipContent('S-03').rows.find((row) => row.label === '비용');
    expect(gold?.value).toContain('G');
    expect(aum?.value).toContain('AUM');
  });
});

describe('스킬 툴팁 범위 설명 — 연출과 같은 말을 한다', () => {
  test('S-01 은 지상 전용임을 명시한다', () => {
    expect(allText('S-01')).toContain('공중');
    expect(allText('S-01')).toContain('맵 전체');
  });

  test('S-02 는 위치 무관 전원 회복임을 명시한다', () => {
    expect(allText('S-02')).toContain('맵 전체');
  });

  test('S-03 은 본진 한 지점임을 명시한다', () => {
    expect(allText('S-03')).toContain('본진');
  });
});

describe('스킬 툴팁 마크업', () => {
  test('항목명–값 쌍을 dl 로 낸다 (낭독 순서 = 시각 순서)', () => {
    const markup = buildSkillTooltipMarkup(skillTooltipContent('S-01'));
    expect(markup).toContain('<dl');
    expect(markup).toContain('<dt>효과</dt>');
    expect(markup).toContain(`<dd>피해 ${SKILL_DAMAGE} (적 1체당)</dd>`);
  });

  test('AUM 스킬만 경고 문단을 낸다', () => {
    expect(buildSkillTooltipMarkup(skillTooltipContent('S-03'))).toContain('skilltip__caution');
    expect(buildSkillTooltipMarkup(skillTooltipContent('S-01'))).not.toContain(
      'skilltip__caution',
    );
  });

  test('꺾쇠·따옴표는 이스케이프된다', () => {
    const markup = buildSkillTooltipMarkup({
      id: 'S-01',
      title: '<b>x</b>',
      flavor: '"q"',
      rows: [{ label: '효과', value: 'a & b' }],
      caution: null,
    });
    expect(markup).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(markup).toContain('&quot;q&quot;');
    expect(markup).toContain('a &amp; b');
  });
});

describe('툴팁 위치 — 화면 밖으로 나가지 않는다', () => {
  test('여유가 있으면 버튼 중앙에 맞춘다', () => {
    expect(clampTooltipLeft(400, 100, 260, 1200, 8)).toBe(400 + 50 - 130);
  });

  test('왼쪽으로 넘치면 여백에 붙인다', () => {
    expect(clampTooltipLeft(0, 40, 260, 1200, 8)).toBe(8);
  });

  test('오른쪽으로 넘치면 오른쪽 여백에 붙인다', () => {
    expect(clampTooltipLeft(1180, 40, 260, 1200, 8)).toBe(1200 - 8 - 260);
  });

  test('툴팁이 뷰포트보다 넓으면 왼쪽 여백에 붙인다', () => {
    expect(clampTooltipLeft(100, 40, 600, 300, 8)).toBe(8);
  });

  test('위 공간이 있으면 버튼 위에 뜬다', () => {
    expect(resolveTooltipTop(500, 40, 200, 10, 8)).toBe(500 - 10 - 200);
  });

  test('위 공간이 모자라면 버튼 아래로 뒤집는다', () => {
    expect(resolveTooltipTop(20, 40, 200, 10, 8)).toBe(20 + 40 + 10);
  });
});
