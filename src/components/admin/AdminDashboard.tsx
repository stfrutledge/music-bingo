import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { Playlist } from '../../types';
import { getAllPlaylists, deletePlaylist } from '../../lib/db';
import { Button } from '../shared/Button';

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
    <div className="min-h-screen bg-navy-950 p-4">
      <div className="max-w-4xl mx-auto">
        <header className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-white">Music Bingo Admin</h1>
          <Link to="/">
            <Button variant="ghost" size="sm">Switch to Host</Button>
          </Link>
        </header>

        <div className="mb-6">
          <Link to="/admin/playlist/new">
            <Button variant="primary">Create New Playlist</Button>
          </Link>
        </div>

        {loading ? (
          <div className="text-slate-400">Loading playlists...</div>
        ) : playlists.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-slate-400 mb-4">No playlists yet</p>
            <Link to="/admin/playlist/new">
              <Button variant="primary">Create Your First Playlist</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {playlists.map(playlist => (
              <div key={playlist.id} className="card">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-white">{playlist.name}</h3>
                    {playlist.description && (
                      <p className="text-slate-400 text-sm mt-1">{playlist.description}</p>
                    )}
                    <p className="text-slate-500 text-sm mt-2">
                      {playlist.songs.length} songs
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Link to={`/admin/playlist/${playlist.id}`}>
                      <Button variant="secondary" size="sm">Edit</Button>
                    </Link>
                    <Link to={`/admin/cards/${playlist.id}`}>
                      <Button variant="secondary" size="sm">Cards</Button>
                    </Link>
                    <Link to={`/admin/audio/${playlist.id}`}>
                      <Button variant="secondary" size="sm">Audio</Button>
                    </Link>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleDelete(playlist.id, playlist.name)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
