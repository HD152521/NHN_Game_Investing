import { describe, expect, test } from 'vitest';

/**
 * DOM(jsdom) 없이 검증한다 — trade-panel과 같은 이유로 순수 로직(문자열 생성)만
 * 여기서 테스트하고, DOM 배선은 `roster.ts`에 격리한다.
 */
import {
  ALLY_IDENTITY,
  TOWER_BUILD_COST,
  TOWER_IDENTITY,
  UNIT_COST,
} from '../combat';
import {
  ROSTER_FLAVOR_ATTR,
  TOWER_ROSTER,
  UNIT_ROSTER,
  buildRosterMarkup,
  formatCostLabel,
  formatUnaffordableNotice,
  resolveRosterButtonState,
  rosterEntryFor,
} from './roster-logic';

describe('로스터 항목은 정체성·비용 데이터에서 읽는다', () => {
  test('타워 항목의 이름·코드·실루엣은 정체성 데이터와 같다', () => {
    for (const entry of TOWER_ROSTER) {
      const identity = TOWER_IDENTITY[entry.kind];
      expect(entry.displayName).toBe(identity.displayName);
      expect(entry.codeId).toBe(identity.codeId);
      expect(entry.silhouette).toBe(identity.silhouette);
      expect(entry.flavor).toBe(identity.flavor);
      expect(entry.subLabel).toBe(identity.laneLabel);
    }
  });

  test('유닛 항목의 이름·역할은 정체성 데이터와 같다', () => {
    for (const entry of UNIT_ROSTER) {
      const identity = ALLY_IDENTITY[entry.kind];
      expect(entry.displayName).toBe(identity.displayName);
      expect(entry.subLabel).toBe(identity.role);
      expect(entry.flavor).toBe(identity.flavor);
    }
  });

  test('비용은 밸런스 상수 테이블 값 그대로다', () => {
    for (const entry of TOWER_ROSTER) {
      expect(entry.cost).toBe(TOWER_BUILD_COST[entry.kind]);
    }
    for (const entry of UNIT_ROSTER) {
      expect(entry.cost).toBe(UNIT_COST[entry.kind]);
    }
  });

  test('타워 3종 · 유닛 3종이 빠짐없이 노출된다', () => {
    expect(TOWER_ROSTER.map((e) => e.kind)).toEqual(['basic', 'antiair', 'splash']);
    expect(UNIT_ROSTER.map((e) => e.kind)).toEqual(['intern', 'analyst', 'trader']);
  });

  test('종류 키로 항목을 역조회할 수 있다', () => {
    expect(rosterEntryFor('antiair')?.displayName).toBe('공시 리피터');
    expect(rosterEntryFor('trader')?.displayName).toBe('락업 반장');
    expect(rosterEntryFor('없는종류')).toBeNull();
  });
});

describe('비용 표기', () => {
  test('골드 단위를 붙인다', () => {
    expect(formatCostLabel(120)).toBe('120 G');
    expect(formatCostLabel(30)).toBe('30 G');
  });
});

describe('버튼 마크업', () => {
  const towerMarkup = buildRosterMarkup(TOWER_ROSTER, 'tower', 'btn--build');
  const unitMarkup = buildRosterMarkup(UNIT_ROSTER, 'unit', 'btn--summon');

  test('표시 이름과 비용이 마크업에 들어간다', () => {
    expect(towerMarkup).toContain('지지선 앵커포');
    expect(towerMarkup).toContain('공시 리피터');
    expect(towerMarkup).toContain('물타기 살포기');
    expect(towerMarkup).toContain(formatCostLabel(TOWER_BUILD_COST.splash));
    expect(unitMarkup).toContain('개장벨 사환');
    expect(unitMarkup).toContain(formatCostLabel(UNIT_COST.intern));
  });

  test('기능 이름(intern/basic)은 data 속성으로만 남고 화면 글자로 새지 않는다', () => {
    const visibleText = unitMarkup.replace(/<[^>]*>/g, '');
    expect(visibleText).not.toContain('intern');
    expect(visibleText).not.toContain('analyst');
    expect(unitMarkup).toContain('data-unit="intern"');
    expect(towerMarkup).toContain('data-tower="basic"');
  });

  test('정체 한 줄이 hover/focus용 속성으로 실린다', () => {
    expect(towerMarkup).toContain(`${ROSTER_FLAVOR_ATTR}="`);
    expect(towerMarkup).toContain(TOWER_IDENTITY.basic.flavor);
    expect(unitMarkup).toContain(ALLY_IDENTITY.intern.flavor);
  });

  test('title 속성으로 마우스 툴팁도 보장한다 (JS 없이 읽히는 최소 경로)', () => {
    expect(unitMarkup).toContain(`title="${ALLY_IDENTITY.trader.flavor}"`);
  });

  test('클래스와 data 속성이 기존 빌드바 계약을 유지한다', () => {
    expect(towerMarkup.startsWith('<button class="btn btn--build"')).toBe(true);
    expect(unitMarkup).toContain('type="button"');
  });
});

/**
 * CLICK-PATH-004 — 유닛 소환 버튼 3종이 **항상 활성**이었다.
 * 골드가 모자라면 `summonUnit`이 조용히 거부하는데 화면에는 아무 변화가 없었다.
 * 판정 기준은 스킬 버튼(`resolveSkillButtonState`)과 같은 규칙이어야 한다.
 */
describe('resolveRosterButtonState — 골드 부족이 버튼에 보인다', () => {
  test('골드가 모자라면 비활성이고 그 이유가 따로 표시된다', () => {
    const state = resolveRosterButtonState({
      cost: UNIT_COST.trader,
      gold: UNIT_COST.trader - 1,
      hasSession: true,
    });
    expect(state.disabled).toBe(true);
    expect(state.unaffordable).toBe(true);
  });

  test('비용과 잔액이 정확히 같으면 살 수 있다 (경계 포함)', () => {
    const state = resolveRosterButtonState({
      cost: UNIT_COST.intern,
      gold: UNIT_COST.intern,
      hasSession: true,
    });
    expect(state.disabled).toBe(false);
    expect(state.unaffordable).toBe(false);
  });

  test('세션이 없으면 비활성이지만 "돈이 없어서"는 아니다', () => {
    const state = resolveRosterButtonState({ cost: UNIT_COST.analyst, gold: 9999, hasSession: false });
    expect(state.disabled).toBe(true);
    expect(state.unaffordable).toBe(false);
  });

  test('안내 문구가 필요한 금액을 말한다', () => {
    const notice = formatUnaffordableNotice(ALLY_IDENTITY.trader.displayName, UNIT_COST.trader);
    expect(notice).toContain(ALLY_IDENTITY.trader.displayName);
    expect(notice).toContain(String(UNIT_COST.trader));
  });
});
