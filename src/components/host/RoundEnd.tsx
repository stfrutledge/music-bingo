import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../../context/GameContext';
import { getAllPatterns, getPatternById } from '../../lib/patterns';
import { checkWin } from '../../lib/winChecker';
import { Button } from '../shared/Button';
import { PatternDisplay } from '../shared/PatternDisplay';
import { AppShell } from '../shared/AppShell';
import { useConfirmDialog } from '../shared/ConfirmDialog';
import type { BingoPattern } from '../../types';

// Average duration per song clip in seconds (typical music bingo plays ~30s per song)
const SONG_CLIP_SECONDS = 30;

/**
 * Format seconds into a readable time string (e.g., "~1.5 min" or "~30 sec")
 */
function formatTimeEstimate(seconds: number): string {
  if (seconds < 60) {
    return `~${seconds}s`;
  }
  const minutes = seconds / 60;
  if (minutes < 2) {
    return `~${minutes.toFixed(1)} min`;
  }
  return `~${Math.round(minutes)} min`;
}

interface PatternStatus {
  bingos: number;
  closestMissing: number;       // How many songs the card needs
  songsUntilWin: number;        // How many songs until the card wins (based on shuffle order)
  closestCards: number[];
}

export function RoundEnd() {
  const navigate = useNavigate();
  const { game, playlist, advanceRound, endGame, resetCalledSongs, cards, excludedSongIds } = useGame();
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const [selectedNextPattern, setSelectedNextPattern] = useState<string | null>(null);
  // When false we show just the pre-selected next design; when true we reveal the
  // full pattern grid so the host can switch to a different one.
  const [changingPattern, setChangingPattern] = useState(false);

  // Pre-select the pattern the host chose for the next round at setup time.
  // currentRound is a 0-based index, so the next round's planned pattern lives
  // at plannedPatternIds[currentRound + 1]. Falls back to manual selection when
  // no plan exists (older games) or the plan has fewer rounds than played.
  useEffect(() => {
    if (!game) return;
    const planned = game.plannedPatternIds?.[game.currentRound + 1];
    setSelectedNextPattern(planned ?? null);
    // No plan to preview → open the grid so the host can pick.
    setChangingPattern(!planned);
  }, [game?.id, game?.currentRound]);

  // Calculate status for each pattern based on current called songs and shuffle order
  const patternStatuses = useMemo(() => {
    if (!game || !cards.length) return new Map<string, PatternStatus>();

    const calledSet = new Set(game.calledSongIds);
    const statuses = new Map<string, PatternStatus>();

    // Get active cards: explicit list takes precedence over the legacy range
    const activeCards = game.activeCardNumbers && game.activeCardNumbers.length > 0
      ? cards.filter(c => game.activeCardNumbers!.includes(c.cardNumber))
      : game.cardRangeStart && game.cardRangeEnd
      ? cards.filter(c => c.cardNumber >= game.cardRangeStart! && c.cardNumber <= game.cardRangeEnd!)
      : cards;

    // Get remaining songs in shuffle order (songs not yet called)
    const remainingSongs = game.shuffledSongOrder.slice(game.currentSongIndex);

    // Create a map of songId -> position in remaining shuffle (1-based: "in X songs")
    const songPositionMap = new Map<string, number>();
    remainingSongs.forEach((songId, idx) => {
      if (!songPositionMap.has(songId)) {
        songPositionMap.set(songId, idx + 1); // 1-based position
      }
    });

    for (const pattern of getAllPatterns()) {
      let bingos = 0;
      let closestMissing = Infinity;
      let bestSongsUntilWin = Infinity;
      const closestCards: number[] = [];

      for (const card of activeCards) {
        const result = checkWin(card, pattern, calledSet, excludedSongIds);
        const missing = result.missingSlots.length;

        if (missing === 0) {
          bingos++;
        } else {
          // Calculate when this card will win based on shuffle order
          // Find the LAST position of any missing song - that's when the card wins
          let latestPosition = 0;
          for (const missingSong of result.missingSongs) {
            const pos = songPositionMap.get(missingSong.songId);
            if (pos !== undefined && pos > latestPosition) {
              latestPosition = pos;
            }
          }

          // If any missing song isn't in the remaining shuffle, card can't win
          const canWin = result.missingSongs.every(ms => songPositionMap.has(ms.songId));
          const songsUntilWin = canWin ? latestPosition : Infinity;

          // Track the card that wins soonest (by songsUntilWin, not by closestMissing)
          if (songsUntilWin < bestSongsUntilWin) {
            bestSongsUntilWin = songsUntilWin;
            closestMissing = missing;
            closestCards.length = 0;
            closestCards.push(card.cardNumber);
          } else if (songsUntilWin === bestSongsUntilWin && closestCards.length < 3) {
            closestCards.push(card.cardNumber);
          }
        }
      }

      statuses.set(pattern.id, {
        bingos,
        closestMissing: closestMissing === Infinity ? 0 : closestMissing,
        songsUntilWin: bestSongsUntilWin === Infinity ? 0 : bestSongsUntilWin,
        closestCards,
      });
    }

    return statuses;
  }, [game?.calledSongIds, game?.shuffledSongOrder, game?.currentSongIndex, cards, game?.cardRangeStart, game?.cardRangeEnd, game?.activeCardNumbers, excludedSongIds]);

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

    if (status.songsUntilWin === 0) {
      return {
        text: 'No winner possible',
        color: 'text-[var(--text-muted)]',
      };
    }

    const cardLabel = status.closestCards.length > 0
      ? `#${status.closestCards[0]}`
      : '';

    // Time estimate based on actual songs until win
    const timeEstimate = formatTimeEstimate(status.songsUntilWin * SONG_CLIP_SECONDS);

    if (status.songsUntilWin === 1) {
      return {
        text: `${cardLabel} wins next (${timeEstimate})`,
        color: 'text-[var(--status-warning-text)]',
      };
    }

    if (status.songsUntilWin <= 5) {
      return {
        text: `${cardLabel} in ${status.songsUntilWin} songs (${timeEstimate})`,
        color: 'text-[var(--status-warning-text)]',
      };
    }

    if (status.songsUntilWin <= 10) {
      return {
        text: `${cardLabel} in ${status.songsUntilWin} songs (${timeEstimate})`,
        color: 'text-[var(--status-info-text)]',
      };
    }

    return {
      text: `${cardLabel} in ${status.songsUntilWin} songs (${timeEstimate})`,
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
      <ConfirmDialog />
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

          {/* Previous Rounds */}
          {game.currentRound > 0 && (
            <div className="card">
              <h2 className="text-sm font-semibold text-[var(--text-secondary)] mb-3 uppercase tracking-wide">
                Previous Rounds
              </h2>
              <div className="space-y-3">
                {game.rounds.slice(0, game.currentRound).map(round => {
                  const roundPattern = getPatternById(round.patternId);
                  return (
                    <div
                      key={round.roundNumber}
                      className="flex items-start justify-between gap-3 pb-3 border-b border-[var(--border-color)] last:border-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[var(--text-primary)]">
                          Round {round.roundNumber}
                        </div>
                        <div className="text-xs text-[var(--text-secondary)] truncate">
                          {roundPattern.name}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        {round.winners.length > 0 ? (
                          <>
                            <div className="text-sm font-semibold text-[var(--status-success-text)]">
                              {round.winners.length} winner{round.winners.length !== 1 ? 's' : ''}
                            </div>
                            <div className="text-xs text-[var(--text-secondary)]">
                              {round.winners.map(w => `#${w.cardNumber}`).join(', ')}
                            </div>
                          </>
                        ) : (
                          <div className="text-sm text-[var(--text-muted)]">No winners</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Reset Cards Option */}
          <div className="card">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Card Reset</h3>
            <div className="text-sm text-[var(--text-secondary)] mb-3">
              Players keeping marks? Or fresh start?
            </div>
            <Button
              variant="secondary"
              fullWidth
              onClick={async () => {
                const confirmed = await confirm({
                  title: 'Reset All Cards',
                  message: 'Reset all cards? This will clear all called songs and players will need to wipe their cards.',
                  confirmLabel: 'Reset Cards',
                  cancelLabel: 'Cancel',
                  variant: 'danger',
                });
                if (confirmed) {
                  resetCalledSongs();
                  alert('Cards reset! Tell players to clear their marks.');
                }
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
              {!changingPattern && selectedNextPattern
                ? `Pre-selected from setup for Round ${currentRound.roundNumber + 1}`
                : `Choose a pattern for Round ${currentRound.roundNumber + 1}`}
            </p>

            {/* Pattern Selection */}
            {!changingPattern && selectedNextPattern ? (
              (() => {
                const nextPattern = getPatternById(selectedNextPattern);
                const statusLabel = getStatusLabel(nextPattern);
                return (
                  <div className="mb-6">
                    <div className="flex flex-col sm:flex-row items-center gap-6 p-6 rounded-lg bg-[var(--bg-hover)] border border-[var(--border-color)]">
                      <PatternDisplay pattern={nextPattern} size="lg" showLabel={false} selected />
                      <div className="text-center sm:text-left">
                        <div className="text-xs uppercase tracking-wide text-[var(--text-muted)] mb-1">
                          Next design
                        </div>
                        <div className="text-xl font-bold text-[var(--text-primary)]">
                          {nextPattern.name}
                        </div>
                        {nextPattern.description && (
                          <div className="text-sm text-[var(--text-secondary)] mt-1">
                            {nextPattern.description}
                          </div>
                        )}
                        {statusLabel.text && (
                          <div className={`text-sm mt-2 ${statusLabel.color}`}>
                            {statusLabel.text}
                          </div>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mt-3"
                      onClick={() => setChangingPattern(true)}
                    >
                      Change design
                    </Button>
                  </div>
                );
              })()
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-4 mb-6">
                {getAllPatterns().map(p => {
                  const statusLabel = getStatusLabel(p);
                  return (
                    <div
                      key={p.id}
                      onClick={() => {
                        setSelectedNextPattern(p.id);
                        // Collapse back to the single preview showing the new choice
                        setChangingPattern(false);
                      }}
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
            )}

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
