import type { BingoCard, BingoPattern } from '../types';
import { getPatternIndices, patternIndicesToSlotIndices } from './patterns';

export interface WinCheckResult {
  isWin: boolean;
  cardNumber: number;
  patternName: string;
  matchedSlots: number[];
  missingSlots: number[];
  missingSongs: { index: number; songId: string }[];
}

// All possible lines in a 5x5 grid (as grid indices 0-24)
const ALL_HORIZONTAL_LINES = [
  [0, 1, 2, 3, 4],       // Row 1
  [5, 6, 7, 8, 9],       // Row 2
  [10, 11, 12, 13, 14],  // Row 3 (includes free space at 12)
  [15, 16, 17, 18, 19],  // Row 4
  [20, 21, 22, 23, 24],  // Row 5
];

const ALL_VERTICAL_LINES = [
  [0, 5, 10, 15, 20],    // Col 1
  [1, 6, 11, 16, 21],    // Col 2
  [2, 7, 12, 17, 22],    // Col 3 (includes free space at 12)
  [3, 8, 13, 18, 23],    // Col 4
  [4, 9, 14, 19, 24],    // Col 5
];

const ALL_DIAGONAL_LINES = [
  [0, 6, 12, 18, 24],    // Top-left to bottom-right
  [4, 8, 12, 16, 20],    // Top-right to bottom-left
];

function gridIndexToSlotIndex(gridIdx: number): number | null {
  if (gridIdx === 12) return null; // Free space
  return gridIdx > 12 ? gridIdx - 1 : gridIdx;
}

function checkLineCompletion(
  card: BingoCard,
  lineGridIndices: number[],
  calledSongIds: Set<string>,
  excludedSongIds: Set<string>
): { matched: number[]; missing: number[]; missingSongs: { index: number; songId: string }[] } {
  const matched: number[] = [];
  const missing: number[] = [];
  const missingSongs: { index: number; songId: string }[] = [];

  for (const gridIdx of lineGridIndices) {
    if (gridIdx === 12) continue; // Free space - always counts as matched

    const slotIdx = gridIndexToSlotIndex(gridIdx)!;
    const songId = card.slots[slotIdx];

    if (calledSongIds.has(songId) || excludedSongIds.has(songId)) {
      matched.push(slotIdx);
    } else {
      missing.push(slotIdx);
      missingSongs.push({ index: slotIdx, songId });
    }
  }

  return { matched, missing, missingSongs };
}

export function checkWin(
  card: BingoCard,
  pattern: BingoPattern,
  calledSongIds: Set<string>,
  excludedSongIds: Set<string> = new Set()
): WinCheckResult {
  // For "any line" patterns, check all possible lines of that type
  // and return the best result (winner or closest to winning)

  let linesToCheck: number[][] = [];

  if (pattern.id === 'single-line-h') {
    linesToCheck = ALL_HORIZONTAL_LINES;
  } else if (pattern.id === 'single-line-v') {
    linesToCheck = ALL_VERTICAL_LINES;
  } else if (pattern.id === 'single-line-d') {
    linesToCheck = ALL_DIAGONAL_LINES;
  }

  // If it's an "any line" pattern, find the best line
  if (linesToCheck.length > 0) {
    let bestResult: { matched: number[]; missing: number[]; missingSongs: { index: number; songId: string }[] } | null = null;

    for (const line of linesToCheck) {
      const result = checkLineCompletion(card, line, calledSongIds, excludedSongIds);

      // If this line is complete, return immediately
      if (result.missing.length === 0) {
        return {
          isWin: true,
          cardNumber: card.cardNumber,
          patternName: pattern.name,
          matchedSlots: result.matched,
          missingSlots: [],
          missingSongs: [],
        };
      }

      // Track the best (most complete) line
      if (!bestResult || result.missing.length < bestResult.missing.length) {
        bestResult = result;
      }
    }

    // Return the best non-winning result
    return {
      isWin: false,
      cardNumber: card.cardNumber,
      patternName: pattern.name,
      matchedSlots: bestResult!.matched,
      missingSlots: bestResult!.missing,
      missingSongs: bestResult!.missingSongs,
    };
  }

  // For other patterns, use the exact pattern grid
  const patternIndices = getPatternIndices(pattern);
  const slotIndices = patternIndicesToSlotIndices(patternIndices);

  const matchedSlots: number[] = [];
  const missingSlots: number[] = [];
  const missingSongs: { index: number; songId: string }[] = [];

  for (const slotIdx of slotIndices) {
    const songId = card.slots[slotIdx];
    // A slot is "marked" if the song was called OR if it's excluded (dead square)
    if (calledSongIds.has(songId) || excludedSongIds.has(songId)) {
      matchedSlots.push(slotIdx);
    } else {
      missingSlots.push(slotIdx);
      missingSongs.push({ index: slotIdx, songId });
    }
  }

  return {
    isWin: missingSlots.length === 0,
    cardNumber: card.cardNumber,
    patternName: pattern.name,
    matchedSlots,
    missingSlots,
    missingSongs,
  };
}

// Check if a card has any winning pattern (for any line patterns)
export function checkAnyLine(
  card: BingoCard,
  calledSongIds: Set<string>
): { hasWin: boolean; winType?: 'horizontal' | 'vertical' | 'diagonal' } {
  // Check horizontal lines
  for (let row = 0; row < 5; row++) {
    let rowComplete = true;
    for (let col = 0; col < 5; col++) {
      const gridIdx = row * 5 + col;
      if (gridIdx === 12) continue; // Free space

      const slotIdx = gridIdx > 12 ? gridIdx - 1 : gridIdx;
      const songId = card.slots[slotIdx];
      if (!calledSongIds.has(songId)) {
        rowComplete = false;
        break;
      }
    }
    if (rowComplete) {
      return { hasWin: true, winType: 'horizontal' };
    }
  }

  // Check vertical lines
  for (let col = 0; col < 5; col++) {
    let colComplete = true;
    for (let row = 0; row < 5; row++) {
      const gridIdx = row * 5 + col;
      if (gridIdx === 12) continue; // Free space

      const slotIdx = gridIdx > 12 ? gridIdx - 1 : gridIdx;
      const songId = card.slots[slotIdx];
      if (!calledSongIds.has(songId)) {
        colComplete = false;
        break;
      }
    }
    if (colComplete) {
      return { hasWin: true, winType: 'vertical' };
    }
  }

  // Check diagonals
  const topLeftDiag = [0, 6, 12, 18, 24];
  const topRightDiag = [4, 8, 12, 16, 20];

  let diag1Complete = true;
  let diag2Complete = true;

  for (const gridIdx of topLeftDiag) {
    if (gridIdx === 12) continue; // Free space
    const slotIdx = gridIdx > 12 ? gridIdx - 1 : gridIdx;
    const songId = card.slots[slotIdx];
    if (!calledSongIds.has(songId)) {
      diag1Complete = false;
      break;
    }
  }

  for (const gridIdx of topRightDiag) {
    if (gridIdx === 12) continue; // Free space
    const slotIdx = gridIdx > 12 ? gridIdx - 1 : gridIdx;
    const songId = card.slots[slotIdx];
    if (!calledSongIds.has(songId)) {
      diag2Complete = false;
      break;
    }
  }

  if (diag1Complete || diag2Complete) {
    return { hasWin: true, winType: 'diagonal' };
  }

  return { hasWin: false };
}

// Convert slot index (0-23) to grid position for display
export function slotIndexToGridPosition(slotIndex: number): { row: number; col: number } {
  // Slot indices skip index 12 (center)
  const gridIndex = slotIndex >= 12 ? slotIndex + 1 : slotIndex;
  return {
    row: Math.floor(gridIndex / 5),
    col: gridIndex % 5,
  };
}

// Convert grid position to slot index
export function gridPositionToSlotIndex(row: number, col: number): number | null {
  const gridIndex = row * 5 + col;
  if (gridIndex === 12) return null; // Free space
  return gridIndex > 12 ? gridIndex - 1 : gridIndex;
}
