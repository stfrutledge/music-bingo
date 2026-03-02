import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import type { Playlist, EventConfig } from '../../types';
import { getPlaylist } from '../../lib/db';
import { downloadPlaylistAudio, getCacheStatus, clearPlaylistCache, checkAudioAvailability } from '../../lib/audioCache';
import { Button } from '../shared/Button';
import { AppShell } from '../shared/AppShell';

export function AudioDownload() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  // Get eventConfig from router state (if loaded via event)
  const eventConfig = (location.state as { eventConfig?: EventConfig })?.eventConfig;

  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState({ downloaded: 0, total: 0 });
  const [cachedCount, setCachedCount] = useState(0);
  const [checking, setChecking] = useState(true);
  const [isLocal, setIsLocal] = useState(false);
  const [failedSongs, setFailedSongs] = useState<string[]>([]);

  useEffect(() => {
    if (id) {
      loadPlaylist(id);
    }
  }, [id]);

  const loadPlaylist = async (playlistId: string) => {
    const data = await getPlaylist(playlistId);
    if (data) {
      setPlaylist(data);

      // First check if files are directly accessible (local server)
      const availability = await checkAudioAvailability(data);
      setIsLocal(availability.isLocal);

      // Only auto-skip for LOCAL files (localhost dev server)
      // Remote files (Cloudflare) should still show download option for offline use
      if (availability.allAvailable && availability.isLocal) {
        navigate(`/host/setup/${data.id}`, { replace: true, state: { eventConfig } });
        return;
      }

      // Fall back to cache status check
      const status = await getCacheStatus(data);
      setCachedCount(status.cachedSongs);
      setProgress({ downloaded: status.cachedSongs, total: status.totalSongs });

      if (status.isComplete) {
        navigate(`/host/setup/${data.id}`, { replace: true, state: { eventConfig } });
        return;
      }

      setChecking(false);
    }
  };

  const handleDownload = async () => {
    if (!playlist) return;

    setDownloading(true);
    setFailedSongs([]);

    const result = await downloadPlaylistAudio(playlist, (downloaded, total) => {
      setProgress({ downloaded, total });
    });

    setDownloading(false);

    if (result.failedSongs.length > 0) {
      setFailedSongs(result.failedSongs);
    }

    // Check final status
    const status = await getCacheStatus(playlist);
    if (status.isComplete) {
      navigate(`/host/setup/${playlist.id}`, { state: { eventConfig } });
    } else {
      setCachedCount(status.cachedSongs);
    }
  };

  const handleRedownload = async () => {
    if (!playlist) return;

    // Clear existing cache
    await clearPlaylistCache(playlist);
    setCachedCount(0);
    setProgress({ downloaded: 0, total: playlist.songs.length });

    // Start fresh download
    handleDownload();
  };

  const handleSkip = () => {
    if (playlist) {
      navigate(`/host/setup/${playlist.id}`, { state: { eventConfig } });
    }
  };

  if (!playlist || checking) {
    return (
      <AppShell centered>
        <div className="text-[var(--text-secondary)]">{checking ? 'Checking audio files...' : 'Loading...'}</div>
      </AppShell>
    );
  }

  const progressPercent = progress.total > 0
    ? Math.round((progress.downloaded / progress.total) * 100)
    : 0;

  const isComplete = progress.downloaded === progress.total && progress.total > 0;

  return (
    <AppShell title="Download Audio" maxWidth="sm" centered>
      <div className="card text-center">
          <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">{playlist.name}</h2>
          <p className="text-[var(--text-secondary)] mb-6">Download audio for offline play</p>

          {/* Progress */}
          <div className="mb-6">
            <div className="flex justify-between text-sm text-[var(--text-secondary)] mb-2">
              <span>{progress.downloaded} of {progress.total} songs</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="h-3 bg-[var(--bg-hover)] rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  isComplete ? 'bg-[var(--accent-green)]' : 'bg-[var(--accent-teal)]'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            {isComplete ? (
              <Button
                variant="success"
                size="lg"
                fullWidth
                onClick={() => navigate(`/host/setup/${playlist.id}`, { state: { eventConfig } })}
              >
                Continue to Game Setup
              </Button>
            ) : (
              <>
                <Button
                  variant="primary"
                  size="lg"
                  fullWidth
                  onClick={handleDownload}
                  disabled={downloading}
                >
                  {downloading
                    ? `Downloading... ${progressPercent}%`
                    : cachedCount > 0
                    ? 'Continue Download'
                    : 'Download Audio Files'}
                </Button>

                {cachedCount > 0 && (
                  <Button
                    variant="secondary"
                    fullWidth
                    onClick={handleRedownload}
                    disabled={downloading}
                  >
                    Re-download All
                  </Button>
                )}

                <Button
                  variant="ghost"
                  fullWidth
                  onClick={handleSkip}
                >
                  Skip (requires internet)
                </Button>
              </>
            )}

            <Button
              variant="ghost"
              fullWidth
              onClick={() => navigate('/host/playlists')}
            >
              Choose Different Playlist
            </Button>
          </div>

        {/* Info */}
        <p className="mt-6 text-xs text-[var(--text-muted)]">
          {isLocal ? (
            'Files appear to be hosted locally. Download to cache for offline use, or skip if you have a local server running.'
          ) : (
            'Downloaded audio will be cached for offline use.'
          )}
        </p>

        {/* Failed Songs List */}
        {failedSongs.length > 0 && (
          <div className="mt-4 p-3 bg-[var(--status-error-bg)] border border-[var(--status-error-text)] rounded-lg text-left">
            <p className="text-sm font-semibold text-[var(--status-error-text)] mb-2">
              {failedSongs.length} file{failedSongs.length > 1 ? 's' : ''} failed to download:
            </p>
            <ul className="text-xs text-[var(--status-error-text)] max-h-32 overflow-y-auto space-y-1">
              {failedSongs.map((song, i) => (
                <li key={i}>• {song}</li>
              ))}
            </ul>
            <p className="text-xs text-[var(--text-muted)] mt-2">
              Check that CORS is configured on your R2 bucket.
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
