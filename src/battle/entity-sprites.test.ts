/**
 * 매핑표 무결성 + 진영 구분 신호 검사.
 *
 * ★ 이 파일이 무엇을 대체하는가 ★
 * PLAN Step 3 에서 `src/battle/shapes/` 를 지우면서 두 테스트가 폐기됐다:
 *
 *   1) `shapes/silhouette.test.ts` — "분류값 `rounded` ⇒ 그림에 `arc` 가 있다 /
 *      `angular` ⇒ `arc` 가 없다" 를 전수 검사했다.
 *   2) `shapes/tower-silhouette.test.ts` — 타워 3종의 **바운딩 박스 비율** 서열을 고정했다.
 *
 * 둘 다 **벡터 패스 전제**다. 픽셀 아트에는 `arc` 라는 개념 자체가 없고, `basePlateRect`
 * 같은 도형 함수도 사라졌으므로 그대로는 못 옮긴다. 그래서 두 테스트가 지키던 **불변식**을
 * 픽셀 아트에서 성립하는 형태로 다시 세운다:
 *
 *   - (1) 이 지키던 것 = "아군과 악당이 서로 다른 신호로 구분된다".
 *     픽셀 아트에서 이식본이 **엄격하게** 지키는 신호는 **진영 잉크**다: 아군 쪽 스프라이트는
 *     `r`(UP_ALLY)·`d`(UP_DEEP) 만, 악당 쪽은 `b`(ENEMY_DOWN)·`n`(ENEMY_DEEP) 만 쓴다.
 *     실측 결과 반대편 잉크는 14개 렌더 대상 전부에서 **정확히 0픽셀**이다(여유 0이 아니라
 *     아예 존재하지 않는다). 이 잉크 쌍은 색약 팔레트에서도 서로 멀리 떨어지도록 명시
 *     오버라이드되어 있어(`COLORBLIND_OVERRIDES`), 색약 모드에서도 신호가 살아 있다 —
 *     아래 세 번째 describe 가 그것까지 함께 고정한다.
 *
 *   - 색을 완전히 지운 **실루엣만으로**도 유닛 8종이 서로 구별되는지 함께 검사한다.
 *     ⚠️ 다만 "악당 실루엣이 아군보다 더 각졌다" 류의 **형태 축**은 이식본에 존재하지
 *     않는다. 실측(정규화 폭 프로파일 L1 거리)에서 진영 간 최소 거리 0.106 이 진영 내
 *     최소 거리(아군 0.140 / 악당 0.123)보다 **작다** — 즉 형태는 진영이 아니라 개체를
 *     가르는 축이다. 없는 불변식을 억지로 세우면 그것이야말로 이 테스트들이 막으려던
 *     "데이터와 화면이 조용히 갈라지는" 상태이므로, 성립하는 것만 고정한다.
 *
 *   - (2) 는 아래 마지막 describe 가 **원본 아트의 실제 비율**로 다시 쓴다.
 */

import { describe, expect, test } from 'vitest';

import { identityForCode } from '../combat/identity.js';
import { parseHex, resolvePalette } from '../design/index.js';
import { spriteGrid } from '../sprites/index.js';
import type { SpriteGrid } from '../sprites/index.js';
import { RENDERABLE_SPRITE_KEYS } from '../sprites/render/index.js';
import type { RenderableSpriteKey } from '../sprites/render/index.js';
import {
  ALLY_SPRITES,
  BATTLE_SPRITES,
  BOSS_SPRITE,
  ENEMY_BASE_SPRITE,
  ENEMY_SPRITES,
  HQ_SPRITE,
  TOWER_SPRITES,
  enemyKindForId,
} from './entity-sprites.js';

/** 아군 진영 잉크 문자(UP_ALLY / UP_DEEP). */
const ALLY_INK = ['r', 'd'] as const;
/** 악당 진영 잉크 문자(ENEMY_DOWN / ENEMY_DEEP). */
const ENEMY_INK = ['b', 'n'] as const;

const ALLY_SIDE_KEYS: readonly RenderableSpriteKey[] = [
  ...Object.values(ALLY_SPRITES).map((entry) => entry.key),
  ...Object.values(TOWER_SPRITES).map((entry) => entry.key),
  HQ_SPRITE.key,
];

const ENEMY_SIDE_KEYS: readonly RenderableSpriteKey[] = [
  ...Object.values(ENEMY_SPRITES).map((entry) => entry.key),
  ENEMY_BASE_SPRITE.key,
  BOSS_SPRITE.key,
];

function inkCount(grid: SpriteGrid, chars: readonly string[]): number {
  let count = 0;
  for (const row of grid) for (const cell of row) if (chars.includes(cell)) count += 1;
  return count;
}

/** 색을 전부 버리고 남은 이진 실루엣의 행별 폭(0인 행은 버린다). */
function rowWidths(grid: SpriteGrid): readonly number[] {
  const widths: number[] = [];
  for (const row of grid) {
    let first = -1;
    let last = -1;
    for (let x = 0; x < row.length; x += 1) {
      if (row[x] === '.') continue;
      if (first < 0) first = x;
      last = x;
    }
    if (first >= 0) widths.push(last - first + 1);
  }
  return widths;
}

const PROFILE_BUCKETS = 16;

/** 실루엣 폭 프로파일 — 높이는 16칸으로, 폭은 최대폭 1.0 으로 정규화한다(크기 차이 제거). */
function widthProfile(key: RenderableSpriteKey): readonly number[] {
  const widths = rowWidths(spriteGrid(key));
  const widest = Math.max(...widths);
  const profile: number[] = [];
  for (let bucket = 0; bucket < PROFILE_BUCKETS; bucket += 1) {
    const index = Math.floor((bucket * widths.length) / PROFILE_BUCKETS);
    profile.push((widths[index] ?? 0) / widest);
  }
  return profile;
}

/** 두 프로파일의 평균 절대 차이. 0 이면 실루엣이 같은 모양이라는 뜻이다. */
function profileDistance(a: readonly number[], b: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < PROFILE_BUCKETS; i += 1) sum += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
  return sum / PROFILE_BUCKETS;
}

/** 실루엣 바운딩 박스의 세로/가로 비. 클수록 "높고 얇다". */
function aspectRatio(key: RenderableSpriteKey): number {
  const widths = rowWidths(spriteGrid(key));
  return widths.length / Math.max(...widths);
}

// ─────────────────────────────────────────────────────────────────
describe('매핑표 — codeId ↔ 스프라이트 키가 한 파일에서 전부 맞는다', () => {
  test('codeId 가 있는 항목은 전부 정체성 표에 존재한다', () => {
    for (const entry of BATTLE_SPRITES) {
      if (entry.codeId === null) continue;
      expect(identityForCode(entry.codeId), entry.codeId).not.toBeNull();
    }
  });

  test('기지 2종만 codeId 가 없다 (PLAN 0.1 C-5: identity.ts 에 엔트리가 없다)', () => {
    const codeless = BATTLE_SPRITES.filter((entry) => entry.codeId === null).map((entry) => entry.key);
    expect(codeless).toEqual([HQ_SPRITE.key, ENEMY_BASE_SPRITE.key]);
  });

  test('렌더 대상 14키를 중복 없이 전부 덮는다', () => {
    const keys = BATTLE_SPRITES.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toHaveLength(14);
    for (const key of keys) expect(RENDERABLE_SPRITE_KEYS).toContain(key);
  });

  test('★ 순번 매핑 고정 — 이름으로 맞추면 틀리는 3건 (PLAN 0.1 C-6)', () => {
    // A-02 호가 통신원(원거리) = 원본 allyScout. "정찰"이 아니다.
    expect(ALLY_SPRITES.analyst.key).toBe('tf-ally-02');
    // A-03 락업 반장(탱커) = 원본 allyAnchor.
    expect(ALLY_SPRITES.trader.key).toBe('tf-ally-03');
    // T-01 "지지선 앵커포"는 allyAnchor 가 아니라 towerBasic 이다 — 가장 헷갈리는 자리.
    expect(TOWER_SPRITES.basic.key).toBe('tf-tower-01');
    expect(TOWER_SPRITES.basic.key).not.toBe(ALLY_SPRITES.trader.key);
  });

  test('공중 악당 2종만 공중 스프라이트를 쓴다', () => {
    expect(ENEMY_SPRITES.rumorKite.key).toBe('tf-enemy-air-01');
    expect(ENEMY_SPRITES.panicSiren.key).toBe('tf-enemy-air-02');
    expect(ENEMY_SPRITES.gapScout.key).toBe('tf-enemy-01');
  });
});

// ─────────────────────────────────────────────────────────────────
describe('진영 잉크 배타성 — 아군과 악당은 서로의 색을 한 픽셀도 쓰지 않는다', () => {
  test.each(ALLY_SIDE_KEYS.map((key) => [key] as const))('%s 는 아군 잉크만 쓴다', (key) => {
    const grid = spriteGrid(key);
    expect(inkCount(grid, ALLY_INK)).toBeGreaterThan(0);
    expect(inkCount(grid, ENEMY_INK)).toBe(0);
  });

  test.each(ENEMY_SIDE_KEYS.map((key) => [key] as const))('%s 는 악당 잉크만 쓴다', (key) => {
    const grid = spriteGrid(key);
    expect(inkCount(grid, ENEMY_INK)).toBeGreaterThan(0);
    expect(inkCount(grid, ALLY_INK)).toBe(0);
  });

  test('두 진영 잉크는 기본·색약 모드 양쪽에서 확실히 다른 색이다', () => {
    // 이 검사가 없으면 "잉크가 다르다"가 색약 모드에서 무의미해질 수 있다.
    for (const mode of ['default', 'colorblind'] as const) {
      const palette = resolvePalette(mode);
      const ally = parseHex(palette.UP_ALLY);
      const enemy = parseHex(palette.ENEMY_DOWN);
      const delta = Math.max(Math.abs(ally.r - enemy.r), Math.abs(ally.g - enemy.g), Math.abs(ally.b - enemy.b));
      expect(delta, mode).toBeGreaterThanOrEqual(100);
    }
  });
});

// ─────────────────────────────────────────────────────────────────
describe('실루엣 — 색을 완전히 지워도 유닛 8종이 서로 구별된다', () => {
  const UNIT_KEYS: readonly RenderableSpriteKey[] = [
    ...Object.values(ALLY_SPRITES).map((entry) => entry.key),
    ...Object.values(ENEMY_SPRITES).map((entry) => entry.key),
  ];

  /**
   * 실측 최소 거리 0.106 (`tf-ally-03` × `tf-enemy-02`). 임계 0.08 은 그 아래로 여유를 두되,
   * 두 실루엣이 사실상 같아지는 회귀(거리 → 0)는 확실히 잡는 값이다.
   */
  const MIN_PROFILE_DISTANCE = 0.08;

  test('전장에 나오는 8종의 실루엣이 서로 같지 않다', () => {
    for (let i = 0; i < UNIT_KEYS.length; i += 1) {
      for (let j = i + 1; j < UNIT_KEYS.length; j += 1) {
        const a = UNIT_KEYS[i] as RenderableSpriteKey;
        const b = UNIT_KEYS[j] as RenderableSpriteKey;
        expect(profileDistance(widthProfile(a), widthProfile(b)), `${a} × ${b}`).toBeGreaterThan(
          MIN_PROFILE_DISTANCE,
        );
      }
    }
  });

  test('공중 악당 2종은 지상 유닛보다 확실히 납작하다 — 레인 구분 신호', () => {
    const airFlattest = Math.max(aspectRatio('tf-enemy-air-01'), aspectRatio('tf-enemy-air-02'));
    const groundKeys: readonly RenderableSpriteKey[] = [
      'tf-ally-01',
      'tf-ally-02',
      'tf-ally-03',
      'tf-enemy-01',
      'tf-enemy-02',
      'tf-enemy-03',
    ];
    for (const key of groundKeys) {
      expect(aspectRatio(key), key).toBeGreaterThan(airFlattest);
    }
  });
});

// ─────────────────────────────────────────────────────────────────
describe('타워 3종 — 실루엣 비율이 서로 다르다 (시트 §06 "한눈에 구분")', () => {
  /**
   * ⚠️ 옛 `tower-silhouette.test.ts` 는 "T-03 살포기가 가장 뭉툭(가장 낮은 비율)"을 고정했다.
   *    그건 **새로 발명한 도형**의 성질이었고 원본 아트에는 성립하지 않는다.
   *    실측: T-01 0.643 / T-03 0.724 / T-02 1.000 — 가장 뭉툭한 것은 T-01 앵커포다.
   *    (원본이 정답이므로 테스트를 원본에 맞춘다. PLAN 공통 제약: "이식은 재해석 금지".)
   */
  test('공시 리피터(T-02)가 가장 높고 얇다', () => {
    const repeater = aspectRatio(TOWER_SPRITES.antiair.key);
    expect(repeater).toBeGreaterThan(aspectRatio(TOWER_SPRITES.basic.key));
    expect(repeater).toBeGreaterThan(aspectRatio(TOWER_SPRITES.splash.key));
  });

  test('지지선 앵커포(T-01)가 가장 낮고 넓다', () => {
    const anchor = aspectRatio(TOWER_SPRITES.basic.key);
    expect(anchor).toBeLessThan(aspectRatio(TOWER_SPRITES.splash.key));
    expect(anchor).toBeLessThan(aspectRatio(TOWER_SPRITES.antiair.key));
  });

  test('세 실루엣이 서로 다른 폭 프로파일을 가진다', () => {
    const kinds = ['basic', 'antiair', 'splash'] as const;
    for (let i = 0; i < kinds.length; i += 1) {
      for (let j = i + 1; j < kinds.length; j += 1) {
        const a = TOWER_SPRITES[kinds[i] as (typeof kinds)[number]].key;
        const b = TOWER_SPRITES[kinds[j] as (typeof kinds)[number]].key;
        expect(profileDistance(widthProfile(a), widthProfile(b)), `${a} × ${b}`).toBeGreaterThan(0.05);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────
describe('enemyKindForId — 종류 필드 없는 적을 결정적으로 고른다', () => {
  test('id가 다르면 다른 종류가 나오고, 같은 id는 항상 같은 종류다', () => {
    expect(enemyKindForId('ground', 0)).not.toBe(enemyKindForId('ground', 1));
    expect(enemyKindForId('ground', 7)).toBe(enemyKindForId('ground', 7));
    expect(enemyKindForId('air', 0)).not.toBe(enemyKindForId('air', 1));
  });

  test('음수 id도 유효한 종류로 접힌다(크래시 방지)', () => {
    expect(enemyKindForId('ground', -5)).toBeTruthy();
    expect(enemyKindForId('air', -1)).toBeTruthy();
  });

  test('공중 레인은 공중 스프라이트만 고른다', () => {
    for (let id = 0; id < 8; id += 1) {
      expect(ENEMY_SPRITES[enemyKindForId('air', id)].key).toMatch(/^tf-enemy-air-/);
    }
  });
});
