import type { BingoCard, Playlist, Song } from '../types';

interface GenerationStats {
  totalCards: number;
  songDistribution: Map<string, number>;
  minAppearances: number;
  maxAppearances: number;
  maxOverlap: number;
  avgOverlap: number;
}

interface GenerationOptions {
  cardCount: number;
  slotsPerCard: number; // 24 (5x5 minus free space)
  maxOverlap: number; // Maximum songs two cards can share
  maxAttempts: number;
}

const DEFAULT_OPTIONS: GenerationOptions = {
  cardCount: 60,
  slotsPerCard: 24,
  maxOverlap: 18, // Cards can share at most 18 songs
  maxAttempts: 1000,
};

export function generateCards(
  playlist: Playlist,
  options: Partial<GenerationOptions> = {}
): { cards: BingoCard[]; stats: GenerationStats } {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { cardCount, slotsPerCard, maxOverlap, maxAttempts } = opts;

  const songs = playlist.songs;
  if (songs.length < slotsPerCard) {
    throw new Error(`Playlist must have at least ${slotsPerCard} songs`);
  }

  const cards: BingoCard[] = [];
  const songAppearances = new Map<string, number>();

  // Initialize appearance counts
  songs.forEach(s => songAppearances.set(s.id, 0));

  for (let cardNum = 1; cardNum <= cardCount; cardNum++) {
    let slots: string[] | null = null;
    let attempts = 0;

    while (!slots && attempts < maxAttempts) {
      attempts++;
      const candidate = selectSongsForCard(songs, songAppearances, slotsPerCard);

      // Check overlap with existing cards
      const overlapOk = cards.every(existingCard => {
        const overlap = countOverlap(candidate, existingCard.slots);
        return overlap <= maxOverlap;
      });

      if (overlapOk) {
        slots = candidate;
      }
    }

    if (!slots) {
      // If we couldn't find a valid card, use best effort
      slots = selectSongsForCard(songs, songAppearances, slotsPerCard);
    }

    // Update appearance counts
    slots.forEach(songId => {
      songAppearances.set(songId, (songAppearances.get(songId) || 0) + 1);
    });

    // Shuffle the slots for random positioning
    const shuffledSlots = shuffleArray([...slots]);

    cards.push({
      id: `${playlist.id}-card-${cardNum}`,
      playlistId: playlist.id,
      cardNumber: cardNum,
      slots: shuffledSlots,
      createdAt: Date.now(),
    });
  }

  const stats = calculateStats(cards, songAppearances);

  return { cards, stats };
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
  let overlapCount = 0;

  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const overlap = countOverlap(cards[i].slots, cards[j].slots);
      maxOverlap = Math.max(maxOverlap, overlap);
      totalOverlap += overlap;
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
  };
}

export function shuffleSongOrder(songs: Song[]): string[] {
  const ids = songs.map(s => s.id);
  return shuffleArray(ids);
}
