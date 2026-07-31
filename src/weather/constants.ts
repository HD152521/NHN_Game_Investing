/**
 * 날씨 판정 임계값 — 아트-프로덕션시트 v1.1 §03 WEATHER FX.
 *
 * ★ "날씨는 분위기가 아니라 시장 상태 표시다."
 *   따라서 여기 있는 숫자는 연출 취향이 아니라 **게임 정보의 눈금**이다.
 *   값을 바꾸면 플레이어가 읽는 시장 신호 자체가 바뀐다.
 *
 * 매직넘버를 판정·렌더 코드에 직접 쓰지 말고 전부 이 파일(판정)과
 * 각 `draw-weather-*.ts`(연출 수치)의 명명 상수로 관리한다.
 */

/**
 * z 계산의 분모 하한(%).
 *
 * σ30은 `src/market/stats.ts`에서 이미 `SIGMA_FLOOR_PCT`(0.01)로 잘려 나오지만,
 * 그 하한은 손익 z-score용이라 날씨에 쓰기엔 너무 낮다 — 0.01%짜리 σ에서는
 * 0.05% 흔들림만으로 z=5가 되어 무변동 구간에 폭우가 쏟아진다.
 * 날씨용으로는 더 보수적인 하한을 따로 둔다.
 */
export const Z_SIGMA_FLOOR_PCT = 0.05;

/** 방향성 날씨(WX-01/WX-02)가 시작되는 |z| 임계. 이 미만은 '맑음'. */
export const DIRECTIONAL_MIN_Z = 1;

/** |z|가 이 값에 도달하면 강도가 1(최대)로 포화한다. */
export const DIRECTIONAL_FULL_Z = 4;

/** WX-03 횡보 안개 판정: σ30이 이 값(%) 이하면 변동성이 죽은 것으로 본다. */
export const FOG_MAX_SIGMA_PCT = 0.6;

/** σ30이 이 값(%) 이하로 내려가면 안개 강도가 1이 된다. */
export const FOG_FULL_SIGMA_PCT = 0.1;

/**
 * 안개 판정에 허용되는 최대 절대 등락률(%).
 *
 * σ가 죽었더라도 실제로 크게 움직였다면 그건 안개가 아니라 폭우/상승기류다.
 * 이 가드가 없으면 σ 하한 때문에 z가 폭주해 판정이 뒤집힌다.
 */
export const FOG_MAX_ABS_CHANGE_PCT = 0.5;

/** `MarketEvent` 1건이 전장 날씨를 지배하는 시간(ms). */
export const EVENT_WINDOW_MS = 30_000;

/**
 * 시장 이벤트가 활성인 동안 보장되는 최소 강도.
 *
 * 이벤트(FR-7 패닉 셀 / FOMO 랠리)는 차트 지표보다 먼저 확정된 '사건'이므로,
 * 지표가 아직 따라오지 않았어도 전장에서는 확실히 읽혀야 한다.
 */
export const EVENT_INTENSITY_FLOOR = 0.6;

/** WX-04 정전이 유지되는 최대 프레임 수 (시트 03: "3프레임 이내로 짧게"). */
export const BLACKOUT_MAX_FRAMES = 3;

/** WX-04 스캔라인 줄 수 (시트 03: "굵은 스캔라인 두 줄"). */
export const BLACKOUT_SCANLINE_COUNT = 2;

/** WX-03 안개 띠 겹 수 (시트 03: "무채색 안개 띠 두 겹"). */
export const FOG_BAND_COUNT = 2;
