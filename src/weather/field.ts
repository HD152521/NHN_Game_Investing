/**
 * 광선·입자 버퍼 — **한 번만 할당하고 영원히 재사용한다.**
 *
 * PRD §11: 유닛 60체 + 타워 8기에서 60 FPS. 날씨가 그 예산을 먹으면 안 되므로
 * 프레임마다 입자 배열을 만들지 않는다. 대신 슬롯별 고정 시드만 들고 있다가,
 * 매 프레임 위치를 `시드 + 시각`으로 **계산**한다 (상태 갱신도, 할당도 없음).
 *
 * ★ 여기 있는 `Float32Array`는 생성 이후 절대 쓰지 않는다(read-only 취급).
 *   슬롯에 상태를 저장하기 시작하면 렌더가 순서 의존적이 되어 테스트가 무너진다.
 */

/**
 * 선할당 슬롯 수. 날씨 4종이 이 버퍼를 공유하며, 종류별 최대치는 각 렌더러 상수가 정한다.
 * 1920×1080에서 폭우가 가장 많이 쓰며(48), 여유를 둬 64로 잡는다.
 */
export const FIELD_SLOT_COUNT = 64;

export interface WeatherField {
  /** 슬롯별 가로 위치 시드(0~1). */
  readonly seed: Float32Array;
  /** 슬롯별 낙하/상승 속도 배수(0.6~1.4). 전부 같은 속도면 줄무늬처럼 보인다. */
  readonly speed: Float32Array;
  /** 슬롯별 길이 배수(0.5~1.0). */
  readonly length: Float32Array;
}

/** 정수 → 0~1 결정적 해시. 시드 RNG 없이 같은 배치를 재현하려고 sin 해시를 쓴다. */
function hash01(index: number, salt: number): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

/** 속도 배수 하한 / 폭. */
const SPEED_MIN = 0.6;
const SPEED_SPAN = 0.8;
/** 길이 배수 하한 / 폭. */
const LENGTH_MIN = 0.5;
const LENGTH_SPAN = 0.5;

/** 버퍼를 한 번 만든다. 앱 수명 동안 한 개만 존재하면 된다. */
export function createWeatherField(): WeatherField {
  const seed = new Float32Array(FIELD_SLOT_COUNT);
  const speed = new Float32Array(FIELD_SLOT_COUNT);
  const length = new Float32Array(FIELD_SLOT_COUNT);

  for (let i = 0; i < FIELD_SLOT_COUNT; i += 1) {
    seed[i] = hash01(i + 1, 1);
    speed[i] = SPEED_MIN + hash01(i + 1, 2) * SPEED_SPAN;
    length[i] = LENGTH_MIN + hash01(i + 1, 3) * LENGTH_SPAN;
  }

  return { seed, speed, length };
}

/** 슬롯 시드. 범위 밖이면 0 (`noUncheckedIndexedAccess` 대응 + 크래시 방지). */
export function slotSeed(field: WeatherField, index: number): number {
  return field.seed[index] ?? 0;
}

/** 슬롯 속도 배수. 범위 밖이면 1. */
export function slotSpeed(field: WeatherField, index: number): number {
  return field.speed[index] ?? 1;
}

/** 슬롯 길이 배수. 범위 밖이면 1. */
export function slotLength(field: WeatherField, index: number): number {
  return field.length[index] ?? 1;
}

/**
 * 시각 → 0~1 위상.
 *
 * @param periodMs 1주기 길이(ms). 0 이하이면 위상을 0으로 고정한다(정지).
 * @param offset   슬롯별 위상 오프셋(0~1).
 * @param speed    슬롯별 속도 배수.
 */
export function fieldPhase(timeMs: number, periodMs: number, offset: number, speed: number): number {
  if (periodMs <= 0 || !Number.isFinite(timeMs)) return offset - Math.floor(offset);
  const raw = (timeMs * speed) / periodMs + offset;
  return raw - Math.floor(raw);
}

/**
 * 강도(0~1) → 실제로 그릴 개수.
 *
 * 강도가 0이면 0개(아예 안 그림), 0보다 크면 최소 개수는 보장한다 —
 * 임계를 갓 넘긴 순간에 입자가 1~2개만 흩날리면 날씨로 읽히지 않는다.
 */
export function activeCount(intensity: number, max: number, min: number): number {
  if (intensity <= 0) return 0;
  const scaled = Math.round(max * intensity);
  return Math.min(max, Math.max(min, scaled));
}
