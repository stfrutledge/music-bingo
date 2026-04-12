import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Playlist, BingoCard, GenerationStats, PacingTable } from '../../types';
import { getPlaylist, getCardsForPlaylist, saveCards, deleteCardsForPlaylist, savePacingTable, getPacingTable } from '../../lib/db';
import { generateCards } from '../../lib/cardGenerator';
import { generateCardsPDF, downloadPDF } from '../../lib/pdfGenerator';
import { Button } from '../shared/Button';
import { BingoGrid } from '../shared/BingoGrid';
import { AppShell } from '../shared/AppShell';

interface ExistingPack {
  id: string;
  name: string;
  cardCount: number;
}

export function CardGenerator() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [cards, setCards] = useState<BingoCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [stats, setStats] = useState<GenerationStats | null>(null);
  const [pacingTable, setPacingTable] = useState<PacingTable | null>(null);
  const [cardCount, setCardCount] = useState(80);
  const [previewCard, setPreviewCard] = useState<BingoCard | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Card pack state
  const [packName, setPackName] = useState('');
  const [existingPacks, setExistingPacks] = useState<ExistingPack[]>([]);

  useEffect(() => {
    if (id) {
      loadData(id);
      loadExistingPacks(id);
    }
  }, [id]);

  const loadData = async (playlistId: string) => {
    setLoading(true);
    const [playlistData, cardsData, pacingData] = await Promise.all([
      getPlaylist(playlistId),
      getCardsForPlaylist(playlistId),
      getPacingTable(playlistId),
    ]);

    if (playlistData) {
      setPlaylist(playlistData);
      setCards(cardsData);
      if (pacingData) setPacingTable(pacingData);
      if (cardsData.length > 0) setPreviewCard(cardsData[0]);
    }
    setLoading(false);
  };

  const loadExistingPacks = async (playlistId: string) => {
    try {
      // Try dev API first (for local development)
      const response = await fetch(`/api/list-card-packs?playlistId=${playlistId}`);
      if (response.ok) {
        const data = await response.json();
        setExistingPacks(data.packs || []);
      }
    } catch {
      // In production, load from manifest
      try {
        const manifestResponse = await fetch(`${import.meta.env.BASE_URL}packs/playlists-manifest.json`);
        if (manifestResponse.ok) {
          const manifest = await manifestResponse.json();
          const playlistInfo = manifest.playlists?.find((p: { id: string }) => p.id === playlistId);
          if (playlistInfo?.cardPacks) {
            setExistingPacks(playlistInfo.cardPacks);
          }
        }
      } catch {
        // Ignore errors
      }
    }
  };

  const loadPackFromFile = async (packId: string) => {
    if (!playlist) return;
    setLoading(true);
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}packs/${playlist.id}/card-packs/${packId}.json`);
      if (response.ok) {
        const data = await response.json();
        setCards(data.cards || []);
        setPacingTable(data.pacingTable || null);
        setPackName(data.pack?.name || '');
        if (data.cards?.length > 0) {
          setPreviewCard(data.cards[0]);
        }
      }
    } catch (error) {
      console.error('Failed to load pack:', error);
    }
    setLoading(false);
  };

  const handleGenerate = async () => {
    if (!playlist) return;
    setGenerating(true);
    await deleteCardsForPlaylist(playlist.id);
    const { cards: newCards, stats: newStats, pacingTable: newPacingTable } = generateCards(playlist, { cardCount });
    await saveCards(newCards);
    await savePacingTable(newPacingTable);
    setCards(newCards);
    setStats(newStats);
    setPacingTable(newPacingTable);
    setPreviewCard(newCards[0]);
    setGenerating(false);
  };

  const handleDownloadPDF = async () => {
    if (!playlist || cards.length === 0) return;
    const pdf = await generateCardsPDF(cards, playlist);
    downloadPDF(pdf, `${playlist.name.toLowerCase().replace(/\s+/g, '-')}-cards.pdf`);
  };

  const handleSaveCards = async () => {
    if (!playlist || cards.length === 0 || !pacingTable || !packName.trim()) return;
    setSaving(true);
    setSaveStatus('idle');

    try {
      // Generate pack ID from name (URL-safe slug)
      const packId = packName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

      // Save card pack via dev API
      const response = await fetch('/api/save-card-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playlistId: playlist.id,
          packId,
          packName: packName.trim(),
          cards,
          pacingTable,
        }),
      });

      if (response.ok) {
        setSaveStatus('success');
        // Reload existing packs list
        await loadExistingPacks(playlist.id);
      } else {
        setSaveStatus('error');
      }
    } catch {
      setSaveStatus('error');
    }

    setSaving(false);
  };

  const handleDownloadSinglePDF = async (card: BingoCard) => {
    if (!playlist) return;
    const pdf = await generateCardsPDF([card], playlist);
    downloadPDF(pdf, `card-${card.cardNumber}.pdf`);
  };

  if (loading) {
    return <AppShell centered><div className="text-[var(--text-secondary)]">Loading...</div></AppShell>;
  }

  if (!playlist) {
    return <AppShell centered><div className="text-[var(--status-error-text)]">Playlist not found</div></AppShell>;
  }

  const songMap = new Map(playlist.songs.map(s => [s.id, s]));

  return (
    <AppShell title={playlist.name} subtitle="Card Generator" maxWidth="xl">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-[var(--text-primary)]">Card Generator</h1>
          <p className="text-[var(--text-secondary)] mt-1">
            {playlist.name} &bull; {playlist.songs.length} songs
          </p>
        </div>
        <Button variant="ghost" onClick={() => navigate('/admin')}>
          Back to Admin
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Settings Column */}
        <div className="lg:col-span-4 xl:col-span-3 space-y-6">
          <div className="card">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Generate Cards</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">Number of Cards</label>
                <input
                  type="number"
                  value={cardCount}
                  onChange={e => setCardCount(Math.max(1, parseInt(e.target.value) || 1))}
                  className="input w-full"
                  min="1"
                  max="200"
                />
              </div>

              <div className="p-3 bg-[var(--bg-hover)] rounded-lg text-sm">
                <div className="flex justify-between mb-1">
                  <span className="text-[var(--text-secondary)]">Songs:</span>
                  <span className="text-[var(--text-primary)] font-medium">{playlist.songs.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">Coverage:</span>
                  <span className="text-[var(--text-primary)]">{Math.round((24 / playlist.songs.length) * 100)}%</span>
                </div>
              </div>

              <Button variant="primary" onClick={handleGenerate} disabled={generating} fullWidth>
                {generating ? 'Generating...' : `Generate ${cardCount} Cards`}
              </Button>
            </div>
          </div>

          {stats && (
            <div className="card">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Stats</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">Generated:</span>
                  <span className="text-[var(--text-primary)]">{stats.totalCards}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">Song range:</span>
                  <span className="text-[var(--text-primary)]">{stats.minAppearances}-{stats.maxAppearances}</span>
                </div>
              </div>
            </div>
          )}

          {/* Existing Card Packs */}
          {existingPacks.length > 0 && (
            <div className="card">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Saved Card Packs</h3>
              <div className="space-y-2">
                {existingPacks.map(pack => (
                  <div
                    key={pack.id}
                    className="flex items-center gap-2 p-3 bg-[var(--bg-hover)] rounded-lg"
                  >
                    <button
                      onClick={() => loadPackFromFile(pack.id)}
                      className="flex-1 text-left hover:opacity-80 transition-opacity"
                    >
                      <div className="font-medium text-[var(--text-primary)]">{pack.name}</div>
                      <div className="text-xs text-[var(--text-secondary)]">{pack.cardCount} cards</div>
                    </button>
                    <button
                      onClick={async () => {
                        if (confirm(`Delete card pack "${pack.name}"?`)) {
                          try {
                            const response = await fetch(`/api/delete-card-pack?playlistId=${playlist?.id}&packId=${pack.id}`, {
                              method: 'DELETE',
                            });
                            if (response.ok) {
                              loadExistingPacks(playlist!.id);
                            } else {
                              alert('Failed to delete pack');
                            }
                          } catch {
                            alert('Failed to delete pack (dev server required)');
                          }
                        }
                      }}
                      className="p-2 text-[var(--status-error-text)] hover:bg-[var(--bg-card)] rounded transition-colors"
                      title="Delete pack"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {cards.length > 0 && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">Pack Name</label>
                <input
                  type="text"
                  value={packName}
                  onChange={e => setPackName(e.target.value)}
                  placeholder="e.g., Dead Rabbit Event"
                  className="input w-full"
                />
              </div>
              <Button
                variant="primary"
                onClick={handleSaveCards}
                disabled={saving || !pacingTable || !packName.trim()}
                fullWidth
              >
                {saving ? 'Saving...' : 'Save Card Pack'}
              </Button>
              {saveStatus === 'success' && (
                <p className="text-sm text-[var(--status-success-text)] text-center">
                  Saved to public/packs/{playlist?.id}/card-packs/
                </p>
              )}
              {saveStatus === 'error' && (
                <p className="text-sm text-[var(--status-error-text)] text-center">
                  Save failed (dev server required)
                </p>
              )}
              <Button variant="success" onClick={handleDownloadPDF} fullWidth>
                Download All Cards (PDF)
              </Button>
            </div>
          )}
        </div>

        {/* Preview Column */}
        <div className="lg:col-span-5 xl:col-span-6">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Preview</h2>
              {previewCard && (
                <div className="flex items-center gap-2">
                  <select
                    value={previewCard.cardNumber}
                    onChange={e => {
                      const card = cards.find(c => c.cardNumber === parseInt(e.target.value));
                      if (card) setPreviewCard(card);
                    }}
                    className="input w-24"
                  >
                    {cards.map(card => (
                      <option key={card.id} value={card.cardNumber}>#{card.cardNumber}</option>
                    ))}
                  </select>
                  <Button variant="secondary" size="sm" onClick={() => previewCard && handleDownloadSinglePDF(previewCard)}>
                    Download
                  </Button>
                </div>
              )}
            </div>

            {previewCard ? (
              <div>
                <div className="text-center mb-4">
                  <span className="text-xl font-bold text-[var(--text-primary)]">Card #{previewCard.cardNumber}</span>
                </div>
                <div className="max-w-md mx-auto">
                  <BingoGrid slots={previewCard.slots} songMap={songMap} size="md" />
                </div>
              </div>
            ) : (
              <div className="text-center py-16 text-[var(--text-muted)]">
                Generate cards to see preview
              </div>
            )}
          </div>
        </div>

        {/* Pacing & Cards List Column */}
        <div className="lg:col-span-3 space-y-6">
          {pacingTable && (
            <div className="card">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Game Pacing</h3>
              <div className="space-y-2">
                {pacingTable.entries.map(entry => (
                  <div key={entry.groupSize} className="flex justify-between text-sm p-2 bg-[var(--bg-hover)] rounded">
                    <span className="text-[var(--text-secondary)]">{entry.groupSize} players</span>
                    <span className="text-[var(--text-primary)] font-medium">~{entry.expectedSongsToWin}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {cards.length > 0 && (
            <div className="card">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">All Cards ({cards.length})</h3>
              <div className="grid grid-cols-4 gap-1 max-h-64 overflow-y-auto">
                {cards.map(card => (
                  <button
                    key={card.id}
                    onClick={() => setPreviewCard(card)}
                    className={`p-1.5 rounded text-xs font-medium transition-colors ${
                      previewCard?.id === card.id
                        ? 'bg-[var(--accent-green)] text-white'
                        : 'bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:bg-[var(--bg-card)]'
                    }`}
                  >
                    {card.cardNumber}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
