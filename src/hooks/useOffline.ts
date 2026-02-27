import { useState, useCallback } from 'react';
import type { OfflineProgress } from '../lib/offlineManager';
import {
  downloadAllAudio,
  isOfflineReady,
  getOfflineTimestamp,
  checkCacheStatus,
  clearOfflineStatus,
} from '../lib/offlineManager';

interface UseOfflineReturn {
  isReady: boolean;
  lastDownload: Date | null;
  cacheStatus: { total: number; cached: number } | null;
  progress: OfflineProgress | null;
  isDownloading: boolean;
  startDownload: (playlistId: string) => Promise<void>;
  refreshStatus: (playlistId: string) => Promise<void>;
  clearCache: () => void;
}

export function useOffline(): UseOfflineReturn {
  const [isReady, setIsReady] = useState(isOfflineReady());
  const [lastDownload, setLastDownload] = useState<Date | null>(() => {
    const ts = getOfflineTimestamp();
    return ts ? new Date(ts) : null;
  });
  const [cacheStatus, setCacheStatus] = useState<{ total: number; cached: number } | null>(null);
  const [progress, setProgress] = useState<OfflineProgress | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const refreshStatus = useCallback(async (playlistId: string) => {
    const status = await checkCacheStatus(playlistId);
    setCacheStatus(status);
    setIsReady(isOfflineReady());
    const ts = getOfflineTimestamp();
    setLastDownload(ts ? new Date(ts) : null);
  }, []);

  const startDownload = useCallback(async (playlistId: string) => {
    setIsDownloading(true);
    setProgress({
      total: 0,
      downloaded: 0,
      currentFile: 'Preparing...',
      status: 'downloading',
    });

    await downloadAllAudio(playlistId, (p) => {
      setProgress(p);
      if (p.status === 'complete') {
        setIsReady(true);
        setLastDownload(new Date());
        setIsDownloading(false);
      } else if (p.status === 'error') {
        setIsDownloading(false);
      }
    });

    // Refresh cache status after download
    const status = await checkCacheStatus(playlistId);
    setCacheStatus(status);
  }, []);

  const clearCache = useCallback(() => {
    clearOfflineStatus();
    setIsReady(false);
    setLastDownload(null);
    setCacheStatus(null);
    // Also clear the actual cache
    caches.delete('audio-cache').catch(console.error);
  }, []);

  return {
    isReady,
    lastDownload,
    cacheStatus,
    progress,
    isDownloading,
    startDownload,
    refreshStatus,
    clearCache,
  };
}
