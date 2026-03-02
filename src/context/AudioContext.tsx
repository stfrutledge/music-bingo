import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { getAudioFromCache } from '../lib/audioCache';

const FADE_DURATION = 500; // ms for fade in/out

interface AudioContextState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  isLoading: boolean;
  error: string | null;
  startOffset: number;
  isFading: boolean;
  isPreloading: boolean;
}

interface AudioContextValue extends AudioContextState {
  play: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  stopWithFade: () => Promise<void>;
  seek: (time: number) => void;
  loadAudio: (url: string, startTime?: number, autoPlay?: boolean) => Promise<void>;
  preloadAudio: (url: string, startTime?: number) => void;
  transitionToPreloaded: () => Promise<void>;
}

const AudioContext = createContext<AudioContextValue | null>(null);

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const preloadAudioRef = useRef<HTMLAudioElement | null>(null);
  const startTimeRef = useRef<number>(0);
  const preloadStartTimeRef = useRef<number>(0);
  const fadeIntervalRef = useRef<number | null>(null);
  const preloadUrlRef = useRef<string>('');
  const currentUrlRef = useRef<string>('');

  const [state, setState] = useState<AudioContextState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    isLoading: false,
    error: null,
    startOffset: 0,
    isFading: false,
    isPreloading: false,
  });

  // Initialize audio elements
  useEffect(() => {
    const audio = new Audio();
    const preloadAudio = new Audio();
    audioRef.current = audio;
    preloadAudioRef.current = preloadAudio;

    audio.addEventListener('timeupdate', () => {
      setState(prev => ({ ...prev, currentTime: audio.currentTime }));
    });

    audio.addEventListener('loadedmetadata', () => {
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

    // Preload audio ready listener
    preloadAudio.addEventListener('canplaythrough', () => {
      setState(prev => ({ ...prev, isPreloading: false }));
    });

    return () => {
      audio.pause();
      audio.src = '';
      preloadAudio.src = '';
    };
  }, []);

  const fadeIn = useCallback((audio: HTMLAudioElement) => {
    audio.volume = 0;

    const steps = 20;
    const stepDuration = FADE_DURATION / steps;
    const volumeStep = 1 / steps;
    let currentStep = 0;

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

    // Skip if the same URL is already loaded (don't interrupt playback)
    if (currentUrlRef.current === url) {
      return;
    }

    // Stop any current playback and reset state
    audio.pause();
    startTimeRef.current = startTime;
    currentUrlRef.current = url;

    setState(prev => ({
      ...prev,
      isPlaying: false,
      isLoading: true,
      error: null,
      currentTime: startTime,
      duration: 0,
      startOffset: startTime,
    }));

    // Try to load from cache first (for offline support)
    let audioSrc = url;
    try {
      const cachedResponse = await getAudioFromCache(url);
      if (cachedResponse) {
        const blob = await cachedResponse.blob();
        audioSrc = URL.createObjectURL(blob);
        console.log('Playing from cache:', url);
      }
    } catch (err) {
      console.warn('Cache lookup failed, using network:', err);
    }

    audio.src = audioSrc;
    audio.load();

    if (autoPlay) {
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

  const preloadAudio = useCallback(async (url: string, startTime: number = 0) => {
    const preload = preloadAudioRef.current;
    if (!preload) return;

    preloadUrlRef.current = url;
    preloadStartTimeRef.current = startTime;
    setState(prev => ({ ...prev, isPreloading: true }));

    // Try to load from cache first (for offline support)
    let audioSrc = url;
    try {
      const cachedResponse = await getAudioFromCache(url);
      if (cachedResponse) {
        const blob = await cachedResponse.blob();
        audioSrc = URL.createObjectURL(blob);
      }
    } catch (err) {
      console.warn('Cache lookup failed for preload:', err);
    }

    preload.src = audioSrc;
    preload.load();

    // Seek to start time when metadata loads
    preload.addEventListener('loadedmetadata', function onMeta() {
      preload.removeEventListener('loadedmetadata', onMeta);
      if (startTime > 0 && startTime < preload.duration) {
        preload.currentTime = startTime;
      }
    }, { once: true });
  }, []);

  const transitionToPreloaded = useCallback(async (): Promise<void> => {
    const audio = audioRef.current;
    const preload = preloadAudioRef.current;
    if (!audio || !preload || !preloadUrlRef.current) return;

    // Wait for preload to be ready if still loading
    if (preload.readyState < 3) {
      await new Promise<void>((resolve) => {
        preload.addEventListener('canplay', () => resolve(), { once: true });
      });
    }

    // Fade out current
    await stopWithFade();

    // Swap the audio elements
    startTimeRef.current = preloadStartTimeRef.current;
    currentUrlRef.current = preloadUrlRef.current;
    audio.src = preloadUrlRef.current;
    audio.load();

    // Wait for it to be ready and play
    await new Promise<void>((resolve) => {
      audio.addEventListener('canplay', async function onCanPlay() {
        audio.removeEventListener('canplay', onCanPlay);
        if (preloadStartTimeRef.current > 0) {
          audio.currentTime = preloadStartTimeRef.current;
        }
        try {
          audio.volume = 0;
          await audio.play();
          fadeIn(audio);
        } catch (err) {
          console.warn('Auto-play failed:', err);
          audio.volume = 1;
        }
        resolve();
      }, { once: true });
    });

    setState(prev => ({
      ...prev,
      startOffset: preloadStartTimeRef.current,
      duration: audio.duration,
    }));

    // Clear preload
    preloadUrlRef.current = '';
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
          audio.volume = 1;
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

  const value: AudioContextValue = {
    ...state,
    play,
    pause,
    stop,
    stopWithFade,
    seek,
    loadAudio,
    preloadAudio,
    transitionToPreloaded,
  };

  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
}

export function useAudio(): AudioContextValue {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error('useAudio must be used within an AudioProvider');
  }
  return context;
}
