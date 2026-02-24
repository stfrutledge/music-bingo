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

export function checkWin(
  card: BingoCard,
  pattern: BingoPattern,
  calledSongIds: Set<string>,
  excludedSongIds: Set<string> = new Set()
): WinCheckResult {
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
