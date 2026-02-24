import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BingoCard } from '../../types';
import { useGame } from '../../context/GameContext';
import { getCard } from '../../lib/db';
import { getPatternById, getPatternIndices, patternIndicesToSlotIndices } from '../../lib/patterns';
import { checkWin } from '../../lib/winChecker';
import { Button } from '../shared/Button';
import { BingoGrid } from '../shared/BingoGrid';

export function WinnerVerification() {
  const navigate = useNavigate();
  const { game, playlist, recordWinner, excludedSongIds } = useGame();

  const [cardNumber, setCardNumber] = useState('');
  const [card, setCard] = useState<BingoCard | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    isWin: boolean;
    missingSlots: number[];
  } | null>(null);

  useEffect(() => {
    // Reset when card number changes
    setCard(null);
    setResult(null);
  }, [cardNumber]);

  if (!game || !playlist) {
    return (
      <div className="min-h-screen bg-navy-950 flex items-center justify-center">
        <div className="text-slate-400">No active game</div>
      </div>
    );
  }

  const currentRound = game.rounds[game.currentRound];
  const pattern = getPatternById(currentRound.patternId);
  const patternSlotIndices = patternIndicesToSlotIndices(getPatternIndices(pattern));

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
    <div className="min-h-screen bg-navy-950 p-4 safe-area-inset">
      <div className="max-w-md mx-auto">
        <header className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">Verify Winner</h1>
          <Button variant="ghost" size="sm" onClick={() => navigate('/host/game')}>
            Cancel
          </Button>
        </header>

        {/* Pattern Info */}
        <div className="card mb-6 text-center">
          <div className="text-slate-400 text-sm mb-2">Current Pattern</div>
          <div className="text-white font-semibold">{pattern.name}</div>
        </div>

        {/* Card Number Input */}
        <div className="card mb-6">
          <label className="block text-sm text-slate-400 mb-2">
            Enter Card Number
          </label>
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

        {/* Result */}
        {result && card && (
          <div className="space-y-4">
            {/* Verdict */}
            <div
              className={`card text-center ${
                result.isWin ? 'bg-green-900/50 border-green-500' : 'bg-red-900/50 border-red-500'
              } border-2`}
            >
              <div className={`text-3xl font-bold ${result.isWin ? 'text-green-400' : 'text-red-400'}`}>
                {result.isWin ? 'WINNER!' : 'NOT A WINNER'}
              </div>
              {!result.isWin && result.missingSlots.length > 0 && (
                <div className="text-slate-400 mt-2">
                  Missing {result.missingSlots.length} song{result.missingSlots.length !== 1 ? 's' : ''}
                </div>
              )}
            </div>

            {/* Card Display */}
            <div className="card">
              <div className="text-center mb-4">
                <span className="text-lg font-bold text-white">Card #{card.cardNumber}</span>
              </div>
              <BingoGrid
                slots={card.slots}
                songMap={songMap}
                calledSongIds={calledSet}
                excludedSongIds={excludedSongIds}
                highlightedSlots={result.isWin ? patternSlotIndices : []}
                patternSlots={result.isWin ? [] : patternSlotIndices}
                size="sm"
              />
              <div className="mt-4 flex gap-2 text-sm justify-center">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 bg-indigo-600 rounded" /> Called
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 bg-green-600 rounded" /> Win
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 border-2 border-yellow-400 rounded" /> Needed
                </span>
              </div>
            </div>

            {/* Actions */}
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
        )}
      </div>
    </div>
  );
}
