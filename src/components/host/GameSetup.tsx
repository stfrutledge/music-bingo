import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Playlist } from '../../types';
import { getPlaylist, getCardsForPlaylist } from '../../lib/db';
import { BINGO_PATTERNS } from '../../lib/patterns';
import { useGame } from '../../context/GameContext';
import { Button } from '../shared/Button';
import { PatternDisplay } from '../shared/PatternDisplay';

export function GameSetup() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { startNewGame } = useGame();

  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [hasCards, setHasCards] = useState(false);
  const [selectedPatterns, setSelectedPatterns] = useState<string[]>(['single-line-h']);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (id) {
      loadPlaylist(id);
    }
  }, [id]);

  const loadPlaylist = async (playlistId: string) => {
    setLoading(true);
    const [playlistData, cards] = await Promise.all([
      getPlaylist(playlistId),
      getCardsForPlaylist(playlistId),
    ]);

    if (playlistData) {
      setPlaylist(playlistData);
      setHasCards(cards.length > 0);
    }
    setLoading(false);
  };

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
    await startNewGame(playlist, selectedPatterns);
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
          {!hasCards && (
            <p className="text-yellow-400 text-sm mt-2">
              No cards generated for this playlist. Generate cards in Admin mode for winner verification.
            </p>
          )}
        </div>

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
