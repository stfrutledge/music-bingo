import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Playlist, BingoCard, PacingTable, PacingEntry } from '../../types';
import { getPlaylist, getCardsForPlaylist, getPacingTable } from '../../lib/db';
import { getPacingForGroupSize } from '../../lib/cardGenerator';
import { BINGO_PATTERNS } from '../../lib/patterns';
import { useGame } from '../../context/GameContext';
import { Button } from '../shared/Button';
import { PatternDisplay } from '../shared/PatternDisplay';

export function GameSetup() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { startNewGame } = useGame();

  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [allCards, setAllCards] = useState<BingoCard[]>([]);
  const [pacingTable, setPacingTable] = useState<PacingTable | null>(null);
  const [selectedPatterns, setSelectedPatterns] = useState<string[]>(['single-line-h']);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  // Player count determines cards in play (always cards #1 through #playerCount)
  const [playerCount, setPlayerCount] = useState(30);
  const cardRangeStart = 1;
  const cardRangeEnd = Math.min(playerCount, allCards.length);
  const cardsInPlay = cardRangeEnd - cardRangeStart + 1;

  // Get pacing info for current player count
  const pacingEntry = useMemo((): PacingEntry | null => {
    if (!pacingTable) return null;
    return getPacingForGroupSize(pacingTable, cardsInPlay);
  }, [pacingTable, cardsInPlay]);

  useEffect(() => {
    if (id) {
      loadPlaylist(id);
    }
  }, [id]);

  const loadPlaylist = async (playlistId: string) => {
    setLoading(true);
    const [playlistData, cards, pacing] = await Promise.all([
      getPlaylist(playlistId),
      getCardsForPlaylist(playlistId),
      getPacingTable(playlistId),
    ]);

    if (playlistData) {
      setPlaylist(playlistData);
      setAllCards(cards);
      setPacingTable(pacing || null);
      // Default player count to 30 or total cards if fewer available
      if (cards.length > 0) {
        setPlayerCount(Math.min(30, cards.length));
      }
    }
    setLoading(false);
  };

  const totalCards = allCards.length;

  const togglePattern = (patternId: string) => {
    setSelectedPatterns(prev => {
      if (prev.includes(patternId)) {
        // Don't allow removing last pattern
        if (prev.length === 1) return prev;
        return prev.filter(p => p !== patternId);
      }
      return [...prev, patternId];
    });
  };

  const handleStartGame = async () => {
    if (!playlist) return;

    setStarting(true);
    await startNewGame(playlist, selectedPatterns, { cardRangeStart, cardRangeEnd });
    navigate('/host/game');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-navy-950 flex items-center justify-center">
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }

  if (!playlist) {
    return (
      <div className="min-h-screen bg-navy-950 flex items-center justify-center">
        <div className="text-red-400">Playlist not found</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-navy-950 p-4 safe-area-inset">
      <div className="max-w-lg mx-auto">
        <header className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-white">Game Setup</h1>
          <Button variant="ghost" size="sm" onClick={() => navigate('/host/playlists')}>
            Cancel
          </Button>
        </header>

        {/* Playlist Info */}
        <div className="card mb-6">
          <h2 className="text-lg font-semibold text-white">{playlist.name}</h2>
          <p className="text-slate-400">{playlist.songs.length} songs</p>
          {totalCards === 0 && (
            <p className="text-yellow-400 text-sm mt-2">
              No cards generated for this playlist. Generate cards in Admin mode for winner verification.
            </p>
          )}
        </div>

        {/* Player Count */}
        {totalCards > 0 && (
          <div className="card mb-6">
            <h3 className="text-lg font-semibold text-white mb-4">
              How Many Players?
            </h3>

            <div className="mb-4">
              <input
                type="number"
                value={playerCount}
                onChange={e => {
                  const val = Math.max(1, Math.min(parseInt(e.target.value) || 1, totalCards));
                  setPlayerCount(val);
                }}
                className="input w-full text-center text-2xl font-bold"
                min="1"
                max={totalCards}
              />
            </div>

            {/* Quick select buttons */}
            <div className="flex flex-wrap gap-2 mb-4">
              {[10, 20, 30, 50].filter(n => n <= totalCards).map(count => (
                <button
                  key={count}
                  onClick={() => setPlayerCount(count)}
                  className={`px-3 py-1 rounded text-sm ${
                    playerCount === count
                      ? 'bg-indigo-600 text-white'
                      : 'bg-navy-700 text-slate-300 hover:bg-navy-600'
                  }`}
                >
                  {count}
                </button>
              ))}
            </div>

            {/* Distribution instructions */}
            <div className="bg-green-900/30 border border-green-700 rounded-lg p-4 text-center">
              <div className="text-sm text-green-400 mb-1">Distribute to players:</div>
              <div className="text-2xl font-bold text-white">
                Cards #1 through #{cardsInPlay}
              </div>
              <div className="text-sm text-slate-400 mt-1">
                {cardsInPlay} card{cardsInPlay !== 1 ? 's' : ''} total
              </div>
            </div>

            {/* Pacing info */}
            {pacingEntry && (
              <div className="mt-4 bg-indigo-900/30 border border-indigo-700 rounded-lg p-4">
                <div className="text-sm text-indigo-400 mb-2">Game Pacing</div>
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-white">
                      ~{pacingEntry.expectedSongsToWin}
                    </div>
                    <div className="text-xs text-slate-400">songs to winner</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white">
                      {playlist ? playlist.songs.length - pacingEntry.excludeCount : 0}
                    </div>
                    <div className="text-xs text-slate-400">active songs</div>
                  </div>
                </div>
                {pacingEntry.excludeCount > 0 && (
                  <div className="mt-3 text-xs text-yellow-400 text-center">
                    {pacingEntry.excludeCount} songs excluded for balanced pacing
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Pattern Selection */}
        <div className="card mb-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            Select Patterns for Rounds
          </h3>
          <p className="text-sm text-slate-400 mb-4">
            Select patterns in order. First pattern is Round 1, etc.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {BINGO_PATTERNS.map(pattern => (
              <div
                key={pattern.id}
                onClick={() => togglePattern(pattern.id)}
                className="cursor-pointer"
              >
                <PatternDisplay
                  pattern={pattern}
                  size="sm"
                  selected={selectedPatterns.includes(pattern.id)}
                />
                {selectedPatterns.includes(pattern.id) && (
                  <div className="text-center text-xs text-indigo-400 mt-1">
                    Round {selectedPatterns.indexOf(pattern.id) + 1}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Selected Order */}
        {selectedPatterns.length > 1 && (
          <div className="card mb-6">
            <h3 className="text-sm font-semibold text-white mb-2">Round Order</h3>
            <div className="flex flex-wrap gap-2">
              {selectedPatterns.map((patternId, idx) => {
                const pattern = BINGO_PATTERNS.find(p => p.id === patternId);
                return (
                  <span
                    key={patternId}
                    className="px-3 py-1 bg-navy-700 rounded-full text-sm text-white"
                  >
                    R{idx + 1}: {pattern?.name}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Start Button */}
        <Button
          variant="success"
          size="lg"
          fullWidth
          onClick={handleStartGame}
          disabled={starting || selectedPatterns.length === 0}
        >
          {starting ? 'Starting...' : 'Start Game'}
        </Button>
      </div>
    </div>
  );
}
