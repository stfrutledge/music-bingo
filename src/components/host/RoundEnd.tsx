import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../../context/GameContext';
import { BINGO_PATTERNS, getPatternById } from '../../lib/patterns';
import { Button } from '../shared/Button';
import { PatternDisplay } from '../shared/PatternDisplay';

export function RoundEnd() {
  const navigate = useNavigate();
  const { game, playlist, advanceRound, endGame } = useGame();

  const [selectedNextPattern, setSelectedNextPattern] = useState<string | null>(null);

  if (!game || !playlist) {
    return (
      <div className="min-h-screen bg-navy-950 flex items-center justify-center">
        <div className="text-slate-400">No active game</div>
      </div>
    );
  }

  const currentRound = game.rounds[game.currentRound];
  const pattern = getPatternById(currentRound.patternId);

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
            {BINGO_PATTERNS.map(p => (
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
              </div>
            ))}
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
