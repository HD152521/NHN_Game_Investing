/**
 * 사운드 시스템 공용 타입 — **판정과 재생을 잇는 계약** (PRD §3.1 ⑬ 설정).
 *
 * ★ 이 파일은 `src/combat/types.ts`·`src/weather/types.ts`와 같은 자리다 ★
 * "무엇을 언제 울릴지"를 정하는 순수 판정층(`events.ts`·`throttle.ts`)과 실제로 소리를
 * 내는 얇은 재생층(`engine.ts`)이 이 파일만 보고 서로를 몰라도 되게 한다.
 * **구현 세부(AudioContext·노드 그래프)를 여기에 넣지 마라.**
 *
 * ★ 왜 오디오 파일이 없는가 ★
 * 이 프로젝트는 스프라이트를 **코드로 그린다**(`src/sprites`의 문자 그리드). 소리도 같은
 * 규율을 따라 **파형을 합성한다**: ① 라이선스 관리가 없고 ② 번들이 늘지 않고
 * ③ 팔레트 토큰처럼 파라미터로 조율되며 ④ 색약 모드처럼 접근성 설정과 엮기 쉽다.
 *
 * ★ 톤 ★ 파이낸셜 느와르다. 화려한 게임 효과음이 아니라 **트레이딩 터미널의 건조한
 * 신호음**에 가깝게 — 짧고, 저음 위주로, 과하지 않게.
 *
 * ⚠️ **소리는 보조 채널이다.** 소리가 하나도 나지 않아도 게임은 완전히 플레이 가능해야
 * 한다(지금 그렇다 — 깨지 마라). 그래서 이 모듈의 모든 실패는 **무음**으로 수렴한다.
 */

/**
 * 합성 파형. `noise`만 오실레이터가 아니라 화이트노이즈 버퍼다.
 *
 * 이 다섯이면 필요한 소리가 전부 나온다 — 늘리기 전에 기존 조합으로 안 되는지 먼저 봐라.
 */
export type Waveform = 'sine' | 'square' | 'sawtooth' | 'triangle' | 'noise';

/**
 * 연타 억제 그룹. 지금은 **분류 표시**이고 상한은 소리별 `minGapMs`가 건다.
 *
 * 채널을 판정에 쓰지 않는 이유: 같은 채널 안에서도 성격이 크게 다르다(타워 발사는 초당
 * 수십 회, 본진 피격은 드물지만 반드시 들려야 한다). 채널 단위로 묶어 막으면 드문 소리가
 * 잦은 소리에 막힌다.
 */
export type SoundChannel = 'trade' | 'build' | 'combat' | 'skill' | 'flow';

/**
 * 이 게임이 내는 소리 전부.
 *
 * ★ 이벤트가 아니라 **소리**의 목록이다 ★ 여러 이벤트가 같은 소리로 모일 수 있다
 * (`soundForEvent`가 그 매핑을 소유한다).
 */
export type GameSoundId =
  // ── 매매 (FR-5) ──
  | 'trade-open'
  | 'trade-add'
  | 'trade-close-profit'
  | 'trade-close-loss'
  | 'trade-liquidated'
  // ── 편성 (FR-6.4·6.5) ──
  | 'tower-build'
  | 'tower-upgrade'
  | 'unit-summon'
  // ── 전투 (FR-6) ──
  | 'tower-fire'
  | 'enemy-down'
  | 'boss-down'
  | 'base-hit'
  // ── 스킬 (FR-6.6) ──
  | 'skill-bomb'
  | 'skill-heal'
  | 'skill-shield'
  // ── 흐름 ──
  | 'wave-start'
  | 'boss-appear'
  | 'prep-tick'
  | 'stage-cleared'
  | 'stage-defeated';

/** 레이어 하나에 거는 필터. 노이즈를 "쉬익"이 아니라 "탁"으로 만드는 데 쓴다. */
export interface SoundFilter {
  readonly type: 'lowpass' | 'highpass';
  readonly hz: number;
}

/**
 * 소리 한 겹.
 *
 * 주파수는 `startHz` → `endHz`로 선형 이동한다(같으면 고정음). 진폭은 짧은 어택 뒤
 * 지수 감쇠다 — 클릭 노이즈를 피하면서도 타악기처럼 끊기게 하려는 것이다.
 */
export interface SoundLayer {
  readonly wave: Waveform;
  /** 시작 주파수(Hz). `noise`에서는 필터 컷오프의 기준으로만 쓰이지 않고 무시된다. */
  readonly startHz: number;
  /** 끝 주파수(Hz). `startHz`와 같으면 고정음이다. */
  readonly endHz: number;
  /** 큐 시작 기준 지연(ms). 여러 겹을 어긋나게 쌓아 화음·연타를 만든다. */
  readonly startMs: number;
  readonly durationMs: number;
  /** 레이어 상대 진폭(0~1). 마스터 볼륨 × 소리 볼륨에 다시 곱해진다. */
  readonly gain: number;
  readonly filter?: SoundFilter;
}

/**
 * 소리 1종의 완전한 정의.
 *
 * ★ 단일 출처 ★ 파형·연타 간격·상대 볼륨·우선순위가 전부 여기 있다. 재생층은 이 값을
 * 해석만 하고, 판정층은 이 값을 읽어 통과 여부만 정한다. 어느 쪽도 자기 표를 따로 갖지 않는다.
 */
export interface SoundSpec {
  readonly id: GameSoundId;
  /** 사람이 읽는 이름. 테스트 실패 메시지와 문서에 쓴다. */
  readonly label: string;
  readonly channel: SoundChannel;
  readonly layers: readonly SoundLayer[];
  /**
   * 같은 소리의 최소 간격(ms). **연타 억제의 핵심 파라미터다.**
   *
   * 근거는 `catalog.ts`의 각 항목 주석에 있다 — 값만 고치지 말고 근거를 같이 고쳐라.
   */
  readonly minGapMs: number;
  /** 소리별 상대 볼륨(0~1). 마스터 볼륨에 곱한다. */
  readonly volume: number;
  /**
   * 동시 재생 상한에 걸렸을 때의 서열. **높을수록 살아남는다.**
   *
   * 타워 발사(1)가 본진 피격(5)이나 보스 등장(6)을 밀어내면 안 된다 —
   * 잦은 소리가 드물고 중요한 소리를 가리는 것이 연타 문제의 본질이다.
   */
  readonly priority: number;
}

// ── 게임 이벤트 ────────────────────────────────────────────────────

/**
 * 청산 사유. `src/position`의 `CloseReason`과 **문자열까지 같다**(아래 주석의 이유로
 * import는 하지 않는다). 밑줄 표기(`stage_end`)도 그쪽을 그대로 따른다 — 셸이 값을
 * 변환 없이 넘길 수 있어야 매핑 표가 하나 더 생기지 않는다.
 */
export type TradeCloseReason = 'manual' | 'liquidated' | 'stage_end';

/** 스테이지 결말. `src/app/settlement.ts`의 `StageOutcome`와 같은 뜻이다. */
export type StageEndOutcome = 'cleared' | 'defeated' | 'unresolved';

/** 스킬 3종. `src/combat`의 `SkillId`와 같은 문자열이다(테스트가 고정한다). */
export type AudioSkillId = 'S-01' | 'S-02' | 'S-03';

/**
 * 소리를 울릴 수 있는 게임 사건.
 *
 * ★ 왜 `src/combat`·`src/position` 타입을 import하지 않는가 ★
 * `src/weather`·`src/ground`가 `combat`을 import하지 않고 필요한 필드만 구조적으로 좁혀
 * 받는 것과 같은 이유다(§17-2 경계 규칙). 오디오는 전투의 하위 관심사이므로 의존이
 * 역방향으로 생기면 순환이 난다. 문자열 유니온이 어긋나지 않는지는 테스트가 고정한다.
 */
export type GameEvent =
  | { readonly kind: 'trade-open' }
  | { readonly kind: 'trade-add' }
  | { readonly kind: 'trade-close'; readonly pnl: number; readonly reason: TradeCloseReason }
  | { readonly kind: 'tower-build' }
  | { readonly kind: 'tower-upgrade' }
  | { readonly kind: 'unit-summon' }
  | { readonly kind: 'tower-fire' }
  | { readonly kind: 'enemy-down'; readonly boss: boolean }
  | { readonly kind: 'base-hit'; readonly damage: number }
  | { readonly kind: 'skill-cast'; readonly skill: AudioSkillId }
  | { readonly kind: 'wave-start'; readonly wave: number }
  | { readonly kind: 'boss-appear' }
  | { readonly kind: 'prep-tick' }
  | { readonly kind: 'stage-end'; readonly outcome: StageEndOutcome };

// ── 전투 상태에서 이벤트를 뽑아내기 위한 **구조적** 입력 ──────────────

/** 타워에서 발사 판정에 필요한 것만. `Tower`의 부분집합이다. */
export interface FiringTower {
  readonly slot: number;
  /** 발사하면 `TOWER_COOLDOWN_MS`로 **되채워진다** — 그래서 증가가 곧 발사다. */
  readonly cooldownMs: number;
}

/**
 * 오디오가 보는 전투 한 프레임. **`CombatState`의 부분집합**이다.
 *
 * ★ 왜 `CombatEvents`가 아니라 상태를 받는가 ★
 * 필요한 사실이 전부 상태의 **차분**으로 나온다: 발사 = 쿨다운 증가, 본진 피격 = `baseHp`
 * 감소, 웨이브 시작 = `wave` 증가, 보스 등장 = `boss` 생성. 이벤트를 손으로 옮겨 적는
 * 경로를 만들지 않으면 §19-10("스펙에 필드를 추가하면 옮겨 적는 모든 곳을 같이 고쳐라")의
 * 사고가 구조적으로 불가능해진다. 사망만은 상태에 남지 않는 한 프레임짜리 사실이라
 * 예외적으로 이벤트로 받는다(`DeathEvent` 주석 참고).
 *
 * 필드를 늘리기 전에 정말 소리에 필요한지 확인해라 — 여기가 넓어질수록 전투 구현의
 * 변화가 오디오를 깨뜨린다.
 */
export interface CombatAudioFrame {
  readonly towers: readonly FiringTower[];
  /** 보스가 전장에 있는가. 없다가 생기면 등장이다. */
  readonly hasBoss: boolean;
  /** 본진 HP. **감소분이 곧 피격 피해다**(실드가 막으면 감소가 없다). */
  readonly baseHp: number;
  /** 현재 웨이브 번호. 증가가 곧 웨이브 시작이다. */
  readonly wave: number;
}

/** 죽은 개체 하나에서 소리에 필요한 것만. `DeathEvent`의 부분집합이다. */
export interface DyingEntity {
  readonly kind: 'unit' | 'enemy' | 'boss';
}
