import { useState, useEffect } from 'react';
import { getAudioSource, setAudioSource } from '../../lib/audioSettings';
import type { AudioSource } from '../../types';

export function AudioSourceToggle() {
  const [source, setSource] = useState<AudioSource>(() => getAudioSource());

  useEffect(() => {
    setAudioSource(source);
  }, [source]);

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-[var(--text-secondary)] hidden sm:inline">Audio Source:</span>
      <div className="flex rounded-lg overflow-hidden border border-[var(--border-color)]" role="radiogroup" aria-label="Audio source">
        <button
          onClick={() => setSource('local')}
          role="radio"
          aria-checked={source === 'local'}
          className={`px-4 py-2.5 sm:px-3 sm:py-1.5 min-h-[44px] sm:min-h-0 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--accent-green)] ${
            source === 'local'
              ? 'bg-[var(--accent-green)] text-white'
              : 'bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
          }`}
        >
          Local
        </button>
        <button
          onClick={() => setSource('cloudflare')}
          role="radio"
          aria-checked={source === 'cloudflare'}
          className={`px-4 py-2.5 sm:px-3 sm:py-1.5 min-h-[44px] sm:min-h-0 text-sm font-medium transition-colors border-l border-[var(--border-color)] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--accent-green)] ${
            source === 'cloudflare'
              ? 'bg-[var(--accent-green)] text-white'
              : 'bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
          }`}
        >
          Streaming
        </button>
      </div>
    </div>
  );
}
