import type { GroupRecommendation } from '../types';

/**
 * Get recommended card generation settings based on expected player count.
 * Larger groups need more cards and can tolerate higher overlap.
 * Smaller groups benefit from stricter uniqueness for more varied gameplay.
 */
export function getGroupRecommendation(playerCount: number): GroupRecommendation {
  if (playerCount <= 10) {
    return {
      cardCount: Math.max(10, playerCount + 2),
      maxOverlap: 12,
      maxPositionalOverlap: 2,
      suggestedPatterns: ['single-line-h', 'single-line-v', 'single-line-d'],
      description: 'Small group - strict overlap settings for maximum card uniqueness',
    };
  }

  if (playerCount <= 25) {
    return {
      cardCount: playerCount + 5,
      maxOverlap: 15,
      maxPositionalOverlap: 3,
      suggestedPatterns: ['single-line-h', 'single-line-v', 'four-corners'],
      description: 'Medium-small group - balanced settings for good variety',
    };
  }

  if (playerCount <= 50) {
    return {
      cardCount: Math.round(playerCount * 1.1),
      maxOverlap: 16,
      maxPositionalOverlap: 3,
      suggestedPatterns: ['single-line-h', 'four-corners', 'letter-x'],
      description: 'Medium group - moderate overlap for feasible generation',
    };
  }

  if (playerCount <= 100) {
    return {
      cardCount: Math.round(playerCount * 1.05),
      maxOverlap: 18,
      maxPositionalOverlap: 4,
      suggestedPatterns: ['four-corners', 'letter-x', 'plus-sign'],
      description: 'Large group - relaxed overlap to ensure generation succeeds',
    };
  }

  // 100+ players
  return {
    cardCount: Math.round(playerCount * 1.02),
    maxOverlap: 20,
    maxPositionalOverlap: 4,
    suggestedPatterns: ['letter-x', 'frame', 'blackout'],
    description: 'Very large group - harder patterns recommended to extend game time',
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
