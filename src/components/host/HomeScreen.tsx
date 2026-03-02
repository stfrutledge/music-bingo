import { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '../shared/Button';
import { AppShell } from '../shared/AppShell';
import { useOfflineStatus } from '../../hooks/useOfflineStatus';
import { useGame } from '../../context/GameContext';
import { getAvailableEvents, loadEvent, importEventToDb } from '../../lib/eventService';
import { getCacheStatus, isLocalUrl } from '../../lib/audioCache';
import type { EventManifest, EventConfig } from '../../types';

export function HomeScreen() {
  const isOffline = useOfflineStatus();
  const navigate = useNavigate();
  const location = useLocation();
  const { game, isLoading } = useGame();

  // Event loading state
  const [events, setEvents] = useState<EventManifest['events']>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingEvent, setLoadingEvent] = useState(false);

  // Check if user intentionally exited the game
  const fromGame = (location.state as { fromGame?: boolean })?.fromGame;

  // Load available events on mount
  useEffect(() => {
    async function loadEvents() {
      setLoadingEvents(true);
      const eventsList = await getAvailableEvents();
      setEvents(eventsList);
      setLoadingEvents(false);
    }
    loadEvents();
  }, []);

  const handleLoadEvent = async () => {
    if (!selectedEventId) return;

    setLoadingEvent(true);
    const eventData = await loadEvent(selectedEventId);

    if (!eventData) {
      alert('Failed to load event');
      setLoadingEvent(false);
      return;
    }

    const { event, embedded } = eventData;

    // Import playlist and cards to IndexedDB
    await importEventToDb(embedded.playlist, embedded.cardPackData);

    // Create event config to pass through the flow
    const eventConfig: EventConfig = {
      eventId: event.id,
      eventName: event.name,
      defaultPatterns: event.defaultPatterns,
      defaultPlayerCount: event.defaultPlayerCount,
    };

    // Check if audio needs to be downloaded
    const isLocal = isLocalUrl(embedded.playlist.baseAudioUrl);
    const cacheStatus = await getCacheStatus(embedded.playlist);

    setLoadingEvent(false);

    if (!isLocal && !cacheStatus.isComplete) {
      // Navigate to audio download page with event config
      navigate(`/host/download/${embedded.playlist.id}`, { state: { eventConfig } });
    } else {
      // Navigate directly to game setup with event config
      navigate(`/host/setup/${embedded.playlist.id}`, { state: { eventConfig } });
    }
  };

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

          {/* Quick Load Event */}
          {!loadingEvents && events.length > 0 && (
            <div className="mt-8 p-4 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl">
              <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-3">Quick Load Event</h3>
              <div className="flex flex-col sm:flex-row gap-3">
                <select
                  value={selectedEventId}
                  onChange={e => setSelectedEventId(e.target.value)}
                  className="input flex-1"
                  disabled={loadingEvent}
                >
                  <option value="">Select an event...</option>
                  {events.map(event => (
                    <option key={event.id} value={event.id}>{event.name}</option>
                  ))}
                </select>
                <Button
                  variant="success"
                  onClick={handleLoadEvent}
                  disabled={!selectedEventId || loadingEvent}
                  className="whitespace-nowrap"
                >
                  {loadingEvent ? 'Loading...' : 'Load Event'}
                </Button>
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-2">
                Events bundle playlist + cards for one-click setup
              </p>
            </div>
          )}

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
