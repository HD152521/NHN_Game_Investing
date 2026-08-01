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
 * 네 값 모두 디자인 원본(`ticker-front-sprites.js` 의 `MAP.cb`)에 **명시**되어 있습니다.
 *   cb: { up: '#FFB000', 'up-deep': '#B37A00', down: '#0072B2', 'down-deep': '#004E7A' }
 * 이전에는 음영 두 개를 "문서에 없다"고 보고 ×0.6 으로 파생했지만, 그것은 추측이
 * 명시값을 덮은 것이었습니다(실제 비율은 약 0.70). 원본값으로 되돌렸습니다.
 */
export const COLORBLIND_OVERRIDES = {
  /** 앰버 — 디자인 원본 `MAP.cb.up` */
  UP_ALLY: '#FFB000',
  /** 앰버 음영 — 디자인 원본 `MAP.cb['up-deep']` 명시값 */
  UP_DEEP: '#B37A00',
  /** 딥 블루 — 디자인 원본 `MAP.cb.down` */
  ENEMY_DOWN: '#0072B2',
  /** 딥 블루 음영 — 디자인 원본 `MAP.cb['down-deep']` 명시값 */
  ENEMY_DEEP: '#004E7A',
} as const satisfies Partial<Record<PaletteToken, HexColor>>;
