import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Playlist, CacheStatus } from '../../types';
import { getAllPlaylists } from '../../lib/db';
import { getCacheStatus } from '../../lib/audioCache';
import { Button } from '../shared/Button';

interface PlaylistWithCache extends Playlist {
  cacheStatus?: CacheStatus;
}

export function PlaylistSelect() {
  const navigate = useNavigate();
  const [playlists, setPlaylists] = useState<PlaylistWithCache[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPlaylists();
  }, []);

  const loadPlaylists = async () => {
    setLoading(true);
    const data = await getAllPlaylists();

    // Get cache status for each playlist
    const withCache: PlaylistWithCache[] = await Promise.all(
      data.map(async playlist => ({
        ...playlist,
        cacheStatus: await getCacheStatus(playlist),
      }))
    );

    setPlaylists(withCache);
    setLoading(false);
  };

  const handleSelect = (playlist: PlaylistWithCache) => {
    if (playlist.cacheStatus?.isComplete) {
      navigate(`/host/setup/${playlist.id}`);
    } else {
      navigate(`/host/download/${playlist.id}`);
    }
  };

  return (
    <div className="min-h-screen bg-navy-950 p-4 safe-area-inset">
      <div className="max-w-md mx-auto">
        <header className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-white">Select Playlist</h1>
          <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
            Cancel
          </Button>
        </header>

        {loading ? (
          <div className="text-center py-12 text-slate-400">
            Loading playlists...
          </div>
        ) : playlists.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-slate-400 mb-4">No playlists available</p>
            <p className="text-sm text-slate-500 mb-6">
              Create playlists in Admin mode first
            </p>
            <Button variant="primary" onClick={() => navigate('/admin')}>
              Go to Admin
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {playlists.map(playlist => (
              <button
                key={playlist.id}
                onClick={() => handleSelect(playlist)}
                className="w-full card text-left hover:bg-navy-800 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-white">
                      {playlist.name}
                    </h3>
                    <p className="text-sm text-slate-400">
                      {playlist.songs.length} songs
                    </p>
                  </div>

                  {/* Cache status indicator */}
                  <div className="flex items-center gap-2">
                    {playlist.cacheStatus?.isComplete ? (
                      <span className="px-2 py-1 bg-green-600/20 text-green-400 text-xs rounded-full">
                        Ready
                      </span>
                    ) : playlist.cacheStatus && playlist.cacheStatus.cachedSongs > 0 ? (
                      <span className="px-2 py-1 bg-yellow-600/20 text-yellow-400 text-xs rounded-full">
                        {playlist.cacheStatus.cachedSongs}/{playlist.cacheStatus.totalSongs}
                      </span>
                    ) : (
                      <span className="px-2 py-1 bg-slate-600/20 text-slate-400 text-xs rounded-full">
                        Not downloaded
                      </span>
                    )}
                    <svg
                      className="w-5 h-5 text-slate-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
