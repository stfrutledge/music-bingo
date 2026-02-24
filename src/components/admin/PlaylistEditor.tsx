import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Playlist, Song } from '../../types';
import { getPlaylist, savePlaylist } from '../../lib/db';
import { generateAudioFilename } from '../../lib/audioCache';
import { Button } from '../shared/Button';

const DEFAULT_BASE_URL = 'https://yourusername.github.io/music-bingo/packs/';

export function PlaylistEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === 'new';

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [baseAudioUrl, setBaseAudioUrl] = useState(DEFAULT_BASE_URL);
  const [songs, setSongs] = useState<Song[]>([]);
  const [bulkInput, setBulkInput] = useState('');
  const [showBulkInput, setShowBulkInput] = useState(false);
  const [showJsonImport, setShowJsonImport] = useState(false);
  const [jsonInput, setJsonInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isNew && id) {
      loadPlaylist(id);
    }
  }, [id, isNew]);

  const loadPlaylist = async (playlistId: string) => {
    const playlist = await getPlaylist(playlistId);
    if (playlist) {
      setName(playlist.name);
      setDescription(playlist.description || '');
      setBaseAudioUrl(playlist.baseAudioUrl);
      setSongs(playlist.songs);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      alert('Please enter a playlist name');
      return;
    }

    if (songs.length < 24) {
      alert('Playlist must have at least 24 songs for bingo cards');
      return;
    }

    setSaving(true);

    const playlist: Playlist = {
      id: isNew ? `playlist-${Date.now()}` : id!,
      name: name.trim(),
      description: description.trim() || undefined,
      baseAudioUrl: baseAudioUrl.trim(),
      songs,
      createdAt: isNew ? Date.now() : Date.now(),
      updatedAt: Date.now(),
    };

    await savePlaylist(playlist);
    setSaving(false);
    navigate('/admin');
  };

  const addSong = () => {
    const newSong: Song = {
      id: `song-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: '',
      artist: '',
      audioFile: '',
    };
    setSongs([...songs, newSong]);
  };

  const updateSong = (index: number, field: keyof Song, value: string | number) => {
    const updated = [...songs];
    updated[index] = { ...updated[index], [field]: value };

    // Auto-generate audio filename when title or artist changes
    if (field === 'title' || field === 'artist') {
      const song = updated[index];
      if (song.title && song.artist) {
        updated[index].audioFile = generateAudioFilename(song.title, song.artist);
      }
    }

    setSongs(updated);
  };

  const removeSong = (index: number) => {
    setSongs(songs.filter((_, i) => i !== index));
  };

  const moveSong = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= songs.length) return;

    const updated = [...songs];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    setSongs(updated);
  };

  const parseBulkInput = () => {
    const lines = bulkInput.trim().split('\n').filter(line => line.trim());
    const newSongs: Song[] = [];

    for (const line of lines) {
      // Try to parse "Title - Artist" or "Artist - Title" format
      const parts = line.split(/\s*[-–—]\s*/);
      if (parts.length >= 2) {
        const title = parts[0].trim();
        const artist = parts.slice(1).join(' - ').trim();

        newSongs.push({
          id: `song-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          title,
          artist,
          audioFile: generateAudioFilename(title, artist),
        });
      }
    }

    if (newSongs.length > 0) {
      setSongs([...songs, ...newSongs]);
      setBulkInput('');
      setShowBulkInput(false);
    } else {
      alert('Could not parse any songs. Use format: "Title - Artist" (one per line)');
    }
  };

  const parseJsonImport = () => {
    try {
      const data = JSON.parse(jsonInput);

      // Handle full playlist format or just songs array
      const importedSongs = data.songs || data;

      if (!Array.isArray(importedSongs)) {
        alert('Invalid JSON format. Expected array of songs or playlist object with songs array.');
        return;
      }

      const newSongs: Song[] = importedSongs.map((s: Record<string, unknown>) => ({
        id: (s.id as string) || `song-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title: (s.title as string) || '',
        artist: (s.artist as string) || '',
        audioFile: (s.audioFile as string) || '',
        startTime: typeof s.startTime === 'number' ? s.startTime : undefined,
      }));

      // If importing a full playlist, also import metadata
      if (data.name && isNew) {
        setName(data.name);
        if (data.description) setDescription(data.description);
        if (data.baseAudioUrl) setBaseAudioUrl(data.baseAudioUrl);
      }

      setSongs(newSongs);
      setJsonInput('');
      setShowJsonImport(false);
      alert(`Imported ${newSongs.length} songs`);
    } catch {
      alert('Invalid JSON. Please check the format.');
    }
  };

  return (
    <div className="min-h-screen bg-navy-950 p-4">
      <div className="max-w-4xl mx-auto">
        <header className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-white">
            {isNew ? 'Create Playlist' : 'Edit Playlist'}
          </h1>
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin')}>
            Cancel
          </Button>
        </header>

        <div className="space-y-6">
          {/* Basic Info */}
          <div className="card">
            <h2 className="text-lg font-semibold text-white mb-4">Playlist Info</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="input"
                  placeholder="2000s Hits"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Description</label>
                <input
                  type="text"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="input"
                  placeholder="The best songs from the 2000s"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Base Audio URL</label>
                <input
                  type="text"
                  value={baseAudioUrl}
                  onChange={e => setBaseAudioUrl(e.target.value)}
                  className="input"
                  placeholder={DEFAULT_BASE_URL}
                />
                <p className="text-xs text-slate-500 mt-1">
                  Audio files will be loaded from this URL + filename
                </p>
              </div>
            </div>
          </div>

          {/* Songs */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">
                Songs ({songs.length})
                {songs.length < 24 && (
                  <span className="text-yellow-400 text-sm ml-2">
                    (minimum 24 required)
                  </span>
                )}
              </h2>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => { setShowJsonImport(!showJsonImport); setShowBulkInput(false); }}
                >
                  {showJsonImport ? 'Hide JSON' : 'Import JSON'}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => { setShowBulkInput(!showBulkInput); setShowJsonImport(false); }}
                >
                  {showBulkInput ? 'Hide Bulk' : 'Bulk Add'}
                </Button>
                <Button variant="primary" size="sm" onClick={addSong}>
                  Add Song
                </Button>
              </div>
            </div>

            {showJsonImport && (
              <div className="mb-4 p-4 bg-navy-800 rounded-lg">
                <label className="block text-sm text-slate-400 mb-2">
                  Paste JSON from detect_start_times.py script
                </label>
                <textarea
                  value={jsonInput}
                  onChange={e => setJsonInput(e.target.value)}
                  className="input h-32 font-mono text-sm"
                  placeholder='{"songs": [{"title": "...", "artist": "...", "startTime": 30}]}'
                />
                <Button
                  variant="primary"
                  size="sm"
                  className="mt-2"
                  onClick={parseJsonImport}
                >
                  Import JSON
                </Button>
              </div>
            )}

            {showBulkInput && (
              <div className="mb-4 p-4 bg-navy-800 rounded-lg">
                <label className="block text-sm text-slate-400 mb-2">
                  Paste songs (one per line, format: "Title - Artist")
                </label>
                <textarea
                  value={bulkInput}
                  onChange={e => setBulkInput(e.target.value)}
                  className="input h-32 font-mono text-sm"
                  placeholder="Toxic - Britney Spears&#10;Hey Ya! - OutKast&#10;In Da Club - 50 Cent"
                />
                <Button
                  variant="primary"
                  size="sm"
                  className="mt-2"
                  onClick={parseBulkInput}
                >
                  Parse & Add Songs
                </Button>
              </div>
            )}

            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {songs.map((song, index) => (
                <div
                  key={song.id}
                  className="flex items-center gap-2 p-2 bg-navy-800 rounded"
                >
                  <span className="text-slate-500 w-8 text-center">{index + 1}</span>
                  <input
                    type="text"
                    value={song.title}
                    onChange={e => updateSong(index, 'title', e.target.value)}
                    className="input flex-1"
                    placeholder="Song title"
                  />
                  <input
                    type="text"
                    value={song.artist}
                    onChange={e => updateSong(index, 'artist', e.target.value)}
                    className="input flex-1"
                    placeholder="Artist"
                  />
                  <input
                    type="number"
                    value={song.startTime || ''}
                    onChange={e => updateSong(index, 'startTime', e.target.value ? parseInt(e.target.value) : 0)}
                    className="input w-16 text-center"
                    placeholder="0s"
                    min="0"
                    title="Start time (seconds)"
                  />
                  <div className="flex gap-1">
                    <button
                      onClick={() => moveSong(index, 'up')}
                      disabled={index === 0}
                      className="p-1 text-slate-400 hover:text-white disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => moveSong(index, 'down')}
                      disabled={index === songs.length - 1}
                      className="p-1 text-slate-400 hover:text-white disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => removeSong(index)}
                      className="p-1 text-red-400 hover:text-red-300"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-4">
            <Button variant="secondary" onClick={() => navigate('/admin')}>
              Cancel
            </Button>
            <Button
              variant="success"
              onClick={handleSave}
              disabled={saving || !name.trim() || songs.length < 24}
            >
              {saving ? 'Saving...' : 'Save Playlist'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
