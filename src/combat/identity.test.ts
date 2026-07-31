import { describe, expect, test } from 'vitest';

import { silhouetteShapeFor } from '../design';
import { TOWER_BUILD_COST, UNIT_COST, WAVE_COUNT } from './constants';
import {
  ALLY_IDENTITY,
  BOSS_IDENTITY,
  ENEMY_IDENTITY,
  ENEMY_KINDS,
  IDENTITY_BY_CODE,
  TOWER_IDENTITY,
  allIdentities,
  enemyKindsForLane,
  identityForCode,
} from './identity';
import type { EntityIdentity } from './identity';

const CODE_PATTERN = /^[ABET]-\d{2}$/;

function expectFilled(identity: EntityIdentity): void {
  expect(identity.codeId).toMatch(CODE_PATTERN);
  expect(identity.displayName.length).toBeGreaterThan(0);
  expect(identity.role.length).toBeGreaterThan(0);
  expect(identity.flavor.length).toBeGreaterThan(0);
}

describe('정체성 데이터 — 누락 0', () => {
  test('아군·악당·타워·보스 전부가 표시 이름·코드·역할·정체 한 줄을 갖는다', () => {
    const all = allIdentities();
    expect(all.length).toBe(3 + 5 + 3 + 1);
    for (const identity of all) {
      expectFilled(identity);
    }
  });

  test('아군 3종은 시트의 A-01~A-03 이름을 쓴다', () => {
    expect(ALLY_IDENTITY.intern.displayName).toBe('개장벨 사환');
    expect(ALLY_IDENTITY.analyst.displayName).toBe('호가 통신원');
    expect(ALLY_IDENTITY.trader.displayName).toBe('락업 반장');
    expect(ALLY_IDENTITY.intern.codeId).toBe('A-01');
    expect(ALLY_IDENTITY.analyst.codeId).toBe('A-02');
    expect(ALLY_IDENTITY.trader.codeId).toBe('A-03');
  });

  test('악당 5종은 시트의 E-01~E-05 이름·역할을 쓴다', () => {
    expect(ENEMY_IDENTITY.gapScout.displayName).toBe('갭하락 첨병');
    expect(ENEMY_IDENTITY.marginEnforcer.displayName).toBe('반대매매 집행관');
    expect(ENEMY_IDENTITY.liquidationDigger.displayName).toBe('청산 굴착기');
    expect(ENEMY_IDENTITY.rumorKite.displayName).toBe('루머 연');
    expect(ENEMY_IDENTITY.panicSiren.displayName).toBe('패닉 사이렌');
    expect(ENEMY_KINDS.map((kind) => ENEMY_IDENTITY[kind].codeId)).toEqual([
      'E-01',
      'E-02',
      'E-03',
      'E-04',
      'E-05',
    ]);
  });

  test('타워 3종은 시트의 T-01~T-03 이름과 담당 레인을 쓴다', () => {
    expect(TOWER_IDENTITY.basic.displayName).toBe('지지선 앵커포');
    expect(TOWER_IDENTITY.antiair.displayName).toBe('공시 리피터');
    expect(TOWER_IDENTITY.splash.displayName).toBe('물타기 살포기');
    expect(TOWER_IDENTITY.antiair.laneLabel).toBe('공중');
  });

  test('보스는 마진콜 심판관이며 마지막 웨이브에 등장한다', () => {
    expect(BOSS_IDENTITY.displayName).toBe('마진콜 심판관');
    expect(BOSS_IDENTITY.appearWave).toBe(WAVE_COUNT);
  });

  test('코드 ID는 전부 유일하고 코드로 역조회된다', () => {
    const codes = allIdentities().map((identity) => identity.codeId);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) {
      expect(identityForCode(code)?.codeId).toBe(code);
    }
    expect(identityForCode('Z-99')).toBeNull();
    expect(Object.keys(IDENTITY_BY_CODE).length).toBe(codes.length);
  });
});

describe('실루엣 이중 인코딩 (시트 00)', () => {
  test('아군 유닛과 타워는 전부 rounded', () => {
    for (const identity of [...Object.values(ALLY_IDENTITY), ...Object.values(TOWER_IDENTITY)]) {
      expect(identity.faction).toBe('ally');
      expect(identity.silhouette).toBe('rounded');
    }
  });

  test('악당과 보스는 전부 angular', () => {
    for (const identity of [...Object.values(ENEMY_IDENTITY), BOSS_IDENTITY]) {
      expect(identity.faction).toBe('enemy');
      expect(identity.silhouette).toBe('angular');
    }
  });

  test('실루엣은 src/design 인코딩 테이블과 정합한다', () => {
    for (const identity of allIdentities()) {
      expect(identity.silhouette).toBe(silhouetteShapeFor(identity.faction));
    }
  });
});

describe('레인 배정', () => {
  test('지상 악당 3종 / 공중 악당 2종', () => {
    expect(enemyKindsForLane('ground')).toEqual([
      'gapScout',
      'marginEnforcer',
      'liquidationDigger',
    ]);
    expect(enemyKindsForLane('air')).toEqual(['rumorKite', 'panicSiren']);
  });

  test('악당 정체성의 lane은 레인 조회 결과와 일치한다', () => {
    for (const lane of ['ground', 'air'] as const) {
      for (const kind of enemyKindsForLane(lane)) {
        expect(ENEMY_IDENTITY[kind].lane).toBe(lane);
      }
    }
  });
});

describe('비용은 상수 테이블 단일 출처를 쓴다', () => {
  test('정체성 데이터는 비용을 따로 들고 있지 않다 (밸런스 상수와 이중화 금지)', () => {
    for (const identity of allIdentities()) {
      expect(identity).not.toHaveProperty('cost');
    }
    // 비용 조회는 기존 상수 테이블 그대로다.
    expect(UNIT_COST.intern).toBeGreaterThan(0);
    expect(TOWER_BUILD_COST.basic).toBeGreaterThan(0);
  });
});
