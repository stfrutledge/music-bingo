import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../../context/GameContext';
import { BINGO_PATTERNS, getPatternById } from '../../lib/patterns';
import { checkWin } from '../../lib/winChecker';
import { Button } from '../shared/Button';
import { PatternDisplay } from '../shared/PatternDisplay';
import { AppShell } from '../shared/AppShell';
import type { BingoPattern } from '../../types';

interface PatternStatus {
  bingos: number;
  closestMissing: number;
  closestCards: number[];
}

export function RoundEnd() {
  const navigate = useNavigate();
  const { game, playlist, advanceRound, endGame, resetCalledSongs, cards, excludedSongIds } = useGame();

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
    return <AppShell centered><div className="text-[var(--text-secondary)]">No active game</div></AppShell>;
  }

  const currentRound = game.rounds[game.currentRound];
  const pattern = getPatternById(currentRound.patternId);

  const getStatusLabel = (p: BingoPattern): { text: string; color: string } => {
    const status = patternStatuses.get(p.id);
    if (!status) return { text: '', color: 'text-[var(--text-muted)]' };

    if (status.bingos > 0) {
      return {
        text: `${status.bingos} BINGO!`,
        color: 'text-[var(--status-success-text)]',
      };
    }

    const cardLabel = status.closestCards.length > 0
      ? `#${status.closestCards[0]}`
      : '';

    if (status.closestMissing === 1) {
      return {
        text: `${cardLabel} is 1 away`,
        color: 'text-[var(--status-warning-text)]',
      };
    }

    if (status.closestMissing <= 3) {
      return {
        text: `${cardLabel} is ${status.closestMissing} away`,
        color: 'text-[var(--status-info-text)]',
      };
    }

    return {
      text: `${cardLabel} is ${status.closestMissing} away`,
      color: 'text-[var(--text-muted)]',
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
    <AppShell title={`Round ${currentRound.roundNumber} Complete`} maxWidth="xl">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-[var(--text-primary)]">
            Round {currentRound.roundNumber} Complete
          </h1>
          <p className="text-[var(--text-secondary)] mt-1">Pattern: {pattern.name}</p>
        </div>
        <Button variant="secondary" onClick={handleResume}>
          Resume Round
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column - Round Summary & Actions */}
        <div className="lg:col-span-1 space-y-6">
          {/* Round Summary */}
          <div className="card text-center">
            <h2 className="text-sm font-semibold text-[var(--text-secondary)] mb-2 uppercase tracking-wide">Round Summary</h2>
            {currentRound.winners.length > 0 ? (
              <div className="text-[var(--status-success-text)]">
                <div className="text-3xl font-bold">{currentRound.winners.length}</div>
                <div className="text-sm">winner{currentRound.winners.length !== 1 ? 's' : ''}</div>
                <div className="text-sm text-[var(--text-secondary)] mt-2">
                  Cards: {currentRound.winners.map(w => `#${w.cardNumber}`).join(', ')}
                </div>
              </div>
            ) : (
              <div className="text-[var(--text-muted)]">No winners yet</div>
            )}
          </div>

          {/* Reset Cards Option */}
          <div className="card">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Card Reset</h3>
            <div className="text-sm text-[var(--text-secondary)] mb-3">
              Players keeping marks? Or fresh start?
            </div>
            <Button
              variant="secondary"
              fullWidth
              onClick={() => {
                resetCalledSongs();
                alert('Cards reset! Tell players to clear their marks.');
              }}
            >
              Reset All Cards
            </Button>
            <div className="text-xs text-[var(--text-muted)] mt-2 text-center">
              Clears all called songs - players wipe their cards
            </div>
          </div>

          {/* End Game */}
          <Button variant="danger" fullWidth onClick={handleEndGame}>
            End Game
          </Button>
        </div>

        {/* Right Column - Next Round Setup */}
        <div className="lg:col-span-2">
          <div className="card">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
              Start Next Round
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-6">
              Select a pattern for Round {currentRound.roundNumber + 1}
            </p>

            {/* Pattern Selection */}
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-4 mb-6">
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
        </div>
      </div>
    </AppShell>
  );
}
