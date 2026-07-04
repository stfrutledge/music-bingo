import type { AudioSource, AudioSettings } from '../types';

const AUDIO_SETTINGS_KEY = 'music-bingo-audio-settings';

// Audio source URLs. 'local' is BASE_URL-relative so it resolves correctly in
// dev (/audio/), in an all-local phone build served at the root, and on Pages.
export const AUDIO_URLS = {
  local: `${import.meta.env.BASE_URL}audio/`,
  cloudflare: 'https://pub-1b29fd47df394cdc9f178d12ed054836.r2.dev/',
} as const;

/**
 * Audio files are gitignored (1.7 GB), so hosted deployments (GitHub Pages)
 * have no /audio/ folder — only local origins (dev server, on-device build)
 * can serve the 'local' source.
 */
export function isLocalOrigin(): boolean {
  const hostname = window.location.hostname.toLowerCase();
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.local')
  );
}

function defaultSettings(): AudioSettings {
  return { audioSource: isLocalOrigin() ? 'local' : 'cloudflare' };
}

export function getAudioSettings(): AudioSettings {
  try {
    const stored = localStorage.getItem(AUDIO_SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<AudioSettings>;
      const settings = { ...defaultSettings(), ...parsed };
      // A stored 'local' source can never work on a hosted origin — coerce it
      // so team members who once had it saved don't get silent 404s.
      if (settings.audioSource === 'local' && !isLocalOrigin()) {
        settings.audioSource = 'cloudflare';
      }
      return settings;
    }
  } catch (error) {
    console.warn('Failed to load audio settings:', error);
  }
  return defaultSettings();
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
