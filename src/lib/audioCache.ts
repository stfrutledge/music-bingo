import type { Playlist, CacheStatus } from '../types';

const AUDIO_CACHE_NAME = 'music-bingo-audio-v1';

export async function openAudioCache(): Promise<Cache> {
  return caches.open(AUDIO_CACHE_NAME);
}

/**
 * Check if audio files are directly accessible (local server or already available).
 * This is faster than checking cache and works for locally-hosted files.
 */
export async function checkAudioAvailability(playlist: Playlist): Promise<{
  available: number;
  total: number;
  allAvailable: boolean;
  isLocal: boolean;
}> {
  const total = playlist.songs.length;
  let available = 0;

  // Check if baseUrl is local (localhost, 127.0.0.1, or relative path)
  const isLocal = isLocalUrl(playlist.baseAudioUrl);

  // Sample check: test first few files to see if they're accessible
  const samplesToCheck = Math.min(3, playlist.songs.length);

  for (let i = 0; i < samplesToCheck; i++) {
    const song = playlist.songs[i];
    const url = getAudioUrl(playlist.baseAudioUrl, song.audioFile);

    try {
      // Use GET with range header to just fetch first byte (more compatible than HEAD)
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Range': 'bytes=0-0' },
      });
      // Accept 200 (full response) or 206 (partial content)
      if (response.ok || response.status === 206) {
        available++;
      }
    } catch (err) {
      console.warn(`File not accessible: ${url}`, err);
    }
  }

  // If all samples are available, assume all files are available
  const allAvailable = available === samplesToCheck;

  return {
    available: allAvailable ? total : available,
    total,
    allAvailable,
    isLocal,
  };
}

/**
 * Check if a URL is local (doesn't require downloading/caching).
 */
export function isLocalUrl(url: string): boolean {
  if (!url) return false;

  // Relative URLs are local
  if (url.startsWith('/') || url.startsWith('./')) return true;

  try {
    const parsed = new URL(url, window.location.origin);
    const hostname = parsed.hostname.toLowerCase();

    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname.endsWith('.local') ||
      hostname === window.location.hostname
    );
  } catch {
    return false;
  }
}

export async function getCacheStatus(playlist: Playlist): Promise<CacheStatus> {
  const cache = await openAudioCache();
  let cachedCount = 0;

  for (const song of playlist.songs) {
    const url = getAudioUrl(playlist.baseAudioUrl, song.audioFile);
    const response = await cache.match(url);
    if (response) {
      cachedCount++;
    }
  }

  return {
    playlistId: playlist.id,
    totalSongs: playlist.songs.length,
    cachedSongs: cachedCount,
    isComplete: cachedCount === playlist.songs.length,
  };
}

export async function downloadPlaylistAudio(
  playlist: Playlist,
  onProgress?: (downloaded: number, total: number) => void
): Promise<void> {
  const cache = await openAudioCache();
  const total = playlist.songs.length;
  let downloaded = 0;

  for (const song of playlist.songs) {
    const url = getAudioUrl(playlist.baseAudioUrl, song.audioFile);

    // Check if already cached
    const existing = await cache.match(url);
    if (!existing) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          await cache.put(url, response);
        }
      } catch (error) {
        console.warn(`Failed to cache ${song.title}:`, error);
      }
    }

    downloaded++;
    onProgress?.(downloaded, total);
  }
}

export async function getAudioFromCache(url: string): Promise<Response | undefined> {
  const cache = await openAudioCache();
  return cache.match(url);
}

export async function isAudioCached(url: string): Promise<boolean> {
  const response = await getAudioFromCache(url);
  return response !== undefined;
}

export async function clearPlaylistCache(playlist: Playlist): Promise<void> {
  const cache = await openAudioCache();

  for (const song of playlist.songs) {
    const url = getAudioUrl(playlist.baseAudioUrl, song.audioFile);
    await cache.delete(url);
  }
}

export async function clearAllAudioCache(): Promise<boolean> {
  return caches.delete(AUDIO_CACHE_NAME);
}

export function getAudioUrl(baseUrl: string, filename: string): string {
  // Ensure baseUrl ends with /
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${base}${filename}`;
}

export function generateAudioFilename(title: string, artist: string): string {
  const sanitize = (str: string) =>
    str
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

  return `${sanitize(artist)}-${sanitize(title)}.mp3`;
}
