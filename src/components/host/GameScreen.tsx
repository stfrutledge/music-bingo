import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useGame } from '../../context/GameContext';
import { useAudio } from '../../context/AudioContext';
import { useWakeLock } from '../../hooks/useWakeLock';
import { useArtwork } from '../../hooks/useArtwork';
import { getAudioUrl } from '../../lib/audioCache';
import { getPatternById } from '../../lib/patterns';
import { Button } from '../shared/Button';
import { AudioPlayer } from '../shared/AudioPlayer';
import { PatternDisplay } from '../shared/PatternDisplay';
import { ThemeToggle } from '../shared/ThemeToggle';
import { CardPreviewModal } from './CardPreviewModal';

export function GameScreen() {
  const navigate = useNavigate();
  const { game, playlist, cards, currentSong, nextSong, prevSong, setPlaying, isLoading, potentialWinners, confirmedWinners, cardsInPlay, endGame } = useGame();
  const audio = useAudio();
  const wakeLock = useWakeLock();

  const [showCalledList, setShowCalledList] = useState(false);
  const [showWinnerTracker, setShowWinnerTracker] = useState(true);
  const [hasLoadedCurrentSong, setHasLoadedCurrentSong] = useState(false);
  const [shouldAutoPlay, setShouldAutoPlay] = useState(false);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [previewCardNumber, setPreviewCardNumber] = useState<number | null>(null);

  // Get the current audio URL for artwork extraction
  const currentAudioUrl = currentSong && playlist
    ? getAudioUrl(playlist.baseAudioUrl, currentSong.audioFile)
    : null;
  const { artworkUrl, isLoading: artworkLoading } = useArtwork(
    currentAudioUrl,
    currentSong?.artist,
    currentSong?.title
  );

  useEffect(() => {
    wakeLock.request();
    return () => { wakeLock.release(); };
  }, []);

  useEffect(() => {
    if (currentSong && playlist && !hasLoadedCurrentSong) {
      const url = getAudioUrl(playlist.baseAudioUrl, currentSong.audioFile);
      audio.loadAudio(url, currentSong.startTime || 0, shouldAutoPlay);
      setHasLoadedCurrentSong(true);
      setShouldAutoPlay(false);
    }
  }, [currentSong?.id, playlist?.baseAudioUrl, hasLoadedCurrentSong, shouldAutoPlay]);

  useEffect(() => {
    if (currentSong && playlist && game && !audio.isLoading) {
      const nextIndex = game.currentSongIndex + 1;
      if (nextIndex < game.shuffledSongOrder.length) {
        const nextSongId = game.shuffledSongOrder[nextIndex];
        const nextSongData = playlist.songs.find(s => s.id === nextSongId);
        if (nextSongData) {
          const nextUrl = getAudioUrl(playlist.baseAudioUrl, nextSongData.audioFile);
          audio.preloadAudio(nextUrl, nextSongData.startTime || 0);
        }
      }
    }
  }, [currentSong?.id, game?.currentSongIndex, audio.isLoading]);

  useEffect(() => {
    setPlaying(audio.isPlaying);
  }, [audio.isPlaying]);

  // Handle loop: restart from 0:00 when song ends if loop is enabled
  useEffect(() => {
    if (loopEnabled && audio.duration > 0 && audio.currentTime >= audio.duration - 0.5 && !audio.isPlaying) {
      audio.seek(0);
      audio.play();
    }
  }, [loopEnabled, audio.currentTime, audio.duration, audio.isPlaying]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--bg-secondary)] flex items-center justify-center">
        <div className="text-[var(--text-secondary)]">Loading game...</div>
      </div>
    );
  }

  if (!game || !playlist || !currentSong) {
    return (
      <div className="min-h-screen bg-[var(--bg-secondary)] flex items-center justify-center">
        <div className="text-center">
          <p className="text-[var(--text-secondary)] mb-4">No active game</p>
          <Link to="/">
            <Button variant="primary">Go Home</Button>
          </Link>
        </div>
      </div>
    );
  }

  const currentRound = game.rounds[game.currentRound];
  const pattern = getPatternById(currentRound.patternId);
  const songNumber = game.currentSongIndex + 1;
  const totalSongs = game.shuffledSongOrder.length;
  const calledSongs = game.calledSongIds.map(id => playlist.songs.find(s => s.id === id)).filter(Boolean);
  const songMap = new Map(playlist.songs.map(s => [s.id, s]));
  const calledSongIdsSet = new Set(game.calledSongIds);
  const previewCard = previewCardNumber ? cards.find(c => c.cardNumber === previewCardNumber) : null;

  const handlePlayPause = () => audio.isPlaying ? audio.pause() : audio.play();

  const handleNextSong = async () => {
    await audio.stopWithFade();
    setShouldAutoPlay(true);
    setHasLoadedCurrentSong(false);
    nextSong();
  };

  const handlePrevSong = async () => {
    await audio.stopWithFade();
    setShouldAutoPlay(true);
    setHasLoadedCurrentSong(false);
    prevSong();
  };

  const handleEndGame = () => {
    if (confirm('Are you sure you want to end the game?')) {
      endGame();
      navigate('/host/game-over');
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)] flex flex-col">
      {/* Header */}
      <header className="bg-[var(--bg-card)] border-b border-[var(--border-color)] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 h-14 lg:h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                if (confirm('Exit the game? You can resume it later from the home screen.')) {
                  audio.pause();
                  navigate('/', { state: { fromGame: true } });
                }
              }}
              className="flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span className="hidden sm:inline">Exit</span>
            </button>
            <div className="h-6 w-px bg-[var(--border-color)]" />
            <div className="flex items-center gap-3">
              <PatternDisplay pattern={pattern} size="sm" showLabel={false} />
              <div>
                <div className="text-[var(--text-primary)] font-semibold text-sm lg:text-base">Round {currentRound.roundNumber}: {pattern.name}</div>
                <div className="text-xs text-[var(--text-secondary)]">{playlist.name}</div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-medium text-[var(--text-primary)]">Song {songNumber} of {totalSongs}</div>
              <div className="text-xs text-[var(--text-secondary)]">{cardsInPlay} cards in play</div>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 lg:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
          {/* Left Column - Now Playing */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-6">
            {/* Current Song Card */}
            <div className="card py-8 lg:py-12">
              <div className="flex flex-col sm:flex-row items-center gap-6">
                {/* Album Artwork */}
                <div className="w-32 h-32 sm:w-40 sm:h-40 lg:w-48 lg:h-48 flex-shrink-0 rounded-lg overflow-hidden bg-[var(--bg-hover)] flex items-center justify-center">
                  {artworkLoading ? (
                    <div className="w-8 h-8 border-2 border-[var(--accent-green)] border-t-transparent rounded-full animate-spin" />
                  ) : artworkUrl ? (
                    <img
                      src={artworkUrl}
                      alt={`${currentSong.title} album art`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <svg className="w-16 h-16 text-[var(--text-muted)]" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                    </svg>
                  )}
                </div>

                {/* Song Info */}
                <div className="flex-1 text-center sm:text-left">
                  <div className="text-sm text-[var(--accent-green)] font-medium uppercase tracking-wider mb-2">Now Playing</div>
                  <h1 className="text-2xl lg:text-3xl font-bold text-[var(--text-primary)] mb-2">
                    {currentSong.title}
                  </h1>
                  <p className="text-lg lg:text-xl text-[var(--text-secondary)]">
                    {currentSong.artist}
                  </p>
                </div>
              </div>
            </div>

            {/* Audio Player */}
            <div className="card">
              <AudioPlayer
                currentTime={audio.currentTime}
                duration={audio.duration}
                isPlaying={audio.isPlaying}
                isLoading={audio.isLoading}
                onPlayPause={handlePlayPause}
                onSeek={audio.seek}
                loopEnabled={loopEnabled}
                onLoopToggle={() => setLoopEnabled(!loopEnabled)}
              />
            </div>

            {/* Primary Actions */}
            <div className="grid grid-cols-2 gap-4">
              <Button variant="success" size="lg" fullWidth onClick={handleNextSong} disabled={songNumber >= totalSongs}>
                Next Song
              </Button>
              <Button variant="secondary" size="lg" fullWidth onClick={() => navigate('/host/verify')}>
                Verify Winner
              </Button>
            </div>

            {/* Secondary Actions */}
            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" size="sm" onClick={handlePrevSong} disabled={songNumber <= 1}>
                Previous Song
              </Button>
              <Button variant="secondary" size="sm" onClick={() => navigate('/host/round-end')}>
                End Round
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowCalledList(!showCalledList)} className="lg:hidden">
                {showCalledList ? 'Hide' : 'Show'} Called ({calledSongs.length})
              </Button>
              <div className="flex-1" />
              <Button variant="danger" size="sm" onClick={handleEndGame}>
                End Game
              </Button>
            </div>

            {/* Mobile Called Songs */}
            {showCalledList && (
              <div className="card lg:hidden max-h-48 overflow-y-auto">
                <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">Called Songs</h3>
                <div className="space-y-1">
                  {calledSongs.slice().reverse().map((song, idx) => (
                    <div key={song!.id} className={`text-sm ${idx === 0 ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-secondary)]'}`}>
                      {calledSongs.length - idx}. {song!.title} - {song!.artist}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Sidebar */}
          <div className="lg:col-span-5 xl:col-span-4 space-y-6">
            {/* Winner Tracker */}
            {potentialWinners.length > 0 && (
              <div className="card">
                <button onClick={() => setShowWinnerTracker(!showWinnerTracker)} className="w-full flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wide flex items-center gap-2">
                    {potentialWinners.some(w => w.missingCount === 0) ? (
                      <span className="w-2 h-2 bg-[var(--accent-green)] rounded-full animate-pulse" />
                    ) : potentialWinners.some(w => w.missingCount === 1) ? (
                      <span className="w-2 h-2 bg-[var(--accent-amber)] rounded-full" />
                    ) : (
                      <span className="w-2 h-2 bg-[var(--accent-teal)] rounded-full" />
                    )}
                    Winner Tracker
                  </h3>
                  <span className="text-[var(--text-secondary)] text-xs">{showWinnerTracker ? '▼' : '▶'}</span>
                </button>

                {showWinnerTracker && (
                  <div className="space-y-3">
                    {potentialWinners.filter(w => w.missingCount === 0).length > 0 && (
                      <div>
                        <div className="text-xs text-[var(--status-success-text)] font-medium mb-1">BINGO!</div>
                        <div className="flex flex-wrap gap-1">
                          {potentialWinners.filter(w => w.missingCount === 0).map(w => (
                            <button
                              key={w.cardNumber}
                              onClick={() => setPreviewCardNumber(w.cardNumber)}
                              className={`px-2 py-1 rounded text-sm font-medium hidden lg:inline-block hover:ring-2 hover:ring-offset-1 hover:ring-[var(--accent-green)] transition-all ${confirmedWinners.includes(w.cardNumber) ? 'bg-[var(--accent-green)] text-white' : 'bg-[var(--status-success-bg)] text-[var(--status-success-text)] animate-pulse'}`}
                            >
                              #{w.cardNumber}{confirmedWinners.includes(w.cardNumber) && ' ✓'}
                            </button>
                          ))}
                          {potentialWinners.filter(w => w.missingCount === 0).map(w => (
                            <span key={w.cardNumber} className={`px-2 py-1 rounded text-sm font-medium lg:hidden ${confirmedWinners.includes(w.cardNumber) ? 'bg-[var(--accent-green)] text-white' : 'bg-[var(--status-success-bg)] text-[var(--status-success-text)] animate-pulse'}`}>
                              #{w.cardNumber}{confirmedWinners.includes(w.cardNumber) && ' ✓'}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {potentialWinners.filter(w => w.missingCount === 1).length > 0 && (
                      <div>
                        <div className="text-xs text-[var(--status-warning-text)] font-medium mb-1">Need 1 song</div>
                        <div className="flex flex-wrap gap-1">
                          {potentialWinners.filter(w => w.missingCount === 1).map(w => (
                            <button
                              key={w.cardNumber}
                              onClick={() => setPreviewCardNumber(w.cardNumber)}
                              className="px-2 py-1 bg-[var(--status-warning-bg)] text-[var(--status-warning-text)] rounded text-sm hidden lg:inline-block hover:ring-2 hover:ring-offset-1 hover:ring-[var(--accent-amber)] transition-all"
                            >
                              #{w.cardNumber}
                            </button>
                          ))}
                          {potentialWinners.filter(w => w.missingCount === 1).map(w => (
                            <span key={w.cardNumber} className="px-2 py-1 bg-[var(--status-warning-bg)] text-[var(--status-warning-text)] rounded text-sm lg:hidden">#{w.cardNumber}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {potentialWinners.filter(w => w.missingCount === 2).length > 0 && (
                      <div>
                        <div className="text-xs text-[var(--status-info-text)] font-medium mb-1">Need 2 songs</div>
                        <div className="flex flex-wrap gap-1">
                          {potentialWinners.filter(w => w.missingCount === 2).map(w => (
                            <button
                              key={w.cardNumber}
                              onClick={() => setPreviewCardNumber(w.cardNumber)}
                              className="px-2 py-1 bg-[var(--status-info-bg)] text-[var(--status-info-text)] rounded text-sm hidden lg:inline-block hover:ring-2 hover:ring-offset-1 hover:ring-[var(--accent-teal)] transition-all"
                            >
                              #{w.cardNumber}
                            </button>
                          ))}
                          {potentialWinners.filter(w => w.missingCount === 2).map(w => (
                            <span key={w.cardNumber} className="px-2 py-1 bg-[var(--status-info-bg)] text-[var(--status-info-text)] rounded text-sm lg:hidden">#{w.cardNumber}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Called Songs - Desktop */}
            <div className="card hidden lg:block">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3 uppercase tracking-wide">
                Called Songs ({calledSongs.length})
              </h3>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {calledSongs.length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)]">No songs called yet</p>
                ) : (
                  calledSongs.slice().reverse().map((song, idx) => (
                    <div key={song!.id} className={`text-sm ${idx === 0 ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-secondary)]'}`}>
                      {calledSongs.length - idx}. {song!.title} - {song!.artist}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Game Stats */}
            <div className="card hidden lg:block">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3 uppercase tracking-wide">Game Stats</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-[var(--bg-hover)] rounded-lg">
                  <div className="text-2xl font-bold text-[var(--text-primary)]">{songNumber}</div>
                  <div className="text-xs text-[var(--text-secondary)]">Current Song</div>
                </div>
                <div className="text-center p-3 bg-[var(--bg-hover)] rounded-lg">
                  <div className="text-2xl font-bold text-[var(--text-primary)]">{totalSongs - songNumber}</div>
                  <div className="text-xs text-[var(--text-secondary)]">Remaining</div>
                </div>
                <div className="text-center p-3 bg-[var(--bg-hover)] rounded-lg">
                  <div className="text-2xl font-bold text-[var(--text-primary)]">{cardsInPlay}</div>
                  <div className="text-xs text-[var(--text-secondary)]">Cards</div>
                </div>
                <div className="text-center p-3 bg-[var(--bg-hover)] rounded-lg">
                  <div className="text-2xl font-bold text-[var(--status-success-text)]">{currentRound.winners.length}</div>
                  <div className="text-xs text-[var(--text-secondary)]">Winners</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Wake Lock Indicator */}
      {wakeLock.isSupported && (
        <div className="fixed bottom-2 left-2 text-xs text-[var(--text-muted)]">
          {wakeLock.isActive ? '🔒 Screen on' : ''}
        </div>
      )}

      {/* Card Preview Modal (Desktop only) */}
      {previewCard && (
        <CardPreviewModal
          card={previewCard}
          songMap={songMap}
          calledSongIds={calledSongIdsSet}
          onClose={() => setPreviewCardNumber(null)}
        />
      )}
    </div>
  );
}
