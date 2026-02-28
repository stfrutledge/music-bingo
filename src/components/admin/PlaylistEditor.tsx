import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Playlist, Song } from '../../types';
import { getPlaylist, savePlaylist } from '../../lib/db';
import { generateAudioFilename } from '../../lib/audioCache';
import { Button } from '../shared/Button';
import { AppShell } from '../shared/AppShell';

const DEFAULT_BASE_URL = 'https://yourusername.github.io/music-bingo/packs/';

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

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
  const [deployStatus, setDeployStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');

  // Audio preview state
  const [expandedSongIndex, setExpandedSongIndex] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioError, setAudioError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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

  const handleSaveForDeployment = async () => {
    if (!name.trim() || songs.length < 24) return;

    setDeployStatus('saving');

    const playlist: Playlist = {
      id: isNew ? `playlist-${Date.now()}` : id!,
      name: name.trim(),
      description: description.trim() || undefined,
      baseAudioUrl: baseAudioUrl.trim(),
      songs,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    try {
      const response = await fetch('/api/save-playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlist }),
      });

      if (response.ok) {
        // Also save to IndexedDB
        await savePlaylist(playlist);
        setDeployStatus('success');
      } else {
        setDeployStatus('error');
      }
    } catch {
      setDeployStatus('error');
    }
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

  const updateSong = (index: number, field: keyof Song, value: string | number | boolean) => {
    const updated = [...songs];
    updated[index] = { ...updated[index], [field]: value };

    // Auto-generate audio filename when title or artist changes
    if (field === 'title' || field === 'artist') {
      const song = updated[index];
      if (song.title && song.artist) {
        updated[index].audioFile = generateAudioFilename(song.title, song.artist);
      }
    }

    // Auto-lock start time when manually edited
    if (field === 'startTime') {
      updated[index].startTimeManual = true;
    }

    setSongs(updated);
  };

  const toggleStartTimeLock = (index: number) => {
    const updated = [...songs];
    updated[index] = {
      ...updated[index],
      startTimeManual: !updated[index].startTimeManual
    };
    setSongs(updated);
  };

  // Audio preview functions
  const toggleExpanded = useCallback((index: number) => {
    if (expandedSongIndex === index) {
      // Collapse and stop audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setExpandedSongIndex(null);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      setAudioError(null);
    } else {
      // Stop any existing audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setExpandedSongIndex(index);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      setAudioError(null);

      // Load the new audio
      const song = songs[index];
      if (song.audioFile && baseAudioUrl) {
        const audio = new Audio(`${baseAudioUrl}${song.audioFile}`);
        audioRef.current = audio;

        audio.addEventListener('loadedmetadata', () => {
          setDuration(audio.duration);
        });

        audio.addEventListener('timeupdate', () => {
          setCurrentTime(audio.currentTime);
        });

        audio.addEventListener('ended', () => {
          setIsPlaying(false);
        });

        audio.addEventListener('error', () => {
          setAudioError('Could not load audio file');
        });

        audio.load();
      } else {
        setAudioError('No audio file specified');
      }
    }
  }, [expandedSongIndex, songs, baseAudioUrl]);

  const togglePlayPause = useCallback(() => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(() => {
        setAudioError('Could not play audio');
      });
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const seekTo = useCallback((time: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = time;
    setCurrentTime(time);
  }, []);

  const handleTimelineClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || duration === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newTime = percentage * duration;
    seekTo(newTime);
  }, [duration, seekTo]);

  const setStartTimeFromPlayback = useCallback((index: number) => {
    const roundedTime = Math.floor(currentTime);
    updateSong(index, 'startTime', roundedTime);
  }, [currentTime]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

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

      // Create a map of existing songs by ID for preserving manual overrides
      const existingSongsById = new Map(songs.map(s => [s.id, s]));
      // Also create a map by title+artist for matching songs without IDs
      const existingSongsByKey = new Map(songs.map(s => [`${s.title.toLowerCase()}|${s.artist.toLowerCase()}`, s]));

      let preservedCount = 0;

      const newSongs: Song[] = importedSongs.map((s: Record<string, unknown>) => {
        const importedId = s.id as string;
        const importedTitle = (s.title as string) || '';
        const importedArtist = (s.artist as string) || '';
        const songKey = `${importedTitle.toLowerCase()}|${importedArtist.toLowerCase()}`;

        // Check if we have an existing song with manual start time
        const existingSong = existingSongsById.get(importedId) || existingSongsByKey.get(songKey);

        if (existingSong?.startTimeManual) {
          // Preserve the manually set start time
          preservedCount++;
          return {
            id: importedId || `song-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            title: importedTitle,
            artist: importedArtist,
            audioFile: (s.audioFile as string) || existingSong.audioFile || '',
            startTime: existingSong.startTime,
            startTimeManual: true,
          };
        }

        return {
          id: importedId || `song-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          title: importedTitle,
          artist: importedArtist,
          audioFile: (s.audioFile as string) || '',
          startTime: typeof s.startTime === 'number' ? s.startTime : undefined,
          startTimeManual: typeof s.startTimeManual === 'boolean' ? s.startTimeManual : undefined,
        };
      });

      // If importing a full playlist, also import metadata
      if (data.name && isNew) {
        setName(data.name);
        if (data.description) setDescription(data.description);
        if (data.baseAudioUrl) setBaseAudioUrl(data.baseAudioUrl);
      }

      setSongs(newSongs);
      setJsonInput('');
      setShowJsonImport(false);

      const message = preservedCount > 0
        ? `Imported ${newSongs.length} songs (${preservedCount} manually-locked start times preserved)`
        : `Imported ${newSongs.length} songs`;
      alert(message);
    } catch {
      alert('Invalid JSON. Please check the format.');
    }
  };

  return (
    <AppShell title={isNew ? 'Create Playlist' : 'Edit Playlist'} maxWidth="xl">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-[var(--text-primary)]">
            {isNew ? 'Create Playlist' : 'Edit Playlist'}
          </h1>
          {!isNew && name && (
            <p className="text-[var(--text-secondary)] mt-1">{name}</p>
          )}
        </div>
        <Button variant="ghost" onClick={() => navigate('/admin')}>
          Cancel
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content - 2 columns on desktop */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Info */}
          <div className="card">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 uppercase tracking-wide">Playlist Info</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="input"
                  placeholder="2000s Hits"
                />
              </div>
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">Description</label>
                <input
                  type="text"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="input"
                  placeholder="The best songs from the 2000s"
                />
              </div>
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">Base Audio URL</label>
                <input
                  type="text"
                  value={baseAudioUrl}
                  onChange={e => setBaseAudioUrl(e.target.value)}
                  className="input"
                  placeholder={DEFAULT_BASE_URL}
                />
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Audio files will be loaded from this URL + filename
                </p>
              </div>
            </div>
          </div>

          {/* Songs */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                Songs ({songs.length})
                {songs.length < 24 && (
                  <span className="text-[var(--status-warning-text)] text-sm ml-2">
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
              <div className="mb-4 p-4 bg-[var(--bg-hover)] border border-[var(--border-color)] rounded-lg">
                <label className="block text-sm text-[var(--text-secondary)] mb-2">
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
              <div className="mb-4 p-4 bg-[var(--bg-hover)] border border-[var(--border-color)] rounded-lg">
                <label className="block text-sm text-[var(--text-secondary)] mb-2">
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

            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {songs.map((song, index) => {
                const isExpanded = expandedSongIndex === index;
                return (
                  <div
                    key={song.id}
                    className={`bg-[var(--bg-hover)] border border-[var(--border-color)] rounded ${
                      isExpanded ? 'ring-2 ring-[var(--accent-primary)]' : ''
                    }`}
                  >
                    {/* Main song row */}
                    <div
                      className="flex items-center gap-2 p-2 cursor-pointer hover:bg-[var(--bg-tertiary)] transition-colors"
                      onClick={() => toggleExpanded(index)}
                    >
                      <span className="text-[var(--text-muted)] w-6 text-center text-sm">{index + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-[var(--text-primary)] truncate">
                          {song.title || <span className="text-[var(--text-muted)] italic">Untitled</span>}
                        </div>
                        <div className="text-sm text-[var(--text-secondary)] truncate">
                          {song.artist || <span className="text-[var(--text-muted)] italic">Unknown artist</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-sm text-[var(--text-muted)]">
                        {song.startTime !== undefined && song.startTime > 0 && (
                          <span className="px-2 py-0.5 rounded bg-[var(--bg-tertiary)]">
                            {formatTime(song.startTime)}
                          </span>
                        )}
                        {song.startTimeManual && (
                          <span title="Start time manually locked">🔒</span>
                        )}
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleExpanded(index); }}
                        className={`p-1.5 rounded transition-colors ${
                          isExpanded
                            ? 'text-[var(--accent-primary)] bg-[var(--accent-primary)]/10'
                            : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                        }`}
                        title={isExpanded ? 'Close' : 'Edit & preview'}
                      >
                        {isExpanded ? '▲' : '▼'}
                      </button>
                    </div>

                    {/* Expanded edit & audio preview */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-2 border-t border-[var(--border-color)] space-y-4">
                        {/* Edit fields */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-[var(--text-muted)] mb-1">Title</label>
                            <input
                              type="text"
                              value={song.title}
                              onChange={e => updateSong(index, 'title', e.target.value)}
                              className="input w-full"
                              placeholder="Song title"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-[var(--text-muted)] mb-1">Artist</label>
                            <input
                              type="text"
                              value={song.artist}
                              onChange={e => updateSong(index, 'artist', e.target.value)}
                              className="input w-full"
                              placeholder="Artist"
                            />
                          </div>
                        </div>

                        {/* Start time controls */}
                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-[var(--text-muted)]">Start time:</label>
                            <input
                              type="number"
                              value={song.startTime || ''}
                              onChange={e => updateSong(index, 'startTime', e.target.value ? parseInt(e.target.value) : 0)}
                              className="input w-20 text-center"
                              placeholder="0"
                              min="0"
                            />
                            <span className="text-xs text-[var(--text-muted)]">sec</span>
                          </div>
                          <button
                            onClick={() => toggleStartTimeLock(index)}
                            className={`px-2 py-1 rounded text-sm flex items-center gap-1 transition-colors ${
                              song.startTimeManual
                                ? 'text-[var(--status-success-text)] bg-[var(--status-success-bg)]'
                                : 'text-[var(--text-muted)] bg-[var(--bg-tertiary)] hover:text-[var(--text-secondary)]'
                            }`}
                            title={song.startTimeManual
                              ? 'Locked - will be preserved on import'
                              : 'Unlocked - will be updated on import'
                            }
                          >
                            {song.startTimeManual ? '🔒 Locked' : '🔓 Unlocked'}
                          </button>
                        </div>

                        {/* Audio player */}
                        {audioError ? (
                          <p className="text-[var(--status-error-text)] text-sm">{audioError}</p>
                        ) : (
                          <div className="space-y-4">
                            {/* Progress bar - same style as game */}
                            <div className="relative">
                              {/* Start time marker (behind progress bar) */}
                              {song.startTime !== undefined && song.startTime > 0 && duration > 0 && (
                                <div
                                  className="absolute top-0 w-1 h-3 bg-[var(--accent-green)] rounded-full z-10 -translate-x-1/2"
                                  style={{ left: `${(song.startTime / duration) * 100}%` }}
                                  title={`Start time: ${formatTime(song.startTime)}`}
                                />
                              )}
                              <div
                                className="h-3 bg-[var(--bg-hover)] rounded-full cursor-pointer relative"
                                onClick={handleTimelineClick}
                              >
                                <div
                                  className="h-full bg-[var(--accent-green)] rounded-full transition-all"
                                  style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%' }}
                                />
                              </div>
                            </div>

                            {/* Controls row */}
                            <div className="flex items-center gap-4">
                              {/* Time */}
                              <span className="text-sm text-[var(--text-secondary)] w-12 font-mono">{formatTime(currentTime)}</span>

                              {/* Play/Pause */}
                              <button
                                onClick={togglePlayPause}
                                className="w-12 h-12 flex items-center justify-center bg-[var(--accent-green)] rounded-full hover:opacity-90 transition-opacity"
                              >
                                {isPlaying ? (
                                  <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                                  </svg>
                                ) : (
                                  <svg className="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M8 5v14l11-7z" />
                                  </svg>
                                )}
                              </button>

                              {/* Duration */}
                              <span className="text-sm text-[var(--text-secondary)] w-12 font-mono">{formatTime(duration)}</span>

                              <div className="flex-1" />

                              {/* Set Start Time button */}
                              <Button
                                variant="success"
                                size="sm"
                                onClick={() => setStartTimeFromPlayback(index)}
                                disabled={duration === 0}
                              >
                                Set Start @ {formatTime(currentTime)}
                              </Button>

                              {/* Jump to start time */}
                              {song.startTime !== undefined && song.startTime > 0 && (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => seekTo(song.startTime!)}
                                >
                                  Go to {formatTime(song.startTime)}
                                </Button>
                              )}
                            </div>

                            {/* Song actions row */}
                            <div className="flex items-center gap-2 pt-2 border-t border-[var(--border-color)]">
                              <button
                                onClick={() => moveSong(index, 'up')}
                                disabled={index === 0}
                                className="px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 bg-[var(--bg-tertiary)] rounded"
                              >
                                ↑ Move up
                              </button>
                              <button
                                onClick={() => moveSong(index, 'down')}
                                disabled={index === songs.length - 1}
                                className="px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 bg-[var(--bg-tertiary)] rounded"
                              >
                                ↓ Move down
                              </button>
                              <div className="flex-1" />
                              <button
                                onClick={() => { toggleExpanded(index); removeSong(index); }}
                                className="px-3 py-1.5 text-sm text-[var(--status-error-text)] hover:opacity-80 bg-[var(--bg-tertiary)] rounded"
                              >
                                Delete song
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Sidebar - Actions and Info */}
        <div className="space-y-6">
          {/* Save Card */}
          <div className="card">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Actions</h3>
            <div className="space-y-3">
              <Button
                variant="success"
                fullWidth
                onClick={handleSave}
                disabled={saving || !name.trim() || songs.length < 24}
              >
                {saving ? 'Saving...' : 'Save Playlist'}
              </Button>

              <div className="border-t border-[var(--border-color)] pt-3">
                <p className="text-xs text-[var(--text-muted)] mb-2">For deployment:</p>
                <Button
                  variant="primary"
                  fullWidth
                  onClick={handleSaveForDeployment}
                  disabled={deployStatus === 'saving' || !name.trim() || songs.length < 24}
                >
                  {deployStatus === 'saving' ? 'Saving...' : 'Save for Deployment'}
                </Button>
                {deployStatus === 'success' && (
                  <p className="text-xs text-[var(--status-success-text)] mt-1 text-center">
                    Saved to public/packs/
                  </p>
                )}
                {deployStatus === 'error' && (
                  <p className="text-xs text-[var(--status-error-text)] mt-1 text-center">
                    Failed (dev server required)
                  </p>
                )}
              </div>

              <Button variant="secondary" fullWidth onClick={() => navigate('/admin')}>
                Cancel
              </Button>
            </div>
          </div>

          {/* Info Card */}
          <div className="card">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3 uppercase tracking-wide">Info</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Songs:</span>
                <span className={`font-medium ${songs.length >= 24 ? 'text-[var(--status-success-text)]' : 'text-[var(--status-warning-text)]'}`}>
                  {songs.length}/24 minimum
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Status:</span>
                <span className={`font-medium ${songs.length >= 24 && name.trim() ? 'text-[var(--status-success-text)]' : 'text-[var(--text-muted)]'}`}>
                  {songs.length >= 24 && name.trim() ? 'Ready to save' : 'Incomplete'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
