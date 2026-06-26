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

// In-memory registry of user-defined custom patterns. Populated at app startup
// from IndexedDB (see main.tsx) so the synchronous getPattern/getPatternById
// lookups used across the game flow can resolve custom pattern IDs too.
const customPatterns = new Map<string, BingoPattern>();

// Replace the entire custom-pattern registry (used on startup load).
export function setCustomPatterns(patterns: BingoPattern[]): void {
  customPatterns.clear();
  for (const p of patterns) {
    customPatterns.set(p.id, { ...p, isCustom: true });
  }
}

// Add or update a single custom pattern in the registry.
export function registerCustomPattern(pattern: BingoPattern): void {
  customPatterns.set(pattern.id, { ...pattern, isCustom: true });
}

export function unregisterCustomPattern(id: string): void {
  customPatterns.delete(id);
}

export function getCustomPatterns(): BingoPattern[] {
  return [...customPatterns.values()];
}

// Presets followed by custom patterns — the full selectable list.
export function getAllPatterns(): BingoPattern[] {
  return [...BINGO_PATTERNS, ...customPatterns.values()];
}

// Build a BingoPattern from a 5x5 grid and a name. The center (index 12) is
// always the free space and is forced off regardless of the grid passed in.
export function createCustomPattern(name: string, grid: boolean[][]): BingoPattern {
  const normalized = grid.map((row, r) =>
    row.map((cell, c) => (r === 2 && c === 2 ? false : cell))
  );
  const count = normalized.flat().filter(Boolean).length;
  return {
    id: `custom-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    name: name.trim() || 'Custom Pattern',
    description: `Custom pattern (${count} square${count === 1 ? '' : 's'})`,
    grid: normalized,
    isCustom: true,
    createdAt: Date.now(),
  };
}

export function getPattern(id: string): BingoPattern | undefined {
  return BINGO_PATTERNS.find(p => p.id === id) ?? customPatterns.get(id);
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
