import type { Rgba } from './types.js';

/** RGBA 픽셀 한 개가 차지하는 바이트 수. */
export const PIXEL_STRIDE = 4;

/** 아트가이드 R2 — 키잉 대상 배경색 #FF00FF. */
export const MAGENTA: Rgba = { r: 255, g: 0, b: 255, a: 255 };

/**
 * 배경 판정 허용 오차 (채널별 최대 편차, Chebyshev 거리).
 * JPEG 재압축이나 모델 디더링으로 생긴 미세한 색 흔들림을 흡수합니다.
 * 흰색(255,255,255)은 G 채널 거리가 255라 이 값과 무관하게 안전합니다.
 */
export const DEFAULT_KEY_TOLERANCE = 32;

/**
 * 프린지(안티에일리어싱 혼색) 탐색 반경.
 * 배경 픽셀로부터 이 반경 안에 있는 피사체 픽셀만 부분 알파 + 디스필 처리합니다.
 */
export const DEFAULT_FRINGE_RADIUS = 2;

/**
 * 프린지로 인정할 최소 마젠타 성분(0~1).
 * 이보다 낮으면 원래 피사체 색으로 보고 알파를 깎지 않습니다.
 */
export const DEFAULT_FRINGE_MIN_SPILL = 0.05;

/** 이 값 이상의 알파를 "불투명"으로 간주 (히스토그램·바운딩박스·잔여검사 공통). */
export const OPAQUE_ALPHA_THRESHOLD = 8;

/** 라인업 분할 시 피사체 사이 공백으로 인정할 최소 열 수. */
export const DEFAULT_MIN_GAP = 4;

/** 라인업 분할 시 노이즈가 아닌 피사체로 인정할 최소 폭/높이. */
export const DEFAULT_MIN_SEGMENT_SIZE = 4;

/** baseline 정렬 캔버스의 상하 여백(px). */
export const DEFAULT_BASELINE_PADDING = 2;

/** PART 6 체크 3번 — 실루엣 판정용 축소 프리뷰 한 변 크기. */
export const PREVIEW_CELL_SIZE = 64;

/** 프리뷰 시트 한 줄에 들어가는 셀 수. */
export const PREVIEW_COLUMNS = 8;

/** 아틀라스 프레임 사이 여백(px). 샘플링 시 이웃 프레임 색이 새는 것을 막습니다. */
export const ATLAS_PADDING = 2;

/** 아틀라스 최대 가로 폭. 초과하면 다음 선반(shelf)으로 내려갑니다. */
export const DEFAULT_MAX_ATLAS_WIDTH = 2048;

/**
 * 산출물 마젠타 잔여 검사 허용 오차.
 * 키잉 허용 오차보다 넉넉하게 잡아 "거의 마젠타"인 픽셀도 잡아냅니다.
 */
export const RESIDUE_TOLERANCE = 48;

/** 매니페스트 스키마 버전. 런타임 로더가 호환성 판단에 씁니다. */
export const MANIFEST_VERSION = 1;
