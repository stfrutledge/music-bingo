import type { BingoPattern } from '../types';

// Helper to create a 5x5 grid from a string representation
function createGrid(pattern: string[]): boolean[][] {
  return pattern.map(row =>
    row.split('').map(c => c === 'X')
  );
}

export const BINGO_PATTERNS: BingoPattern[] = [
  {
    id: 'single-line-h',
    name: 'Single Line (Horizontal)',
    description: 'Complete any horizontal row',
    grid: createGrid([
      'XXXXX',
      '.....',
      '.....',
      '.....',
      '.....',
    ]),
  },
  {
    id: 'single-line-v',
    name: 'Single Line (Vertical)',
    description: 'Complete any vertical column',
    grid: createGrid([
      'X....',
      'X....',
      'X....',
      'X....',
      'X....',
    ]),
  },
  {
    id: 'single-line-d',
    name: 'Single Line (Diagonal)',
    description: 'Complete either diagonal',
    grid: createGrid([
      'X....',
      '.X...',
      '..X..',
      '...X.',
      '....X',
    ]),
  },
  {
    id: 'four-corners',
    name: 'Four Corners',
    description: 'Complete all four corners',
    grid: createGrid([
      'X...X',
      '.....',
      '.....',
      '.....',
      'X...X',
    ]),
  },
  {
    id: 'letter-x',
    name: 'Letter X',
    description: 'Complete both diagonals forming an X',
    grid: createGrid([
      'X...X',
      '.X.X.',
      '..X..',
      '.X.X.',
      'X...X',
    ]),
  },
  {
    id: 'plus-sign',
    name: 'Plus Sign',
    description: 'Complete center row and column',
    grid: createGrid([
      '..X..',
      '..X..',
      'XXXXX',
      '..X..',
      '..X..',
    ]),
  },
  {
    id: 'frame',
    name: 'Frame',
    description: 'Complete the outer border',
    grid: createGrid([
      'XXXXX',
      'X...X',
      'X...X',
      'X...X',
      'XXXXX',
    ]),
  },
  {
    id: 'letter-t',
    name: 'Letter T',
    description: 'Complete top row and center column',
    grid: createGrid([
      'XXXXX',
      '..X..',
      '..X..',
      '..X..',
      '..X..',
    ]),
  },
  {
    id: 'blackout',
    name: 'Blackout',
    description: 'Complete the entire card',
    grid: createGrid([
      'XXXXX',
      'XXXXX',
      'XXXXX',
      'XXXXX',
      'XXXXX',
    ]),
  },
  {
    id: 'postage-stamp',
    name: 'Postage Stamp',
    description: 'Complete any 2x2 corner',
    grid: createGrid([
      'XX...',
      'XX...',
      '.....',
      '.....',
      '.....',
    ]),
  },
];

export function getPattern(id: string): BingoPattern | undefined {
  return BINGO_PATTERNS.find(p => p.id === id);
}

export function getPatternById(id: string): BingoPattern {
  const pattern = getPattern(id);
  if (!pattern) {
    throw new Error(`Pattern not found: ${id}`);
  }
  return pattern;
}

// Get indices for the pattern cells (0-24, excluding center which is free space)
export function getPatternIndices(pattern: BingoPattern): number[] {
  const indices: number[] = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      if (pattern.grid[row][col]) {
        const index = row * 5 + col;
        // Center (index 12) is always free space
        if (index !== 12) {
          indices.push(index);
        }
      }
    }
  }
  return indices;
}

// Normalize pattern indices to account for free space
// Card slots array is 24 items (no center), so we need to adjust
export function patternIndicesToSlotIndices(patternIndices: number[]): number[] {
  return patternIndices.map(idx => {
    // Adjust index for missing center (index 12)
    return idx > 12 ? idx - 1 : idx;
  });
}
