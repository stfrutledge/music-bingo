import type { Playlist, CacheStatus } from '../types';

const AUDIO_CACHE_NAME = 'music-bingo-audio-v1';

export async function openAudioCache(): Promise<Cache> {
  return caches.open(AUDIO_CACHE_NAME);
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
