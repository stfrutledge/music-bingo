import { useState, useEffect } from 'react';
import { extractArtwork } from '../lib/artworkExtractor';

interface UseArtworkReturn {
  artworkUrl: string | null;
  isLoading: boolean;
}

export function useArtwork(audioUrl: string | null): UseArtworkReturn {
  const [artworkUrl, setArtworkUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!audioUrl) {
      setArtworkUrl(null);
      return;
    }

    setIsLoading(true);
    extractArtwork(audioUrl)
      .then((result) => {
        setArtworkUrl(result?.dataUrl || null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [audioUrl]);

  return { artworkUrl, isLoading };
}
