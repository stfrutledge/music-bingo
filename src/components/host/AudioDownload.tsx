import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Playlist } from '../../types';
import { getPlaylist } from '../../lib/db';
import { downloadPlaylistAudio, getCacheStatus, clearPlaylistCache } from '../../lib/audioCache';
import { Button } from '../shared/Button';

export function AudioDownload() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState({ downloaded: 0, total: 0 });
  const [cachedCount, setCachedCount] = useState(0);

  useEffect(() => {
    if (id) {
      loadPlaylist(id);
    }
  }, [id]);

  const loadPlaylist = async (playlistId: string) => {
    const data = await getPlaylist(playlistId);
    if (data) {
      setPlaylist(data);
      const status = await getCacheStatus(data);
      setCachedCount(status.cachedSongs);
      setProgress({ downloaded: status.cachedSongs, total: status.totalSongs });
    }
  };

  const handleDownload = async () => {
    if (!playlist) return;

    setDownloading(true);

    await downloadPlaylistAudio(playlist, (downloaded, total) => {
      setProgress({ downloaded, total });
    });

    setDownloading(false);

    // Check final status
    const status = await getCacheStatus(playlist);
    if (status.isComplete) {
      navigate(`/host/setup/${playlist.id}`);
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
      navigate(`/host/setup/${playlist.id}`);
    }
  };

  if (!playlist) {
    return (
      <div className="min-h-screen bg-navy-950 flex items-center justify-center">
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }

  const progressPercent = progress.total > 0
    ? Math.round((progress.downloaded / progress.total) * 100)
    : 0;

  const isComplete = progress.downloaded === progress.total && progress.total > 0;

  return (
    <div className="min-h-screen bg-navy-950 p-4 flex flex-col items-center justify-center safe-area-inset">
      <div className="max-w-md w-full">
        <div className="card text-center">
          <h2 className="text-xl font-bold text-white mb-2">{playlist.name}</h2>
          <p className="text-slate-400 mb-6">Download audio for offline play</p>

          {/* Progress */}
          <div className="mb-6">
            <div className="flex justify-between text-sm text-slate-400 mb-2">
              <span>{progress.downloaded} of {progress.total} songs</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="h-3 bg-navy-700 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  isComplete ? 'bg-green-500' : 'bg-indigo-500'
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
                onClick={() => navigate(`/host/setup/${playlist.id}`)}
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
          <p className="mt-6 text-xs text-slate-500">
            Downloaded audio will be cached for offline use.
            {cachedCount > 0 && cachedCount < progress.total && (
              <span className="block mt-1 text-yellow-400">
                Some files may have failed to download.
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
