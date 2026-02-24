import { Link } from 'react-router-dom';
import { Button } from '../shared/Button';
import { useOfflineStatus } from '../../hooks/useOfflineStatus';

export function HomeScreen() {
  const isOffline = useOfflineStatus();

  return (
    <div className="min-h-screen bg-navy-950 flex flex-col items-center justify-center p-4 safe-area-inset">
      {/* Offline indicator */}
      {isOffline && (
        <div className="fixed top-0 left-0 right-0 bg-yellow-600 text-white text-center py-2 text-sm">
          You're offline - cached playlists will still work
        </div>
      )}

      <div className="text-center max-w-md w-full">
        {/* Logo / Title */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-white mb-2">Music Bingo</h1>
          <p className="text-slate-400">Host your music bingo games</p>
        </div>

        {/* Main Actions */}
        <div className="space-y-4">
          <Link to="/host/playlists" className="block">
            <Button variant="primary" size="lg" fullWidth>
              Start New Game
            </Button>
          </Link>

          <Link to="/host/resume" className="block">
            <Button variant="secondary" size="lg" fullWidth>
              Resume Game
            </Button>
          </Link>
        </div>

        {/* Admin Link */}
        <div className="mt-12 pt-8 border-t border-navy-800">
          <Link to="/admin">
            <Button variant="ghost" size="sm">
              Admin Mode
            </Button>
          </Link>
        </div>
      </div>

      {/* PWA Install hint */}
      <div className="fixed bottom-4 text-center text-sm text-slate-500">
        Add to home screen for the best experience
      </div>
    </div>
  );
}
