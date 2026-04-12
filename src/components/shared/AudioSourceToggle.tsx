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
      <span className="text-sm text-[var(--text-secondary)]">Audio Source:</span>
      <div className="flex rounded-lg overflow-hidden border border-[var(--border-color)]">
        <button
          onClick={() => setSource('local')}
          className={`px-3 py-1.5 text-sm font-medium transition-colors ${
            source === 'local'
              ? 'bg-[var(--accent-green)] text-white'
              : 'bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
          }`}
        >
          Local
        </button>
        <button
          onClick={() => setSource('cloudflare')}
          className={`px-3 py-1.5 text-sm font-medium transition-colors border-l border-[var(--border-color)] ${
            source === 'cloudflare'
              ? 'bg-[var(--accent-blue)] text-white'
              : 'bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
          }`}
        >
          Streaming
        </button>
      </div>
    </div>
  );
}
