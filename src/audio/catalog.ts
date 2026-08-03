/**
 * 소리 20종의 합성 레시피 — **모든 파형·주파수·길이의 단일 출처**.
 *
 * ★ 톤 규율 (파이낸셜 느와르) ★
 * ① **짧게.** 대부분 40~200ms다. 400ms를 넘는 것은 스테이지 결말·보스 등장뿐이다.
 * ② **저음 위주.** 기준음이 대체로 100~500Hz에 있다. 1kHz 이상은 준비 카운트다운의
 *    미세한 틱 하나뿐이다 — 고음은 게임기 소리로 들리고, 이 게임의 톤이 아니다.
 * ③ **화음을 만들지 마라.** 두 음을 겹칠 때는 완전5도(3:2)나 옥타브만 쓴다. 장·단조가
 *    생기는 순간 "밝은 게임"이 되고 느와르가 깨진다.
 * ④ **과하지 않게.** 개별 `volume`이 0.5를 넘는 것은 없다. 여러 겹이 동시에 울려도
 *    합이 1을 넘지 않도록 레이어 `gain`을 낮게 잡는다.
 *
 * ★ 색 팔레트와 같은 규율이다 ★ `src/design/palette.ts` 밖에서 생짜 HEX를 쓰지 않는 것처럼,
 * 이 파일 밖에서 주파수·길이를 적지 마라. 소리를 바꾸려면 여기 값만 고친다.
 */

import type { GameSoundId, SoundSpec } from './types';

/**
 * 소리 하나의 총 길이(ms) — 가장 늦게 끝나는 레이어 기준.
 *
 * 동시 재생 상한을 세는 데 쓴다(`throttle.ts`). 레이어가 없으면 0이다 —
 * 그 경우 큐는 즉시 끝난 것으로 취급되어 자리를 차지하지 않는다.
 */
export function soundDurationMs(spec: SoundSpec): number {
  let end = 0;
  for (const layer of spec.layers) {
    const layerEnd = layer.startMs + layer.durationMs;
    if (layerEnd > end) end = layerEnd;
  }
  return end;
}

/**
 * ── 소리 20종 ──────────────────────────────────────────────────
 *
 * `minGapMs`(연타 억제)와 `priority`(동시 재생 서열)의 근거는 항목마다 적어 둔다.
 * **값만 고치고 근거를 남겨 두면 다음 사람이 근거 없이 되돌린다.**
 */
export const SOUND_SPECS: Readonly<Record<GameSoundId, SoundSpec>> = {
  // ── 매매 (FR-5) ────────────────────────────────────────────
  /**
   * 진입 — 주문 체결 확인음. 단음 사각파 한 번.
   *
   * 매매는 사람이 누른 만큼만 일어나고 `minHoldMs = 2,000`이 다음 조작을 막으므로
   * 연타 억제는 사실상 필요 없다. 그래도 0으로 두지 않는 이유는 스크린리더·키보드
   * 반복 입력에서 같은 프레임에 두 번 들어오는 경로가 있기 때문이다.
   */
  'trade-open': {
    id: 'trade-open',
    label: '진입',
    channel: 'trade',
    minGapMs: 120,
    volume: 0.34,
    priority: 4,
    layers: [
      { wave: 'square', startHz: 392, endHz: 392, startMs: 0, durationMs: 55, gain: 0.5 },
      { wave: 'sine', startHz: 196, endHz: 196, startMs: 0, durationMs: 90, gain: 0.35 },
    ],
  },

  /** 추가매수(물타기) — 진입보다 낮고 짧다. 새 포지션이 아니라 **덧붙임**이라는 뜻이다. */
  'trade-add': {
    id: 'trade-add',
    label: '추가매수',
    channel: 'trade',
    minGapMs: 120,
    volume: 0.26,
    priority: 3,
    layers: [
      { wave: 'square', startHz: 294, endHz: 294, startMs: 0, durationMs: 40, gain: 0.42 },
      { wave: 'sine', startHz: 147, endHz: 147, startMs: 20, durationMs: 70, gain: 0.3 },
    ],
  },

  /**
   * 이익 청산 — 완전5도 **상행**(392 → 588). 두 음을 겹치지 않고 이어 붙인다.
   *
   * ★ 초록을 쓰지 않는 것과 같은 규율 ★ 팔레트에 초록이 없어 이익을 `GOLD`로 표시하듯,
   * 여기서도 "승리 팡파르"를 쓰지 않는다. 상행 5도 하나면 방향은 충분히 읽힌다.
   */
  'trade-close-profit': {
    id: 'trade-close-profit',
    label: '이익 청산',
    channel: 'trade',
    minGapMs: 150,
    volume: 0.38,
    priority: 5,
    layers: [
      { wave: 'triangle', startHz: 392, endHz: 392, startMs: 0, durationMs: 70, gain: 0.5 },
      { wave: 'triangle', startHz: 588, endHz: 588, startMs: 65, durationMs: 130, gain: 0.45 },
      { wave: 'sine', startHz: 196, endHz: 196, startMs: 0, durationMs: 190, gain: 0.22 },
    ],
  },

  /** 손실 청산 — 같은 5도의 **하행**(392 → 262). 이익과 정확히 대칭이라 방향만 다르다. */
  'trade-close-loss': {
    id: 'trade-close-loss',
    label: '손실 청산',
    channel: 'trade',
    minGapMs: 150,
    volume: 0.38,
    priority: 5,
    layers: [
      { wave: 'triangle', startHz: 392, endHz: 392, startMs: 0, durationMs: 70, gain: 0.5 },
      { wave: 'triangle', startHz: 262, endHz: 262, startMs: 65, durationMs: 150, gain: 0.45 },
      { wave: 'sine', startHz: 131, endHz: 131, startMs: 0, durationMs: 210, gain: 0.24 },
    ],
  },

  /**
   * ★ 강제 청산 — 유일한 **경고성** 매매음 ★
   *
   * 손실 청산과 반드시 구분돼야 한다. 강제 청산은 사람이 고른 결과가 아니라 시장이
   * 밀어낸 결과이고, 화면에서도 별도 문구('강제 청산')와 골드 연출 톤을 갖는다.
   * 같은 저음을 **두 번 두드려**(경보의 관습) 사각파로 낸다 — 이 게임에서 사각파를
   * 두 번 치는 소리는 이것 하나뿐이다.
   */
  'trade-liquidated': {
    id: 'trade-liquidated',
    label: '강제 청산',
    channel: 'trade',
    minGapMs: 400,
    volume: 0.44,
    priority: 7,
    layers: [
      { wave: 'square', startHz: 233, endHz: 208, startMs: 0, durationMs: 150, gain: 0.5 },
      { wave: 'square', startHz: 233, endHz: 196, startMs: 190, durationMs: 220, gain: 0.5 },
      { wave: 'sine', startHz: 87, endHz: 65, startMs: 0, durationMs: 420, gain: 0.32 },
    ],
  },

  // ── 편성 (FR-6.4·6.5) ──────────────────────────────────────
  /** 타워 건설 — 무거운 것이 바닥에 놓이는 소리. 저음 + 짧은 노이즈 탁. */
  'tower-build': {
    id: 'tower-build',
    label: '타워 건설',
    channel: 'build',
    minGapMs: 100,
    volume: 0.36,
    priority: 4,
    layers: [
      { wave: 'sine', startHz: 160, endHz: 88, startMs: 0, durationMs: 130, gain: 0.55 },
      {
        wave: 'noise',
        startHz: 0,
        endHz: 0,
        startMs: 0,
        durationMs: 45,
        gain: 0.22,
        filter: { type: 'lowpass', hz: 1400 },
      },
    ],
  },

  /** 타워 업그레이드 — 건설과 같은 몸통에 옥타브 위 확인음을 얹는다. */
  'tower-upgrade': {
    id: 'tower-upgrade',
    label: '타워 업그레이드',
    channel: 'build',
    minGapMs: 100,
    volume: 0.36,
    priority: 4,
    layers: [
      { wave: 'sine', startHz: 160, endHz: 110, startMs: 0, durationMs: 120, gain: 0.5 },
      { wave: 'triangle', startHz: 330, endHz: 494, startMs: 60, durationMs: 130, gain: 0.34 },
    ],
  },

  /** 유닛 소환 — 사람이 나오는 소리라 타워보다 가볍고 살짝 위로 뜬다. */
  'unit-summon': {
    id: 'unit-summon',
    label: '유닛 소환',
    channel: 'build',
    minGapMs: 90,
    volume: 0.3,
    priority: 3,
    layers: [
      { wave: 'triangle', startHz: 262, endHz: 349, startMs: 0, durationMs: 95, gain: 0.45 },
      { wave: 'sine', startHz: 131, endHz: 131, startMs: 0, durationMs: 60, gain: 0.28 },
    ],
  },

  // ── 전투 (FR-6) ────────────────────────────────────────────
  /**
   * ★ 타워 발사 — 이 게임에서 가장 자주 울리는 소리 ★
   *
   * 타워 6기가 각자 쿨다운(가장 짧은 것 600ms)으로 쏘면 **초당 10회**를 넘는다.
   * 그대로 내보내면 소리 벽이 되어 다른 신호가 전부 묻힌다. 그래서:
   *   · `minGapMs = 130` — 초당 최대 7.7회. 개별 발사가 아니라 **교전이 벌어지는 중**
   *     이라는 질감으로 들린다. 100 아래로 내리면 다시 연속음처럼 뭉친다.
   *   · `volume = 0.16` — 준비 틱 다음으로 조용하다. 배경음의 자리다.
   *   · `priority = 1` — 최하위. 동시 재생이 찰 때 **가장 먼저 밀려난다.**
   * 노이즈 한 겹만 쓴다(오실레이터 없음) — 음정이 생기면 리듬이 들리고 그게 더 거슬린다.
   */
  'tower-fire': {
    id: 'tower-fire',
    label: '타워 발사',
    channel: 'combat',
    minGapMs: 130,
    volume: 0.16,
    priority: 1,
    layers: [
      {
        wave: 'noise',
        startHz: 0,
        endHz: 0,
        startMs: 0,
        durationMs: 32,
        gain: 0.4,
        filter: { type: 'highpass', hz: 900 },
      },
      { wave: 'square', startHz: 220, endHz: 165, startMs: 0, durationMs: 28, gain: 0.16 },
    ],
  },

  /**
   * 적 처치 — 짧은 하강. 한 웨이브에 14마리가 몰려 죽으므로 억제가 필요하다.
   *
   * `minGapMs = 90`은 "여러 마리가 무너지고 있다"는 것이 들리면서도 각 처치가 뭉개지지
   * 않는 하한이다. 발사보다 우선순위가 높은 이유: 처치는 **결과**이고 발사는 과정이다.
   */
  'enemy-down': {
    id: 'enemy-down',
    label: '적 처치',
    channel: 'combat',
    minGapMs: 90,
    volume: 0.24,
    priority: 2,
    layers: [
      { wave: 'triangle', startHz: 196, endHz: 98, startMs: 0, durationMs: 85, gain: 0.45 },
      {
        wave: 'noise',
        startHz: 0,
        endHz: 0,
        startMs: 0,
        durationMs: 40,
        gain: 0.14,
        filter: { type: 'lowpass', hz: 2200 },
      },
    ],
  },

  /** 보스 처치 — 판당 최대 1회다. 길고 낮게 떨어뜨려 사건임을 알린다. */
  'boss-down': {
    id: 'boss-down',
    label: '보스 처치',
    channel: 'combat',
    minGapMs: 800,
    volume: 0.42,
    priority: 8,
    layers: [
      { wave: 'sawtooth', startHz: 147, endHz: 49, startMs: 0, durationMs: 520, gain: 0.4 },
      { wave: 'sine', startHz: 98, endHz: 41, startMs: 0, durationMs: 620, gain: 0.35 },
      {
        wave: 'noise',
        startHz: 0,
        endHz: 0,
        startMs: 0,
        durationMs: 180,
        gain: 0.18,
        filter: { type: 'lowpass', hz: 900 },
      },
    ],
  },

  /**
   * ★ 본진 피격 — 반드시 들려야 하는 소리 ★
   *
   * 본진 HP는 패배 조건이다. 화면에서는 HUD 숫자 하나로만 바뀌므로 전장을 보고 있으면
   * 놓치기 쉽다. 그래서 우선순위를 높게(6) 잡아 발사·처치가 아무리 몰려도 밀려나지 않게 한다.
   * 적 공격 주기가 1,000ms이고 여러 마리가 동시에 두드리므로 `minGapMs = 200`으로 묶는다.
   */
  'base-hit': {
    id: 'base-hit',
    label: '본진 피격',
    channel: 'combat',
    minGapMs: 200,
    volume: 0.4,
    priority: 6,
    layers: [
      { wave: 'square', startHz: 82, endHz: 65, startMs: 0, durationMs: 170, gain: 0.5 },
      {
        wave: 'noise',
        startHz: 0,
        endHz: 0,
        startMs: 0,
        durationMs: 90,
        gain: 0.24,
        filter: { type: 'lowpass', hz: 600 },
      },
    ],
  },

  // ── 스킬 3종 (FR-6.6) ──────────────────────────────────────
  /** S-01 공시 폭탄 — 노이즈 하강 + 저음 충격. 광역 피해라 가장 타격감이 크다. */
  'skill-bomb': {
    id: 'skill-bomb',
    label: 'S-01 공시 폭탄',
    channel: 'skill',
    minGapMs: 300,
    volume: 0.44,
    priority: 7,
    layers: [
      {
        wave: 'noise',
        startHz: 0,
        endHz: 0,
        startMs: 0,
        durationMs: 260,
        gain: 0.36,
        filter: { type: 'lowpass', hz: 1800 },
      },
      { wave: 'sine', startHz: 165, endHz: 44, startMs: 0, durationMs: 320, gain: 0.5 },
    ],
  },

  /** S-02 배당 살포 — 회복이라 유일하게 **위로 열리는** 소리다. 옥타브 상행 2음. */
  'skill-heal': {
    id: 'skill-heal',
    label: 'S-02 배당 살포',
    channel: 'skill',
    minGapMs: 300,
    volume: 0.36,
    priority: 7,
    layers: [
      { wave: 'triangle', startHz: 294, endHz: 294, startMs: 0, durationMs: 110, gain: 0.42 },
      { wave: 'triangle', startHz: 441, endHz: 441, startMs: 90, durationMs: 120, gain: 0.4 },
      { wave: 'triangle', startHz: 588, endHz: 588, startMs: 180, durationMs: 180, gain: 0.34 },
    ],
  },

  /**
   * ★ S-03 서킷브레이커 — **다른 톤이어야 한다** ★
   *
   * 셋 중 유일하게 **AUM(매매 원금)을 태운다**. 즉 "자금을 태워 시간을 산다"가 이 스킬의
   * 설계 의도이고, 나머지 둘과 소모 재화가 다르다는 사실이 소리로 읽혀야 한다.
   *
   * 그래서 타악기적 어택을 쓰지 않고 **디튠된 지속음**(112/110Hz의 2Hz 맥놀이)을 깐다.
   * 두 사인파의 간섭이 만드는 느린 떨림이 "무언가를 계속 소모하고 있다"는 인상을 준다 —
   * 나머지 스킬처럼 한 번 터지고 끝나는 소리와 성질 자체가 다르다.
   */
  'skill-shield': {
    id: 'skill-shield',
    label: 'S-03 서킷브레이커',
    channel: 'skill',
    minGapMs: 300,
    volume: 0.34,
    priority: 7,
    layers: [
      { wave: 'sine', startHz: 110, endHz: 110, startMs: 0, durationMs: 430, gain: 0.42 },
      { wave: 'sine', startHz: 112, endHz: 112, startMs: 0, durationMs: 430, gain: 0.42 },
      { wave: 'sawtooth', startHz: 220, endHz: 233, startMs: 40, durationMs: 340, gain: 0.14 },
    ],
  },

  // ── 흐름 ───────────────────────────────────────────────────
  /** 웨이브 시작 — 장 시작 종을 흉내낸 2음. 30초에 한 번이라 억제가 거의 필요 없다. */
  'wave-start': {
    id: 'wave-start',
    label: '웨이브 시작',
    channel: 'flow',
    minGapMs: 500,
    volume: 0.32,
    priority: 6,
    layers: [
      { wave: 'triangle', startHz: 330, endHz: 330, startMs: 0, durationMs: 90, gain: 0.42 },
      { wave: 'triangle', startHz: 494, endHz: 494, startMs: 85, durationMs: 190, gain: 0.4 },
    ],
  },

  /**
   * 보스 등장 — 판당 1회. 가장 낮고 가장 길다(700ms).
   *
   * 우선순위 9로 **무엇에도 밀리지 않는다.** 보스가 스폰되는 순간은 13웨이브 중
   * 가장 적이 많은 시점이라 발사·처치가 최대로 몰리는 때이기도 하다.
   */
  'boss-appear': {
    id: 'boss-appear',
    label: '보스 등장',
    channel: 'flow',
    minGapMs: 1_000,
    volume: 0.46,
    priority: 9,
    layers: [
      { wave: 'sawtooth', startHz: 55, endHz: 49, startMs: 0, durationMs: 700, gain: 0.4 },
      { wave: 'sine', startHz: 110, endHz: 98, startMs: 0, durationMs: 700, gain: 0.32 },
      { wave: 'square', startHz: 165, endHz: 147, startMs: 220, durationMs: 400, gain: 0.14 },
    ],
  },

  /**
   * 준비 카운트다운 틱 — **이 게임에서 유일한 고음이자 가장 작은 소리**.
   *
   * 준비 5초 동안 초당 한 번이라 최대 5회다. 존재를 알리되 주의를 뺏으면 안 되므로
   * 볼륨 0.12에 12ms짜리 사인파 하나만 쓴다.
   */
  'prep-tick': {
    id: 'prep-tick',
    label: '준비 카운트다운',
    channel: 'flow',
    minGapMs: 400,
    volume: 0.12,
    priority: 2,
    layers: [{ wave: 'sine', startHz: 1_320, endHz: 1_320, startMs: 0, durationMs: 12, gain: 0.5 }],
  },

  /**
   * 클리어 — 상행 5도 + 옥타브. 판당 1회이므로 길이를 허용한다(560ms).
   *
   * 장3도(5:4)를 쓰지 않는 이유는 위 파일 머리말 ③이다 — 밝은 화음이 붙는 순간
   * 이 게임의 톤이 아니게 된다.
   */
  'stage-cleared': {
    id: 'stage-cleared',
    label: '클리어',
    channel: 'flow',
    minGapMs: 1_000,
    volume: 0.42,
    priority: 9,
    layers: [
      { wave: 'triangle', startHz: 262, endHz: 262, startMs: 0, durationMs: 120, gain: 0.44 },
      { wave: 'triangle', startHz: 392, endHz: 392, startMs: 110, durationMs: 140, gain: 0.44 },
      { wave: 'triangle', startHz: 524, endHz: 524, startMs: 230, durationMs: 330, gain: 0.4 },
      { wave: 'sine', startHz: 131, endHz: 131, startMs: 0, durationMs: 560, gain: 0.2 },
    ],
  },

  /** 패배 — 클리어의 반대. 같은 음정 구조를 하행으로 뒤집고 톱니파로 탁하게 만든다. */
  'stage-defeated': {
    id: 'stage-defeated',
    label: '패배',
    channel: 'flow',
    minGapMs: 1_000,
    volume: 0.42,
    priority: 9,
    layers: [
      { wave: 'sawtooth', startHz: 196, endHz: 196, startMs: 0, durationMs: 140, gain: 0.34 },
      { wave: 'sawtooth', startHz: 131, endHz: 131, startMs: 130, durationMs: 170, gain: 0.34 },
      { wave: 'sawtooth', startHz: 98, endHz: 82, startMs: 280, durationMs: 420, gain: 0.32 },
      { wave: 'sine', startHz: 49, endHz: 41, startMs: 200, durationMs: 500, gain: 0.24 },
    ],
  },
};

/** 소리 ID 전부. 테스트·문서가 목록을 손으로 다시 적지 않게 하려는 것이다. */
export const SOUND_IDS: readonly GameSoundId[] = Object.keys(SOUND_SPECS) as GameSoundId[];
