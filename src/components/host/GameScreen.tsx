import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../../context/GameContext';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';
import { useWakeLock } from '../../hooks/useWakeLock';
import { getAudioUrl } from '../../lib/audioCache';
import { getPatternById } from '../../lib/patterns';
import { Button } from '../shared/Button';
import { AudioPlayer } from '../shared/AudioPlayer';
import { PatternDisplay } from '../shared/PatternDisplay';

export function GameScreen() {
  const navigate = useNavigate();
  const { game, playlist, currentSong, nextSong, prevSong, setPlaying } = useGame();
  const audio = useAudioPlayer();
  const wakeLock = useWakeLock();

  const [showCalledList, setShowCalledList] = useState(false);

  // Acquire wake lock when game starts
  useEffect(() => {
    wakeLock.request();
    return () => {
      wakeLock.release();
    };
  }, []);

  // Load audio when song changes
  useEffect(() => {
    if (currentSong && playlist) {
      const url = getAudioUrl(playlist.baseAudioUrl, currentSong.audioFile);
      audio.loadAudio(url, currentSong.startTime || 0);
    }
  }, [currentSong?.id, playlist?.baseAudioUrl]);

  // Sync playing state
  useEffect(() => {
    setPlaying(audio.isPlaying);
  }, [audio.isPlaying]);

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

  const handleNextSong = () => {
    audio.stop();
    nextSong();
  };

  const handlePrevSong = () => {
    audio.stop();
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
            {currentRound.winners.length > 0 && (
              <span className="text-green-400">
                {currentRound.winners.length} winner{currentRound.winners.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </header>

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
