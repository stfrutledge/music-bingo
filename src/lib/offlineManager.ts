import { getPlaylist } from './db';
import { getAudioUrl } from './audioCache';

export interface OfflineProgress {
  total: number;
  downloaded: number;
  currentFile: string;
  status: 'idle' | 'downloading' | 'complete' | 'error';
  error?: string;
}

export type ProgressCallback = (progress: OfflineProgress) => void;

const OFFLINE_READY_KEY = 'music-bingo-offline-ready';
const OFFLINE_TIMESTAMP_KEY = 'music-bingo-offline-timestamp';

export function isOfflineReady(): boolean {
  return localStorage.getItem(OFFLINE_READY_KEY) === 'true';
}

export function getOfflineTimestamp(): number | null {
  const ts = localStorage.getItem(OFFLINE_TIMESTAMP_KEY);
  return ts ? parseInt(ts, 10) : null;
}

export function clearOfflineStatus(): void {
  localStorage.removeItem(OFFLINE_READY_KEY);
  localStorage.removeItem(OFFLINE_TIMESTAMP_KEY);
}

export async function downloadAllAudio(
  playlistId: string,
  onProgress: ProgressCallback
): Promise<boolean> {
  try {
    const playlist = await getPlaylist(playlistId);
    if (!playlist) {
      onProgress({
        total: 0,
        downloaded: 0,
        currentFile: '',
        status: 'error',
        error: 'Playlist not found',
      });
      return false;
    }

    const songs = playlist.songs;
    const total = songs.length;

    onProgress({
      total,
      downloaded: 0,
      currentFile: 'Starting...',
      status: 'downloading',
    });

    // Open or create a cache for audio files
    const cache = await caches.open('audio-cache');

    for (let i = 0; i < songs.length; i++) {
      const song = songs[i];
      const url = getAudioUrl(playlist.baseAudioUrl, song.audioFile);

      onProgress({
        total,
        downloaded: i,
        currentFile: `${song.title} - ${song.artist}`,
        status: 'downloading',
      });

      try {
        // Check if already cached
        const cached = await cache.match(url);
        if (!cached) {
          // Download and cache the file
          const response = await fetch(url);
          if (response.ok) {
            await cache.put(url, response.clone());
          } else {
            console.warn(`Failed to download: ${song.audioFile}`);
          }
        }
      } catch (err) {
        console.warn(`Error downloading ${song.audioFile}:`, err);
        // Continue with other files
      }
    }

    // Mark as offline ready
    localStorage.setItem(OFFLINE_READY_KEY, 'true');
    localStorage.setItem(OFFLINE_TIMESTAMP_KEY, Date.now().toString());

    onProgress({
      total,
      downloaded: total,
      currentFile: '',
      status: 'complete',
    });

    return true;
  } catch (err) {
    onProgress({
      total: 0,
      downloaded: 0,
      currentFile: '',
      status: 'error',
      error: err instanceof Error ? err.message : 'Unknown error',
    });
    return false;
  }
}

export async function checkCacheStatus(playlistId: string): Promise<{
  total: number;
  cached: number;
}> {
  try {
    const playlist = await getPlaylist(playlistId);
    if (!playlist) {
      return { total: 0, cached: 0 };
    }

    const cache = await caches.open('audio-cache');
    let cached = 0;

    for (const song of playlist.songs) {
      const url = getAudioUrl(playlist.baseAudioUrl, song.audioFile);
      const match = await cache.match(url);
      if (match) {
        cached++;
      }
    }

    return { total: playlist.songs.length, cached };
  } catch {
    return { total: 0, cached: 0 };
  }
}
