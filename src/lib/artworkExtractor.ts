import { parseBlob } from 'music-metadata';

interface ArtworkResult {
  dataUrl: string;
  format: string;
}

// Cache extracted artwork to avoid re-fetching
const artworkCache = new Map<string, ArtworkResult | null>();

export async function extractArtwork(audioUrl: string): Promise<ArtworkResult | null> {
  // Check cache first
  if (artworkCache.has(audioUrl)) {
    return artworkCache.get(audioUrl) || null;
  }

  try {
    // Fetch the audio file
    const response = await fetch(audioUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }

    const blob = await response.blob();
    const metadata = await parseBlob(blob);

    const picture = metadata.common.picture?.[0];
    if (picture) {
      // Convert Uint8Array to base64
      let binary = '';
      const bytes = picture.data;
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      const result: ArtworkResult = {
        dataUrl: `data:${picture.format};base64,${base64}`,
        format: picture.format,
      };
      artworkCache.set(audioUrl, result);
      return result;
    }

    artworkCache.set(audioUrl, null);
    return null;
  } catch (error) {
    console.warn('Failed to extract artwork:', error);
    artworkCache.set(audioUrl, null);
    return null;
  }
}

export function clearArtworkCache(): void {
  artworkCache.clear();
}
