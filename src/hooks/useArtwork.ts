import { useState, useEffect } from 'react';
import { extractArtwork } from '../lib/artworkExtractor';

interface UseArtworkReturn {
  artworkUrl: string | null;
  isLoading: boolean;
}

// Cache for iTunes lookups
const itunesCache = new Map<string, string | null>();

function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ')    // Normalize whitespace
    .trim();
}

function stringSimilarity(a: string, b: string): number {
  const aNorm = normalizeString(a);
  const bNorm = normalizeString(b);

  if (aNorm === bNorm) return 1;
  if (aNorm.includes(bNorm) || bNorm.includes(aNorm)) return 0.8;

  // Check word overlap
  const aWords = new Set(aNorm.split(' '));
  const bWords = new Set(bNorm.split(' '));
  const intersection = [...aWords].filter(w => bWords.has(w)).length;
  const union = new Set([...aWords, ...bWords]).size;

  return intersection / union; // Jaccard similarity
}

interface ItunesResult {
  artistName: string;
  trackName: string;
  artworkUrl100: string;
}

async function fetchItunesArtwork(artist: string, title: string): Promise<string | null> {
  const cacheKey = `${artist}-${title}`.toLowerCase();

  if (itunesCache.has(cacheKey)) {
    return itunesCache.get(cacheKey) || null;
  }

  try {
    // Search with both artist and track name, get multiple results to find best match
    const query = encodeURIComponent(`${artist} ${title}`);
    const response = await fetch(
      `https://itunes.apple.com/search?term=${query}&media=music&entity=song&limit=10`
    );

    if (!response.ok) {
      itunesCache.set(cacheKey, null);
      return null;
    }

    const data = await response.json();
    if (!data.results || data.results.length === 0) {
      itunesCache.set(cacheKey, null);
      return null;
    }

    // Score each result by how well it matches artist + title
    let bestMatch: ItunesResult | null = null;
    let bestScore = 0;

    // Words that indicate remixes/covers/versions - penalize these
    const penaltyWords = ['remix', 'cover', 'version', 'mixed', 'workout', 'karaoke', 'tribute', 'instrumental'];

    for (const result of data.results as ItunesResult[]) {
      const artistScore = stringSimilarity(artist, result.artistName);
      const titleScore = stringSimilarity(title, result.trackName);

      // Weight title slightly higher since artist names can vary
      let score = (artistScore * 0.4) + (titleScore * 0.6);

      // Penalize remixes, covers, workout versions - but only if artist doesn't match well
      // (DJ mixes from the same artist often have correct album artwork)
      const trackLower = result.trackName.toLowerCase();
      const artistLower = result.artistName.toLowerCase();
      const isGoodArtistMatch = artistScore >= 0.8;

      for (const word of penaltyWords) {
        if (trackLower.includes(word) || artistLower.includes(word)) {
          score *= isGoodArtistMatch ? 0.85 : 0.4; // Light penalty if artist matches, heavy if not
          break;
        }
      }

      // Bonus for exact artist match
      if (normalizeString(artist) === normalizeString(result.artistName)) {
        score *= 1.2;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = result;
      }
    }

    // Only use result if it's a good match (score > 0.6) AND artist is reasonably similar
    const artistSim = bestMatch ? stringSimilarity(artist, bestMatch.artistName) : 0;
    if (bestMatch && bestScore > 0.6 && artistSim > 0.3) {
      const artworkUrl = bestMatch.artworkUrl100?.replace('100x100', '600x600') || null;
      itunesCache.set(cacheKey, artworkUrl);
      return artworkUrl;
    }

    itunesCache.set(cacheKey, null);
    return null;
  } catch (error) {
    console.warn('iTunes artwork lookup failed:', error);
    itunesCache.set(cacheKey, null);
    return null;
  }
}

export function useArtwork(
  audioUrl: string | null,
  artist?: string,
  title?: string
): UseArtworkReturn {
  const [artworkUrl, setArtworkUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!audioUrl) {
      setArtworkUrl(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    (async () => {
      // Try extracting from the audio file first (works for cached/local files)
      const extracted = await extractArtwork(audioUrl);

      if (cancelled) return;

      if (extracted?.dataUrl) {
        setArtworkUrl(extracted.dataUrl);
        setIsLoading(false);
        return;
      }

      // Fall back to iTunes API if we have artist/title
      if (artist && title) {
        const itunesUrl = await fetchItunesArtwork(artist, title);
        if (cancelled) return;
        setArtworkUrl(itunesUrl);
      } else {
        setArtworkUrl(null);
      }

      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [audioUrl, artist, title]);

  return { artworkUrl, isLoading };
}
