import type { EventManifest, EventData, Playlist, CardPackData } from '../types';
import { savePlaylist, saveCards, savePacingTable } from './db';

const BASE_URL = import.meta.env.BASE_URL;

/**
 * Load the events manifest to get list of available events.
 */
export async function getAvailableEvents(): Promise<EventManifest['events']> {
  try {
    const response = await fetch(`${BASE_URL}packs/events-manifest.json`);
    if (!response.ok) {
      return [];
    }
    const manifest: EventManifest = await response.json();
    return manifest.events || [];
  } catch {
    return [];
  }
}

/**
 * Load a full event with embedded playlist and card pack data.
 */
export async function loadEvent(eventId: string): Promise<EventData | null> {
  try {
    const response = await fetch(`${BASE_URL}packs/events/${eventId}.json`);
    if (!response.ok) {
      return null;
    }
    const data: EventData = await response.json();
    return data;
  } catch {
    return null;
  }
}

/**
 * Import event data (playlist + card pack) into IndexedDB for game use.
 */
export async function importEventToDb(
  playlist: Playlist,
  cardPackData: CardPackData
): Promise<void> {
  // Save playlist to IndexedDB
  await savePlaylist(playlist);

  // Save cards to IndexedDB
  if (cardPackData.cards && cardPackData.cards.length > 0) {
    await saveCards(cardPackData.cards);
  }

  // Save pacing table if available
  if (cardPackData.pacingTable) {
    await savePacingTable(cardPackData.pacingTable);
  }
}

/**
 * Save a new event (dev only - calls API endpoint).
 */
export async function saveEvent(eventData: EventData): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch('/api/save-event', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventData),
    });

    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.error || 'Failed to save event' };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Delete an event (dev only - calls API endpoint).
 */
export async function deleteEvent(eventId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`/api/delete-event?id=${eventId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.error || 'Failed to delete event' };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Create event slug from name.
 */
export function createEventSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}
