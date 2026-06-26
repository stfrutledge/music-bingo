import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { getAudioFromCache, isLocalUrl } from '../lib/audioCache';
import { getAudioSource } from '../lib/audioSettings';

const FADE_DURATION = 200; // ms for fade in/out (quick transitions for bingo)
const CROSSFADE_DURATION = 1000; // ms to fade the outgoing and incoming songs into each other

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
  // Crossfade into the preloaded next song. Resolves true if a crossfade was
  // performed, false if nothing was preloaded (caller should fall back).
  transitionToPreloaded: () => Promise<boolean>;
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

  // Initialize audio elements. The two elements swap roles on every crossfade
  // (the preloaded element becomes the player), so both carry the same core
  // listeners — each guarded to only drive state while it is the active player.
  useEffect(() => {
    const audio = new Audio();
    const preloadAudio = new Audio();
    audioRef.current = audio;
    preloadAudioRef.current = preloadAudio;

    const attachCoreListeners = (el: HTMLAudioElement) => {
      const isActive = () => audioRef.current === el;

      el.addEventListener('timeupdate', () => {
        if (!isActive()) return;
        setState(prev => ({ ...prev, currentTime: el.currentTime }));
      });

      el.addEventListener('loadedmetadata', () => {
        if (!isActive()) return;
        const startTime = startTimeRef.current;
        if (startTime > 0 && startTime < el.duration) {
          el.currentTime = startTime;
        }
        setState(prev => ({
          ...prev,
          duration: el.duration,
          isLoading: false,
          currentTime: startTime,
        }));
      });

      el.addEventListener('ended', () => {
        if (!isActive()) return;
        const startTime = startTimeRef.current;
        el.currentTime = startTime;
        setState(prev => ({ ...prev, isPlaying: false, currentTime: startTime }));
      });

      el.addEventListener('error', () => {
        if (!isActive()) return;
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: 'Failed to load audio',
        }));
      });

      el.addEventListener('play', () => {
        if (!isActive()) return;
        setState(prev => ({ ...prev, isPlaying: true }));
      });

      el.addEventListener('pause', () => {
        if (!isActive()) return;
        setState(prev => ({ ...prev, isPlaying: false }));
      });

      // Buffering of the preloaded (inactive) element is done
      el.addEventListener('canplaythrough', () => {
        if (preloadAudioRef.current === el) {
          setState(prev => ({ ...prev, isPreloading: false }));
        }
      });
    };

    attachCoreListeners(audio);
    attachCoreListeners(preloadAudio);

    return () => {
      audio.pause();
      audio.src = '';
      preloadAudio.pause();
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

    // For local audio source, use files directly without cache lookup
    // Cache is only needed for remote/streaming sources (offline support)
    let audioSrc = url;
    const isLocal = getAudioSource() === 'local' || isLocalUrl(url);

    if (!isLocal) {
      // Only check cache for remote sources
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

    // For local audio source, use files directly without cache lookup
    let audioSrc = url;
    const isLocal = getAudioSource() === 'local' || isLocalUrl(url);

    if (!isLocal) {
      // Only check cache for remote sources
      try {
        const cachedResponse = await getAudioFromCache(url);
        if (cachedResponse) {
          const blob = await cachedResponse.blob();
          audioSrc = URL.createObjectURL(blob);
        }
      } catch (err) {
        console.warn('Cache lookup failed for preload:', err);
      }
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

  // Simultaneously fade the outgoing element to silence and the incoming one up
  // to full volume over CROSSFADE_DURATION. Both elements are playing during it.
  const crossfade = useCallback((from: HTMLAudioElement, to: HTMLAudioElement): Promise<void> => {
    return new Promise((resolve) => {
      const steps = 30;
      const stepDuration = CROSSFADE_DURATION / steps;
      let currentStep = 0;

      if (fadeIntervalRef.current) {
        clearInterval(fadeIntervalRef.current);
      }
      setState(prev => ({ ...prev, isFading: true }));

      fadeIntervalRef.current = window.setInterval(() => {
        currentStep++;
        const t = currentStep / steps;
        from.volume = Math.max(0, 1 - t);
        to.volume = Math.min(1, t);

        if (currentStep >= steps) {
          if (fadeIntervalRef.current) {
            clearInterval(fadeIntervalRef.current);
            fadeIntervalRef.current = null;
          }
          from.volume = 0;
          to.volume = 1;
          setState(prev => ({ ...prev, isFading: false }));
          resolve();
        }
      }, stepDuration);
    });
  }, []);

  const transitionToPreloaded = useCallback(async (): Promise<boolean> => {
    const current = audioRef.current;
    const preload = preloadAudioRef.current;
    // Nothing preloaded — let the caller fall back to a normal load.
    if (!current || !preload || !preloadUrlRef.current) return false;

    // Keep the current song playing until the next one is actually ready —
    // this is what prevents a silent gap on slower loads.
    if (preload.readyState < 3) {
      await new Promise<void>((resolve) => {
        if (preload.readyState >= 3) return resolve();
        preload.addEventListener('canplay', function onCanPlay() {
          preload.removeEventListener('canplay', onCanPlay);
          resolve();
        }, { once: true });
      });
    }

    // Make sure the incoming song starts at its intended offset, then begin
    // playing it silently underneath the current song.
    const incomingStart = preloadStartTimeRef.current;
    if (incomingStart > 0 && incomingStart < preload.duration) {
      preload.currentTime = incomingStart;
    }
    preload.volume = 0;
    try {
      await preload.play();
    } catch (err) {
      console.warn('Crossfade play failed:', err);
      return false;
    }

    // Fade the two into each other.
    await crossfade(current, preload);

    // Swap roles: the preloaded element is now the player. Do this before
    // pausing the old element so its 'pause' event is ignored by the guards.
    audioRef.current = preload;
    preloadAudioRef.current = current;
    startTimeRef.current = incomingStart;
    currentUrlRef.current = preloadUrlRef.current;

    // Park the outgoing element so it's free to preload the next song.
    current.pause();
    current.volume = 1;

    // Clear preload bookkeeping.
    preloadUrlRef.current = '';
    preloadStartTimeRef.current = 0;

    setState(prev => ({
      ...prev,
      isPlaying: true,
      isFading: false,
      isPreloading: false,
      startOffset: incomingStart,
      duration: preload.duration,
      currentTime: preload.currentTime,
    }));

    return true;
  }, [crossfade]);

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
