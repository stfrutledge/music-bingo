import { useNavigate } from 'react-router-dom';
import { useGame } from '../../context/GameContext';
import { getPatternById } from '../../lib/patterns';
import { Button } from '../shared/Button';

export function GameOver() {
  const navigate = useNavigate();
  const { game, playlist, clearGame } = useGame();

  if (!game || !playlist) {
    return (
      <div className="min-h-screen bg-navy-950 flex items-center justify-center">
        <div className="text-slate-400">No game data</div>
      </div>
    );
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
    <div className="min-h-screen bg-navy-950 p-4 flex flex-col items-center justify-center safe-area-inset">
      <div className="max-w-md w-full">
        <div className="card text-center mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">Game Complete!</h1>
          <p className="text-slate-400">{playlist.name}</p>
        </div>

        {/* Stats */}
        <div className="card mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">Game Summary</h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-4 bg-navy-800 rounded-lg">
              <div className="text-3xl font-bold text-green-400">{totalWinners}</div>
              <div className="text-sm text-slate-400">Total Winners</div>
            </div>
            <div className="text-center p-4 bg-navy-800 rounded-lg">
              <div className="text-3xl font-bold text-indigo-400">{game.rounds.length}</div>
              <div className="text-sm text-slate-400">Rounds Played</div>
            </div>
            <div className="text-center p-4 bg-navy-800 rounded-lg">
              <div className="text-3xl font-bold text-white">{songsPlayed}</div>
              <div className="text-sm text-slate-400">Songs Played</div>
            </div>
            <div className="text-center p-4 bg-navy-800 rounded-lg">
              <div className="text-3xl font-bold text-white">{duration}m</div>
              <div className="text-sm text-slate-400">Duration</div>
            </div>
          </div>
        </div>

        {/* Round Details */}
        <div className="card mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">Round Details</h2>
          <div className="space-y-3">
            {game.rounds.map((round, idx) => {
              const pattern = getPatternById(round.patternId);
              return (
                <div key={idx} className="flex items-center justify-between p-3 bg-navy-800 rounded-lg">
                  <div>
                    <div className="text-white font-medium">Round {round.roundNumber}</div>
                    <div className="text-sm text-slate-400">{pattern.name}</div>
                  </div>
                  <div className="text-right">
                    {round.winners.length > 0 ? (
                      <div className="text-green-400">
                        {round.winners.length} winner{round.winners.length !== 1 ? 's' : ''}
                        <div className="text-xs text-slate-400">
                          Card{round.winners.length !== 1 ? 's' : ''}: {round.winners.map(w => `#${w.cardNumber}`).join(', ')}
                        </div>
                      </div>
                    ) : (
                      <div className="text-slate-500">No winners</div>
                    )}
                  </div>
                </div>
              );
            })}
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
    </div>
  );
}
