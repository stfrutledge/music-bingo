import { useState, useRef, useCallback, useEffect } from 'react';

const FADE_DURATION = 500; // ms for fade in/out

interface AudioPlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  isLoading: boolean;
  error: string | null;
  startOffset: number; // The startTime offset for display purposes
  isFading: boolean;
}

interface UseAudioPlayerReturn extends AudioPlayerState {
  play: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  stopWithFade: () => Promise<void>;
  seek: (time: number) => void;
  loadAudio: (url: string, startTime?: number, autoPlay?: boolean) => Promise<void>;
}

export function useAudioPlayer(): UseAudioPlayerReturn {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const startTimeRef = useRef<number>(0);
  const fadeIntervalRef = useRef<number | null>(null);
  const [state, setState] = useState<AudioPlayerState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    isLoading: false,
    error: null,
    startOffset: 0,
    isFading: false,
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

  const fadeIn = useCallback((audio: HTMLAudioElement) => {
    audio.volume = 0;

    const steps = 20;
    const stepDuration = FADE_DURATION / steps;
    const volumeStep = 1 / steps;
    let currentStep = 0;

    // Clear any existing fade
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
    }

    setState(prev => ({ ...prev, isFading: true }));

    fadeIntervalRef.current = window.setInterval(() => {
      currentStep++;
      audio.volume = Math.min(1, volumeStep * currentStep);

      if (currentStep >= steps) {
        if (fadeIntervalRef.current) {
          clearInterval(fadeIntervalRef.current);
          fadeIntervalRef.current = null;
        }
        audio.volume = 1;
        setState(prev => ({ ...prev, isFading: false }));
      }
    }, stepDuration);
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
      // Wait for audio to be ready, then play with fade in
      audio.addEventListener('canplay', async function onCanPlay() {
        audio.removeEventListener('canplay', onCanPlay);
        try {
          audio.volume = 0;
          await audio.play();
          fadeIn(audio);
        } catch (err) {
          console.warn('Auto-play failed:', err);
          audio.volume = 1;
        }
      }, { once: true });
    }
  }, [fadeIn]);

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
      // Clear any ongoing fade
      if (fadeIntervalRef.current) {
        clearInterval(fadeIntervalRef.current);
        fadeIntervalRef.current = null;
      }
      audio.pause();
      audio.volume = 1;
      audio.currentTime = startTimeRef.current;
      setState(prev => ({ ...prev, currentTime: startTimeRef.current, isFading: false }));
    }
  }, []);

  const stopWithFade = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      const audio = audioRef.current;
      if (!audio || audio.paused) {
        resolve();
        return;
      }

      setState(prev => ({ ...prev, isFading: true }));

      const startVolume = audio.volume;
      const steps = 20;
      const stepDuration = FADE_DURATION / steps;
      const volumeStep = startVolume / steps;
      let currentStep = 0;

      // Clear any existing fade
      if (fadeIntervalRef.current) {
        clearInterval(fadeIntervalRef.current);
      }

      fadeIntervalRef.current = window.setInterval(() => {
        currentStep++;
        audio.volume = Math.max(0, startVolume - (volumeStep * currentStep));

        if (currentStep >= steps) {
          if (fadeIntervalRef.current) {
            clearInterval(fadeIntervalRef.current);
            fadeIntervalRef.current = null;
          }
          audio.pause();
          audio.volume = 1; // Reset volume for next play
          audio.currentTime = startTimeRef.current;
          setState(prev => ({ ...prev, currentTime: startTimeRef.current, isFading: false }));
          resolve();
        }
      }, stepDuration);
    });
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
    stopWithFade,
    seek,
    loadAudio,
  };
}
