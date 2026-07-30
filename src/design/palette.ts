/**
 * TICKER FRONT 팔레트 — 아트가이드 §1.3 의 단일 소스.
 *
 * ★ 이 파일은 프로젝트에서 생짜 HEX 리터럴이 허용되는 유일한 곳입니다.
 *   (`no-hardcoded-hex.test.ts` 가 나머지 소스를 스캔해 강제합니다.)
 *
 * 설계 의도 (§1.3):
 *   하락 = 파랑 = 적군 / 상승 = 빨강 = 아군.
 *   차트 색과 진영 색이 **같은 토큰**을 참조하므로, 차트에 파란 캔들이 길게 뜨는 것이
 *   곧 "파란 적군이 강해진다"는 게임 정보가 됩니다.
 *   → UP_ALLY / ENEMY_DOWN 을 차트용·진영용으로 쪼개지 마세요. 이 설계가 무너집니다.
 */

export type HexColor = `#${string}`;

/** 아트가이드 §1.3 팔레트 표 (12토큰). */
export const BASE_PALETTE = {
  /** 최심층 배경(하늘·우주) */
  BG_0: '#070A12',
  /** 중경 건물 */
  BG_1: '#0F1524',
  /** 근경·지면 */
  BG_2: '#1A2236',
  /** 외곽선 (거의 검정) */
  LINE: '#05070C',
  /** 상승, 아군 유닛·타워, 내 사옥 */
  UP_ALLY: '#FF4D5A',
  /** 아군 음영 */
  UP_DEEP: '#B32330',
  /** 하락, 베어 세력 */
  ENEMY_DOWN: '#2E86FF',
  /** 적군 음영 */
  ENEMY_DEEP: '#1A4E9E',
  /** 골드 재화, 강조 */
  GOLD: '#FFC53D',
  /** 운용자금 (골드와 확실히 구분) */
  AUM: '#9B6BFF',
  /** 본문 */
  TEXT: '#E8ECF4',
  /** 보조 텍스트, 비활성 */
  MUTED: '#7C89A3',
} as const satisfies Record<string, HexColor>;

export type PaletteToken = keyof typeof BASE_PALETTE;

export const PALETTE_TOKENS = Object.keys(BASE_PALETTE) as readonly PaletteToken[];

/**
 * 색약 모드 오버라이드 (아트가이드 §1.3 색약 표 / PRD FR-13.1).
 *
 * UP / DOWN 두 개만 문서에 명시되어 있습니다. 음영 토큰(UP_DEEP / ENEMY_DEEP)까지
 * 함께 바꾸지 않으면 앰버 본체에 크림슨 음영이 붙어 셰이딩이 깨지므로,
 * 기본 팔레트의 base→deep 채널 비율(약 0.6)을 그대로 적용해 파생했습니다.
 */
export const COLORBLIND_OVERRIDES = {
  /** 앰버 — 아트가이드 색약 표 */
  UP_ALLY: '#FFB000',
  /** #FFB000 × 0.6 (base→deep 비율 유지, 파생값) */
  UP_DEEP: '#996A00',
  /** 딥 블루 — 아트가이드 색약 표 */
  ENEMY_DOWN: '#0072B2',
  /** #0072B2 × 0.6 (base→deep 비율 유지, 파생값) */
  ENEMY_DEEP: '#00446B',
} as const satisfies Partial<Record<PaletteToken, HexColor>>;
