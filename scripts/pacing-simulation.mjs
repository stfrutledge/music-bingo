/**
 * Pacing Simulation Script
 * Simulates bingo games with dynamic playlist filtering
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

function checkSingleLineWin(cardSlots, calledSongIds) {
  for (const line of WINNING_LINES) {
    let lineComplete = true;
    for (const slotIdx of line) {
      if (slotIdx === -1) continue; // Free space
      const songId = cardSlots[slotIdx];
      if (!calledSongIds.has(songId)) {
        lineComplete = false;
        break;
      }
    }
    if (lineComplete) return true;
  }
  return false;
}

function simulateGame(cards, callableSongIds) {
  const songOrder = shuffleArray([...callableSongIds]);
  const calledSet = new Set();

  for (let i = 0; i < songOrder.length; i++) {
    calledSet.add(songOrder[i]);

    for (const card of cards) {
      if (checkSingleLineWin(card.slots, calledSet)) {
        return i + 1; // Songs called to first winner
      }
    }
  }

  return songOrder.length; // No winner (shouldn't happen)
}

function runSimulations(cards, callableSongIds, numSimulations = 1000) {
  const results = [];

  for (let i = 0; i < numSimulations; i++) {
    results.push(simulateGame(cards, callableSongIds));
  }

  results.sort((a, b) => a - b);

  const median = results[Math.floor(results.length / 2)];
  const mean = results.reduce((a, b) => a + b, 0) / results.length;
  const min = results[0];
  const max = results[results.length - 1];
  const p10 = results[Math.floor(results.length * 0.1)];
  const p90 = results[Math.floor(results.length * 0.9)];

  return { median, mean, min, max, p10, p90 };
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

// Get songs that appear on active cards (dynamic filtering)
function getSongsOnActiveCards(activeCards) {
  const songsOnCards = new Set();
  for (const card of activeCards) {
    for (const songId of card.slots) {
      songsOnCards.add(songId);
    }
  }
  return songsOnCards;
}

// Main simulation
console.log('=== Dynamic Playlist Filtering Simulation ===\n');

const NUM_CARDS = 80;
const NUM_SONGS = 75;
const SIMULATIONS = 3000;

console.log(`Generating ${NUM_CARDS} cards with ${NUM_SONGS} songs...\n`);
const { cards, songs } = generateTestCards(NUM_CARDS, NUM_SONGS);

console.log('Players | Songs on Cards | Filtered Out | Median | Mean  | P10 | P90');
console.log('--------|----------------|--------------|--------|-------|-----|----');

for (const playerCount of [10, 15, 20, 25, 30, 35, 40, 50, 60, 80]) {
  const activeCards = cards.slice(0, playerCount);
  const songsOnCards = getSongsOnActiveCards(activeCards);
  const filteredOut = NUM_SONGS - songsOnCards.size;

  const results = runSimulations(activeCards, songsOnCards, SIMULATIONS);

  console.log(
    `   ${String(playerCount).padStart(2)}   |       ${String(songsOnCards.size).padStart(2)}       |      ${String(filteredOut).padStart(2)}      |   ${String(results.median).padStart(2)}   | ${results.mean.toFixed(1).padStart(5)} |  ${String(results.p10).padStart(2)} |  ${String(results.p90).padStart(2)}`
  );
}

console.log('\n=== Analysis ===');
console.log('With dynamic filtering, songs not on ANY active card are automatically excluded.');
console.log('This reduces the callable playlist without affecting any player.');
console.log('\nFewer players = fewer unique songs needed = shorter games');
