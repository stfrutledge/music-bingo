import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Playlist, BingoCard, GenerationStats, PacingTable } from '../../types';
import { getPlaylist, getCardsForPlaylist, saveCards, deleteCardsForPlaylist, savePacingTable, getPacingTable } from '../../lib/db';
import { generateCards } from '../../lib/cardGenerator';
import { generateCardsPDF, downloadPDF } from '../../lib/pdfGenerator';
import { Button } from '../shared/Button';
import { BingoGrid } from '../shared/BingoGrid';
import { AppShell } from '../shared/AppShell';

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

  useEffect(() => {
    if (id) loadData(id);
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
    if (!playlist || cards.length === 0 || !pacingTable) return;
    setSaving(true);
    setSaveStatus('idle');

    try {
      // Save cards via dev API
      const response = await fetch('/api/save-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playlistId: playlist.id,
          cards,
          pacingTable,
        }),
      });

      if (response.ok) {
        setSaveStatus('success');
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

          {cards.length > 0 && (
            <div className="space-y-3">
              <Button
                variant="primary"
                onClick={handleSaveCards}
                disabled={saving || !pacingTable}
                fullWidth
              >
                {saving ? 'Saving...' : 'Save Cards for Deployment'}
              </Button>
              {saveStatus === 'success' && (
                <p className="text-sm text-[var(--status-success-text)] text-center">
                  Saved to public/packs/{playlist?.id}/
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
