import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Playlist, CacheStatus } from '../../types';
import { getAllPlaylists } from '../../lib/db';
import { getCacheStatus } from '../../lib/audioCache';
import { Button } from '../shared/Button';
import { AppShell } from '../shared/AppShell';

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
    <AppShell title="Select Playlist" maxWidth="xl">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-[var(--text-primary)]">Select a Playlist</h1>
          <p className="text-[var(--text-secondary)] mt-1">
            Choose a playlist to start your music bingo game
          </p>
        </div>
        <Button variant="ghost" onClick={() => navigate('/')}>
          Cancel
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-[var(--text-secondary)]">
          Loading playlists...
        </div>
      ) : playlists.length === 0 ? (
        <div className="card text-center py-16 max-w-lg mx-auto">
          <div className="w-16 h-16 rounded-full bg-[var(--bg-hover)] flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">No playlists available</h2>
          <p className="text-[var(--text-secondary)] mb-6">
            Create playlists in Admin mode first
          </p>
          <Button variant="primary" onClick={() => navigate('/admin')}>
            Go to Admin
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {playlists.map(playlist => (
            <button
              key={playlist.id}
              onClick={() => handleSelect(playlist)}
              className="card text-left hover:border-[var(--accent-green)] hover:shadow-md transition-all group"
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-lg font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-green)] transition-colors">
                  {playlist.name}
                </h3>
                <svg
                  className="w-5 h-5 text-[var(--text-muted)] group-hover:text-[var(--accent-green)] transition-colors flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>

              {playlist.description && (
                <p className="text-sm text-[var(--text-secondary)] line-clamp-2 mb-4">
                  {playlist.description}
                </p>
              )}

              <div className="flex items-center justify-between pt-4 border-t border-[var(--border-color)]">
                <span className="text-sm text-[var(--text-muted)]">
                  {playlist.songs.length} songs
                </span>

                {/* Cache status indicator */}
                {playlist.cacheStatus?.isComplete ? (
                  <span className="badge badge-success">Ready</span>
                ) : playlist.cacheStatus && playlist.cacheStatus.cachedSongs > 0 ? (
                  <span className="badge badge-warning">
                    {playlist.cacheStatus.cachedSongs}/{playlist.cacheStatus.totalSongs}
                  </span>
                ) : (
                  <span className="badge badge-neutral">Not downloaded</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </AppShell>
  );
}
