import React from 'react';

interface AudioPlayerProps {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  isLoading: boolean;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  loopEnabled: boolean;
  onLoopToggle: () => void;
}

export function AudioPlayer({
  currentTime,
  duration,
  isPlaying,
  isLoading,
  onPlayPause,
  onSeek,
  loopEnabled,
  onLoopToggle,
}: AudioPlayerProps) {
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    onSeek(percent * duration);
  };

  const handleProgressKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = duration * 0.05; // 5% of duration
    const largeStep = duration * 0.1; // 10% of duration

    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        onSeek(Math.min(currentTime + step, duration));
        break;
      case 'ArrowLeft':
        e.preventDefault();
        onSeek(Math.max(currentTime - step, 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        onSeek(Math.min(currentTime + largeStep, duration));
        break;
      case 'ArrowDown':
        e.preventDefault();
        onSeek(Math.max(currentTime - largeStep, 0));
        break;
      case 'Home':
        e.preventDefault();
        onSeek(0);
        break;
      case 'End':
        e.preventDefault();
        onSeek(duration);
        break;
    }
  };

  return (
    <div className="flex flex-col gap-2 w-full">
      {/* Progress bar - taller on mobile for easier touch */}
      <div
        role="slider"
        tabIndex={0}
        aria-label="Seek audio"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(currentTime)}
        aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
        className="h-3 sm:h-2 bg-[var(--bg-hover)] rounded-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--accent-green)] focus:ring-offset-2 focus:ring-offset-[var(--ring-offset)]"
        onClick={handleProgressClick}
        onKeyDown={handleProgressKeyDown}
      >
        <div
          className="h-full bg-[var(--accent-green)] rounded-full transition-all pointer-events-none"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Controls */}
      <div className="flex items-center">
        <span className="text-sm text-[var(--text-secondary)] w-12">{formatTime(currentTime)}</span>

        <div className="flex-1 flex justify-center">
          {/* Play/Pause button */}
          <button
            onClick={onPlayPause}
            disabled={isLoading}
            aria-label={isLoading ? 'Loading audio' : isPlaying ? 'Pause' : 'Play'}
            className="w-12 h-12 flex items-center justify-center bg-[var(--accent-green)] rounded-full hover:bg-[var(--accent-green-light)] disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-green)] focus:ring-offset-2 focus:ring-offset-[var(--ring-offset)]"
          >
            {isLoading ? (
              <LoadingSpinner />
            ) : isPlaying ? (
              <PauseIcon />
            ) : (
              <PlayIcon />
            )}
          </button>
        </div>

        {/* Loop toggle button */}
        <button
          onClick={onLoopToggle}
          disabled={isLoading}
          aria-label={loopEnabled ? 'Disable loop' : 'Enable loop'}
          aria-pressed={loopEnabled}
          className={`w-11 h-11 sm:w-8 sm:h-8 flex items-center justify-center rounded-full border transition-colors mr-2 focus:outline-none focus:ring-2 focus:ring-[var(--accent-green)] focus:ring-offset-2 focus:ring-offset-[var(--ring-offset)] ${
            loopEnabled
              ? 'bg-[var(--accent-green)] border-[var(--accent-green)] text-white'
              : 'bg-[var(--bg-hover)] border-[var(--border-color)] hover:bg-[var(--bg-card)]'
          } disabled:opacity-50`}
          title={loopEnabled ? 'Loop enabled - song will restart when finished' : 'Loop disabled - song will stop when finished'}
        >
          <LoopIcon enabled={loopEnabled} />
        </button>

        <span className="text-sm text-[var(--text-secondary)] w-12 text-right">{formatTime(duration)}</span>
      </div>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg className="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
    </svg>
  );
}

function LoadingSpinner() {
  return (
    <svg className="w-6 h-6 text-white animate-spin" fill="none" viewBox="0 0 24 24">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function LoopIcon({ enabled }: { enabled: boolean }) {
  return (
    <svg className={`w-4 h-4 ${enabled ? 'text-white' : 'text-[var(--text-secondary)]'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}
