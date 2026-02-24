import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { GameState, Playlist } from '../../types';
import { getAllGames, getPlaylist } from '../../lib/db';
import { useGame } from '../../context/GameContext';
import { Button } from '../shared/Button';

interface GameWithPlaylist {
  game: GameState;
  playlist: Playlist | null;
}

export function ResumeGame() {
  const navigate = useNavigate();
  const { loadGame } = useGame();

  const [games, setGames] = useState<GameWithPlaylist[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadGames();
  }, []);

  const loadGames = async () => {
    setLoading(true);
    const allGames = await getAllGames();

    // Get playlist info for each game
    const gamesWithPlaylists: GameWithPlaylist[] = await Promise.all(
      allGames
        .filter(g => !g.endedAt) // Only show active games
        .map(async game => ({
          game,
          playlist: (await getPlaylist(game.playlistId)) ?? null,
        }))
    );

    setGames(gamesWithPlaylists);
    setLoading(false);
  };

  const handleResume = async (game: GameState, playlist: Playlist) => {
    await loadGame(game.id, playlist);
    navigate('/host/game');
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="min-h-screen bg-navy-950 p-4 safe-area-inset">
      <div className="max-w-md mx-auto">
        <header className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-white">Resume Game</h1>
          <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
            Cancel
          </Button>
        </header>

        {loading ? (
          <div className="text-center py-12 text-slate-400">
            Loading...
          </div>
        ) : games.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-slate-400 mb-4">No active games to resume</p>
            <Button variant="primary" onClick={() => navigate('/host/playlists')}>
              Start New Game
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {games.map(({ game, playlist }) => (
              <button
                key={game.id}
                onClick={() => playlist && handleResume(game, playlist)}
                disabled={!playlist}
                className="w-full card text-left hover:bg-navy-800 transition-colors disabled:opacity-50"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-white">
                      {playlist?.name || 'Unknown Playlist'}
                    </h3>
                    <p className="text-sm text-slate-400">
                      Round {game.currentRound + 1} • {game.calledSongIds.length} songs played
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Started {formatDate(game.startedAt)}
                    </p>
                  </div>
                  <svg
                    className="w-5 h-5 text-slate-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
