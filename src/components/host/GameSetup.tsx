import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Playlist, BingoCard, PacingTable, PacingEntry } from '../../types';
import { getPlaylist, getCardsForPlaylist, getPacingTable } from '../../lib/db';
import { getPacingForGroupSize } from '../../lib/cardGenerator';
import { BINGO_PATTERNS } from '../../lib/patterns';
import { useGame } from '../../context/GameContext';
import { Button } from '../shared/Button';
import { PatternDisplay } from '../shared/PatternDisplay';
import { AppShell } from '../shared/AppShell';

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

  const [playerCount, setPlayerCount] = useState(30);
  const cardRangeStart = 1;
  const cardRangeEnd = Math.min(playerCount, allCards.length);
  const cardsInPlay = cardRangeEnd - cardRangeStart + 1;

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
      <AppShell centered>
        <div className="text-[var(--text-secondary)]">Loading...</div>
      </AppShell>
    );
  }

  if (!playlist) {
    return (
      <AppShell centered>
        <div className="text-[var(--status-error-text)]">Playlist not found</div>
      </AppShell>
    );
  }

  return (
    <AppShell title={playlist.name} subtitle="Game Setup" maxWidth="xl">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-[var(--text-primary)]">Game Setup</h1>
          <p className="text-[var(--text-secondary)] mt-1">
            {playlist.name} &bull; {playlist.songs.length} songs
          </p>
        </div>
        <Button variant="ghost" onClick={() => navigate('/host/playlists')}>
          Cancel
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Pattern Selection - Takes 2 columns on desktop */}
        <div className="lg:col-span-2">
          <div className="card">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
              Select Patterns for Rounds
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-6">
              Click patterns in the order you want to play them. First selected = Round 1.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
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
                    <div className="text-center text-xs text-[var(--accent-green)] mt-1 font-medium">
                      Round {selectedPatterns.indexOf(pattern.id) + 1}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Selected Order */}
            {selectedPatterns.length > 1 && (
              <div className="mt-6 pt-6 border-t border-[var(--border-color)]">
                <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Round Order</h3>
                <div className="flex flex-wrap gap-2">
                  {selectedPatterns.map((patternId, idx) => {
                    const pattern = BINGO_PATTERNS.find(p => p.id === patternId);
                    return (
                      <span
                        key={patternId}
                        className="px-3 py-1.5 bg-[var(--bg-accent)] border border-[var(--accent-green)] rounded-full text-sm text-[var(--accent-green)] font-medium"
                      >
                        {idx + 1}. {pattern?.name}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar - Player count and start */}
        <div className="space-y-6">
          {/* Player Count */}
          {totalCards > 0 ? (
            <div className="card">
              <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
                Player Count
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

              <div className="flex flex-wrap gap-2 mb-4">
                {[10, 20, 30, 50].filter(n => n <= totalCards).map(count => (
                  <button
                    key={count}
                    onClick={() => setPlayerCount(count)}
                    className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                      playerCount === count
                        ? 'bg-[var(--accent-green)] text-white'
                        : 'bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:bg-[var(--bg-card)] border border-[var(--border-color)]'
                    }`}
                  >
                    {count}
                  </button>
                ))}
              </div>

              <div className="bg-[var(--status-success-bg)] border border-[var(--accent-green)] rounded-lg p-4 text-center">
                <div className="text-sm text-[var(--status-success-text)] mb-1 font-medium">Distribute cards:</div>
                <div className="text-2xl font-bold text-[var(--text-primary)]">
                  #1 - #{cardsInPlay}
                </div>
              </div>

              {pacingEntry && (
                <div className="mt-4 p-4 bg-[var(--bg-hover)] rounded-lg">
                  <div className="text-sm text-[var(--text-secondary)] mb-2">Expected pacing:</div>
                  <div className="text-lg font-semibold text-[var(--text-primary)]">
                    ~{pacingEntry.expectedSongsToWin} songs to first winner
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="card">
              <p className="text-[var(--status-warning-text)] text-sm">
                No cards generated for this playlist. Generate cards in Admin mode for winner verification.
              </p>
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
    </AppShell>
  );
}
