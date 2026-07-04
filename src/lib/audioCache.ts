import type { Playlist, CacheStatus } from '../types';
import { getEffectiveBaseUrl } from './audioSettings';

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

const DOWNLOAD_CONCURRENCY = 4;
const DOWNLOAD_ATTEMPTS = 3;

/**
 * Ask the browser to protect our storage from eviction. Without this, Android
 * can silently drop the ~1.7 GB audio cache under storage pressure — fatal for
 * an offline gig. Safe to call repeatedly.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export interface StorageInfo {
  usageMB: number;
  quotaMB: number;
  persisted: boolean;
}

export async function getStorageInfo(): Promise<StorageInfo | null> {
  if (!navigator.storage?.estimate) return null;
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    const persisted = navigator.storage.persisted
      ? await navigator.storage.persisted()
      : false;
    return {
      usageMB: Math.round(usage / 1048576),
      quotaMB: Math.round(quota / 1048576),
      persisted,
    };
  } catch {
    return null;
  }
}

async function fetchWithRetry(url: string): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, { mode: 'cors' });
      if (response.ok) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < DOWNLOAD_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
  throw lastError;
}

export async function downloadPlaylistAudio(
  playlist: Playlist,
  onProgress?: (downloaded: number, total: number, error?: string) => void
): Promise<{ success: number; failed: number; failedSongs: string[] }> {
  const cache = await openAudioCache();
  await requestPersistentStorage();

  const total = playlist.songs.length;
  let downloaded = 0;
  let success = 0;
  let failed = 0;
  const failedSongs: string[] = [];
  const queue = [...playlist.songs];

  const worker = async () => {
    for (;;) {
      const song = queue.shift();
      if (!song) return;
      const url = getAudioUrl(playlist.baseAudioUrl, song.audioFile);

      try {
        const existing = await cache.match(url);
        if (!existing) {
          const response = await fetchWithRetry(url);
          await cache.put(url, response);
          const verify = await cache.match(url);
          if (!verify) throw new Error('cached entry failed verification');
        }
        success++;
      } catch (error) {
        console.error(`Failed to download ${song.title}:`, error);
        failed++;
        failedSongs.push(`${song.title} - ${song.artist}`);
        onProgress?.(downloaded, total, `Error: ${song.audioFile}`);
      }

      downloaded++;
      onProgress?.(downloaded, total);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, total) }, worker)
  );

  console.log(`Download complete: ${success} success, ${failed} failed out of ${total}`);
  if (failedSongs.length > 0) {
    console.log('Failed songs:', failedSongs);
  }
  return { success, failed, failedSongs };
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

export function getAudioUrl(_baseUrl: string, filename: string): string {
  // Use the effective base URL from settings (ignores playlist's baseUrl)
  const effectiveBase = getEffectiveBaseUrl();
  // Ensure base ends with /
  const base = effectiveBase.endsWith('/') ? effectiveBase : `${effectiveBase}/`;
  // URL-encode the filename to handle special characters (parentheses, spaces, etc.)
  return `${base}${encodeURIComponent(filename)}`;
}

export function generateAudioFilename(title: string, artist: string): string {
  const sanitize = (str: string) =>
    str
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

  return `${sanitize(artist)}-${sanitize(title)}.mp3`;
}
