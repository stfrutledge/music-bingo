import type { BingoCard, Playlist, Song, GenerationStats, PacingTable, PacingEntry, GenerationResult } from '../types';

interface GenerationOptions {
  cardCount: number;
  slotsPerCard: number;
  maxOverlap: number;
  targetSongsToWin: number;
}

const DEFAULT_OPTIONS: GenerationOptions = {
  cardCount: 80,
  slotsPerCard: 24,
  maxOverlap: 18,
  targetSongsToWin: 13, // Target ~13 songs called before first winner
};

/**
 * Winning lines in a 5x5 bingo grid (slot indices 0-23, skipping center free space)
 */
const WINNING_LINES: number[][] = [
  // 5 Rows
  [0, 1, 2, 3, 4],
  [5, 6, 7, 8, 9],
  [10, 11, -1, 12, 13],  // center is free space
  [14, 15, 16, 17, 18],
  [19, 20, 21, 22, 23],
  // 5 Columns
  [0, 5, 10, 14, 19],
  [1, 6, 11, 15, 20],
  [2, 7, -1, 16, 21],
  [3, 8, 12, 17, 22],
  [4, 9, 13, 18, 23],
  // 2 Diagonals
  [0, 6, -1, 17, 23],
  [4, 8, -1, 15, 19],
];

/**
 * Generate cards incrementally - each card is generated considering previous cards.
 * Any prefix (cards #1 through #N) forms a well-balanced set.
 */
export function generateCards(
  playlist: Playlist,
  options: Partial<GenerationOptions> = {}
): GenerationResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { cardCount, slotsPerCard, maxOverlap } = opts;

  const songs = playlist.songs;
  const numSongs = songs.length;

  if (numSongs < slotsPerCard) {
    throw new Error(`Playlist must have at least ${slotsPerCard} songs`);
  }

  // Track song appearances incrementally
  const songAppearances = new Map<string, number>();
  songs.forEach(s => songAppearances.set(s.id, 0));

  const cards: BingoCard[] = [];

  // Generate cards one at a time, incrementally
  for (let cardIdx = 0; cardIdx < cardCount; cardIdx++) {
    const cardSongs = selectSongsForCard(
      songs,
      songAppearances,
      slotsPerCard,
      cards,
      maxOverlap
    );

    // Update appearance counts
    for (const songId of cardSongs) {
      songAppearances.set(songId, (songAppearances.get(songId) || 0) + 1);
    }

    // Shuffle slot positions
    const shuffledSlots = shuffleArray(cardSongs);

    cards.push({
      id: `${playlist.id}-card-${cardIdx + 1}`,
      playlistId: playlist.id,
      cardNumber: cardIdx + 1,
      slots: shuffledSlots,
      createdAt: Date.now(),
    });
  }

  // Calculate stats
  const stats = calculateStats(cards, songAppearances);

  // Generate pacing table
  const pacingTable = generatePacingTable(playlist, cards, songAppearances, opts);

  return { cards, stats, pacingTable };
}

/**
 * Select songs for a new card, balancing:
 * 1. Even distribution (prefer underrepresented songs)
 * 2. Overlap constraints with existing cards
 */
function selectSongsForCard(
  songs: Song[],
  appearances: Map<string, number>,
  count: number,
  existingCards: BingoCard[],
  maxOverlap: number
): string[] {
  const numSongs = songs.length;

  // Calculate target appearances for even distribution
  const totalAppsNeeded = (existingCards.length + 1) * count;
  const targetPerSong = totalAppsNeeded / numSongs;

  // Build weighted selection - heavily favor underrepresented songs
  const songScores: { id: string; score: number }[] = [];

  for (const song of songs) {
    const current = appearances.get(song.id) || 0;
    // Songs below target get high scores, songs above get low scores
    const deficit = targetPerSong - current;
    // Score ranges from 10 (very underrepresented) to 0.1 (very overrepresented)
    const score = Math.max(0.1, Math.min(10, deficit + 5));
    songScores.push({ id: song.id, score });
  }

  // Try multiple times to find a valid selection
  for (let attempt = 0; attempt < 50; attempt++) {
    const selected = weightedSampleWithoutReplacement(songScores, count);

    // Check overlap with recent cards (checking all would be slow)
    const checkCount = Math.min(20, existingCards.length);
    let valid = true;

    for (let i = existingCards.length - checkCount; i < existingCards.length; i++) {
      if (i < 0) continue;
      const overlap = countOverlap(selected, existingCards[i].slots);
      if (overlap > maxOverlap) {
        valid = false;
        break;
      }
    }

    if (valid) {
      return selected;
    }
  }

  // Fallback: just return weighted selection even if overlap is high
  return weightedSampleWithoutReplacement(songScores, count);
}

/**
 * Sample N items without replacement using weighted probabilities.
 */
function weightedSampleWithoutReplacement(
  items: { id: string; score: number }[],
  count: number
): string[] {
  const result: string[] = [];
  const remaining = [...items];

  for (let i = 0; i < count && remaining.length > 0; i++) {
    const totalScore = remaining.reduce((sum, item) => sum + item.score, 0);
    let pick = Math.random() * totalScore;

    for (let j = 0; j < remaining.length; j++) {
      pick -= remaining[j].score;
      if (pick <= 0) {
        result.push(remaining[j].id);
        remaining.splice(j, 1);
        break;
      }
    }

    // Edge case: if we didn't pick (floating point issues), pick last
    if (result.length === i && remaining.length > 0) {
      const last = remaining.pop()!;
      result.push(last.id);
    }
  }

  return result;
}

/**
 * Generate pacing table by simulating games at different group sizes.
 * Determines how many songs to exclude for each group size to achieve target game length.
 */
function generatePacingTable(
  playlist: Playlist,
  cards: BingoCard[],
  songAppearances: Map<string, number>,
  opts: GenerationOptions
): PacingTable {
  const { targetSongsToWin } = opts;
  const totalCards = cards.length;
  const songs = playlist.songs;

  // Sort songs by appearance count (ascending) - least appearing songs are excluded first
  const sortedSongs = [...songs].sort((a, b) => {
    const aCount = songAppearances.get(a.id) || 0;
    const bCount = songAppearances.get(b.id) || 0;
    return aCount - bCount;
  });

  const entries: PacingEntry[] = [];

  // Sample different group sizes (include common values)
  const groupSizes = [5, 10, 15, 20, 25, 30, 35, 40, 50, 60, 80];

  for (const groupSize of groupSizes) {
    if (groupSize > totalCards) continue;

    // Get cards in play for this group size (cards #1 through #groupSize)
    const cardsInPlay = cards.slice(0, groupSize);

    // Search for optimal exclusion count
    let bestExclude = 0;
    let bestDiff = Infinity;

    // Start from 0 and search upward
    for (let excludeCount = 0; excludeCount <= Math.min(35, songs.length - 24); excludeCount++) {
      const excludedIds = new Set(sortedSongs.slice(0, excludeCount).map(s => s.id));
      const expectedSongs = simulateAverageGameLength(cardsInPlay, songs, excludedIds, 100);

      const diff = Math.abs(expectedSongs - targetSongsToWin);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestExclude = excludeCount;
      }

      // Stop searching once we're well past target (median dropping fast)
      if (expectedSongs < targetSongsToWin - 3) break;
    }

    const excludedSongIds = sortedSongs.slice(0, bestExclude).map(s => s.id);
    const excludedSet = new Set(excludedSongIds);
    const expectedSongsToWin = simulateAverageGameLength(cardsInPlay, songs, excludedSet, 200);

    entries.push({
      groupSize,
      excludeCount: bestExclude,
      excludedSongIds,
      expectedSongsToWin: Math.round(expectedSongsToWin * 10) / 10,
    });
  }

  return {
    playlistId: playlist.id,
    totalCards,
    totalSongs: songs.length,
    entries,
    createdAt: Date.now(),
  };
}

/**
 * Simulate games to estimate average songs needed for first winner.
 * Returns average across multiple simulations.
 */
function simulateAverageGameLength(
  cards: BingoCard[],
  allSongs: Song[],
  excludedSongIds: Set<string>,
  simulations: number
): number {
  let totalSongs = 0;

  // Active songs (not excluded)
  const activeSongIds = allSongs
    .filter(s => !excludedSongIds.has(s.id))
    .map(s => s.id);

  for (let sim = 0; sim < simulations; sim++) {
    const songOrder = shuffleArray([...activeSongIds]);
    const calledSet = new Set<string>();

    let songsToWin = songOrder.length; // Default if no winner

    for (let i = 0; i < songOrder.length; i++) {
      calledSet.add(songOrder[i]);

      // Check each card for a win (single line pattern)
      for (const card of cards) {
        if (checkSingleLineWin(card, calledSet, excludedSongIds)) {
          songsToWin = i + 1;
          break;
        }
      }

      if (songsToWin < songOrder.length) break;
    }

    totalSongs += songsToWin;
  }

  return totalSongs / simulations;
}

/**
 * Check if a card has won with a single line (any row, column, or diagonal).
 * Excluded songs are treated as "dead squares" - already marked.
 */
function checkSingleLineWin(
  card: BingoCard,
  calledSongIds: Set<string>,
  excludedSongIds: Set<string>
): boolean {
  for (const line of WINNING_LINES) {
    let lineComplete = true;

    for (const slotIdx of line) {
      if (slotIdx === -1) continue; // Free space

      const songId = card.slots[slotIdx];
      // Slot is "marked" if song was called OR if song is excluded (dead square)
      const isMarked = calledSongIds.has(songId) || excludedSongIds.has(songId);

      if (!isMarked) {
        lineComplete = false;
        break;
      }
    }

    if (lineComplete) return true;
  }

  return false;
}

function countOverlap(slots1: string[], slots2: string[]): number {
  const set2 = new Set(slots2);
  return slots1.filter(s => set2.has(s)).length;
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Calculate the maximum positional overlap across all winning lines between two cards.
 */
function getMaxPositionalOverlapBetweenCards(card1: BingoCard, card2: BingoCard): number {
  let maxOverlap = 0;
  for (const line of WINNING_LINES) {
    let samePositionCount = 0;
    for (const slotIdx of line) {
      if (slotIdx === -1) continue;
      if (card1.slots[slotIdx] === card2.slots[slotIdx]) {
        samePositionCount++;
      }
    }
    maxOverlap = Math.max(maxOverlap, samePositionCount);
  }
  return maxOverlap;
}

function calculateStats(
  cards: BingoCard[],
  songAppearances: Map<string, number>
): GenerationStats {
  const appearances = Array.from(songAppearances.values());

  let maxOverlap = 0;
  let totalOverlap = 0;
  let maxPositionalOverlap = 0;
  let totalPositionalOverlap = 0;
  let overlapCount = 0;

  // Sample pairwise comparisons (checking all pairs for large sets is slow)
  const sampleSize = Math.min(50, cards.length);

  for (let i = 0; i < sampleSize; i++) {
    for (let j = i + 1; j < sampleSize; j++) {
      // Song overlap
      const overlap = countOverlap(cards[i].slots, cards[j].slots);
      maxOverlap = Math.max(maxOverlap, overlap);
      totalOverlap += overlap;

      // Positional overlap (max across all winning lines)
      const positionalOverlap = getMaxPositionalOverlapBetweenCards(cards[i], cards[j]);
      maxPositionalOverlap = Math.max(maxPositionalOverlap, positionalOverlap);
      totalPositionalOverlap += positionalOverlap;

      overlapCount++;
    }
  }

  return {
    totalCards: cards.length,
    songDistribution: songAppearances,
    minAppearances: Math.min(...appearances),
    maxAppearances: Math.max(...appearances),
    maxOverlap,
    avgOverlap: overlapCount > 0 ? totalOverlap / overlapCount : 0,
    maxPositionalOverlap,
    avgPositionalOverlap: overlapCount > 0 ? totalPositionalOverlap / overlapCount : 0,
  };
}

export function shuffleSongOrder(songs: Song[]): string[] {
  const ids = songs.map(s => s.id);
  return shuffleArray(ids);
}

/**
 * Filter playlist to minimize callable songs while ensuring all cards can still win.
 * Removes songs that appear on few cards, as long as every card still has at least
 * one completable winning line.
 *
 * @param activeCards Cards currently in play
 * @param allSongIds All song IDs in the playlist
 * @returns Set of song IDs that should be called (excludes removable songs)
 */
export function filterPlaylistForActiveCards(
  activeCards: BingoCard[],
  allSongIds: string[]
): { callableSongIds: Set<string>; removedCount: number } {
  // Build set of songs that appear on any active card
  const songsOnCards = new Set<string>();
  for (const card of activeCards) {
    for (const songId of card.slots) {
      songsOnCards.add(songId);
    }
  }

  // Songs not on any active card are automatically excluded
  const relevantSongs = allSongIds.filter(id => songsOnCards.has(id));

  // Count appearances across active cards
  const songAppearances = new Map<string, number>();
  for (const card of activeCards) {
    for (const songId of card.slots) {
      songAppearances.set(songId, (songAppearances.get(songId) || 0) + 1);
    }
  }

  // Sort by appearances (ascending) - try to remove least-appearing first
  const sortedSongs = [...relevantSongs].sort((a, b) => {
    return (songAppearances.get(a) || 0) - (songAppearances.get(b) || 0);
  });

  // Track which songs are currently callable
  const callableSongs = new Set(relevantSongs);

  // Try to remove low-appearing songs one at a time
  for (const songId of sortedSongs) {
    // Don't try to remove songs that appear on many cards (diminishing returns)
    const appearances = songAppearances.get(songId) || 0;
    if (appearances > activeCards.length * 0.3) break;

    // Test if we can remove this song
    callableSongs.delete(songId);

    // Check if all cards still have at least one completable winning line
    let allCardsCanWin = true;
    for (const card of activeCards) {
      if (!cardCanStillWin(card, callableSongs)) {
        allCardsCanWin = false;
        break;
      }
    }

    if (!allCardsCanWin) {
      // Put it back - this song is needed
      callableSongs.add(songId);
    }
  }

  return {
    callableSongIds: callableSongs,
    removedCount: allSongIds.length - callableSongs.size,
  };
}

/**
 * Check if a card has at least one winning line that can be completed
 * using only the callable songs.
 */
function cardCanStillWin(card: BingoCard, callableSongs: Set<string>): boolean {
  for (const line of WINNING_LINES) {
    let lineCompletable = true;
    for (const slotIdx of line) {
      if (slotIdx === -1) continue; // Free space always works
      const songId = card.slots[slotIdx];
      if (!callableSongs.has(songId)) {
        lineCompletable = false;
        break;
      }
    }
    if (lineCompletable) return true;
  }
  return false;
}

/**
 * Get pacing entry for a specific group size.
 * Interpolates between entries if exact match not found.
 */
export function getPacingForGroupSize(
  pacingTable: PacingTable,
  groupSize: number
): PacingEntry | null {
  if (pacingTable.entries.length === 0) return null;

  // Find exact match
  const exact = pacingTable.entries.find(e => e.groupSize === groupSize);
  if (exact) return exact;

  // Find surrounding entries
  let lower: PacingEntry | null = null;
  let upper: PacingEntry | null = null;

  for (const entry of pacingTable.entries) {
    if (entry.groupSize <= groupSize) {
      if (!lower || entry.groupSize > lower.groupSize) {
        lower = entry;
      }
    }
    if (entry.groupSize >= groupSize) {
      if (!upper || entry.groupSize < upper.groupSize) {
        upper = entry;
      }
    }
  }

  // Return closest
  if (!lower) return upper;
  if (!upper) return lower;

  // Return the one closest to groupSize
  return (groupSize - lower.groupSize) <= (upper.groupSize - groupSize) ? lower : upper;
}
