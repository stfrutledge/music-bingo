/**
 * Pacing Simulation Script
 * Simulates bingo games to find optimal song exclusion count
 */

// Winning lines in a 5x5 bingo grid (slot indices 0-23, skipping center)
const WINNING_LINES = [
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

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function checkSingleLineWin(cardSlots, calledSongIds, excludedSongIds) {
  for (const line of WINNING_LINES) {
    let lineComplete = true;
    for (const slotIdx of line) {
      if (slotIdx === -1) continue; // Free space
      const songId = cardSlots[slotIdx];
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

function simulateGame(cards, allSongIds, excludedSongIds) {
  const activeSongIds = allSongIds.filter(id => !excludedSongIds.has(id));
  const songOrder = shuffleArray(activeSongIds);
  const calledSet = new Set();

  for (let i = 0; i < songOrder.length; i++) {
    calledSet.add(songOrder[i]);

    for (const card of cards) {
      if (checkSingleLineWin(card.slots, calledSet, excludedSongIds)) {
        return i + 1; // Songs called to first winner
      }
    }
  }

  return songOrder.length; // No winner (shouldn't happen)
}

function runSimulations(cards, allSongIds, songAppearances, excludeCount, numSimulations = 1000) {
  // Sort songs by appearance count (ascending) - exclude least appearing first
  const sortedSongs = [...allSongIds].sort((a, b) => {
    return (songAppearances.get(a) || 0) - (songAppearances.get(b) || 0);
  });

  const excludedSongIds = new Set(sortedSongs.slice(0, excludeCount));
  const results = [];

  for (let i = 0; i < numSimulations; i++) {
    results.push(simulateGame(cards, allSongIds, excludedSongIds));
  }

  results.sort((a, b) => a - b);

  const median = results[Math.floor(results.length / 2)];
  const mean = results.reduce((a, b) => a + b, 0) / results.length;
  const min = results[0];
  const max = results[results.length - 1];
  const p10 = results[Math.floor(results.length * 0.1)];
  const p90 = results[Math.floor(results.length * 0.9)];

  return { median, mean, min, max, p10, p90, excludeCount };
}

// Generate cards similar to the app's algorithm
function generateTestCards(numCards, numSongs, slotsPerCard = 24) {
  const songs = Array.from({ length: numSongs }, (_, i) => `song-${i}`);
  const songAppearances = new Map(songs.map(s => [s, 0]));
  const cards = [];

  for (let cardIdx = 0; cardIdx < numCards; cardIdx++) {
    // Calculate target appearances for even distribution
    const totalAppsNeeded = (cardIdx + 1) * slotsPerCard;
    const targetPerSong = totalAppsNeeded / numSongs;

    // Build weighted selection
    const songScores = songs.map(id => {
      const current = songAppearances.get(id) || 0;
      const deficit = targetPerSong - current;
      const score = Math.max(0.1, Math.min(10, deficit + 5));
      return { id, score };
    });

    // Weighted sample without replacement
    const selected = [];
    const remaining = [...songScores];

    for (let i = 0; i < slotsPerCard && remaining.length > 0; i++) {
      const totalScore = remaining.reduce((sum, item) => sum + item.score, 0);
      let pick = Math.random() * totalScore;

      for (let j = 0; j < remaining.length; j++) {
        pick -= remaining[j].score;
        if (pick <= 0) {
          selected.push(remaining[j].id);
          remaining.splice(j, 1);
          break;
        }
      }
    }

    // Update appearances
    for (const songId of selected) {
      songAppearances.set(songId, (songAppearances.get(songId) || 0) + 1);
    }

    // Shuffle slot positions
    cards.push({
      cardNumber: cardIdx + 1,
      slots: shuffleArray(selected),
    });
  }

  return { cards, songs, songAppearances };
}

// Safe exclusion calculation (mirrors the app logic)
function calculateSafeExclusions(cards, allSongIds, targetExclusions, maxPerLine = 1) {
  const excluded = new Set();
  const cardLineExclusions = cards.map(() => WINNING_LINES.map(() => 0));

  // Build song -> card/line mapping
  const songLocations = new Map();
  for (let cardIdx = 0; cardIdx < cards.length; cardIdx++) {
    const card = cards[cardIdx];
    for (let lineIdx = 0; lineIdx < WINNING_LINES.length; lineIdx++) {
      const line = WINNING_LINES[lineIdx];
      for (const slotIdx of line) {
        if (slotIdx === -1) continue;
        const songId = card.slots[slotIdx];
        if (!songLocations.has(songId)) {
          songLocations.set(songId, []);
        }
        songLocations.get(songId).push({ cardIdx, lineIdx });
      }
    }
  }

  // Sort by fewest locations first
  const sortedSongs = [...allSongIds].sort((a, b) => {
    return (songLocations.get(a)?.length || 0) - (songLocations.get(b)?.length || 0);
  });

  for (const songId of sortedSongs) {
    if (excluded.size >= targetExclusions) break;
    const locations = songLocations.get(songId) || [];
    let canExclude = true;
    for (const { cardIdx, lineIdx } of locations) {
      if (cardLineExclusions[cardIdx][lineIdx] >= maxPerLine) {
        canExclude = false;
        break;
      }
    }
    if (canExclude) {
      excluded.add(songId);
      for (const { cardIdx, lineIdx } of locations) {
        cardLineExclusions[cardIdx][lineIdx]++;
      }
    }
  }
  return excluded;
}

// Main simulation
console.log('=== Pacing Simulation with Safe Exclusions ===\n');

const NUM_CARDS = 80;
const NUM_SONGS = 75; // Typical playlist size
const CARDS_IN_PLAY = parseInt(process.argv[2]) || 25;
const TARGET_MEDIAN = parseInt(process.argv[3]) || 13;
const SIMULATIONS_PER_TEST = 2000;

console.log(`Generating ${NUM_CARDS} cards with ${NUM_SONGS} songs...`);
const { cards, songs, songAppearances } = generateTestCards(NUM_CARDS, NUM_SONGS);

// Use only first 25 cards (cards #1-#25)
const activeCards = cards.slice(0, CARDS_IN_PLAY);
console.log(`Using cards #1-#${CARDS_IN_PLAY}\n`);

console.log('Song appearance distribution:');
const appearances = Array.from(songAppearances.values());
console.log(`  Min: ${Math.min(...appearances)}, Max: ${Math.max(...appearances)}, Avg: ${(appearances.reduce((a,b) => a+b, 0) / appearances.length).toFixed(1)}\n`);

console.log(`Running ${SIMULATIONS_PER_TEST} simulations per exclusion count...\n`);

console.log('Exclude | Median | Mean  | Min | Max | P10 | P90');
console.log('--------|--------|-------|-----|-----|-----|----');

let bestExclude = 0;
let bestDiff = Infinity;

for (let excludeCount = 0; excludeCount <= 35; excludeCount += 1) {
  const result = runSimulations(activeCards, songs, songAppearances, excludeCount, SIMULATIONS_PER_TEST);

  const diff = Math.abs(result.median - TARGET_MEDIAN);
  if (diff < bestDiff) {
    bestDiff = diff;
    bestExclude = excludeCount;
  }

  const marker = result.median === TARGET_MEDIAN ? ' <-- TARGET' :
                 excludeCount === bestExclude ? ' <-- BEST' : '';

  console.log(`   ${String(excludeCount).padStart(2)}   |   ${String(result.median).padStart(2)}   | ${result.mean.toFixed(1).padStart(5)} |  ${String(result.min).padStart(2)} |  ${String(result.max).padStart(2)} |  ${String(result.p10).padStart(2)} |  ${String(result.p90).padStart(2)}${marker}`);
}

console.log('\n=== Recommendation ===');
console.log(`To achieve median of ~${TARGET_MEDIAN} songs to winner with ${CARDS_IN_PLAY} players:`);
console.log(`  Exclude ${bestExclude} songs from the call list`);
console.log(`  Active songs: ${NUM_SONGS - bestExclude}`);

// Run more detailed analysis at the best point
console.log('\n=== Detailed Analysis at Best Point ===');
const detailed = runSimulations(activeCards, songs, songAppearances, bestExclude, 5000);
console.log(`Exclude ${bestExclude} songs:`);
console.log(`  Median: ${detailed.median} songs`);
console.log(`  Mean: ${detailed.mean.toFixed(2)} songs`);
console.log(`  Range: ${detailed.min} - ${detailed.max} songs`);
console.log(`  10th percentile: ${detailed.p10} songs`);
console.log(`  90th percentile: ${detailed.p90} songs`);

// Test safe exclusion strategy
console.log('\n=== Safe Exclusion Strategy (20% target, max 2 per line) ===');
const targetExclude = Math.floor(NUM_SONGS * 0.20);
const safeExcluded = calculateSafeExclusions(activeCards, songs, targetExclude, 2);
console.log(`Target: ${targetExclude}, Actually excluded: ${safeExcluded.size}`);

// Run simulation with safe exclusions
const safeResults = [];
for (let sim = 0; sim < 2000; sim++) {
  const activeSongIds = songs.filter(id => !safeExcluded.has(id));
  const songOrder = shuffleArray(activeSongIds);
  const calledSet = new Set();
  let songsToWin = songOrder.length;

  for (let i = 0; i < songOrder.length; i++) {
    calledSet.add(songOrder[i]);
    for (const card of activeCards) {
      if (checkSingleLineWin(card.slots, calledSet, safeExcluded)) {
        songsToWin = i + 1;
        break;
      }
    }
    if (songsToWin < songOrder.length) break;
  }
  safeResults.push(songsToWin);
}

safeResults.sort((a, b) => a - b);
const safeMedian = safeResults[Math.floor(safeResults.length / 2)];
const safeMean = safeResults.reduce((a, b) => a + b, 0) / safeResults.length;
const safeP90 = safeResults[Math.floor(safeResults.length * 0.9)];

console.log(`Results with safe exclusions:`);
console.log(`  Median: ${safeMedian} songs`);
console.log(`  Mean: ${safeMean.toFixed(2)} songs`);
console.log(`  90th percentile: ${safeP90} songs (should be <20)`);
