export interface Song {
  id: string;
  title: string;
  artist: string;
  audioFile: string;
  startTime?: number; // Seconds to seek to when playing (e.g., chorus start)
  startTimeManual?: boolean; // If true, start time was manually set and should not be overwritten by imports
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  baseAudioUrl: string;
  songs: Song[];
  createdAt: number;
  updatedAt: number;
}

export interface BingoCard {
  id: string;
  playlistId: string;
  packId?: string; // Which card pack this belongs to
  cardNumber: number;
  slots: string[]; // 24 song IDs (5x5 minus free space)
  createdAt: number;
}

/**
 * A named set of cards for a specific event/venue.
 * Multiple packs can exist for the same playlist.
 */
export interface CardPack {
  id: string;           // URL-safe slug, e.g., "dead-rabbit"
  name: string;         // Display name, e.g., "Dead Rabbit Event"
  playlistId: string;   // Links to the playlist these cards use
  cardCount: number;    // Number of cards in this pack
  createdAt: number;
}

/**
 * Full card pack data including cards and pacing (stored in JSON files).
 */
export interface CardPackData {
  pack: CardPack;
  cards: BingoCard[];
  pacingTable: PacingTable;
}

export interface BingoPattern {
  id: string;
  name: string;
  description: string;
  grid: boolean[][]; // 5x5 grid, true = required for win
}

export interface GameRound {
  roundNumber: number;
  patternId: string;
  winners: WinRecord[];
  startedAt: number;
  endedAt?: number;
}

export interface WinRecord {
  cardNumber: number;
  verifiedAt: number;
  songIndex: number; // Which song was playing when they won
}

export interface GameState {
  id: string;
  playlistId: string;
  packId?: string; // Which card pack is being used
  rounds: GameRound[];
  currentRound: number;
  calledSongIds: string[];
  shuffledSongOrder: string[];
  currentSongIndex: number;
  isPlaying: boolean;
  startedAt: number;
  endedAt?: number;
  cardRangeStart?: number; // First card number in play
  cardRangeEnd?: number; // Last card number in play
}

export interface GameSettings {
  roundPatterns: string[]; // Pattern IDs for each round
  autoAdvanceDelay: number; // ms before auto-advancing to next song
}

export interface PlaylistManifest {
  playlists: PlaylistInfo[];
}

export interface PlaylistInfo {
  id: string;
  name: string;
  songCount: number;
  path: string;
  cardPacks?: CardPackInfo[]; // Available card packs for this playlist
}

export interface CardPackInfo {
  id: string;
  name: string;
  cardCount: number;
  path: string;
}

export interface CacheStatus {
  playlistId: string;
  totalSongs: number;
  cachedSongs: number;
  isComplete: boolean;
  lastUpdated?: number;
}

export type AppMode = 'admin' | 'host';

export interface AppSettings {
  mode: AppMode;
  lastPlaylistId?: string;
  darkMode: boolean;
}

export interface GroupRecommendation {
  cardCount: number;
  maxOverlap: number;
  maxPositionalOverlap: number;
  suggestedPatterns: string[];
  description: string;
}

export interface GenerationStats {
  totalCards: number;
  songDistribution: Map<string, number>;
  minAppearances: number;
  maxAppearances: number;
  maxOverlap: number;
  avgOverlap: number;
  maxPositionalOverlap: number;
  avgPositionalOverlap: number;
}

/**
 * Pacing entry for a specific group size.
 * Tells the game engine how many songs to exclude and which ones.
 */
export interface PacingEntry {
  groupSize: number;
  excludeCount: number;
  excludedSongIds: string[];
  expectedSongsToWin: number;
}

/**
 * Full pacing table generated alongside cards.
 * Maps group size to exclusion configuration.
 */
export interface PacingTable {
  playlistId: string;
  totalCards: number;
  totalSongs: number;
  entries: PacingEntry[];
  createdAt: number;
}

/**
 * Extended generation result including pacing data.
 */
export interface GenerationResult {
  cards: BingoCard[];
  stats: GenerationStats;
  pacingTable: PacingTable;
}
