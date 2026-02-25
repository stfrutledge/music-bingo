import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../../context/GameContext';
import { BINGO_PATTERNS, getPatternById } from '../../lib/patterns';
import { checkWin } from '../../lib/winChecker';
import { Button } from '../shared/Button';
import { PatternDisplay } from '../shared/PatternDisplay';
import type { BingoPattern } from '../../types';

interface PatternStatus {
  bingos: number;
  closestMissing: number;
  closestCards: number[];
}

export function RoundEnd() {
  const navigate = useNavigate();
  const { game, playlist, advanceRound, endGame, cards, excludedSongIds } = useGame();

  const [selectedNextPattern, setSelectedNextPattern] = useState<string | null>(null);

  // Calculate status for each pattern based on current called songs
  const patternStatuses = useMemo(() => {
    if (!game || !cards.length) return new Map<string, PatternStatus>();

    const calledSet = new Set(game.calledSongIds);
    const statuses = new Map<string, PatternStatus>();

    // Get active cards based on game range
    const activeCards = game.cardRangeStart && game.cardRangeEnd
      ? cards.filter(c => c.cardNumber >= game.cardRangeStart! && c.cardNumber <= game.cardRangeEnd!)
      : cards;

    for (const pattern of BINGO_PATTERNS) {
      let bingos = 0;
      let closestMissing = Infinity;
      const closestCards: number[] = [];

      for (const card of activeCards) {
        const result = checkWin(card, pattern, calledSet, excludedSongIds);
        const missing = result.missingSlots.length;

        if (missing === 0) {
          bingos++;
        } else if (missing < closestMissing) {
          closestMissing = missing;
          closestCards.length = 0;
          closestCards.push(card.cardNumber);
        } else if (missing === closestMissing && closestCards.length < 3) {
          closestCards.push(card.cardNumber);
        }
      }

      statuses.set(pattern.id, {
        bingos,
        closestMissing: closestMissing === Infinity ? 0 : closestMissing,
        closestCards,
      });
    }

    return statuses;
  }, [game?.calledSongIds, cards, game?.cardRangeStart, game?.cardRangeEnd, excludedSongIds]);

  if (!game || !playlist) {
    return (
      <div className="min-h-screen bg-navy-950 flex items-center justify-center">
        <div className="text-slate-400">No active game</div>
      </div>
    );
  }

  const currentRound = game.rounds[game.currentRound];
  const pattern = getPatternById(currentRound.patternId);

  const getStatusLabel = (p: BingoPattern): { text: string; color: string } => {
    const status = patternStatuses.get(p.id);
    if (!status) return { text: '', color: 'text-slate-500' };

    if (status.bingos > 0) {
      return {
        text: `${status.bingos} BINGO!`,
        color: 'text-green-400',
      };
    }

    if (status.closestMissing === 1) {
      return {
        text: `1 away (${status.closestCards.length} cards)`,
        color: 'text-yellow-400',
      };
    }

    if (status.closestMissing <= 3) {
      return {
        text: `${status.closestMissing} away`,
        color: 'text-blue-400',
      };
    }

    return {
      text: `${status.closestMissing} away`,
      color: 'text-slate-500',
    };
  };

  const handleNextRound = () => {
    if (!selectedNextPattern) {
      alert('Please select a pattern for the next round');
      return;
    }
    advanceRound(selectedNextPattern);
    navigate('/host/game');
  };

  const handleEndGame = () => {
    endGame();
    navigate('/host/game-over');
  };

  const handleResume = () => {
    navigate('/host/game');
  };

  return (
    <div className="min-h-screen bg-navy-950 p-4 safe-area-inset">
      <div className="max-w-md mx-auto">
        <header className="mb-8">
          <h1 className="text-2xl font-bold text-white text-center">
            End of Round {currentRound.roundNumber}
          </h1>
        </header>

        {/* Round Summary */}
        <div className="card mb-6 text-center">
          <div className="text-slate-400 mb-2">Pattern</div>
          <div className="text-white font-semibold text-lg mb-4">{pattern.name}</div>

          {currentRound.winners.length > 0 ? (
            <div className="text-green-400">
              {currentRound.winners.length} winner{currentRound.winners.length !== 1 ? 's' : ''}
              <div className="text-sm text-slate-400 mt-1">
                Cards: {currentRound.winners.map(w => `#${w.cardNumber}`).join(', ')}
              </div>
            </div>
          ) : (
            <div className="text-slate-500">No winners yet</div>
          )}
        </div>

        {/* Resume option */}
        <div className="mb-6">
          <Button variant="secondary" fullWidth onClick={handleResume}>
            Resume Round
          </Button>
        </div>

        <div className="border-t border-navy-700 pt-6 mb-6">
          <h2 className="text-lg font-semibold text-white mb-4 text-center">
            Start Next Round
          </h2>

          {/* Pattern Selection */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            {BINGO_PATTERNS.map(p => {
              const statusLabel = getStatusLabel(p);
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedNextPattern(p.id)}
                  className="cursor-pointer"
                >
                  <PatternDisplay
                    pattern={p}
                    size="sm"
                    selected={selectedNextPattern === p.id}
                  />
                  <div className={`text-xs text-center mt-1 ${statusLabel.color}`}>
                    {statusLabel.text}
                  </div>
                </div>
              );
            })}
          </div>

          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={handleNextRound}
            disabled={!selectedNextPattern}
          >
            Start Round {currentRound.roundNumber + 1}
          </Button>
        </div>

        <div className="border-t border-navy-700 pt-6">
          <Button
            variant="danger"
            fullWidth
            onClick={handleEndGame}
          >
            End Game
          </Button>
        </div>
      </div>
    </div>
  );
}
