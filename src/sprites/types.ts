/**
 * 스프라이트 생성기의 파라미터 타입.
 *
 * ★ 원본 키 43개는 이 함수들의 **별칭**일 뿐이다. 예를 들어 `tf-gnd-r2-s2`(R2 지역의
 *   균열 발판) 같은 키는 원본에 존재하지 않지만, `ground(2, 2)` 로 만들 수 있다.
 *   그러므로 43키를 상수로 굳히지 말고 파라메트릭 함수를 그대로 노출한다.
 */

/** 지역 1~3. 원본 `bgFar(region)` / `bgMid(region)` / `ground(region, state)` */
export type Region = 1 | 2 | 3;

/** 발판 상태 — 1 정상 / 2 균열 / 3 함몰. 원본 `ground(region, state)` */
export type GroundState = 1 | 2 | 3;

/** 날씨 4종. 원본 `weather(kind)` */
export type WeatherKind = 1 | 2 | 3 | 4;

/** 스킬 FX 3종. 원본 `fx(kind)` */
export type FxKind = 1 | 2 | 3;

/** 발사체 4종. 원본 `proj(kind)` */
export type ProjKind = 1 | 2 | 3 | 4;
