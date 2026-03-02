import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import type { Playlist, BingoCard, PacingTable, PacingEntry, CacheStatus, CardPackInfo, EventConfig } from '../../types';
import { getPlaylist, getCardsForPlaylist, getPacingTable, saveCards, savePacingTable, deleteCardsForPlaylist } from '../../lib/db';
import { getPacingForGroupSize } from '../../lib/cardGenerator';
import { BINGO_PATTERNS } from '../../lib/patterns';
import { getCacheStatus, isLocalUrl } from '../../lib/audioCache';
import { useGame } from '../../context/GameContext';
import { Button } from '../shared/Button';
import { PatternDisplay } from '../shared/PatternDisplay';
import { AppShell } from '../shared/AppShell';

export function GameSetup() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { startNewGame } = useGame();

  // Get eventConfig from router state (if loaded via event)
  const eventConfig = (location.state as { eventConfig?: EventConfig })?.eventConfig;

  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [allCards, setAllCards] = useState<BingoCard[]>([]);
  const [pacingTable, setPacingTable] = useState<PacingTable | null>(null);
  const [selectedPatterns, setSelectedPatterns] = useState<string[]>(
    eventConfig?.defaultPatterns || ['single-line-h']
  );
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  // Offline cache state
  const [cacheStatus, setCacheStatus] = useState<CacheStatus | null>(null);
  const [isLocal, setIsLocal] = useState(false);

  // Card pack state
  const [availablePacks, setAvailablePacks] = useState<CardPackInfo[]>([]);
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [loadingPacks, setLoadingPacks] = useState(false);

  const [playerCount, setPlayerCount] = useState(eventConfig?.defaultPlayerCount || 30);
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
      loadAvailablePacks(id);
    }
  }, [id]);

  const loadAvailablePacks = async (playlistId: string) => {
    setLoadingPacks(true);
    try {
      // Try dev API first (for local development)
      const response = await fetch(`/api/list-card-packs?playlistId=${playlistId}`);
      if (response.ok) {
        const data = await response.json();
        setAvailablePacks(data.packs || []);
        setLoadingPacks(false);
        return;
      }
    } catch {
      // Fall through to manifest
    }

    // In production, load from manifest
    try {
      const manifestResponse = await fetch(`${import.meta.env.BASE_URL}packs/playlists-manifest.json`);
      if (manifestResponse.ok) {
        const manifest = await manifestResponse.json();
        const playlistInfo = manifest.playlists?.find((p: { id: string }) => p.id === playlistId);
        if (playlistInfo?.cardPacks) {
          setAvailablePacks(playlistInfo.cardPacks);
        }
      }
    } catch {
      // Ignore errors
    }
    setLoadingPacks(false);
  };

  const loadCardPack = async (packId: string) => {
    if (!playlist) return;
    setLoading(true);
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}packs/${playlist.id}/card-packs/${packId}.json`);
      if (response.ok) {
        const data = await response.json();
        const cards = data.cards || [];
        const pacing = data.pacingTable || null;

        // Clear existing cards and save new ones to IndexedDB
        await deleteCardsForPlaylist(playlist.id);
        await saveCards(cards);
        if (pacing) {
          await savePacingTable(pacing);
        }

        // Update state
        setAllCards(cards);
        setPacingTable(pacing);
        setSelectedPackId(packId);

        if (cards.length > 0) {
          setPlayerCount(Math.min(30, cards.length));
        }
      }
    } catch (error) {
      console.error('Failed to load card pack:', error);
    }
    setLoading(false);
  };

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

      // Check cache status for offline indicator
      setIsLocal(isLocalUrl(playlistData.baseAudioUrl));
      const status = await getCacheStatus(playlistData);
      setCacheStatus(status);
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
      {/* Event Banner */}
      {eventConfig && (
        <div className="mb-6 p-4 bg-[var(--status-success-bg)] border border-[var(--accent-green)] rounded-lg flex items-center gap-3">
          <svg className="w-5 h-5 text-[var(--status-success-text)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <div className="flex-1">
            <div className="font-semibold text-[var(--status-success-text)]">Event Loaded: {eventConfig.eventName}</div>
            <div className="text-sm text-[var(--text-secondary)]">Playlist and cards pre-configured</div>
          </div>
        </div>
      )}

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

        {/* Sidebar - Card pack, player count, and start */}
        <div className="space-y-6">
          {/* Card Pack Selection */}
          {(availablePacks.length > 0 || eventConfig) && (
            <div className="card">
              <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
                Card Pack
              </h3>
              {eventConfig ? (
                <div className="p-3 bg-[var(--status-success-bg)] border border-[var(--accent-green)] rounded-lg">
                  <p className="text-sm text-[var(--status-success-text)] font-medium">
                    Pre-loaded from event
                  </p>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">
                    {allCards.length} cards ready
                  </p>
                </div>
              ) : (
                <>
                  <select
                    value={selectedPackId || ''}
                    onChange={e => e.target.value && loadCardPack(e.target.value)}
                    className="input w-full"
                    disabled={loading}
                  >
                    <option value="">Select a card pack...</option>
                    {availablePacks.map(pack => (
                      <option key={pack.id} value={pack.id}>
                        {pack.name} ({pack.cardCount} cards)
                      </option>
                    ))}
                  </select>
                  {selectedPackId && (
                    <p className="text-sm text-[var(--status-success-text)] mt-2">
                      Loaded: {availablePacks.find(p => p.id === selectedPackId)?.name}
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* No card packs warning */}
          {!loadingPacks && availablePacks.length === 0 && (
            <div className="card">
              <p className="text-sm text-[var(--status-warning-text)]">
                No card packs available. Generate and save card packs in Admin mode.
              </p>
            </div>
          )}

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

          {/* Offline Status - show cache status and link to download page */}
          {!isLocal && cacheStatus && (
            <div className="card">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  cacheStatus.isComplete
                    ? 'bg-[var(--status-success-bg)] text-[var(--status-success-text)]'
                    : 'bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]'
                }`}>
                  {cacheStatus.isComplete ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    {cacheStatus.isComplete ? 'Offline Ready' : 'Not Downloaded'}
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {cacheStatus.cachedSongs}/{cacheStatus.totalSongs} songs cached
                  </p>
                </div>
                {!cacheStatus.isComplete && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => navigate(`/host/download/${id}`)}
                  >
                    Download
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Start Button */}
          <Button
            variant="success"
            size="lg"
            fullWidth
            onClick={handleStartGame}
            disabled={starting || selectedPatterns.length === 0 || (!eventConfig && availablePacks.length > 0 && !selectedPackId) || totalCards === 0}
          >
            {starting ? 'Starting...' : 'Start Game'}
          </Button>
          {!eventConfig && availablePacks.length > 0 && !selectedPackId && (
            <p className="text-sm text-[var(--text-muted)] text-center mt-2">
              Select a card pack to start
            </p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
