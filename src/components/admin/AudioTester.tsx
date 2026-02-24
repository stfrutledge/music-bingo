import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Playlist, Song } from '../../types';
import { getPlaylist } from '../../lib/db';
import { getAudioUrl } from '../../lib/audioCache';
import { Button } from '../shared/Button';

interface SongStatus {
  song: Song;
  status: 'pending' | 'loading' | 'success' | 'error';
  error?: string;
}

export function AudioTester() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [songStatuses, setSongStatuses] = useState<SongStatus[]>([]);
  const [testing, setTesting] = useState(false);
  const [playingSong, setPlayingSong] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (id) {
      loadPlaylist(id);
    }
    return () => {
      audioRef.current?.pause();
    };
  }, [id]);

  const loadPlaylist = async (playlistId: string) => {
    const data = await getPlaylist(playlistId);
    if (data) {
      setPlaylist(data);
      setSongStatuses(data.songs.map(song => ({
        song,
        status: 'pending',
      })));
    }
  };

  const testSingleSong = async (song: Song): Promise<boolean> => {
    if (!playlist) return false;

    const url = getAudioUrl(playlist.baseAudioUrl, song.audioFile);

    try {
      const response = await fetch(url, { method: 'HEAD' });
      return response.ok;
    } catch {
      return false;
    }
  };

  const testAllSongs = async () => {
    if (!playlist) return;

    setTesting(true);

    for (let i = 0; i < songStatuses.length; i++) {
      const { song } = songStatuses[i];

      setSongStatuses(prev =>
        prev.map((s, idx) =>
          idx === i ? { ...s, status: 'loading' } : s
        )
      );

      const success = await testSingleSong(song);

      setSongStatuses(prev =>
        prev.map((s, idx) =>
          idx === i
            ? { ...s, status: success ? 'success' : 'error', error: success ? undefined : 'File not found' }
            : s
        )
      );
    }

    setTesting(false);
  };

  const playSong = (song: Song) => {
    if (!playlist) return;

    if (playingSong === song.id) {
      audioRef.current?.pause();
      setPlayingSong(null);
      return;
    }

    const url = getAudioUrl(playlist.baseAudioUrl, song.audioFile);

    if (!audioRef.current) {
      audioRef.current = new Audio();
    }

    audioRef.current.src = url;
    audioRef.current.play();
    setPlayingSong(song.id);

    audioRef.current.onended = () => setPlayingSong(null);
    audioRef.current.onerror = () => setPlayingSong(null);
  };

  const successCount = songStatuses.filter(s => s.status === 'success').length;
  const errorCount = songStatuses.filter(s => s.status === 'error').length;
  const pendingCount = songStatuses.filter(s => s.status === 'pending').length;

  if (!playlist) {
    return (
      <div className="min-h-screen bg-navy-950 p-4 flex items-center justify-center">
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-navy-950 p-4">
      <div className="max-w-4xl mx-auto">
        <header className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Audio Tester</h1>
            <p className="text-slate-400">{playlist.name}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin')}>
            Back to Admin
          </Button>
        </header>

        {/* Summary */}
        <div className="card mb-6">
          <div className="flex items-center justify-between">
            <div className="flex gap-6">
              <div>
                <span className="text-2xl font-bold text-white">{playlist.songs.length}</span>
                <span className="text-slate-400 ml-2">total songs</span>
              </div>
              {successCount > 0 && (
                <div>
                  <span className="text-2xl font-bold text-green-400">{successCount}</span>
                  <span className="text-slate-400 ml-2">found</span>
                </div>
              )}
              {errorCount > 0 && (
                <div>
                  <span className="text-2xl font-bold text-red-400">{errorCount}</span>
                  <span className="text-slate-400 ml-2">missing</span>
                </div>
              )}
              {pendingCount > 0 && pendingCount !== playlist.songs.length && (
                <div>
                  <span className="text-2xl font-bold text-slate-400">{pendingCount}</span>
                  <span className="text-slate-400 ml-2">pending</span>
                </div>
              )}
            </div>
            <Button
              variant="primary"
              onClick={testAllSongs}
              disabled={testing}
            >
              {testing ? 'Testing...' : 'Test All Files'}
            </Button>
          </div>
        </div>

        {/* Base URL Info */}
        <div className="card mb-6">
          <h3 className="text-sm font-semibold text-white mb-2">Base Audio URL</h3>
          <code className="text-sm text-indigo-400 break-all">{playlist.baseAudioUrl}</code>
        </div>

        {/* Song List */}
        <div className="space-y-2">
          {songStatuses.map(({ song, status, error }, index) => (
            <div
              key={song.id}
              className="card flex items-center gap-4"
            >
              <span className="text-slate-500 w-8 text-center">{index + 1}</span>

              {/* Status indicator */}
              <div className="w-8">
                {status === 'pending' && (
                  <div className="w-3 h-3 rounded-full bg-slate-600" />
                )}
                {status === 'loading' && (
                  <div className="w-3 h-3 rounded-full bg-yellow-400 animate-pulse" />
                )}
                {status === 'success' && (
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                )}
                {status === 'error' && (
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                )}
              </div>

              {/* Song info */}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-white truncate">{song.title}</div>
                <div className="text-sm text-slate-400 truncate">{song.artist}</div>
              </div>

              {/* Filename */}
              <div className="hidden md:block text-xs text-slate-500 truncate max-w-[200px]">
                {song.audioFile}
              </div>

              {/* Error message */}
              {error && (
                <div className="text-sm text-red-400">{error}</div>
              )}

              {/* Play button */}
              <Button
                variant={playingSong === song.id ? 'danger' : 'secondary'}
                size="sm"
                onClick={() => playSong(song)}
              >
                {playingSong === song.id ? 'Stop' : 'Play'}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
