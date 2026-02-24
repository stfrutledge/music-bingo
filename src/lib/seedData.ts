import type { Playlist } from '../types';
import { db, savePlaylist, getAllPlaylists } from './db';

export async function seedDatabaseIfEmpty(): Promise<void> {
  // Check if we already have playlists
  const existingPlaylists = await getAllPlaylists();
  if (existingPlaylists.length > 0) {
    console.log('Database already has playlists, skipping seed');
    return;
  }

  console.log('Seeding database with initial playlist...');

  try {
    // Fetch the playlist from the public folder
    const response = await fetch('/playlist.json');
    if (!response.ok) {
      console.warn('No seed playlist found at /playlist.json');
      return;
    }

    const data = await response.json();

    // Clean up the data (remove _confidence fields)
    const playlist: Playlist = {
      id: data.id,
      name: data.name,
      description: data.description,
      baseAudioUrl: data.baseAudioUrl,
      songs: data.songs.map((s: Record<string, unknown>) => ({
        id: s.id,
        title: s.title,
        artist: s.artist,
        audioFile: s.audioFile,
        startTime: s.startTime,
      })),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await savePlaylist(playlist);
    console.log(`Seeded playlist: ${playlist.name} with ${playlist.songs.length} songs`);
  } catch (error) {
    console.error('Failed to seed database:', error);
  }
}

export async function resetDatabase(): Promise<void> {
  await db.delete();
  await db.open();
  await seedDatabaseIfEmpty();
}
