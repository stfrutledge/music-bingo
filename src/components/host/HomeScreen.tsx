import { useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '../shared/Button';
import { AppShell } from '../shared/AppShell';
import { useOfflineStatus } from '../../hooks/useOfflineStatus';
import { useGame } from '../../context/GameContext';

export function HomeScreen() {
  const isOffline = useOfflineStatus();
  const navigate = useNavigate();
  const location = useLocation();
  const { game, isLoading } = useGame();

  // Check if user intentionally exited the game
  const fromGame = (location.state as { fromGame?: boolean })?.fromGame;

  // Auto-redirect to game screen if there's an active game (unless user explicitly exited)
  useEffect(() => {
    if (!isLoading && game && !game.endedAt && !fromGame) {
      navigate('/host/game', { replace: true });
    }
  }, [game, isLoading, navigate, fromGame]);

  // Show loading while checking for active game
  if (isLoading) {
    return (
      <AppShell centered>
        <div className="text-[var(--text-secondary)]">Loading...</div>
      </AppShell>
    );
  }

  return (
    <AppShell maxWidth="lg">
      {/* Offline indicator */}
      {isOffline && (
        <div className="fixed top-16 left-0 right-0 bg-[var(--accent-amber)] text-white text-center py-2 text-sm font-medium z-40">
          You're offline - cached playlists will still work
        </div>
      )}

      {/* Hero Section */}
      <div className="lg:grid lg:grid-cols-2 lg:gap-16 lg:items-center lg:min-h-[60vh]">
        {/* Left - Content */}
        <div className="text-center lg:text-left py-12 lg:py-0">
          <h1 className="text-4xl lg:text-5xl font-bold text-[var(--text-primary)] mb-4">
            Host Your Music Bingo Game
          </h1>
          <p className="text-lg text-[var(--text-secondary)] mb-8 max-w-md mx-auto lg:mx-0">
            Play songs, track winners, and manage rounds with ease.
          </p>

          {/* Main Actions */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
            <Link to="/host/playlists">
              <Button variant="primary" size="lg" className="w-full sm:w-auto px-8">
                Start New Game
              </Button>
            </Link>
            <Link to="/host/resume">
              <Button variant="secondary" size="lg" className="w-full sm:w-auto px-8">
                Resume Game
              </Button>
            </Link>
          </div>

        </div>

        {/* Right - Feature Cards */}
        <div className="hidden lg:grid grid-cols-2 gap-4">
          <FeatureCard
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
            }
            title="Custom Playlists"
            description="Create playlists with your own songs"
          />
          <FeatureCard
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
            title="Winner Verification"
            description="Instantly verify bingo winners"
          />
          <FeatureCard
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
              </svg>
            }
            title="PDF Cards"
            description="Generate printable bingo cards"
          />
          <FeatureCard
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            }
            title="Works Offline"
            description="Cache songs for offline use"
          />
        </div>
      </div>

      {/* Mobile PWA hint */}
      <div className="lg:hidden text-center mt-12 text-sm text-[var(--text-muted)]">
        Add to home screen for the best experience
      </div>
    </AppShell>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="card p-5">
      <div className="w-10 h-10 rounded-lg bg-[var(--bg-accent)] flex items-center justify-center text-[var(--accent-green)] mb-3">
        {icon}
      </div>
      <h3 className="font-semibold text-[var(--text-primary)] mb-1">{title}</h3>
      <p className="text-sm text-[var(--text-secondary)]">{description}</p>
    </div>
  );
}
