import type { BingoCard, Playlist, Song, GenerationStats } from '../types';

interface GenerationOptions {
  cardCount: number;
  slotsPerCard: number; // 24 (5x5 minus free space)
  maxOverlap: number; // Maximum songs two cards can share
  maxPositionalOverlap: number; // Max shared songs in same position within any winning line
  enforcePositionalUniqueness: boolean;
  maxAttempts: number;
}

const DEFAULT_OPTIONS: GenerationOptions = {
  cardCount: 60,
  slotsPerCard: 24,
  maxOverlap: 18, // Cards can share at most 18 songs
  maxPositionalOverlap: 3, // No winning line should share more than 3 songs in same positions
  enforcePositionalUniqueness: true,
  maxAttempts: 1000,
};

/**
 * Winning lines in a 5x5 bingo grid, converted to slot indices (0-23, skipping grid index 12 which is free space).
 * Grid layout:
 *   0  1  2  3  4
 *   5  6  7  8  9
 *  10 11 [F] 12 13   (F = free space at grid index 12)
 *  14 15 16 17 18
 *  19 20 21 22 23
 *
 * Slot indices adjust for the missing center: positions 0-11 stay the same, positions 13-24 become 12-23.
 */
const WINNING_LINES: number[][] = [
  // 5 Rows
  [0, 1, 2, 3, 4],           // Row 0
  [5, 6, 7, 8, 9],           // Row 1
  [10, 11, -1, 12, 13],      // Row 2 (center is free space, marked -1)
  [14, 15, 16, 17, 18],      // Row 3
  [19, 20, 21, 22, 23],      // Row 4

  // 5 Columns
  [0, 5, 10, 14, 19],        // Col 0
  [1, 6, 11, 15, 20],        // Col 1
  [2, 7, -1, 16, 21],        // Col 2 (center is free space)
  [3, 8, 12, 17, 22],        // Col 3
  [4, 9, 13, 18, 23],        // Col 4

  // 2 Diagonals
  [0, 6, -1, 17, 23],        // Top-left to bottom-right (center is free)
  [4, 8, -1, 15, 19],        // Top-right to bottom-left (center is free)
];

export function generateCards(
  playlist: Playlist,
  options: Partial<GenerationOptions> = {}
): { cards: BingoCard[]; stats: GenerationStats } {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { cardCount, slotsPerCard, maxOverlap, maxPositionalOverlap, enforcePositionalUniqueness, maxAttempts } = opts;

  const songs = playlist.songs;
  if (songs.length < slotsPerCard) {
    throw new Error(`Playlist must have at least ${slotsPerCard} songs`);
  }

  const cards: BingoCard[] = [];
  const songAppearances = new Map<string, number>();

  // Initialize appearance counts
  songs.forEach(s => songAppearances.set(s.id, 0));

  for (let cardNum = 1; cardNum <= cardCount; cardNum++) {
    let finalSlots: string[] | null = null;
    let songAttempts = 0;

    while (!finalSlots && songAttempts < maxAttempts) {
      songAttempts++;
      const candidateSongs = selectSongsForCard(songs, songAppearances, slotsPerCard);

      // Check song overlap with existing cards
      const songOverlapOk = cards.every(existingCard => {
        const overlap = countOverlap(candidateSongs, existingCard.slots);
        return overlap <= maxOverlap;
      });

      if (!songOverlapOk) continue;

      // Try multiple arrangements to satisfy positional overlap
      if (enforcePositionalUniqueness && cards.length > 0) {
        const arrangedSlots = tryArrangements(
          candidateSongs,
          cards,
          maxPositionalOverlap,
          100 // arrangement attempts
        );
        if (arrangedSlots) {
          finalSlots = arrangedSlots;
        }
      } else {
        // No positional checking, just shuffle
        finalSlots = shuffleArray([...candidateSongs]);
      }
    }

    if (!finalSlots) {
      // If we couldn't find a valid card, use best effort (shuffled)
      const fallbackSongs = selectSongsForCard(songs, songAppearances, slotsPerCard);
      finalSlots = shuffleArray([...fallbackSongs]);
    }

    // Update appearance counts
    finalSlots.forEach(songId => {
      songAppearances.set(songId, (songAppearances.get(songId) || 0) + 1);
    });

    cards.push({
      id: `${playlist.id}-card-${cardNum}`,
      playlistId: playlist.id,
      cardNumber: cardNum,
      slots: finalSlots,
      createdAt: Date.now(),
    });
  }

  const stats = calculateStats(cards, songAppearances);

  return { cards, stats };
}

/**
 * Try multiple random arrangements of songs to find one that satisfies positional overlap constraints.
 */
function tryArrangements(
  songs: string[],
  existingCards: BingoCard[],
  maxPositionalOverlap: number,
  attempts: number
): string[] | null {
  for (let i = 0; i < attempts; i++) {
    const arrangement = shuffleArray([...songs]);
    const positionalOk = checkPositionalOverlap(arrangement, existingCards, maxPositionalOverlap);
    if (positionalOk) {
      return arrangement;
    }
  }
  return null;
}

/**
 * Check if a candidate card arrangement violates positional overlap constraints.
 * Returns true if the arrangement is acceptable (no winning line exceeds maxPositionalOverlap).
 */
function checkPositionalOverlap(
  candidateSlots: string[],
  existingCards: BingoCard[],
  maxPositionalOverlap: number
): boolean {
  for (const existingCard of existingCards) {
    for (const line of WINNING_LINES) {
      let samePositionCount = 0;
      for (const slotIdx of line) {
        // Skip free space positions (marked as -1)
        if (slotIdx === -1) continue;
        if (candidateSlots[slotIdx] === existingCard.slots[slotIdx]) {
          samePositionCount++;
        }
      }
      if (samePositionCount > maxPositionalOverlap) {
        return false;
      }
    }
  }
  return true;
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

function selectSongsForCard(
  songs: Song[],
  appearances: Map<string, number>,
  count: number
): string[] {
  // Weight songs by inverse of their appearances
  // Songs that appear less often are more likely to be selected
  const totalAppearances = Array.from(appearances.values()).reduce((a, b) => a + b, 0);
  const avgAppearances = totalAppearances / songs.length || 1;

  const weightedSongs = songs.map(song => {
    const appearances_count = appearances.get(song.id) || 0;
    // Weight inversely proportional to appearances
    const weight = Math.max(1, avgAppearances * 2 - appearances_count);
    return { song, weight };
  });

  const selected: string[] = [];
  const remaining = [...weightedSongs];

  while (selected.length < count && remaining.length > 0) {
    const totalWeight = remaining.reduce((sum, item) => sum + item.weight, 0);
    let random = Math.random() * totalWeight;

    for (let i = 0; i < remaining.length; i++) {
      random -= remaining[i].weight;
      if (random <= 0) {
        selected.push(remaining[i].song.id);
        remaining.splice(i, 1);
        break;
      }
    }
  }

  return selected;
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

  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
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
