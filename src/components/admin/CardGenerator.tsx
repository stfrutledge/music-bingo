import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Playlist, BingoCard, GenerationStats, PacingTable } from '../../types';
import { getPlaylist, getCardsForPlaylist, saveCards, deleteCardsForPlaylist, savePacingTable, getPacingTable } from '../../lib/db';
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
  const [stats, setStats] = useState<GenerationStats | null>(null);
  const [pacingTable, setPacingTable] = useState<PacingTable | null>(null);

  // Generation settings - just card count now
  const [cardCount, setCardCount] = useState(80);

  const [previewCard, setPreviewCard] = useState<BingoCard | null>(null);

  useEffect(() => {
    if (id) {
      loadData(id);
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
      if (pacingData) {
        setPacingTable(pacingData);
      }
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

    // Generate new cards with pacing table
    const { cards: newCards, stats: newStats, pacingTable: newPacingTable } = generateCards(playlist, {
      cardCount,
    });

    await saveCards(newCards);
    await savePacingTable(newPacingTable);

    setCards(newCards);
    setStats(newStats);
    setPacingTable(newPacingTable);
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
                <p className="text-xs text-slate-500 mt-1">
                  Generate enough for your max expected attendance
                </p>
              </div>

              {/* Playlist size guidance */}
              <div className="p-3 bg-navy-800 rounded-lg space-y-2">
                <div className="text-sm">
                  <span className="text-slate-400">Playlist: </span>
                  <span className="text-white font-medium">{playlist.songs.length} songs</span>
                  <span className="text-slate-400"> → </span>
                  <span className="text-white">{Math.round((24 / playlist.songs.length) * 100)}% coverage per card</span>
                </div>
                {playlist.songs.length >= 48 && playlist.songs.length <= 55 && (
                  <p className="text-xs text-green-400">Optimal range for ~12-16 songs to first winner</p>
                )}
                {playlist.songs.length < 48 && (
                  <p className="text-xs text-yellow-400">Fast games (~8-12 songs to winner)</p>
                )}
                {playlist.songs.length > 55 && playlist.songs.length <= 65 && (
                  <p className="text-xs text-yellow-400">Slower games (~16-22 songs to winner)</p>
                )}
                {playlist.songs.length > 65 && (
                  <p className="text-xs text-red-400">Warning: Games may run long. Consider trimming to 50-55 songs.</p>
                )}
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
                  <div className="text-slate-400">Cards generated:</div>
                  <div className="text-white">{stats.totalCards}</div>
                  <div className="text-slate-400">Songs used:</div>
                  <div className="text-white">{stats.songDistribution.size}</div>
                  <div className="text-slate-400">Song appearances:</div>
                  <div className="text-white">
                    {stats.minAppearances} - {stats.maxAppearances}
                  </div>
                </div>
              </div>
            )}

            {pacingTable && (
              <div className="mt-4 p-4 bg-navy-800 rounded-lg">
                <h3 className="text-sm font-semibold text-white mb-2">Expected Game Length</h3>
                <p className="text-xs text-slate-400 mb-3">
                  Songs until first winner (based on group size)
                </p>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  {pacingTable.entries.map(entry => (
                    <div key={entry.groupSize} className="bg-navy-700 rounded p-2 text-center">
                      <div className="text-slate-400 text-xs">{entry.groupSize} players</div>
                      <div className="text-white font-medium">
                        ~{entry.expectedSongsToWin} songs
                      </div>
                      {entry.excludeCount > 0 && (
                        <div className="text-xs text-yellow-400">
                          ({entry.excludeCount} excluded)
                        </div>
                      )}
                    </div>
                  ))}
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
