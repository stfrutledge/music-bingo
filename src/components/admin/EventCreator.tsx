import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Playlist, CardPackInfo, CardPackData, BingoEvent, EventData } from '../../types';
import { getAllPlaylists, getPlaylist } from '../../lib/db';
import { saveEvent, loadEvent, createEventSlug } from '../../lib/eventService';
import { BINGO_PATTERNS } from '../../lib/patterns';
import { Button } from '../shared/Button';
import { PatternDisplay } from '../shared/PatternDisplay';
import { AppShell } from '../shared/AppShell';

export function EventCreator() {
  const { id: eventId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEditing = !!(eventId && eventId !== 'new');

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>('');
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [availablePacks, setAvailablePacks] = useState<CardPackInfo[]>([]);
  const [selectedPackId, setSelectedPackId] = useState<string>('');
  const [loadedPackData, setLoadedPackData] = useState<CardPackData | null>(null);

  const [eventName, setEventName] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [defaultPatterns, setDefaultPatterns] = useState<string[]>(['single-line-h']);
  const [defaultPlayerCount, setDefaultPlayerCount] = useState<number>(30);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (isEditing && eventId) {
      loadExistingEvent(eventId);
    }
  }, [eventId, isEditing]);

  const loadInitialData = async () => {
    setLoading(true);
    const playlistData = await getAllPlaylists();
    setPlaylists(playlistData);
    setLoading(false);
  };

  const loadExistingEvent = async (id: string) => {
    const eventData = await loadEvent(id);
    if (eventData) {
      const { event, embedded } = eventData;
      setEventName(event.name);
      setEventDescription(event.description || '');
      setDefaultPatterns(event.defaultPatterns || ['single-line-h']);
      setDefaultPlayerCount(event.defaultPlayerCount || 30);
      setSelectedPlaylistId(event.playlistId);
      setSelectedPackId(event.cardPackId);
      setSelectedPlaylist(embedded.playlist);
      setLoadedPackData(embedded.cardPackData);
    }
  };

  useEffect(() => {
    if (selectedPlaylistId && !isEditing) {
      loadPlaylistAndPacks(selectedPlaylistId);
    }
  }, [selectedPlaylistId, isEditing]);

  const loadPlaylistAndPacks = async (playlistId: string) => {
    const playlist = await getPlaylist(playlistId);
    setSelectedPlaylist(playlist || null);
    setSelectedPackId('');
    setLoadedPackData(null);

    // Load available packs
    try {
      const response = await fetch(`/api/list-card-packs?playlistId=${playlistId}`);
      if (response.ok) {
        const data = await response.json();
        setAvailablePacks(data.packs || []);
        return;
      }
    } catch {
      // Fall through to manifest
    }

    // Fallback to manifest
    try {
      const manifestResponse = await fetch(`${import.meta.env.BASE_URL}packs/playlists-manifest.json`);
      if (manifestResponse.ok) {
        const manifest = await manifestResponse.json();
        const playlistInfo = manifest.playlists?.find((p: { id: string }) => p.id === playlistId);
        if (playlistInfo?.cardPacks) {
          setAvailablePacks(playlistInfo.cardPacks);
        }
      }
    } catch {
      setAvailablePacks([]);
    }
  };

  useEffect(() => {
    if (selectedPackId && selectedPlaylistId && !isEditing) {
      loadCardPack(selectedPlaylistId, selectedPackId);
    }
  }, [selectedPackId, selectedPlaylistId, isEditing]);

  const loadCardPack = async (playlistId: string, packId: string) => {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}packs/${playlistId}/card-packs/${packId}.json`);
      if (response.ok) {
        const data: CardPackData = await response.json();
        setLoadedPackData(data);
      }
    } catch (error) {
      console.error('Failed to load card pack:', error);
      setLoadedPackData(null);
    }
  };

  const togglePattern = (patternId: string) => {
    setDefaultPatterns(prev => {
      if (prev.includes(patternId)) {
        if (prev.length === 1) return prev;
        return prev.filter(p => p !== patternId);
      }
      return [...prev, patternId];
    });
  };

  const handleSave = async () => {
    if (!selectedPlaylist || !loadedPackData || !eventName.trim()) return;

    setSaving(true);
    setSaveStatus('idle');
    setErrorMessage('');

    const slug = createEventSlug(eventName);
    const now = Date.now();

    const event: BingoEvent = {
      id: isEditing && eventId ? eventId : slug,
      name: eventName.trim(),
      description: eventDescription.trim() || undefined,
      playlistId: selectedPlaylistId,
      cardPackId: selectedPackId,
      defaultPatterns: defaultPatterns.length > 0 ? defaultPatterns : undefined,
      defaultPlayerCount: defaultPlayerCount > 0 ? defaultPlayerCount : undefined,
      createdAt: now,
    };

    const eventData: EventData = {
      event,
      embedded: {
        playlist: selectedPlaylist,
        cardPackData: loadedPackData,
      },
    };

    const result = await saveEvent(eventData);

    if (result.success) {
      setSaveStatus('success');
      setTimeout(() => {
        navigate('/admin/events');
      }, 1000);
    } else {
      setSaveStatus('error');
      setErrorMessage(result.error || 'Failed to save event');
    }

    setSaving(false);
  };

  if (loading) {
    return (
      <AppShell centered>
        <div className="text-[var(--text-secondary)]">Loading...</div>
      </AppShell>
    );
  }

  const canSave = eventName.trim() && selectedPlaylistId && selectedPackId && loadedPackData;

  return (
    <AppShell title={isEditing ? 'Edit Event' : 'Create Event'} maxWidth="xl">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-[var(--text-primary)]">
            {isEditing ? 'Edit Event' : 'Create Event'}
          </h1>
          <p className="text-[var(--text-secondary)] mt-1">
            Bundle a playlist and card pack for one-click loading
          </p>
        </div>
        <Button variant="ghost" onClick={() => navigate('/admin/events')}>
          Cancel
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Event Details */}
          <div className="card">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Event Details</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">Event Name *</label>
                <input
                  type="text"
                  value={eventName}
                  onChange={e => setEventName(e.target.value)}
                  placeholder="e.g., March 2026 Trivia Night"
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">Description</label>
                <textarea
                  value={eventDescription}
                  onChange={e => setEventDescription(e.target.value)}
                  placeholder="Optional description for this event"
                  className="input w-full h-20 resize-none"
                />
              </div>
            </div>
          </div>

          {/* Playlist Selection */}
          <div className="card">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Select Playlist</h2>
            <select
              value={selectedPlaylistId}
              onChange={e => setSelectedPlaylistId(e.target.value)}
              className="input w-full"
              disabled={isEditing}
            >
              <option value="">Choose a playlist...</option>
              {playlists.map(playlist => (
                <option key={playlist.id} value={playlist.id}>
                  {playlist.name} ({playlist.songs.length} songs)
                </option>
              ))}
            </select>
            {isEditing && selectedPlaylist && (
              <p className="text-sm text-[var(--text-secondary)] mt-2">
                Playlist: {selectedPlaylist.name}
              </p>
            )}
          </div>

          {/* Card Pack Selection */}
          {(selectedPlaylistId || isEditing) && (
            <div className="card">
              <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Select Card Pack</h2>
              {availablePacks.length > 0 ? (
                <select
                  value={selectedPackId}
                  onChange={e => setSelectedPackId(e.target.value)}
                  className="input w-full"
                  disabled={isEditing}
                >
                  <option value="">Choose a card pack...</option>
                  {availablePacks.map(pack => (
                    <option key={pack.id} value={pack.id}>
                      {pack.name} ({pack.cardCount} cards)
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-[var(--status-warning-text)]">
                  No card packs available for this playlist. Generate cards first.
                </p>
              )}
              {loadedPackData && (
                <p className="text-sm text-[var(--status-success-text)] mt-2">
                  Loaded: {loadedPackData.pack.name} ({loadedPackData.cards.length} cards)
                </p>
              )}
            </div>
          )}

          {/* Default Patterns */}
          <div className="card">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Default Patterns</h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              Pre-select patterns for game setup (hosts can still change)
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {BINGO_PATTERNS.map(pattern => (
                <div
                  key={pattern.id}
                  onClick={() => togglePattern(pattern.id)}
                  className="cursor-pointer"
                >
                  <PatternDisplay
                    pattern={pattern}
                    size="sm"
                    selected={defaultPatterns.includes(pattern.id)}
                  />
                  {defaultPatterns.includes(pattern.id) && (
                    <div className="text-center text-xs text-[var(--accent-green)] mt-1 font-medium">
                      Round {defaultPatterns.indexOf(pattern.id) + 1}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Player Count */}
          <div className="card">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Default Player Count</h3>
            <input
              type="number"
              value={defaultPlayerCount}
              onChange={e => setDefaultPlayerCount(Math.max(1, parseInt(e.target.value) || 1))}
              className="input w-full text-center text-xl font-bold"
              min="1"
              max={loadedPackData?.cards.length || 100}
            />
            <p className="text-xs text-[var(--text-muted)] mt-2 text-center">
              Hosts can adjust during setup
            </p>
          </div>

          {/* Summary */}
          <div className="card">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Summary</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Playlist:</span>
                <span className="text-[var(--text-primary)] font-medium">
                  {selectedPlaylist?.name || 'Not selected'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Card Pack:</span>
                <span className="text-[var(--text-primary)] font-medium">
                  {loadedPackData?.pack.name || 'Not selected'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Cards:</span>
                <span className="text-[var(--text-primary)] font-medium">
                  {loadedPackData?.cards.length || 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Rounds:</span>
                <span className="text-[var(--text-primary)] font-medium">
                  {defaultPatterns.length}
                </span>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={handleSave}
            disabled={saving || !canSave}
          >
            {saving ? 'Saving...' : isEditing ? 'Update Event' : 'Create Event'}
          </Button>

          {saveStatus === 'success' && (
            <p className="text-sm text-[var(--status-success-text)] text-center">
              Event saved successfully!
            </p>
          )}
          {saveStatus === 'error' && (
            <p className="text-sm text-[var(--status-error-text)] text-center">
              {errorMessage || 'Save failed (dev server required)'}
            </p>
          )}

          {!canSave && (
            <p className="text-xs text-[var(--text-muted)] text-center">
              {!eventName.trim()
                ? 'Enter an event name'
                : !selectedPlaylistId
                ? 'Select a playlist'
                : !selectedPackId
                ? 'Select a card pack'
                : 'Loading card pack...'}
            </p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
