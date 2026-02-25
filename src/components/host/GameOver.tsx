import { useNavigate } from 'react-router-dom';
import { useGame } from '../../context/GameContext';
import { getPatternById } from '../../lib/patterns';
import { Button } from '../shared/Button';
import { AppShell } from '../shared/AppShell';

export function GameOver() {
  const navigate = useNavigate();
  const { game, playlist, clearGame } = useGame();

  if (!game || !playlist) {
    return <AppShell centered><div className="text-[var(--text-secondary)]">No game data</div></AppShell>;
  }

  const totalWinners = game.rounds.reduce((sum, round) => sum + round.winners.length, 0);
  const songsPlayed = game.calledSongIds.length;
  const duration = game.endedAt
    ? Math.round((game.endedAt - game.startedAt) / 60000)
    : Math.round((Date.now() - game.startedAt) / 60000);

  const handleNewGame = () => {
    clearGame();
    navigate('/host/playlists');
  };

  const handleHome = () => {
    clearGame();
    navigate('/');
  };

  return (
    <AppShell title="Game Complete" maxWidth="xl">
      {/* Page Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl lg:text-4xl font-bold text-[var(--text-primary)] mb-2">Game Complete!</h1>
        <p className="text-[var(--text-secondary)] text-lg">{playlist.name}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column - Stats */}
        <div className="lg:col-span-1 space-y-6">
          {/* Stats */}
          <div className="card">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 uppercase tracking-wide">Summary</h2>

            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-4 bg-[var(--bg-hover)] border border-[var(--border-color)] rounded-lg">
                <div className="text-3xl font-bold text-[var(--status-success-text)]">{totalWinners}</div>
                <div className="text-sm text-[var(--text-secondary)]">Winners</div>
              </div>
              <div className="text-center p-4 bg-[var(--bg-hover)] border border-[var(--border-color)] rounded-lg">
                <div className="text-3xl font-bold text-[var(--accent-teal)]">{game.rounds.length}</div>
                <div className="text-sm text-[var(--text-secondary)]">Rounds</div>
              </div>
              <div className="text-center p-4 bg-[var(--bg-hover)] border border-[var(--border-color)] rounded-lg">
                <div className="text-3xl font-bold text-[var(--text-primary)]">{songsPlayed}</div>
                <div className="text-sm text-[var(--text-secondary)]">Songs</div>
              </div>
              <div className="text-center p-4 bg-[var(--bg-hover)] border border-[var(--border-color)] rounded-lg">
                <div className="text-3xl font-bold text-[var(--text-primary)]">{duration}m</div>
                <div className="text-sm text-[var(--text-secondary)]">Duration</div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <Button variant="primary" size="lg" fullWidth onClick={handleNewGame}>
              Start New Game
            </Button>
            <Button variant="secondary" fullWidth onClick={handleHome}>
              Back to Home
            </Button>
          </div>
        </div>

        {/* Right Column - Round Details */}
        <div className="lg:col-span-2">
          <div className="card">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 uppercase tracking-wide">Round Details</h2>
            <div className="space-y-3">
              {game.rounds.map((round, idx) => {
                const pattern = getPatternById(round.patternId);
                return (
                  <div key={idx} className="flex items-center justify-between p-4 bg-[var(--bg-hover)] border border-[var(--border-color)] rounded-lg">
                    <div>
                      <div className="text-[var(--text-primary)] font-medium">Round {round.roundNumber}</div>
                      <div className="text-sm text-[var(--text-secondary)]">{pattern.name}</div>
                    </div>
                    <div className="text-right">
                      {round.winners.length > 0 ? (
                        <div className="text-[var(--status-success-text)]">
                          {round.winners.length} winner{round.winners.length !== 1 ? 's' : ''}
                          <div className="text-xs text-[var(--text-secondary)]">
                            Card{round.winners.length !== 1 ? 's' : ''}: {round.winners.map(w => `#${w.cardNumber}`).join(', ')}
                          </div>
                        </div>
                      ) : (
                        <div className="text-[var(--text-muted)]">No winners</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
