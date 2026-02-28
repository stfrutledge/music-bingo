import type { Playlist, BingoCard, PacingTable } from '../types';
import { db, savePlaylist, getAllPlaylists, saveCards, savePacingTable, getCardsForPlaylist } from './db';

export async function seedDatabaseIfEmpty(): Promise<void> {
  // Check if we already have playlists
  const existingPlaylists = await getAllPlaylists();
  if (existingPlaylists.length > 0) {
    console.log('Database already has playlists, checking for cards...');
    // Still check if we need to seed cards for existing playlists
    for (const playlist of existingPlaylists) {
      await seedCardsIfMissing(playlist.id);
    }
    return;
  }

  console.log('Seeding database with initial playlist...');

  try {
    // Try loading from packs manifest first
    const manifestResponse = await fetch(`${import.meta.env.BASE_URL}packs/playlists-manifest.json`);
    if (manifestResponse.ok) {
      const manifest = await manifestResponse.json();
      for (const pack of manifest.playlists || []) {
        // Handle both object format { id, name, ... } and simple string format
        const packId = typeof pack === 'string' ? pack : pack.id;
        await seedPlaylistFromPack(packId);
      }
      return;
    }

    // Fallback to legacy /playlist.json
    const response = await fetch(`${import.meta.env.BASE_URL}playlist.json`);
    if (!response.ok) {
      console.warn('No seed playlist found');
      return;
    }

    const data = await response.json();
    const playlist = parsePlaylistData(data);
    await savePlaylist(playlist);
    console.log(`Seeded playlist: ${playlist.name} with ${playlist.songs.length} songs`);

    // Seed cards if available
    await seedCardsIfMissing(playlist.id);
  } catch (error) {
    console.error('Failed to seed database:', error);
  }
}

async function seedPlaylistFromPack(packId: string): Promise<void> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}packs/${packId}/playlist.json`);
    if (!response.ok) return;

    const data = await response.json();
    const playlist = parsePlaylistData(data);
    await savePlaylist(playlist);
    console.log(`Seeded playlist: ${playlist.name}`);

    // Seed cards for this playlist
    await seedCardsIfMissing(playlist.id);
  } catch (error) {
    console.error(`Failed to seed pack ${packId}:`, error);
  }
}

async function seedCardsIfMissing(playlistId: string): Promise<void> {
  // Check if cards already exist
  const existingCards = await getCardsForPlaylist(playlistId);
  if (existingCards.length > 0) {
    console.log(`Cards already exist for ${playlistId}`);
    return;
  }

  try {
    const response = await fetch(`${import.meta.env.BASE_URL}packs/${playlistId}/cards.json`);
    if (!response.ok) {
      console.log(`No static cards found for ${playlistId}`);
      return;
    }

    const data = await response.json();
    const cards: BingoCard[] = data.cards || [];
    const pacingTable: PacingTable | undefined = data.pacingTable;

    if (cards.length > 0) {
      await saveCards(cards);
      console.log(`Seeded ${cards.length} cards for ${playlistId}`);
    }

    if (pacingTable) {
      await savePacingTable(pacingTable);
      console.log(`Seeded pacing table for ${playlistId}`);
    }
  } catch (error) {
    console.error(`Failed to seed cards for ${playlistId}:`, error);
  }
}

function parsePlaylistData(data: Record<string, unknown>): Playlist {
  return {
    id: data.id as string,
    name: data.name as string,
    description: data.description as string | undefined,
    baseAudioUrl: data.baseAudioUrl as string,
    songs: (data.songs as Record<string, unknown>[]).map((s) => ({
      id: s.id as string,
      title: s.title as string,
      artist: s.artist as string,
      audioFile: s.audioFile as string,
      startTime: s.startTime as number | undefined,
    })),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export async function resetDatabase(): Promise<void> {
  await db.delete();
  await db.open();
  await seedDatabaseIfEmpty();
}

export async function forceReseedCards(playlistId: string): Promise<boolean> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}packs/${playlistId}/cards.json`);
    if (!response.ok) return false;

    const data = await response.json();
    const cards: BingoCard[] = data.cards || [];
    const pacingTable: PacingTable | undefined = data.pacingTable;

    if (cards.length > 0) {
      await saveCards(cards);
    }
    if (pacingTable) {
      await savePacingTable(pacingTable);
    }
    return true;
  } catch {
    return false;
  }
}
