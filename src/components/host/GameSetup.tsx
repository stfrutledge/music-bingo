import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import type { Playlist, BingoCard, CacheStatus, CardPackInfo, EventConfig } from '../../types';
import { getPlaylist, getCardsForPlaylist, saveCards, savePacingTable, deleteCardsForPlaylist, saveCustomPattern, deleteCustomPattern } from '../../lib/db';
import { isSheetsConfigured, loadAndMergeFromSheets } from '../../lib/sheetsSync';
import { getAllPatterns, getPatternById, registerCustomPattern, unregisterCustomPattern } from '../../lib/patterns';
import { getCacheStatus, isLocalUrl } from '../../lib/audioCache';
import { checkWin } from '../../lib/winChecker';
import { filterPlaylistForActiveCards } from '../../lib/cardGenerator';
import { useGame } from '../../context/GameContext';
import type { BingoPattern } from '../../types';
import { Button } from '../shared/Button';
import { PatternDisplay } from '../shared/PatternDisplay';
import { CustomPatternEditor } from '../shared/CustomPatternEditor';
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
  const [selectedPatterns, setSelectedPatterns] = useState<string[]>(
    eventConfig?.defaultPatterns || ['single-line-h']
  );
  // Full selectable pattern list (presets + saved custom patterns)
  const [patterns, setPatterns] = useState<BingoPattern[]>(() => getAllPatterns());
  const [editorOpen, setEditorOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  // Offline cache state
  const [cacheStatus, setCacheStatus] = useState<CacheStatus | null>(null);
  const [isLocal, setIsLocal] = useState(false);

  // Card pack state
  const [availablePacks, setAvailablePacks] = useState<CardPackInfo[]>([]);
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [loadingPacks, setLoadingPacks] = useState(false);

  const [selectedCards, setSelectedCards] = useState<Set<number>>(new Set());
  const [shuffledSongOrder, setShuffledSongOrder] = useState<string[]>([]);
  const [showPredictions, setShowPredictions] = useState(false);
  const [targetSongs, setTargetSongs] = useState<{ [round: number]: number }>({});
  const [autoShuffling, setAutoShuffling] = useState(false);
  const [shuffleAttempts, setShuffleAttempts] = useState(0);
  const [tolerance, setTolerance] = useState(1);

  // Sorted list of every available card number (cards aren't guaranteed 1..N)
  const allCardNumbers = useMemo(
    () => allCards.map(c => c.cardNumber).sort((a, b) => a - b),
    [allCards]
  );
  const cardsInPlay = selectedCards.size;

  const selectFirstN = useCallback((n: number) => {
    setSelectedCards(new Set(allCardNumbers.slice(0, Math.max(0, n))));
  }, [allCardNumbers]);

  const toggleCard = useCallback((cardNumber: number) => {
    setSelectedCards(prev => {
      const next = new Set(prev);
      if (next.has(cardNumber)) next.delete(cardNumber);
      else next.add(cardNumber);
      return next;
    });
  }, []);

  // Default to the first N cards once cards load (or when the pack changes)
  useEffect(() => {
    if (allCardNumbers.length > 0 && selectedCards.size === 0) {
      const n = Math.min(eventConfig?.defaultPlayerCount || 30, allCardNumbers.length);
      setSelectedCards(new Set(allCardNumbers.slice(0, n)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allCardNumbers]);

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

    const cardsToCheck = allCards.filter(c => selectedCards.has(c.cardNumber));
    const maxAttempts = 50000; // Increased from 10000
    setAutoShuffling(true);
    setShuffleAttempts(0);

    // Check if any targets are set
    const hasTargets = Object.keys(targetSongs).some(k => targetSongs[parseInt(k)] > 0);
    if (!hasTargets) {
      alert('Set target song numbers for at least one round');
      setAutoShuffling(false);
      return;
    }

    // Get callable songs (only songs on active cards, same filtering as game uses)
    const allSongIds = playlist.songs.map(s => s.id);
    const { callableSongIds } = filterPlaylistForActiveCards(cardsToCheck, allSongIds, selectedPatterns);
    const callableSongList = allSongIds.filter(id => callableSongIds.has(id));

    // Active targets (round → desired first-win song)
    const targetEntries = Object.entries(targetSongs)
      .map(([roundStr, t]) => ({
        roundNum: parseInt(roundStr),
        targetNum: typeof t === 'string' ? parseInt(t) : t,
      }))
      .filter(e => e.targetNum > 0);

    // Score an order: totalDiff is how far off it is (0 = every target within
    // tolerance); allMatch is true only when every target is within tolerance.
    const scoreOrder = (order: string[]): { totalDiff: number; allMatch: boolean } => {
      const predictions = predictAllRounds(cardsToCheck, order, selectedPatterns, playlist);
      let totalDiff = 0;
      let allMatch = true;
      for (const { roundNum, targetNum } of targetEntries) {
        const pred = predictions.find(p => p.roundNumber === roundNum);
        if (!pred) {
          allMatch = false;
          totalDiff += 100; // pattern unreachable — heavily penalized
          continue;
        }
        const diff = Math.abs(pred.firstWinSong - targetNum);
        if (diff > tolerance) {
          allMatch = false;
          totalDiff += diff;
        }
      }
      return { totalDiff, allMatch };
    };

    // Local move: swap two songs in the order
    const swap = (order: string[]): string[] => {
      const next = [...order];
      const a = Math.floor(Math.random() * next.length);
      let b = Math.floor(Math.random() * next.length);
      if (b === a) b = (b + 1) % next.length;
      [next[a], next[b]] = [next[b], next[a]];
      return next;
    };

    // Random-restart hill climbing: take small swap steps from the current order,
    // accepting any non-worse candidate; if stuck for a while, restart from a fresh
    // random order. This converges on tight multi-round targets far faster than
    // re-rolling the whole order every attempt.
    const batchSize = 200;
    const restartAfter = 150; // restart when no new global best for this many steps
    let attempts = 0;
    let found = false;

    let current = shuffleArray([...callableSongList]);
    let currentScore = scoreOrder(current);
    let bestShuffle: string[] | null = current;
    let bestDiff = currentScore.totalDiff;
    let sinceImprovement = 0;

    const runBatch = () => {
      for (let i = 0; i < batchSize && attempts < maxAttempts; i++) {
        attempts++;

        const restart = sinceImprovement >= restartAfter;
        const candidate = restart
          ? shuffleArray([...callableSongList])
          : swap(current);
        const score = scoreOrder(candidate);

        // On a restart, always jump to the fresh order; otherwise climb (accept
        // anything no worse so we can drift across plateaus)
        if (restart || score.totalDiff <= currentScore.totalDiff) {
          current = candidate;
          currentScore = score;
        }

        if (score.totalDiff < bestDiff) {
          bestDiff = score.totalDiff;
          bestShuffle = candidate;
          sinceImprovement = 0;
        } else if (restart) {
          sinceImprovement = 0;
        } else {
          sinceImprovement++;
        }

        if (score.allMatch) {
          setShuffledSongOrder(candidate);
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
          // Use best attempt found
          if (bestShuffle) {
            setShuffledSongOrder(bestShuffle);
            const bestPred = predictAllRounds(cardsToCheck, bestShuffle, selectedPatterns, playlist);
            // Build a per-round summary so it's clear which round(s) missed
            const lines = Object.entries(targetSongs)
              .map(([roundStr, targetSong]) => {
                const roundNum = parseInt(roundStr);
                const targetNum = typeof targetSong === 'string' ? parseInt(targetSong) : targetSong;
                if (!targetNum || targetNum <= 0) return null;
                const pred = bestPred.find(p => p.roundNumber === roundNum);
                const actual = pred ? pred.firstWinSong : null;
                const ok = actual !== null && Math.abs(actual - targetNum) <= tolerance;
                return `Round ${roundNum}: winner at song ${actual ?? '?'} (target ${targetNum}) ${ok ? '✓' : '✗'}`;
              })
              .filter(Boolean)
              .join('\n');
            alert(`Could not find an order where every round matches within ±${tolerance} song after ${maxAttempts} attempts.\n\nBest order found:\n${lines}\n\nUsing best match found.`);
          } else {
            alert(`Could not find matching order after ${maxAttempts} attempts. Try different targets.`);
          }
        }
      }
    };

    requestAnimationFrame(runBatch);
  }, [playlist, selectedPatterns, allCards, selectedCards, targetSongs, tolerance]);

  // Calculate win predictions for all selected rounds
  const roundPredictions = useMemo(() => {
    if (!playlist || allCards.length === 0 || shuffledSongOrder.length === 0 || selectedPatterns.length === 0) {
      return [];
    }
    const cardsToCheck = allCards.filter(c => selectedCards.has(c.cardNumber));
    // Filter song order to only songs on active cards (same as game does)
    const allSongIds = playlist.songs.map(s => s.id);
    const { callableSongIds } = filterPlaylistForActiveCards(cardsToCheck, allSongIds, selectedPatterns);
    const filteredSongOrder = shuffledSongOrder.filter(id => callableSongIds.has(id));
    return predictAllRounds(cardsToCheck, filteredSongOrder, selectedPatterns, playlist);
  }, [playlist, allCards, shuffledSongOrder, selectedPatterns, selectedCards]);

  // How many songs will actually play for the current card range — the ceiling for targets
  const playableSongCount = useMemo(() => {
    if (!playlist) return 0;
    const cardsToCheck = allCards.filter(c => selectedCards.has(c.cardNumber));
    if (cardsToCheck.length === 0) return playlist.songs.length;
    const allSongIds = playlist.songs.map(s => s.id);
    const { callableSongIds } = filterPlaylistForActiveCards(cardsToCheck, allSongIds, selectedPatterns);
    return callableSongIds.size;
  }, [playlist, allCards, selectedPatterns, selectedCards]);

  // Cards that are predicted to win more than one round with the current order
  const repeatWinners = useMemo(() => {
    const cardToRounds = new Map<number, number[]>();
    for (const round of roundPredictions) {
      for (const cardNum of round.firstWinCards) {
        const rounds = cardToRounds.get(cardNum) ?? [];
        rounds.push(round.roundNumber);
        cardToRounds.set(cardNum, rounds);
      }
    }
    return [...cardToRounds.entries()]
      .filter(([, rounds]) => rounds.length > 1)
      .map(([cardNumber, rounds]) => ({ cardNumber, rounds }))
      .sort((a, b) => a.cardNumber - b.cardNumber);
  }, [roundPredictions]);

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
        const cards: BingoCard[] = data.cards || [];
        const pacing = data.pacingTable || null;

        // Clear existing cards and save new ones to IndexedDB
        await deleteCardsForPlaylist(playlist.id);
        await saveCards(cards);
        if (pacing) {
          await savePacingTable(pacing);
        }

        // Update state
        setAllCards(cards);
        setSelectedPackId(packId);

        if (cards.length > 0) {
          const sorted = cards.map(c => c.cardNumber).sort((a, b) => a - b);
          const n = Math.min(eventConfig?.defaultPlayerCount || 30, sorted.length);
          setSelectedCards(new Set(sorted.slice(0, n)));
        }
      }
    } catch (error) {
      console.error('Failed to load card pack:', error);
    }
    setLoading(false);
  };

  const loadPlaylist = async (playlistId: string) => {
    setLoading(true);
    let [playlistData, cards] = await Promise.all([
      getPlaylist(playlistId),
      getCardsForPlaylist(playlistId),
    ]);

    if (playlistData) {
      // Merge with Google Sheets data if configured (for latest titles/start times)
      if (isSheetsConfigured()) {
        try {
          playlistData = await loadAndMergeFromSheets(playlistData);
        } catch (e) {
          console.warn('Could not load from Google Sheets:', e);
        }
      }
      setPlaylist(playlistData);
      setAllCards(cards);
      if (cards.length > 0) {
        const sorted = cards.map(c => c.cardNumber).sort((a, b) => a - b);
        const n = Math.min(eventConfig?.defaultPlayerCount || 30, sorted.length);
        setSelectedCards(new Set(sorted.slice(0, n)));
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

  const handleSaveCustomPattern = async (pattern: BingoPattern) => {
    await saveCustomPattern(pattern);
    registerCustomPattern(pattern);
    setPatterns(getAllPatterns());
    // Auto-add the new pattern as the next round
    setSelectedPatterns(prev => (prev.includes(pattern.id) ? prev : [...prev, pattern.id]));
    setEditorOpen(false);
  };

  const handleDeleteCustomPattern = async (patternId: string) => {
    await deleteCustomPattern(patternId);
    unregisterCustomPattern(patternId);
    setPatterns(getAllPatterns());
    setSelectedPatterns(prev => {
      const next = prev.filter(p => p !== patternId);
      // Never leave the selection empty
      return next.length > 0 ? next : ['single-line-h'];
    });
  };

  const handleStartGame = async () => {
    if (!playlist) return;
    setStarting(true);
    await startNewGame(playlist, selectedPatterns, {
      activeCardNumbers: [...selectedCards].sort((a, b) => a - b),
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
              {patterns.map(pattern => (
                <div key={pattern.id} className="relative">
                  <div
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
                  {pattern.isCustom && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleDeleteCustomPattern(pattern.id); }}
                      aria-label={`Delete ${pattern.name}`}
                      title="Delete custom pattern"
                      className="absolute top-0 right-0 w-6 h-6 flex items-center justify-center rounded-full bg-[var(--accent-red)] text-white text-sm leading-none shadow hover:bg-[var(--accent-red-light)]"
                    >
                      &times;
                    </button>
                  )}
                </div>
              ))}

              {/* Create custom pattern tile */}
              <button
                type="button"
                onClick={() => setEditorOpen(true)}
                className="flex flex-col items-center justify-center gap-1 min-h-[88px] rounded-lg border-2 border-dashed border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--accent-green)] hover:text-[var(--accent-green)] transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="text-xs font-medium">Create Custom</span>
              </button>
            </div>

            {/* Selected Order */}
            {selectedPatterns.length > 1 && (
              <div className="mt-6 pt-6 border-t border-[var(--border-color)]">
                <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Round Order</h3>
                <div className="flex flex-wrap gap-2">
                  {selectedPatterns.map((patternId, idx) => {
                    const pattern = patterns.find(p => p.id === patternId);
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
                <div className="flex items-baseline justify-between mb-3">
                  <div className="text-sm font-medium text-[var(--text-primary)]">
                    Target Win Songs (optional)
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">
                    {playableSongCount} songs play &bull; targets must be ≤ {playableSongCount}
                  </div>
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
                        max={playableSongCount || playlist?.songs.length || 50}
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
                  <div className="min-w-[90px]">
                    <label className="block text-xs text-[var(--text-secondary)] mb-1">
                      Tolerance (±)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max={playlist?.songs.length || 50}
                      value={tolerance}
                      onChange={(e) => setTolerance(Math.max(0, parseInt(e.target.value) || 0))}
                      className="input w-full text-center"
                      disabled={autoShuffling}
                    />
                  </div>
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
                  Set target song numbers and click "Find Order" to auto-shuffle until found (matches within ±{tolerance} song{tolerance === 1 ? '' : 's'})
                </p>
              </div>

              {/* Repeat-winner warning */}
              {repeatWinners.length > 0 && (
                <div className="mb-4 p-3 rounded-lg bg-[var(--status-warning-bg)] border border-[var(--status-warning-text)]">
                  <div className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-[var(--status-warning-text)] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    </svg>
                    <div className="text-sm">
                      <div className="font-semibold text-[var(--status-warning-text)]">
                        Same card wins multiple rounds
                      </div>
                      <ul className="text-[var(--text-secondary)] mt-1 space-y-0.5">
                        {repeatWinners.map(({ cardNumber, rounds }) => (
                          <li key={cardNumber}>
                            Card #{cardNumber} wins rounds {rounds.join(', ')}
                          </li>
                        ))}
                      </ul>
                      <div className="text-xs text-[var(--text-muted)] mt-1">
                        Re-shuffle or run "Find Order" again for a different order.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Round Summary Cards */}
              <div className="space-y-3 mb-4">
                {roundPredictions.map((round) => {
                  const reached = round.firstWinSong > 0;
                  const isRepeat = round.firstWinCards.some(
                    c => repeatWinners.some(r => r.cardNumber === c)
                  );
                  return (
                  <div
                    key={round.roundNumber}
                    className={`border rounded-lg p-4 ${
                      !reached
                        ? 'bg-[var(--status-error-bg)] border-[var(--status-error-text)]'
                        : isRepeat
                        ? 'bg-[var(--status-warning-bg)] border-[var(--status-warning-text)]'
                        : 'bg-[var(--status-success-bg)] border-[var(--accent-green)]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold text-[var(--text-primary)]">
                        Round {round.roundNumber}: {round.patternName}
                      </div>
                      <div className={`text-2xl font-bold ${reached ? 'text-[var(--accent-green)]' : 'text-[var(--status-error-text)]'}`}>
                        {reached ? `Song #${round.firstWinSong}` : 'No winner'}
                      </div>
                    </div>
                    {reached ? (
                      <>
                        <div className="text-sm text-[var(--text-secondary)]">
                          {round.firstWinTitle}
                        </div>
                        <div className="text-sm text-[var(--text-muted)] mt-1">
                          Winner{round.firstWinCards.length > 1 ? 's' : ''}:{' '}
                          {round.firstWinCards.map((c, i) => {
                            const repeat = repeatWinners.some(r => r.cardNumber === c);
                            return (
                              <span key={c}>
                                {i > 0 && ', '}
                                <span className={repeat ? 'font-semibold text-[var(--status-warning-text)]' : ''}>
                                  #{c}{repeat && ' ⚠'}
                                </span>
                              </span>
                            );
                          })}
                          {round.firstWinCards.length > 1 && ` (${round.firstWinCards.length} tied)`}
                        </div>
                      </>
                    ) : (
                      <div className="text-sm text-[var(--text-secondary)]">
                        This pattern can't be completed with the available songs — not enough songs are called to fill it on any card.
                      </div>
                    )}
                  </div>
                  );
                })}
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

          {/* Cards in Play */}
          {totalCards > 0 ? (
            <div className="card">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                  Cards in Play
                </h3>
                <span className="text-sm font-semibold text-[var(--accent-green)]">
                  {cardsInPlay} of {totalCards}
                </span>
              </div>
              <p className="text-sm text-[var(--text-secondary)] mb-4">
                Tap card numbers to choose exactly which cards are in play.
              </p>

              {/* Presets */}
              <div className="flex flex-wrap gap-2 mb-3">
                {[10, 20, 30, 50].filter(n => n <= totalCards).map(count => (
                  <button
                    key={count}
                    onClick={() => selectFirstN(count)}
                    className="px-3 py-1.5 rounded text-sm font-medium bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:bg-[var(--bg-card)] border border-[var(--border-color)] transition-colors"
                  >
                    First {count}
                  </button>
                ))}
                <button
                  onClick={() => setSelectedCards(new Set(allCardNumbers))}
                  className="px-3 py-1.5 rounded text-sm font-medium bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:bg-[var(--bg-card)] border border-[var(--border-color)] transition-colors"
                >
                  All
                </button>
                <button
                  onClick={() => setSelectedCards(new Set())}
                  className="px-3 py-1.5 rounded text-sm font-medium bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:bg-[var(--bg-card)] border border-[var(--border-color)] transition-colors"
                >
                  None
                </button>
              </div>

              {/* Toggle grid */}
              <div className="grid grid-cols-6 gap-1.5 max-h-64 overflow-y-auto p-1 mb-2">
                {allCardNumbers.map(num => {
                  const on = selectedCards.has(num);
                  return (
                    <button
                      key={num}
                      onClick={() => toggleCard(num)}
                      aria-pressed={on}
                      className={`py-1.5 rounded text-sm font-medium transition-colors ${
                        on
                          ? 'bg-[var(--accent-green)] text-white'
                          : 'bg-[var(--bg-hover)] text-[var(--text-muted)] hover:bg-[var(--bg-card)] border border-[var(--border-color)]'
                      }`}
                    >
                      {num}
                    </button>
                  );
                })}
              </div>

              {cardsInPlay === 0 && (
                <p className="text-sm text-[var(--status-warning-text)] mt-2">
                  Select at least one card to start the game.
                </p>
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
            disabled={starting || selectedPatterns.length === 0 || (!eventConfig && availablePacks.length > 0 && !selectedPackId) || totalCards === 0 || cardsInPlay === 0}
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

      <CustomPatternEditor
        isOpen={editorOpen}
        onSave={handleSaveCustomPattern}
        onCancel={() => setEditorOpen(false)}
      />
    </AppShell>
  );
}
