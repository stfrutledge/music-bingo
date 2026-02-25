import React from 'react';

interface AudioPlayerProps {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  isLoading: boolean;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
}

export function AudioPlayer({
  currentTime,
  duration,
  isPlaying,
  isLoading,
  onPlayPause,
  onSeek,
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
      <div className="flex items-center justify-between">
        <span className="text-sm text-[var(--text-secondary)]">{formatTime(currentTime)}</span>

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

        <span className="text-sm text-[var(--text-secondary)]">{formatTime(duration)}</span>
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
