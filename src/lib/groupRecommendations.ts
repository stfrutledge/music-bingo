import type { GroupRecommendation } from '../types';

/**
 * Get recommended card generation settings based on expected player count.
 * Larger groups need more cards and can tolerate higher overlap.
 * Smaller groups benefit from stricter uniqueness for more varied gameplay.
 */
export function getGroupRecommendation(playerCount: number): GroupRecommendation {
  // Higher maxOverlap = cards share more songs = faster games
  // With random song selection, high overlap allows natural clustering
  // All groups now use maxOverlap: 22 for fast games (~12-18 songs to win)

  if (playerCount <= 10) {
    return {
      cardCount: Math.max(10, playerCount + 2),
      maxOverlap: 22,
      maxPositionalOverlap: 4,
      suggestedPatterns: ['single-line-h', 'single-line-v', 'single-line-d'],
      description: 'Small group - quick games',
    };
  }

  if (playerCount <= 25) {
    return {
      cardCount: playerCount + 5,
      maxOverlap: 22,
      maxPositionalOverlap: 4,
      suggestedPatterns: ['single-line-h', 'single-line-v', 'four-corners'],
      description: 'Medium-small group - fast rounds',
    };
  }

  if (playerCount <= 50) {
    return {
      cardCount: Math.round(playerCount * 1.1),
      maxOverlap: 22,
      maxPositionalOverlap: 4,
      suggestedPatterns: ['single-line-h', 'four-corners', 'letter-x'],
      description: 'Medium group - quick rounds',
    };
  }

  if (playerCount <= 100) {
    return {
      cardCount: Math.round(playerCount * 1.05),
      maxOverlap: 22,
      maxPositionalOverlap: 4,
      suggestedPatterns: ['four-corners', 'letter-x', 'plus-sign'],
      description: 'Large group - fast games',
    };
  }

  // 100+ players
  return {
    cardCount: Math.round(playerCount * 1.02),
    maxOverlap: 22,
    maxPositionalOverlap: 4,
    suggestedPatterns: ['letter-x', 'frame', 'blackout'],
    description: 'Very large group - quick rounds',
  };
}

/**
 * Get pattern difficulty descriptions for UI display
 */
export function getPatternDifficultyLabel(patternIds: string[]): string {
  const hasEasyPatterns = patternIds.some(p =>
    ['single-line-h', 'single-line-v', 'single-line-d'].includes(p)
  );
  const hasHardPatterns = patternIds.some(p =>
    ['blackout', 'frame'].includes(p)
  );

  if (hasHardPatterns) return 'Hard';
  if (hasEasyPatterns) return 'Easy';
  return 'Medium';
}
