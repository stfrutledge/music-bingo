import { useState, useRef, useCallback, useEffect } from 'react';

interface AudioPlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  isLoading: boolean;
  error: string | null;
  startOffset: number; // The startTime offset for display purposes
}

interface UseAudioPlayerReturn extends AudioPlayerState {
  play: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  seek: (time: number) => void;
  loadAudio: (url: string, startTime?: number, autoPlay?: boolean) => Promise<void>;
}

export function useAudioPlayer(): UseAudioPlayerReturn {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const startTimeRef = useRef<number>(0);
  const [state, setState] = useState<AudioPlayerState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    isLoading: false,
    error: null,
    startOffset: 0,
  });

  // Initialize audio element
  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    audio.addEventListener('timeupdate', () => {
      setState(prev => ({ ...prev, currentTime: audio.currentTime }));
    });

    audio.addEventListener('loadedmetadata', () => {
      // Seek to start time once metadata is loaded
      const startTime = startTimeRef.current;
      if (startTime > 0 && startTime < audio.duration) {
        audio.currentTime = startTime;
      }
      setState(prev => ({
        ...prev,
        duration: audio.duration,
        isLoading: false,
        currentTime: startTime,
      }));
    });

    audio.addEventListener('ended', () => {
      // When song ends, loop back to the start time
      const startTime = startTimeRef.current;
      audio.currentTime = startTime;
      setState(prev => ({ ...prev, isPlaying: false, currentTime: startTime }));
    });

    audio.addEventListener('error', () => {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Failed to load audio',
      }));
    });

    audio.addEventListener('play', () => {
      setState(prev => ({ ...prev, isPlaying: true }));
    });

    audio.addEventListener('pause', () => {
      setState(prev => ({ ...prev, isPlaying: false }));
    });

    return () => {
      audio.pause();
      audio.src = '';
    };
  }, []);

  const loadAudio = useCallback(async (url: string, startTime: number = 0, autoPlay: boolean = false) => {
    const audio = audioRef.current;
    if (!audio) return;

    startTimeRef.current = startTime;

    setState(prev => ({
      ...prev,
      isLoading: true,
      error: null,
      currentTime: startTime,
      duration: 0,
      startOffset: startTime,
    }));

    audio.src = url;
    audio.load();

    if (autoPlay) {
      // Wait for audio to be ready, then play
      audio.addEventListener('canplay', async function onCanPlay() {
        audio.removeEventListener('canplay', onCanPlay);
        try {
          await audio.play();
        } catch (err) {
          console.warn('Auto-play failed:', err);
        }
      }, { once: true });
    }
  }, []);

  const play = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    try {
      await audio.play();
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: 'Failed to play audio',
      }));
    }
  }, []);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = startTimeRef.current;
      setState(prev => ({ ...prev, currentTime: startTimeRef.current }));
    }
  }, []);

  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = time;
    }
  }, []);

  return {
    ...state,
    play,
    pause,
    stop,
    seek,
    loadAudio,
  };
}
