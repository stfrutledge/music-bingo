import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { GameState, Playlist } from '../../types';
import { getAllGames, getPlaylist } from '../../lib/db';
import { useGame } from '../../context/GameContext';
import { Button } from '../shared/Button';
import { AppShell } from '../shared/AppShell';

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
    <AppShell title="Resume Game" maxWidth="lg">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-[var(--text-primary)]">Resume Game</h1>
          <p className="text-[var(--text-secondary)] mt-1">Continue a previous session</p>
        </div>
        <Button variant="ghost" onClick={() => navigate('/')}>
          Cancel
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-[var(--text-secondary)]">
          Loading...
        </div>
      ) : games.length === 0 ? (
        <div className="card text-center py-16 max-w-md mx-auto">
          <div className="w-16 h-16 rounded-full bg-[var(--bg-hover)] flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">No Active Games</h2>
          <p className="text-[var(--text-secondary)] mb-6">Start a new game to get playing</p>
          <Button variant="primary" onClick={() => navigate('/host/playlists')}>
            Start New Game
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {games.map(({ game, playlist }) => (
            <button
              key={game.id}
              onClick={() => playlist && handleResume(game, playlist)}
              disabled={!playlist}
              className="card text-left hover:border-[var(--accent-green)] hover:shadow-md transition-all group disabled:opacity-50"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-green)] transition-colors">
                    {playlist?.name || 'Unknown Playlist'}
                  </h3>
                  <p className="text-sm text-[var(--text-secondary)] mt-1">
                    Round {game.currentRound + 1} &bull; {game.calledSongIds.length} songs played
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-2">
                    Started {formatDate(game.startedAt)}
                  </p>
                </div>
                <svg
                  className="w-5 h-5 text-[var(--text-muted)] group-hover:text-[var(--accent-green)] transition-colors flex-shrink-0"
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
    </AppShell>
  );
}
