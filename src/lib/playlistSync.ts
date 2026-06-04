import { db, savePlaylist, getPlaylist } from './db';
import type { Playlist } from '../types';

const MANIFEST_URL = `${import.meta.env.BASE_URL}packs/playlists-manifest.json`;

interface PlaylistManifestEntry {
  id: string;
  name: string;
  songCount: number;
  path: string;
  updatedAt?: number;
}

interface PlaylistManifest {
  playlists: PlaylistManifestEntry[];
}

/**
 * Fetches the playlists manifest from the public packs directory
 */
export async function fetchPlaylistManifest(): Promise<PlaylistManifest | null> {
  try {
    const response = await fetch(MANIFEST_URL);
    if (!response.ok) return null;
    return await response.json();
  } catch (e) {
    console.warn('Could not fetch playlist manifest:', e);
    return null;
  }
}

/**
 * Fetches a playlist JSON from the public packs directory
 */
export async function fetchPlaylistFromPacks(path: string): Promise<Playlist | null> {
  try {
    const url = `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();

    // Ensure the playlist has required fields
    return {
      id: data.id,
      name: data.name,
      description: data.description,
      baseAudioUrl: data.baseAudioUrl,
      songs: data.songs || [],
      createdAt: data.createdAt || Date.now(),
      updatedAt: data.updatedAt || Date.now(),
    };
  } catch (e) {
    console.warn(`Could not fetch playlist from ${path}:`, e);
    return null;
  }
}

/**
 * Syncs playlists from public/packs to IndexedDB
 * - New playlists are imported
 * - Existing playlists are updated if the file version is newer
 * Returns the number of playlists synced
 */
export async function syncPlaylistsFromPacks(): Promise<{ imported: number; updated: number; total: number }> {
  const manifest = await fetchPlaylistManifest();
  if (!manifest) {
    return { imported: 0, updated: 0, total: 0 };
  }

  let imported = 0;
  let updated = 0;

  for (const entry of manifest.playlists) {
    const filePlaylist = await fetchPlaylistFromPacks(entry.path);
    if (!filePlaylist) continue;

    const localPlaylist = await getPlaylist(entry.id);

    if (!localPlaylist) {
      // New playlist - import it
      await savePlaylist(filePlaylist);
      imported++;
    } else if (filePlaylist.updatedAt && localPlaylist.updatedAt &&
               filePlaylist.updatedAt > localPlaylist.updatedAt) {
      // File is newer - update local
      await savePlaylist(filePlaylist);
      updated++;
    }
    // If local is newer or same, keep local version
  }

  return { imported, updated, total: manifest.playlists.length };
}

/**
 * Checks if a local playlist has unsaved changes compared to the file version
 */
export async function checkPlaylistSyncStatus(playlistId: string): Promise<'synced' | 'local-newer' | 'file-newer' | 'local-only'> {
  const manifest = await fetchPlaylistManifest();
  const localPlaylist = await getPlaylist(playlistId);

  if (!localPlaylist) return 'local-only';

  const manifestEntry = manifest?.playlists.find(p => p.id === playlistId);
  if (!manifestEntry) return 'local-only';

  const filePlaylist = await fetchPlaylistFromPacks(manifestEntry.path);
  if (!filePlaylist) return 'local-only';

  if (!localPlaylist.updatedAt || !filePlaylist.updatedAt) return 'synced';

  if (localPlaylist.updatedAt > filePlaylist.updatedAt) return 'local-newer';
  if (filePlaylist.updatedAt > localPlaylist.updatedAt) return 'file-newer';

  return 'synced';
}

/**
 * Exports a playlist to a JSON string (for download)
 */
export function exportPlaylistToJson(playlist: Playlist): string {
  // Create a clean export without internal fields
  const exportData = {
    id: playlist.id,
    name: playlist.name,
    description: playlist.description,
    baseAudioUrl: playlist.baseAudioUrl,
    songs: playlist.songs.map(song => ({
      id: song.id,
      title: song.title,
      artist: song.artist,
      audioFile: song.audioFile,
      startTime: song.startTime,
      startTimeManual: song.startTimeManual,
    })),
    createdAt: playlist.createdAt,
    updatedAt: playlist.updatedAt,
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * Downloads a playlist as a JSON file
 */
export function downloadPlaylistJson(playlist: Playlist): void {
  const json = exportPlaylistToJson(playlist);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${playlist.id}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Gets all playlists from both IndexedDB and manifest (merged)
 */
export async function getAllPlaylistsWithSyncStatus(): Promise<Array<{
  playlist: Playlist;
  syncStatus: 'synced' | 'local-newer' | 'file-newer' | 'local-only';
}>> {
  const localPlaylists = await db.playlists.toArray();
  const manifest = await fetchPlaylistManifest();

  const results: Array<{
    playlist: Playlist;
    syncStatus: 'synced' | 'local-newer' | 'file-newer' | 'local-only';
  }> = [];

  for (const playlist of localPlaylists) {
    const manifestEntry = manifest?.playlists.find(p => p.id === playlist.id);

    if (!manifestEntry) {
      results.push({ playlist, syncStatus: 'local-only' });
    } else {
      const filePlaylist = await fetchPlaylistFromPacks(manifestEntry.path);
      if (!filePlaylist || !playlist.updatedAt || !filePlaylist.updatedAt) {
        results.push({ playlist, syncStatus: 'synced' });
      } else if (playlist.updatedAt > filePlaylist.updatedAt) {
        results.push({ playlist, syncStatus: 'local-newer' });
      } else if (filePlaylist.updatedAt > playlist.updatedAt) {
        results.push({ playlist, syncStatus: 'file-newer' });
      } else {
        results.push({ playlist, syncStatus: 'synced' });
      }
    }
  }

  return results;
}
