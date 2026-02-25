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

  return (
    <div className="flex flex-col gap-2 w-full">
      {/* Progress bar */}
      <div
        className="h-2 bg-[var(--bg-hover)] rounded-full cursor-pointer"
        onClick={handleProgressClick}
      >
        <div
          className="h-full bg-[var(--accent-green)] rounded-full transition-all"
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
            className="w-12 h-12 flex items-center justify-center bg-[var(--accent-green)] rounded-full hover:bg-[var(--accent-green-light)] disabled:opacity-50 transition-colors"
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
          className={`w-8 h-8 flex items-center justify-center rounded-full border transition-colors mr-2 ${
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
