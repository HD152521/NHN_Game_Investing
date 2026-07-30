/**
 * 색과 무관한 이중 인코딩 (아트가이드 §1.3 마지막 문단 / PRD FR-13.1).
 *
 * 색을 아예 못 보는 상황에서도 플레이가 되도록, 방향·진영마다
 *   - `▲` / `▼` 기호
 *   - 캔들 채움 / 빈칸
 *   - 원형 / 각진 실루엣
 * 을 색과 독립적으로 제공합니다.
 *
 * `encodeDirection` 과 `encodeFaction` 은 같은 토큰 테이블을 통과하므로
 * 차트 색과 진영 색은 구조적으로 절대 갈라지지 않습니다 (§1.3 설계 의도).
 */

import type { HexColor, PaletteToken } from './palette';
import type { ColorTheme } from './theme';

export type Direction = 'up' | 'down';
export type Faction = 'ally' | 'enemy';
/** 캔들 몸통 표현: 채움 / 빈칸 */
export type CandleFill = 'filled' | 'hollow';
/** 실루엣 형태: 아군=원형, 적군=각짐 */
export type SilhouetteShape = 'rounded' | 'angular';

export interface DirectionEncoding {
  readonly direction: Direction;
  readonly faction: Faction;
  /** 차트와 진영이 공유하는 팔레트 토큰 */
  readonly token: PaletteToken;
  readonly deepToken: PaletteToken;
  readonly color: HexColor;
  readonly deepColor: HexColor;
  readonly symbol: string;
  readonly candleFill: CandleFill;
  readonly shape: SilhouetteShape;
}

interface EncodingSpec {
  readonly direction: Direction;
  readonly faction: Faction;
  readonly token: PaletteToken;
  readonly deepToken: PaletteToken;
  readonly symbol: string;
  readonly candleFill: CandleFill;
  readonly shape: SilhouetteShape;
}

/**
 * 방향 하나가 색·기호·채움·형태를 모두 결정하는 단일 테이블.
 *
 * 채움 규칙 판단: 국내 차트 관습(양봉=속 찬 빨강 / 음봉=빈 파랑)을 따라
 * 상승=filled, 하락=hollow 로 고정했습니다. 아트가이드는 "채움/빈칸 구분"만
 * 요구하고 방향을 지정하지 않았습니다.
 */
const ENCODING_BY_DIRECTION: Readonly<Record<Direction, EncodingSpec>> = {
  up: {
    direction: 'up',
    faction: 'ally',
    token: 'UP_ALLY',
    deepToken: 'UP_DEEP',
    symbol: '▲',
    candleFill: 'filled',
    shape: 'rounded',
  },
  down: {
    direction: 'down',
    faction: 'enemy',
    token: 'ENEMY_DOWN',
    deepToken: 'ENEMY_DEEP',
    symbol: '▼',
    candleFill: 'hollow',
    shape: 'angular',
  },
};

const DIRECTION_BY_FACTION: Readonly<Record<Faction, Direction>> = {
  ally: 'up',
  enemy: 'down',
};

/** 상승=아군 / 하락=적군 (§1.3 결정) */
export function factionForDirection(direction: Direction): Faction {
  return ENCODING_BY_DIRECTION[direction].faction;
}

export function directionForFaction(faction: Faction): Direction {
  return DIRECTION_BY_FACTION[faction];
}

/** 색 없이 조회 가능한 기호 (`▲` / `▼`) */
export function directionSymbol(direction: Direction): string {
  return ENCODING_BY_DIRECTION[direction].symbol;
}

/** 색 없이 조회 가능한 캔들 채움 여부 */
export function candleFillFor(direction: Direction): CandleFill {
  return ENCODING_BY_DIRECTION[direction].candleFill;
}

/** 색 없이 조회 가능한 실루엣 형태 */
export function silhouetteShapeFor(faction: Faction): SilhouetteShape {
  return ENCODING_BY_DIRECTION[directionForFaction(faction)].shape;
}

/** 방향 하나로 색·기호·채움·형태를 일관되게 조회합니다. */
export function encodeDirection(direction: Direction, theme: ColorTheme): DirectionEncoding {
  const spec = ENCODING_BY_DIRECTION[direction];
  return {
    ...spec,
    color: theme.palette[spec.token],
    deepColor: theme.palette[spec.deepToken],
  };
}

/** 진영으로 조회해도 같은 토큰을 통과하므로 결과가 완전히 동일합니다. */
export function encodeFaction(faction: Faction, theme: ColorTheme): DirectionEncoding {
  return encodeDirection(directionForFaction(faction), theme);
}
