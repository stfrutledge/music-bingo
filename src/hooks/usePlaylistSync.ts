import { useEffect, useState } from 'react';
import { syncPlaylistsFromPacks } from '../lib/playlistSync';

interface SyncResult {
  imported: number;
  updated: number;
  total: number;
}

/**
 * Hook that syncs playlists from public/packs on mount
 * Returns sync status and result
 */
export function usePlaylistSync() {
  const [syncing, setSyncing] = useState(true);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;

    async function sync() {
      try {
        const syncResult = await syncPlaylistsFromPacks();
        if (mounted) {
          setResult(syncResult);
          setSyncing(false);

          // Log sync result for debugging
          if (syncResult.imported > 0 || syncResult.updated > 0) {
            console.log(`Playlist sync: ${syncResult.imported} imported, ${syncResult.updated} updated`);
          }
        }
      } catch (e) {
        if (mounted) {
          setError(e instanceof Error ? e : new Error('Sync failed'));
          setSyncing(false);
        }
      }
    }

    sync();

    return () => {
      mounted = false;
    };
  }, []);

  return { syncing, result, error };
}
