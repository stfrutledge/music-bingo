/**
 * Google Sheets Sync for Music Bingo
 *
 * Syncs playlist song data (titles, artists, start times) to Google Sheets.
 * Google Sheets is the source of truth for song metadata.
 */

import type { Song, Playlist } from '../types';

export interface SheetsSongData {
  songId: string;
  title: string;
  artist: string;
  audioFile: string;
  startTime: number;
  startTimeManual: boolean;
}

export interface SheetsPlaylistData {
  playlistId: string;
  playlistName: string;
  songs: SheetsSongData[];
  lastSynced?: number;
}

// The deployed Google Apps Script web app URL
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzWx8w9JjR17Od6J6xHkRFR4V0ZYJTRyngFBBWzxaHN6xTBpBulRn3yFm88TpJaIFlX/exec';

// Debounce timer for auto-save
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
const SAVE_DEBOUNCE_MS = 2000;

/**
 * Convert app Song to Sheets format
 */
export function songToSheetData(song: Song): SheetsSongData {
  return {
    songId: song.id,
    title: song.title,
    artist: song.artist,
    audioFile: song.audioFile,
    startTime: song.startTime || 0,
    startTimeManual: song.startTimeManual || false,
  };
}

/**
 * Convert Sheets data to full Song objects
 * Google Sheets is the source of truth - only songs in Sheets will be used
 */
export function sheetsSongsToLocalSongs(sheetsData: SheetsSongData[]): Song[] {
  return sheetsData.map(s => ({
    id: s.songId,
    title: s.title,
    artist: s.artist,
    audioFile: s.audioFile,
    startTime: s.startTime,
    startTimeManual: s.startTimeManual,
  }));
}

/**
 * Fetch playlist data from Google Sheets
 */
export async function fetchFromSheets(playlistId: string): Promise<SheetsPlaylistData | null> {
  const url = `${SCRIPT_URL}?action=get&playlistId=${encodeURIComponent(playlistId)}`;

  console.log('[Sheets] Fetching playlist:', playlistId);

  const response = await fetch(url);
  const data = await response.json();

  if (data.error) {
    throw new Error(data.error);
  }

  console.log('[Sheets] Fetched playlist with', data.playlist?.songs?.length || 0, 'songs');
  return data.playlist || null;
}

/**
 * Save playlist data to Google Sheets using chunked GET requests
 */
export async function saveToSheets(playlist: SheetsPlaylistData): Promise<{ success: boolean; message: string }> {
  const CHUNK_SIZE = 5;

  console.log('[Sheets] Saving playlist:', playlist.playlistId, 'with', playlist.songs.length, 'songs');

  try {
    // Step 1: Initialize - clear the sheet
    const initData = encodeURIComponent(JSON.stringify({
      playlistId: playlist.playlistId,
      playlistName: playlist.playlistName,
      totalSongs: playlist.songs.length,
    }));
    const initUrl = `${SCRIPT_URL}?action=init&data=${initData}`;

    console.log('[Sheets] Init...');
    const initResp = await fetch(initUrl);
    const initResult = await initResp.json();
    console.log('[Sheets] Init result:', initResult);

    if (initResult.error) {
      throw new Error(initResult.error);
    }

    // Step 2: Send songs in chunks
    for (let i = 0; i < playlist.songs.length; i += CHUNK_SIZE) {
      const chunk = playlist.songs.slice(i, i + CHUNK_SIZE);
      const chunkData = encodeURIComponent(JSON.stringify({
        playlistId: playlist.playlistId,
        startIndex: i,
        songs: chunk,
      }));
      const chunkUrl = `${SCRIPT_URL}?action=chunk&data=${chunkData}`;

      console.log(`[Sheets] Chunk ${i + 1}-${Math.min(i + CHUNK_SIZE, playlist.songs.length)}...`);
      const chunkResp = await fetch(chunkUrl);
      const chunkResult = await chunkResp.json();

      if (chunkResult.error) {
        throw new Error(chunkResult.error);
      }
    }

    // Step 3: Finalize
    const finalizeData = encodeURIComponent(JSON.stringify({
      playlistId: playlist.playlistId,
    }));
    const finalizeUrl = `${SCRIPT_URL}?action=finalize&data=${finalizeData}`;

    console.log('[Sheets] Finalize...');
    const finalizeResp = await fetch(finalizeUrl);
    const finalizeResult = await finalizeResp.json();
    console.log('[Sheets] Finalize result:', finalizeResult);

    if (finalizeResult.error) {
      throw new Error(finalizeResult.error);
    }

    console.log('[Sheets] Save complete!');
    return { success: true, message: 'Saved to Google Sheets' };
  } catch (error) {
    console.error('[Sheets] Save failed:', error);
    return { success: false, message: String(error) };
  }
}

/**
 * Auto-save playlist to Google Sheets with debouncing
 */
export function autoSaveToSheets(
  playlistId: string,
  playlistName: string,
  songs: Song[],
  onSaveStart?: () => void,
  onSaveComplete?: (success: boolean) => void
): void {
  // Clear any pending save
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }

  // Schedule save after debounce period
  saveTimeout = setTimeout(async () => {
    onSaveStart?.();

    const sheetsData: SheetsPlaylistData = {
      playlistId,
      playlistName,
      songs: songs.map(songToSheetData),
    };

    try {
      const result = await saveToSheets(sheetsData);
      onSaveComplete?.(result.success);
    } catch (error) {
      console.error('Auto-save failed:', error);
      onSaveComplete?.(false);
    }
  }, SAVE_DEBOUNCE_MS);
}

/**
 * Cancel any pending auto-save
 */
export function cancelAutoSave(): void {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
}

/**
 * Load playlist from Google Sheets (source of truth)
 * If Sheets has data for this playlist, use it entirely
 * Only falls back to local data if Sheets has no data
 */
export async function loadAndMergeFromSheets(playlist: Playlist): Promise<Playlist> {
  try {
    const sheetsData = await fetchFromSheets(playlist.id);
    if (sheetsData && sheetsData.songs.length > 0) {
      console.log('[Sheets] Loading', sheetsData.songs.length, 'songs from Sheets (source of truth)');
      return {
        ...playlist,
        name: sheetsData.playlistName || playlist.name,
        songs: sheetsSongsToLocalSongs(sheetsData.songs),
      };
    }
    console.log('[Sheets] No data in Sheets for this playlist, using local data');
  } catch (error) {
    console.warn('[Sheets] Could not load from Google Sheets, using local data:', error);
  }

  return playlist;
}

// Legacy exports for compatibility
export function isSheetsConfigured(): boolean {
  return true;
}

export function getScriptUrl(): string {
  return SCRIPT_URL;
}
