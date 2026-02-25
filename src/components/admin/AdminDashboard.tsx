import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { Playlist } from '../../types';
import { getAllPlaylists, deletePlaylist } from '../../lib/db';
import { Button } from '../shared/Button';
import { AppShell } from '../shared/AppShell';

export function AdminDashboard() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPlaylists();
  }, []);

  const loadPlaylists = async () => {
    setLoading(true);
    const data = await getAllPlaylists();
    setPlaylists(data);
    setLoading(false);
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`Delete playlist "${name}"? This will also delete all generated cards.`)) {
      await deletePlaylist(id);
      loadPlaylists();
    }
  };

  return (
    <AppShell title="Admin Dashboard" maxWidth="xl">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-[var(--text-primary)]">Playlists</h1>
          <p className="text-[var(--text-secondary)] mt-1">
            Manage your music bingo playlists and generate cards
          </p>
        </div>
        <Link to="/admin/playlist/new">
          <Button variant="primary" size="lg">
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Playlist
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="text-[var(--text-secondary)] text-center py-12">Loading playlists...</div>
      ) : playlists.length === 0 ? (
        <div className="card text-center py-16 max-w-lg mx-auto">
          <div className="w-16 h-16 rounded-full bg-[var(--bg-hover)] flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">No playlists yet</h2>
          <p className="text-[var(--text-secondary)] mb-6">Create your first playlist to get started</p>
          <Link to="/admin/playlist/new">
            <Button variant="primary">Create Your First Playlist</Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {playlists.map(playlist => (
            <div key={playlist.id} className="card flex flex-col">
              <div className="flex-1 mb-4">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-lg font-semibold text-[var(--text-primary)]">{playlist.name}</h3>
                  <span className="badge badge-info">{playlist.songs.length} songs</span>
                </div>
                {playlist.description && (
                  <p className="text-[var(--text-secondary)] text-sm line-clamp-2">{playlist.description}</p>
                )}
              </div>

              <div className="flex flex-wrap gap-2 pt-4 border-t border-[var(--border-color)]">
                <Link to={`/admin/playlist/${playlist.id}`} className="flex-1 min-w-[80px]">
                  <Button variant="secondary" size="sm" fullWidth>Edit</Button>
                </Link>
                <Link to={`/admin/cards/${playlist.id}`} className="flex-1 min-w-[80px]">
                  <Button variant="secondary" size="sm" fullWidth>Cards</Button>
                </Link>
                <Link to={`/admin/audio/${playlist.id}`} className="flex-1 min-w-[80px]">
                  <Button variant="secondary" size="sm" fullWidth>Audio</Button>
                </Link>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => handleDelete(playlist.id, playlist.name)}
                  className="flex-1 min-w-[80px]"
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
