/**
 * 엔티티 정체성 데이터 레이어 (아트 프로덕션 시트 v1.1 §04·05·06·07).
 *
 * ★ 왜 이 파일이 따로 있는가 ★
 * 코드의 `intern`/`runner` 같은 **기능 이름**만으로는 "이름을 지우고 오크로 바꿔도
 * 규칙이 같다"는 비판을 벗어나지 못한다. 표시 이름·정체 한 줄·실루엣 분류를 **데이터로**
 * 한곳에 모아, 렌더러와 UI가 문자열을 각자 하드코딩하지 않고 여기서 읽게 한다.
 *
 * ⚠️ 이 파일에는 **밸런스 수치를 넣지 않는다.** 비용·HP·피해량의 단일 출처는
 * `constants.ts`다. 정체성과 수치를 한 객체에 합치면 밸런스 조정이 아트 데이터를
 * 건드리게 되고, 두 값이 조용히 어긋난다.
 *
 * 실루엣은 하드코딩하지 않고 `src/design`의 이중 인코딩 테이블(`silhouetteShapeFor`)에서
 * 파생한다 — 아군=원형 / 악당=각형은 색약 모드에서 진영을 가르는 유일한 신호이므로
 * (시트 00), 차트 색 인코딩과 구조적으로 갈라질 수 없어야 한다.
 */

import { silhouetteShapeFor } from '../design';
import type { Faction, SilhouetteShape } from '../design';
import { WAVE_COUNT } from './constants';
import type { EnemyKind, Lane, TowerKind, UnitKind } from './types';

/** 시트의 자산 코드(`A-01`, `E-04`, `T-02`, `B-03`). 아트 발주서와 코드를 잇는 열쇠다. */
export type EntityCode = string;

export interface EntityIdentity {
  /** 시트 자산 코드. 아트 파일명·발주서와 1:1로 대응한다. */
  readonly codeId: EntityCode;
  /** 플레이어에게 보이는 이름. UI는 반드시 이 값을 쓴다. */
  readonly displayName: string;
  /** 진영 — 실루엣과 색 인코딩의 출처. */
  readonly faction: Faction;
  /** 전술 역할 한 단어(근거리·탱커·속공 …). */
  readonly role: string;
  /** 정체 한 줄. hover/focus로 플레이어에게 닿는 유일한 경로다. */
  readonly flavor: string;
  /** 원형(아군) / 각형(악당). `src/design` 인코딩에서 파생된다. */
  readonly silhouette: SilhouetteShape;
}

/** 타워는 "무엇을 잡는가"가 이름만큼 중요하다(공중은 대공 포대로만 잡힌다, FR-6.2). */
export interface TowerIdentity extends EntityIdentity {
  readonly laneLabel: string;
}

export interface EnemyIdentity extends EntityIdentity {
  readonly lane: Lane;
}

export interface BossIdentity extends EntityIdentity {
  /** 등장 웨이브(1-based). 시트 §07 B-03. */
  readonly appearWave: number;
}

/**
 * 악당 종류. **정의는 계약 파일(`types.ts`)이 소유한다** — 종류가 스폰 시점에 개체 스탯을
 * 정하게 되면서(속공/방패/탱커/정찰/광역이 실제로 다른 적이 됐다) 시뮬레이션과 렌더러가
 * 함께 보는 사실이 됐기 때문이다. 여기서는 정체성 데이터와 같이 쓰라고 재수출만 한다.
 */
export type { EnemyKind } from './types';

export const ENEMY_KINDS: readonly EnemyKind[] = [
  'gapScout',
  'marginEnforcer',
  'liquidationDigger',
  'rumorKite',
  'panicSiren',
];

const ALLY_SHAPE = silhouetteShapeFor('ally');
const ENEMY_SHAPE = silhouetteShapeFor('enemy');

// ── §04 아군 3종 — "장 마감 후에도 남은 사람들" ────────────────────
export const ALLY_IDENTITY: Readonly<Record<UnitKind, EntityIdentity>> = {
  intern: {
    codeId: 'A-01',
    displayName: '개장벨 사환',
    faction: 'ally',
    role: '근거리',
    flavor: '놋쇠 개장벨을 뒤집어 쓴 최말단 사환 — 값싸고 많고 제일 먼저 죽는다.',
    silhouette: ALLY_SHAPE,
  },
  analyst: {
    codeId: 'A-02',
    displayName: '호가 통신원',
    faction: 'ally',
    role: '원거리',
    flavor: '티커테이프 릴을 짊어진 신호수 — 풀린 테이프 길이만큼 멀리서 쏜다.',
    silhouette: ALLY_SHAPE,
  },
  trader: {
    codeId: 'A-03',
    displayName: '락업 반장',
    faction: 'ally',
    role: '탱커',
    flavor: '뜯어온 금고문을 방패로 든 반장 — 밀려도 팔지 않는다.',
    silhouette: ALLY_SHAPE,
  },
};

// ── §05 베어 세력 — "얼굴 없는 하락 압력" ──────────────────────────
export const ENEMY_IDENTITY: Readonly<Record<EnemyKind, EnemyIdentity>> = {
  gapScout: {
    codeId: 'E-01',
    displayName: '갭하락 첨병',
    faction: 'enemy',
    role: '속공',
    flavor: '후드 안이 검은 공백인 창병 — 장이 열리자마자 아래로 꽂힌다.',
    silhouette: ENEMY_SHAPE,
    lane: 'ground',
  },
  marginEnforcer: {
    codeId: 'E-02',
    displayName: '반대매매 집행관',
    faction: 'enemy',
    role: '방패',
    flavor: '장부 방패와 봉인 망치 — 담보가 모자라면 대신 팔아치운다.',
    silhouette: ENEMY_SHAPE,
    lane: 'ground',
  },
  liquidationDigger: {
    codeId: 'E-03',
    displayName: '청산 굴착기',
    faction: 'enemy',
    role: '탱커',
    flavor: '사람보다 장비에 가깝다 — 굴착 암으로 바닥을 더 파낸다.',
    silhouette: ENEMY_SHAPE,
    lane: 'ground',
  },
  rumorKite: {
    codeId: 'E-04',
    displayName: '루머 연',
    faction: 'enemy',
    role: '정찰',
    flavor: '누가 띄웠는지 모르는 각진 연 — 찌라시를 발라 상공을 훑는다.',
    silhouette: ENEMY_SHAPE,
    lane: 'air',
  },
  panicSiren: {
    codeId: 'E-05',
    displayName: '패닉 사이렌',
    faction: 'enemy',
    role: '광역',
    flavor: '뒤집힌 확성기 셋이 프로펠러처럼 돈다 — 아래로 공포를 떨군다.',
    silhouette: ENEMY_SHAPE,
    lane: 'air',
  },
};

// ── §06 타워 3종 ─────────────────────────────────────────────────
export const TOWER_IDENTITY: Readonly<Record<TowerKind, TowerIdentity>> = {
  basic: {
    codeId: 'T-01',
    displayName: '지지선 앵커포',
    faction: 'ally',
    role: '단일',
    flavor: '쐐기 두 개를 지면에 박아 고정한 단발 포 — 지지선은 여기서 지킨다.',
    silhouette: ALLY_SHAPE,
    laneLabel: '지상',
  },
  antiair: {
    codeId: 'T-02',
    displayName: '공시 리피터',
    faction: 'ally',
    role: '대공',
    flavor: '위로 세운 3연 수직 발사관 — 떠다니는 소문만 골라 때린다.',
    silhouette: ALLY_SHAPE,
    laneLabel: '공중',
  },
  splash: {
    codeId: 'T-03',
    displayName: '물타기 살포기',
    faction: 'ally',
    role: '광역',
    flavor: '나팔처럼 벌어진 광구 박격포 — 넓게 뿌려 평단을 낮춘다.',
    silhouette: ALLY_SHAPE,
    laneLabel: '지상·범위',
  },
};

// ── §07 보스 ─────────────────────────────────────────────────────
export const BOSS_IDENTITY: BossIdentity = {
  codeId: 'B-03',
  displayName: '마진콜 심판관',
  faction: 'enemy',
  role: '보스',
  flavor: '한 팔은 하강 차트날, 다른 손엔 압류 도장 — 유예는 없다.',
  silhouette: ENEMY_SHAPE,
  /** 시트 §07: "13웨이브 등장" = 마지막 웨이브. 숫자를 다시 적지 않고 상수를 쓴다. */
  appearWave: WAVE_COUNT,
};

/** 전체 정체성 목록(아군 → 악당 → 타워 → 보스). 검증·디버그 화면용. */
export function allIdentities(): readonly EntityIdentity[] {
  return [
    ...Object.values(ALLY_IDENTITY),
    ...Object.values(ENEMY_IDENTITY),
    ...Object.values(TOWER_IDENTITY),
    BOSS_IDENTITY,
  ];
}

/** 시트 자산 코드 → 정체성. 아트 파일명에서 코드만 떼어 역조회할 때 쓴다. */
export const IDENTITY_BY_CODE: Readonly<Record<EntityCode, EntityIdentity>> = Object.freeze(
  Object.fromEntries(allIdentities().map((identity) => [identity.codeId, identity])),
);

export function identityForCode(code: EntityCode): EntityIdentity | null {
  return IDENTITY_BY_CODE[code] ?? null;
}

/**
 * 레인별 악당 종류. `Enemy`에 종류가 실리지 않으므로, 렌더러가 "이 레인에 나올 수 있는
 * 실루엣"을 고를 때 쓰는 목록이다.
 */
export function enemyKindsForLane(lane: Lane): readonly EnemyKind[] {
  return ENEMY_KINDS.filter((kind) => ENEMY_IDENTITY[kind].lane === lane);
}
