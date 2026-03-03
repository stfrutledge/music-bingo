import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import type { Playlist, BingoCard, BingoPattern, PacingTable, PacingEntry, CacheStatus, CardPackInfo, EventConfig } from '../../types';
import { getPlaylist, getCardsForPlaylist, getPacingTable, saveCards, savePacingTable, deleteCardsForPlaylist } from '../../lib/db';
import { getPacingForGroupSize } from '../../lib/cardGenerator';
import { BINGO_PATTERNS, getPatternById } from '../../lib/patterns';
import { getCacheStatus, isLocalUrl } from '../../lib/audioCache';
import { checkWin } from '../../lib/winChecker';
import { useGame } from '../../context/GameContext';
import { Button } from '../shared/Button';
import { PatternDisplay } from '../shared/PatternDisplay';
import { AppShell } from '../shared/AppShell';

interface CardWinPrediction {
  cardNumber: number;
  winSongIndex: number; // 1-based song number when card wins
  winSongTitle: string;
}

interface RoundPrediction {
  roundNumber: number;
  patternId: string;
  patternName: string;
  firstWinSong: number;
  firstWinTitle: string;
  firstWinCards: number[];
  allPredictions: CardWinPrediction[];
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function predictAllRounds(
  cards: BingoCard[],
  songOrder: string[],
  patternIds: string[],
  playlist: Playlist
): RoundPrediction[] {
  const roundPredictions: RoundPrediction[] = [];
  const calledSongIds = new Set<string>();
  let songIdx = 0;

  for (let roundNum = 0; roundNum < patternIds.length; roundNum++) {
    const pattern = getPatternById(patternIds[roundNum]);
    const predictions: CardWinPrediction[] = [];
    const cardsStillPlaying = new Set(cards.map(c => c.cardNumber));

    // Continue from where last round ended
    while (songIdx < songOrder.length && predictions.length === 0) {
      const songId = songOrder[songIdx];
      calledSongIds.add(songId);

      // Check each card that hasn't won this round
      for (const card of cards) {
        if (!cardsStillPlaying.has(card.cardNumber)) continue;
        if (predictions.some(p => p.cardNumber === card.cardNumber)) continue;

        const result = checkWin(card, pattern, calledSongIds);
        if (result.isWin) {
          const song = playlist.songs.find(s => s.id === songId);
          predictions.push({
            cardNumber: card.cardNumber,
            winSongIndex: songIdx + 1,
            winSongTitle: song ? `${song.title} - ${song.artist}` : 'Unknown',
          });
        }
      }

      songIdx++;
    }

    // Continue to find all winners at the same song
    const firstWinSong = predictions[0]?.winSongIndex || 0;

    // Keep checking remaining cards until we've found all who win on firstWinSong
    // (they already won above, but let's continue to get more predictions for display)
    while (songIdx < songOrder.length) {
      const songId = songOrder[songIdx];
      calledSongIds.add(songId);

      for (const card of cards) {
        if (predictions.some(p => p.cardNumber === card.cardNumber)) continue;

        const result = checkWin(card, pattern, calledSongIds);
        if (result.isWin) {
          const song = playlist.songs.find(s => s.id === songId);
          predictions.push({
            cardNumber: card.cardNumber,
            winSongIndex: songIdx + 1,
            winSongTitle: song ? `${song.title} - ${song.artist}` : 'Unknown',
          });
        }
      }

      // Stop after finding first winner(s) for this round
      if (predictions.length > 0 && predictions.every(p => p.winSongIndex === firstWinSong)) {
        // Found all tied first winners, stop here for this round
        break;
      }
      if (predictions.length > 0) break;

      songIdx++;
    }

    const sortedPredictions = predictions.sort((a, b) => a.winSongIndex - b.winSongIndex);
    const firstWinCards = sortedPredictions
      .filter(p => p.winSongIndex === firstWinSong)
      .map(p => p.cardNumber);

    roundPredictions.push({
      roundNumber: roundNum + 1,
      patternId: patternIds[roundNum],
      patternName: pattern.name,
      firstWinSong,
      firstWinTitle: sortedPredictions[0]?.winSongTitle || '',
      firstWinCards,
      allPredictions: sortedPredictions,
    });
  }

  return roundPredictions;
}

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
  const [shuffledSongOrder, setShuffledSongOrder] = useState<string[]>([]);
  const [showPredictions, setShowPredictions] = useState(false);
  const [targetSongs, setTargetSongs] = useState<{ [round: number]: number }>({});
  const [autoShuffling, setAutoShuffling] = useState(false);
  const [shuffleAttempts, setShuffleAttempts] = useState(0);
  const cardRangeStart = 1;
  const cardRangeEnd = Math.min(playerCount, allCards.length);
  const cardsInPlay = cardRangeEnd - cardRangeStart + 1;

  // Shuffle songs when playlist loads
  useEffect(() => {
    if (playlist && playlist.songs.length > 0) {
      setShuffledSongOrder(shuffleArray(playlist.songs.map(s => s.id)));
    }
  }, [playlist?.id]);

  const handleShuffle = useCallback(() => {
    if (playlist) {
      setShuffledSongOrder(shuffleArray(playlist.songs.map(s => s.id)));
    }
  }, [playlist]);

  const handleAutoShuffle = useCallback(async () => {
    if (!playlist || selectedPatterns.length === 0 || allCards.length === 0) return;

    const cardsToCheck = allCards.filter(c => c.cardNumber >= cardRangeStart && c.cardNumber <= cardRangeEnd);
    const maxAttempts = 10000;
    setAutoShuffling(true);
    setShuffleAttempts(0);

    // Check if any targets are set
    const hasTargets = Object.keys(targetSongs).some(k => targetSongs[parseInt(k)] > 0);
    if (!hasTargets) {
      alert('Set target song numbers for at least one round');
      setAutoShuffling(false);
      return;
    }

    // Run in batches to avoid blocking UI
    const batchSize = 100;
    let attempts = 0;
    let found = false;

    const runBatch = () => {
      for (let i = 0; i < batchSize && attempts < maxAttempts; i++) {
        attempts++;
        const shuffled = shuffleArray(playlist.songs.map(s => s.id));
        const predictions = predictAllRounds(cardsToCheck, shuffled, selectedPatterns, playlist);

        // Check if all targets are met
        let allMatch = true;
        for (const [roundStr, targetSong] of Object.entries(targetSongs)) {
          const roundNum = parseInt(roundStr);
          if (targetSong > 0) {
            const roundPred = predictions.find(p => p.roundNumber === roundNum);
            if (!roundPred || roundPred.firstWinSong !== targetSong) {
              allMatch = false;
              break;
            }
          }
        }

        if (allMatch) {
          setShuffledSongOrder(shuffled);
          found = true;
          break;
        }
      }

      setShuffleAttempts(attempts);

      if (!found && attempts < maxAttempts) {
        requestAnimationFrame(runBatch);
      } else {
        setAutoShuffling(false);
        if (!found) {
          alert(`Could not find matching order after ${maxAttempts} attempts. Try different targets.`);
        }
      }
    };

    requestAnimationFrame(runBatch);
  }, [playlist, selectedPatterns, allCards, cardRangeStart, cardRangeEnd, targetSongs]);

  // Calculate win predictions for all selected rounds
  const roundPredictions = useMemo(() => {
    if (!playlist || allCards.length === 0 || shuffledSongOrder.length === 0 || selectedPatterns.length === 0) {
      return [];
    }
    const cardsToCheck = allCards.filter(c => c.cardNumber >= cardRangeStart && c.cardNumber <= cardRangeEnd);
    return predictAllRounds(cardsToCheck, shuffledSongOrder, selectedPatterns, playlist);
  }, [playlist, allCards, shuffledSongOrder, selectedPatterns, cardRangeStart, cardRangeEnd]);

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
    await startNewGame(playlist, selectedPatterns, {
      cardRangeStart,
      cardRangeEnd,
      shuffledSongOrder,
    });
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

          {/* Win Predictions */}
          {allCards.length > 0 && selectedPatterns.length > 0 && (
            <div className="card mt-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                    Win Predictions
                  </h2>
                  <p className="text-sm text-[var(--text-secondary)]">
                    {selectedPatterns.length} round{selectedPatterns.length > 1 ? 's' : ''} selected
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={handleShuffle} disabled={autoShuffling}>
                    Shuffle
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowPredictions(!showPredictions)}
                  >
                    {showPredictions ? 'Hide' : 'Show'} Details
                  </Button>
                </div>
              </div>

              {/* Target Song Inputs */}
              <div className="bg-[var(--bg-hover)] rounded-lg p-4 mb-4">
                <div className="text-sm font-medium text-[var(--text-primary)] mb-3">
                  Target Win Songs (optional)
                </div>
                <div className="flex flex-wrap gap-4 items-end">
                  {selectedPatterns.map((_, idx) => (
                    <div key={idx} className="flex-1 min-w-[120px]">
                      <label className="block text-xs text-[var(--text-secondary)] mb-1">
                        Round {idx + 1}
                      </label>
                      <input
                        type="number"
                        min="1"
                        max={playlist?.songs.length || 50}
                        value={targetSongs[idx + 1] || ''}
                        onChange={(e) => setTargetSongs(prev => ({
                          ...prev,
                          [idx + 1]: parseInt(e.target.value) || 0
                        }))}
                        placeholder="Any"
                        className="input w-full text-center"
                        disabled={autoShuffling}
                      />
                    </div>
                  ))}
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleAutoShuffle}
                    disabled={autoShuffling}
                  >
                    {autoShuffling ? `Searching... (${shuffleAttempts})` : 'Find Order'}
                  </Button>
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-2">
                  Set target song numbers and click "Find Order" to auto-shuffle until found
                </p>
              </div>

              {/* Round Summary Cards */}
              <div className="space-y-3 mb-4">
                {roundPredictions.map((round) => (
                  <div
                    key={round.roundNumber}
                    className="bg-[var(--status-success-bg)] border border-[var(--accent-green)] rounded-lg p-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold text-[var(--text-primary)]">
                        Round {round.roundNumber}: {round.patternName}
                      </div>
                      <div className="text-2xl font-bold text-[var(--accent-green)]">
                        Song #{round.firstWinSong}
                      </div>
                    </div>
                    <div className="text-sm text-[var(--text-secondary)]">
                      {round.firstWinTitle}
                    </div>
                    <div className="text-sm text-[var(--text-muted)] mt-1">
                      Winner{round.firstWinCards.length > 1 ? 's' : ''}: {round.firstWinCards.map(c => `#${c}`).join(', ')}
                      {round.firstWinCards.length > 1 && ` (${round.firstWinCards.length} tied)`}
                    </div>
                  </div>
                ))}
              </div>

              {/* Total songs summary */}
              {roundPredictions.length >= 2 && (
                <div className="bg-[var(--bg-hover)] rounded-lg p-3 text-center mb-4">
                  <div className="text-sm text-[var(--text-secondary)]">
                    Total songs through Round {roundPredictions.length}:
                  </div>
                  <div className="text-2xl font-bold text-[var(--text-primary)]">
                    {roundPredictions[roundPredictions.length - 1]?.firstWinSong || '-'}
                  </div>
                </div>
              )}

              {/* Detailed predictions per round */}
              {showPredictions && roundPredictions.map((round) => (
                <div key={round.roundNumber} className="mb-4">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">
                    Round {round.roundNumber} Details
                  </h3>
                  <div className="max-h-48 overflow-y-auto border border-[var(--border-color)] rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-[var(--bg-hover)] sticky top-0">
                        <tr>
                          <th className="text-left p-2 text-[var(--text-secondary)]">Card</th>
                          <th className="text-left p-2 text-[var(--text-secondary)]">Wins On</th>
                          <th className="text-left p-2 text-[var(--text-secondary)]">Song</th>
                        </tr>
                      </thead>
                      <tbody>
                        {round.allPredictions.map((pred, idx) => (
                          <tr
                            key={pred.cardNumber}
                            className={pred.winSongIndex === round.firstWinSong ? 'bg-[var(--status-success-bg)]' : idx % 2 === 0 ? 'bg-[var(--bg-card)]' : ''}
                          >
                            <td className="p-2 font-medium text-[var(--text-primary)]">#{pred.cardNumber}</td>
                            <td className="p-2 text-[var(--text-primary)]">Song {pred.winSongIndex}</td>
                            <td className="p-2 text-[var(--text-secondary)] truncate max-w-[200px]">{pred.winSongTitle}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
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
