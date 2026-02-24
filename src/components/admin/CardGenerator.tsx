import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Playlist, BingoCard } from '../../types';
import { getPlaylist, getCardsForPlaylist, saveCards, deleteCardsForPlaylist } from '../../lib/db';
import { generateCards } from '../../lib/cardGenerator';
import { generateCardsPDF, downloadPDF } from '../../lib/pdfGenerator';
import { Button } from '../shared/Button';
import { BingoGrid } from '../shared/BingoGrid';

export function CardGenerator() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [cards, setCards] = useState<BingoCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [stats, setStats] = useState<{
    minAppearances: number;
    maxAppearances: number;
    maxOverlap: number;
    avgOverlap: number;
  } | null>(null);

  const [cardCount, setCardCount] = useState(60);
  const [maxOverlap, setMaxOverlap] = useState(18);
  const [previewCard, setPreviewCard] = useState<BingoCard | null>(null);

  useEffect(() => {
    if (id) {
      loadData(id);
    }
  }, [id]);

  const loadData = async (playlistId: string) => {
    setLoading(true);
    const [playlistData, cardsData] = await Promise.all([
      getPlaylist(playlistId),
      getCardsForPlaylist(playlistId),
    ]);

    if (playlistData) {
      setPlaylist(playlistData);
      setCards(cardsData);
      if (cardsData.length > 0) {
        setPreviewCard(cardsData[0]);
      }
    }
    setLoading(false);
  };

  const handleGenerate = async () => {
    if (!playlist) return;

    setGenerating(true);

    // Delete existing cards first
    await deleteCardsForPlaylist(playlist.id);

    // Generate new cards
    const { cards: newCards, stats: newStats } = generateCards(playlist, {
      cardCount,
      maxOverlap,
    });

    await saveCards(newCards);

    setCards(newCards);
    setStats({
      minAppearances: newStats.minAppearances,
      maxAppearances: newStats.maxAppearances,
      maxOverlap: newStats.maxOverlap,
      avgOverlap: newStats.avgOverlap,
    });
    setPreviewCard(newCards[0]);
    setGenerating(false);
  };

  const handleDownloadPDF = () => {
    if (!playlist || cards.length === 0) return;

    const pdf = generateCardsPDF(cards, playlist);
    downloadPDF(pdf, `${playlist.name.toLowerCase().replace(/\s+/g, '-')}-cards.pdf`);
  };

  const handleDownloadSinglePDF = (card: BingoCard) => {
    if (!playlist) return;

    const pdf = generateCardsPDF([card], playlist);
    downloadPDF(pdf, `card-${card.cardNumber}.pdf`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-navy-950 p-4 flex items-center justify-center">
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }

  if (!playlist) {
    return (
      <div className="min-h-screen bg-navy-950 p-4 flex items-center justify-center">
        <div className="text-red-400">Playlist not found</div>
      </div>
    );
  }

  const songMap = new Map(playlist.songs.map(s => [s.id, s]));

  return (
    <div className="min-h-screen bg-navy-950 p-4">
      <div className="max-w-6xl mx-auto">
        <header className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Card Generator</h1>
            <p className="text-slate-400">{playlist.name}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin')}>
            Back to Admin
          </Button>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Settings Panel */}
          <div className="card">
            <h2 className="text-lg font-semibold text-white mb-4">Generation Settings</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">
                  Number of Cards
                </label>
                <input
                  type="number"
                  value={cardCount}
                  onChange={e => setCardCount(Math.max(1, parseInt(e.target.value) || 1))}
                  className="input w-32"
                  min="1"
                  max="200"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">
                  Maximum Overlap Between Cards
                </label>
                <input
                  type="number"
                  value={maxOverlap}
                  onChange={e => setMaxOverlap(Math.max(1, parseInt(e.target.value) || 1))}
                  className="input w-32"
                  min="1"
                  max="23"
                />
                <p className="text-xs text-slate-500 mt-1">
                  No two cards will share more than this many songs
                </p>
              </div>

              <div className="pt-4">
                <Button
                  variant="primary"
                  onClick={handleGenerate}
                  disabled={generating}
                  fullWidth
                >
                  {generating ? 'Generating...' : `Generate ${cardCount} Cards`}
                </Button>
              </div>
            </div>

            {stats && (
              <div className="mt-6 p-4 bg-navy-800 rounded-lg">
                <h3 className="text-sm font-semibold text-white mb-2">Generation Stats</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-slate-400">Song appearances:</div>
                  <div className="text-white">
                    {stats.minAppearances} - {stats.maxAppearances}
                  </div>
                  <div className="text-slate-400">Max overlap:</div>
                  <div className="text-white">{stats.maxOverlap} songs</div>
                  <div className="text-slate-400">Avg overlap:</div>
                  <div className="text-white">{stats.avgOverlap.toFixed(1)} songs</div>
                </div>
              </div>
            )}

            {cards.length > 0 && (
              <div className="mt-6">
                <Button
                  variant="success"
                  onClick={handleDownloadPDF}
                  fullWidth
                >
                  Download All {cards.length} Cards (PDF)
                </Button>
              </div>
            )}
          </div>

          {/* Preview Panel */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Card Preview</h2>
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
                      <option key={card.id} value={card.cardNumber}>
                        #{card.cardNumber}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => previewCard && handleDownloadSinglePDF(previewCard)}
                  >
                    Download
                  </Button>
                </div>
              )}
            </div>

            {previewCard ? (
              <div>
                <div className="text-center mb-2">
                  <span className="text-lg font-bold text-white">
                    Card #{previewCard.cardNumber}
                  </span>
                </div>
                <BingoGrid
                  slots={previewCard.slots}
                  songMap={songMap}
                  size="md"
                />
              </div>
            ) : (
              <div className="text-center py-12 text-slate-400">
                Generate cards to see preview
              </div>
            )}
          </div>
        </div>

        {/* Cards List */}
        {cards.length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold text-white mb-4">
              All Cards ({cards.length})
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
              {cards.map(card => (
                <div
                  key={card.id}
                  onClick={() => setPreviewCard(card)}
                  className={`
                    p-2 rounded-lg cursor-pointer transition-colors
                    ${previewCard?.id === card.id ? 'bg-indigo-600' : 'bg-navy-800 hover:bg-navy-700'}
                  `}
                >
                  <div className="text-center text-white font-medium">
                    #{card.cardNumber}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
