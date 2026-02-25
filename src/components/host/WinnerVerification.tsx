import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BingoCard } from '../../types';
import { useGame } from '../../context/GameContext';
import { getCard } from '../../lib/db';
import { getPatternById } from '../../lib/patterns';
import { checkWin } from '../../lib/winChecker';
import { Button } from '../shared/Button';
import { BingoGrid } from '../shared/BingoGrid';
import { AppShell } from '../shared/AppShell';

export function WinnerVerification() {
  const navigate = useNavigate();
  const { game, playlist, recordWinner, excludedSongIds } = useGame();

  const [cardNumber, setCardNumber] = useState('');
  const [card, setCard] = useState<BingoCard | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    isWin: boolean;
    missingSlots: number[];
    matchedSlots: number[];
  } | null>(null);

  useEffect(() => {
    // Reset when card number changes
    setCard(null);
    setResult(null);
  }, [cardNumber]);

  if (!game || !playlist) {
    return <AppShell centered><div className="text-[var(--text-secondary)]">No active game</div></AppShell>;
  }

  const currentRound = game.rounds[game.currentRound];
  const pattern = getPatternById(currentRound.patternId);

  const handleCheckCard = async () => {
    const num = parseInt(cardNumber);
    if (isNaN(num) || num < 1) {
      alert('Please enter a valid card number');
      return;
    }

    setLoading(true);
    const foundCard = await getCard(playlist.id, num);

    if (!foundCard) {
      alert(`Card #${num} not found`);
      setLoading(false);
      return;
    }

    setCard(foundCard);

    // Check for win (excluded songs count as marked/called)
    const calledSet = new Set(game.calledSongIds);
    const checkResult = checkWin(foundCard, pattern, calledSet, excludedSongIds);

    setResult({
      isWin: checkResult.isWin,
      missingSlots: checkResult.missingSlots,
      matchedSlots: checkResult.matchedSlots,
    });

    setLoading(false);
  };

  const handleConfirmWinner = () => {
    if (!card) return;
    recordWinner(card.cardNumber);
    navigate('/host/game');
  };

  const songMap = new Map(playlist.songs.map(s => [s.id, s]));
  const calledSet = new Set(game.calledSongIds);

  return (
    <AppShell title="Verify Winner" maxWidth="lg">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-[var(--text-primary)]">Verify Winner</h1>
          <p className="text-[var(--text-secondary)] mt-1">Pattern: {pattern.name}</p>
        </div>
        <Button variant="ghost" onClick={() => navigate('/host/game')}>
          Back to Game
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column - Input */}
        <div className="space-y-6">
          {/* Card Number Input */}
          <div className="card">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Enter Card Number</h2>
            <div className="flex gap-2">
              <input
                type="number"
                value={cardNumber}
                onChange={e => setCardNumber(e.target.value)}
                className="input flex-1 text-2xl text-center"
                placeholder="#"
                min="1"
                inputMode="numeric"
              />
              <Button
                variant="primary"
                onClick={handleCheckCard}
                disabled={loading || !cardNumber}
              >
                {loading ? 'Checking...' : 'Check'}
              </Button>
            </div>
          </div>

          {/* Pattern Info - Mobile */}
          <div className="card lg:hidden text-center">
            <div className="text-[var(--text-secondary)] text-sm mb-2 uppercase tracking-wide">Current Pattern</div>
            <div className="text-[var(--text-primary)] font-semibold">{pattern.name}</div>
          </div>
        </div>

        {/* Right Column - Result */}
        <div className="space-y-6">
          {result && card ? (
            <>
              {/* Verdict */}
              <div
                className={`card text-center ${
                  result.isWin
                    ? 'bg-[var(--status-success-bg)] border-[var(--accent-green)]'
                    : 'bg-[var(--status-error-bg)] border-red-500'
                } border-2`}
              >
                <div className={`text-3xl font-bold ${result.isWin ? 'text-[var(--status-success-text)]' : 'text-[var(--status-error-text)]'}`}>
                  {result.isWin ? 'WINNER!' : 'NOT A WINNER'}
                </div>
                {!result.isWin && result.missingSlots.length > 0 && (
                  <div className="text-[var(--text-secondary)] mt-2">
                    Missing {result.missingSlots.length} song{result.missingSlots.length !== 1 ? 's' : ''}
                  </div>
                )}
              </div>

              {/* Card Display */}
              <div className="card">
                <div className="text-center mb-4">
                  <span className="text-lg font-bold text-[var(--text-primary)]">Card #{card.cardNumber}</span>
                </div>
                <div className="max-w-sm mx-auto">
                  <BingoGrid
                    slots={card.slots}
                    songMap={songMap}
                    calledSongIds={calledSet}
                    excludedSongIds={excludedSongIds}
                    highlightedSlots={result.isWin ? result.matchedSlots : []}
                    patternSlots={result.isWin ? [] : result.matchedSlots}
                    size="sm"
                  />
                </div>
                <div className="mt-4 flex gap-2 text-sm justify-center flex-wrap">
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-[var(--accent-teal)] rounded" /> Called
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-[var(--accent-green)] rounded" /> Win
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 border-2 border-[var(--accent-amber)] rounded" /> Needed
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-3">
                {result.isWin && (
                  <Button
                    variant="success"
                    size="lg"
                    fullWidth
                    onClick={handleConfirmWinner}
                  >
                    Confirm Winner
                  </Button>
                )}

                <Button
                  variant="secondary"
                  fullWidth
                  onClick={() => {
                    setCardNumber('');
                    setCard(null);
                    setResult(null);
                  }}
                >
                  Check Another Card
                </Button>
              </div>
            </>
          ) : (
            <div className="card text-center py-16 text-[var(--text-muted)]">
              Enter a card number to verify
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
