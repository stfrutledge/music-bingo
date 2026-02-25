import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../../context/GameContext';
import { useAudio } from '../../context/AudioContext';
import { useWakeLock } from '../../hooks/useWakeLock';
import { getAudioUrl } from '../../lib/audioCache';
import { getPatternById } from '../../lib/patterns';
import { Button } from '../shared/Button';
import { AudioPlayer } from '../shared/AudioPlayer';
import { PatternDisplay } from '../shared/PatternDisplay';

export function GameScreen() {
  const navigate = useNavigate();
  const { game, playlist, currentSong, nextSong, prevSong, setPlaying, isLoading, potentialWinners, confirmedWinners, cardsInPlay } = useGame();
  const audio = useAudio();
  const wakeLock = useWakeLock();

  const [showCalledList, setShowCalledList] = useState(false);
  const [showWinnerTracker, setShowWinnerTracker] = useState(true);
  const [hasLoadedCurrentSong, setHasLoadedCurrentSong] = useState(false);
  const [shouldAutoPlay, setShouldAutoPlay] = useState(false);

  // Acquire wake lock when game starts
  useEffect(() => {
    wakeLock.request();
    return () => {
      wakeLock.release();
    };
  }, []);

  // Load audio when song changes (only if not already playing the right song)
  useEffect(() => {
    if (currentSong && playlist && !hasLoadedCurrentSong) {
      const url = getAudioUrl(playlist.baseAudioUrl, currentSong.audioFile);
      audio.loadAudio(url, currentSong.startTime || 0, shouldAutoPlay);
      setHasLoadedCurrentSong(true);
      setShouldAutoPlay(false);
    }
  }, [currentSong?.id, playlist?.baseAudioUrl, hasLoadedCurrentSong, shouldAutoPlay]);

  // Preload next song when current song is loaded
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

  // Sync playing state
  useEffect(() => {
    setPlaying(audio.isPlaying);
  }, [audio.isPlaying]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-navy-950 flex items-center justify-center">
        <div className="text-slate-400">Loading game...</div>
      </div>
    );
  }

  if (!game || !playlist || !currentSong) {
    return (
      <div className="min-h-screen bg-navy-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-400 mb-4">No active game</p>
          <Button variant="primary" onClick={() => navigate('/')}>
            Go Home
          </Button>
        </div>
      </div>
    );
  }

  const currentRound = game.rounds[game.currentRound];
  const pattern = getPatternById(currentRound.patternId);
  const songNumber = game.currentSongIndex + 1;
  const totalSongs = game.shuffledSongOrder.length;

  const calledSongs = game.calledSongIds.map(id =>
    playlist.songs.find(s => s.id === id)
  ).filter(Boolean);

  const handlePlayPause = () => {
    if (audio.isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
  };

  const handleNextSong = async () => {
    // Use preloaded audio for seamless transition
    await audio.transitionToPreloaded();
    // Mark as loaded BEFORE state change so useEffect doesn't reload
    setHasLoadedCurrentSong(true);
    nextSong();
  };

  const handlePrevSong = async () => {
    // For previous, we need to load fresh (no preload for going backwards)
    await audio.stopWithFade();
    setShouldAutoPlay(true);
    setHasLoadedCurrentSong(false);
    prevSong();
  };

  return (
    <div className="min-h-screen bg-navy-950 flex flex-col safe-area-inset">
      {/* Header */}
      <header className="p-4 flex items-center justify-between border-b border-navy-800">
        <div className="flex items-center gap-3">
          <PatternDisplay pattern={pattern} size="sm" showLabel={false} />
          <div>
            <div className="text-white font-semibold">Round {currentRound.roundNumber}</div>
            <div className="text-sm text-slate-400">{pattern.name}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-white font-semibold">{songNumber} / {totalSongs}</div>
          <div className="text-sm text-slate-400">
            {currentRound.winners.length > 0 ? (
              <span className="text-green-400">
                {currentRound.winners.length} winner{currentRound.winners.length !== 1 ? 's' : ''}
              </span>
            ) : (
              <span>{cardsInPlay} cards</span>
            )}
          </div>
        </div>
      </header>

      {/* Winner Tracker */}
      {potentialWinners.length > 0 && (
        <div className="px-4 pt-2">
          <button
            onClick={() => setShowWinnerTracker(!showWinnerTracker)}
            className="w-full flex items-center justify-between p-2 bg-navy-800 rounded-lg"
          >
            <span className="text-sm font-medium text-white flex items-center gap-2">
              {potentialWinners.some(w => w.missingCount === 0) ? (
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              ) : potentialWinners.some(w => w.missingCount === 1) ? (
                <span className="w-2 h-2 bg-yellow-500 rounded-full" />
              ) : (
                <span className="w-2 h-2 bg-blue-500 rounded-full" />
              )}
              Expect Bingo: {potentialWinners.filter(w => w.missingCount === 0).length} won, {potentialWinners.filter(w => w.missingCount === 1).length} need 1
            </span>
            <span className="text-slate-400 text-sm">{showWinnerTracker ? '▼' : '▶'}</span>
          </button>

          {showWinnerTracker && (
            <div className="mt-2 p-3 bg-navy-800/50 rounded-lg space-y-2">
              {/* Winners (0 missing) */}
              {potentialWinners.filter(w => w.missingCount === 0).length > 0 && (
                <div>
                  <div className="text-xs text-green-400 font-medium mb-1">BINGO!</div>
                  <div className="flex flex-wrap gap-1">
                    {potentialWinners.filter(w => w.missingCount === 0).map(w => (
                      <span
                        key={w.cardNumber}
                        className={`px-2 py-1 rounded text-sm font-medium ${
                          confirmedWinners.includes(w.cardNumber)
                            ? 'bg-green-600 text-white'
                            : 'bg-green-900 text-green-300 animate-pulse'
                        }`}
                      >
                        #{w.cardNumber}
                        {confirmedWinners.includes(w.cardNumber) && ' ✓'}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Need 1 song */}
              {potentialWinners.filter(w => w.missingCount === 1).length > 0 && (
                <div>
                  <div className="text-xs text-yellow-400 font-medium mb-1">Need 1 song</div>
                  <div className="flex flex-wrap gap-1">
                    {potentialWinners.filter(w => w.missingCount === 1).map(w => (
                      <span
                        key={w.cardNumber}
                        className="px-2 py-1 bg-yellow-900/50 text-yellow-300 rounded text-sm"
                        title={`Needs: ${w.missingSongIds.join(', ')}`}
                      >
                        #{w.cardNumber}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Need 2 songs */}
              {potentialWinners.filter(w => w.missingCount === 2).length > 0 && (
                <div>
                  <div className="text-xs text-blue-400 font-medium mb-1">Need 2 songs</div>
                  <div className="flex flex-wrap gap-1">
                    {potentialWinners.filter(w => w.missingCount === 2).map(w => (
                      <span
                        key={w.cardNumber}
                        className="px-2 py-1 bg-blue-900/30 text-blue-300 rounded text-sm"
                      >
                        #{w.cardNumber}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col p-4">
        {/* Current Song */}
        <div className="card flex-1 flex flex-col items-center justify-center text-center mb-4">
          <div className="text-3xl font-bold text-white mb-2 text-shadow">
            {currentSong.title}
          </div>
          <div className="text-xl text-slate-400">
            {currentSong.artist}
          </div>
        </div>

        {/* Audio Player */}
        <div className="card mb-4">
          <AudioPlayer
            currentTime={audio.currentTime}
            duration={audio.duration}
            isPlaying={audio.isPlaying}
            isLoading={audio.isLoading}
            onPlayPause={handlePlayPause}
            onSeek={audio.seek}
          />
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <Button
            variant="success"
            size="lg"
            fullWidth
            onClick={handleNextSong}
            disabled={songNumber >= totalSongs}
          >
            Next Song
          </Button>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={() => navigate('/host/verify')}
          >
            Winner!
          </Button>
        </div>

        {/* Secondary Actions */}
        <div className="flex justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePrevSong}
            disabled={songNumber <= 1}
          >
            Previous
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowCalledList(!showCalledList)}
          >
            {showCalledList ? 'Hide' : 'Show'} Called ({calledSongs.length})
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/host/round-end')}
          >
            End Round
          </Button>
        </div>

        {/* Called Songs List */}
        {showCalledList && (
          <div className="mt-4 card max-h-48 overflow-y-auto">
            <h3 className="text-sm font-semibold text-white mb-2">Called Songs</h3>
            <div className="space-y-1">
              {calledSongs.slice().reverse().map((song, idx) => (
                <div
                  key={song!.id}
                  className={`text-sm ${idx === 0 ? 'text-white font-medium' : 'text-slate-400'}`}
                >
                  {calledSongs.length - idx}. {song!.title} - {song!.artist}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Wake Lock Indicator */}
      {wakeLock.isSupported && (
        <div className="fixed bottom-2 left-2 text-xs text-slate-500">
          {wakeLock.isActive ? 'Screen will stay on' : 'Screen may sleep'}
        </div>
      )}
    </div>
  );
}
