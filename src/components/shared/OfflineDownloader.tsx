import { useEffect } from 'react';
import { useOffline } from '../../hooks/useOffline';
import { Button } from './Button';

interface OfflineDownloaderProps {
  playlistId: string;
}

export function OfflineDownloader({ playlistId }: OfflineDownloaderProps) {
  const {
    isReady,
    lastDownload,
    cacheStatus,
    progress,
    isDownloading,
    startDownload,
    refreshStatus,
  } = useOffline();

  useEffect(() => {
    if (playlistId) {
      refreshStatus(playlistId);
    }
  }, [playlistId, refreshStatus]);

  const handleDownload = () => {
    startDownload(playlistId);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="card">
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
          isReady
            ? 'bg-[var(--status-success-bg)] text-[var(--status-success-text)]'
            : 'bg-[var(--bg-accent)] text-[var(--accent-teal)]'
        }`}>
          {isReady ? (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-[var(--text-primary)] mb-1">
            {isReady ? 'Ready for Offline Play' : 'Prepare for Offline'}
          </h3>

          {isDownloading && progress ? (
            <div className="space-y-2">
              <p className="text-sm text-[var(--text-secondary)] truncate">
                Downloading: {progress.currentFile}
              </p>
              <div className="w-full bg-[var(--bg-hover)] rounded-full h-2">
                <div
                  className="bg-[var(--accent-green)] h-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${progress.total > 0 ? (progress.downloaded / progress.total) * 100 : 0}%`,
                  }}
                />
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                {progress.downloaded} of {progress.total} songs
              </p>
            </div>
          ) : isReady ? (
            <div className="space-y-1">
              <p className="text-sm text-[var(--status-success-text)]">
                All {cacheStatus?.total || 0} songs cached
              </p>
              {lastDownload && (
                <p className="text-xs text-[var(--text-muted)]">
                  Downloaded {formatDate(lastDownload)}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-[var(--text-secondary)]">
              Download all songs to play without internet
            </p>
          )}
        </div>

        {/* Action */}
        <div className="flex-shrink-0">
          {!isDownloading && (
            <Button
              variant={isReady ? 'secondary' : 'primary'}
              size="sm"
              onClick={handleDownload}
            >
              {isReady ? 'Re-download' : 'Download'}
            </Button>
          )}
        </div>
      </div>

      {/* Cache Status */}
      {cacheStatus && !isDownloading && cacheStatus.cached < cacheStatus.total && !isReady && (
        <div className="mt-3 pt-3 border-t border-[var(--border-color)]">
          <p className="text-xs text-[var(--text-muted)]">
            {cacheStatus.cached} of {cacheStatus.total} songs already cached
          </p>
        </div>
      )}
    </div>
  );
}
