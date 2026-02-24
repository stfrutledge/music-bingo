import Dexie, { type Table } from 'dexie';
import type { Playlist, BingoCard, GameState, AppSettings } from '../types';

export class MusicBingoDatabase extends Dexie {
  playlists!: Table<Playlist, string>;
  cards!: Table<BingoCard, string>;
  games!: Table<GameState, string>;
  settings!: Table<AppSettings, string>;

  constructor() {
    super('MusicBingoDB');

    this.version(1).stores({
      playlists: 'id, name, createdAt, updatedAt',
      cards: 'id, playlistId, cardNumber',
      games: 'id, playlistId, startedAt',
      settings: 'mode',
    });
  }
}

export const db = new MusicBingoDatabase();

// Playlist operations
export async function savePlaylist(playlist: Playlist): Promise<void> {
  await db.playlists.put(playlist);
}

export async function getPlaylist(id: string): Promise<Playlist | undefined> {
  return db.playlists.get(id);
}

export async function getAllPlaylists(): Promise<Playlist[]> {
  return db.playlists.orderBy('updatedAt').reverse().toArray();
}

export async function deletePlaylist(id: string): Promise<void> {
  await db.transaction('rw', [db.playlists, db.cards], async () => {
    await db.playlists.delete(id);
    await db.cards.where('playlistId').equals(id).delete();
  });
}

// Card operations
export async function saveCards(cards: BingoCard[]): Promise<void> {
  await db.cards.bulkPut(cards);
}

export async function getCardsForPlaylist(playlistId: string): Promise<BingoCard[]> {
  return db.cards.where('playlistId').equals(playlistId).sortBy('cardNumber');
}

export async function getCard(playlistId: string, cardNumber: number): Promise<BingoCard | undefined> {
  return db.cards
    .where({ playlistId, cardNumber })
    .first();
}

export async function deleteCardsForPlaylist(playlistId: string): Promise<void> {
  await db.cards.where('playlistId').equals(playlistId).delete();
}

// Game operations
export async function saveGame(game: GameState): Promise<void> {
  await db.games.put(game);
}

export async function getGame(id: string): Promise<GameState | undefined> {
  return db.games.get(id);
}

export async function getActiveGame(): Promise<GameState | undefined> {
  return db.games
    .filter(g => !g.endedAt)
    .first();
}

export async function getAllGames(): Promise<GameState[]> {
  return db.games.orderBy('startedAt').reverse().toArray();
}

// Settings operations
export async function getSettings(): Promise<AppSettings | undefined> {
  return db.settings.get('host');
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await db.settings.put(settings);
}
