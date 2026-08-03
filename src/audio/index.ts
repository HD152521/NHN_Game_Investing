/**
 * `src/audio` 공개 API 배럴.
 *
 * 셸(`src/app/stage.ts`)은 여기서만 가져간다 — 내부 파일을 직접 import하면
 * 판정/재생 분리가 호출부에서 무너진다.
 */

export { SOUND_IDS, SOUND_SPECS, soundDurationMs } from './catalog';
export {
  countTowerFires,
  diffCombatEvents,
  prepTickIndex,
  soundForEvent,
} from './events';
export {
  MAX_CONCURRENT_VOICES,
  admitSound,
  createPlaybackState,
  pruneVoices,
} from './throttle';
export type { ActiveVoice, AdmitReason, AdmitResult, PlaybackState } from './throttle';
export {
  AUDIO_SETTINGS_VERSION,
  AUDIO_STORAGE_KEY,
  DEFAULT_VOLUME,
  VOLUME_STEP_PERCENT,
  audioControlView,
  clampVolume,
  defaultAudioSettings,
  defaultAudioStorage,
  effectiveVolume,
  formatVolumeLabel,
  loadAudioSettings,
  muteButtonLabel,
  parseAudioSettings,
  percentToVolume,
  saveAudioSettings,
  serializeAudioSettings,
  volumeToPercent,
} from './settings';
export type { AudioControlView, AudioSettings, AudioStorage } from './settings';
export { createAudioEngine, defaultAudioContextFactory } from './engine';
export type { AudioContextFactory, AudioEngine, AudioVoice } from './engine';
export { createGameAudio } from './mixer';
export type { GameAudio, GameAudioOptions } from './mixer';
export type {
  AudioSkillId,
  CombatAudioFrame,
  DyingEntity,
  FiringTower,
  GameEvent,
  GameSoundId,
  SoundChannel,
  SoundFilter,
  SoundLayer,
  SoundSpec,
  StageEndOutcome,
  TradeCloseReason,
  Waveform,
} from './types';
