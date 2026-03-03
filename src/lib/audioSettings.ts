import type { AudioSource, AudioSettings } from '../types';

const AUDIO_SETTINGS_KEY = 'music-bingo-audio-settings';

// Audio source URLs
export const AUDIO_URLS = {
  local: '/audio/',
  cloudflare: 'https://pub-fac7b942338643f38692b2544ffeb60d.r2.dev/',
} as const;

const DEFAULT_SETTINGS: AudioSettings = {
  audioSource: 'local',
};

export function getAudioSettings(): AudioSettings {
  try {
    const stored = localStorage.getItem(AUDIO_SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch (error) {
    console.warn('Failed to load audio settings:', error);
  }
  return DEFAULT_SETTINGS;
}

export function setAudioSettings(settings: Partial<AudioSettings>): void {
  try {
    const current = getAudioSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(updated));
  } catch (error) {
    console.warn('Failed to save audio settings:', error);
  }
}

export function getAudioSource(): AudioSource {
  return getAudioSettings().audioSource;
}

export function setAudioSource(source: AudioSource): void {
  setAudioSettings({ audioSource: source });
}

export function getEffectiveBaseUrl(): string {
  const source = getAudioSource();
  return AUDIO_URLS[source];
}
