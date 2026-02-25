import type { BingoCard, Song } from '../../types';
import { BingoGrid } from '../shared/BingoGrid';

interface CardPreviewModalProps {
  card: BingoCard;
  songMap: Map<string, Song>;
  calledSongIds: Set<string>;
  onClose: () => void;
}

export function CardPreviewModal({
  card,
  songMap,
  calledSongIds,
  onClose,
}: CardPreviewModalProps) {
  // Count called songs on this card
  const calledCount = card.slots.filter(id => calledSongIds.has(id)).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-[var(--bg-card)] rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border-color)]">
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">
              Card #{card.cardNumber}
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              {calledCount} of 24 songs called
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Card Grid */}
        <div className="p-4">
          <BingoGrid
            slots={card.slots}
            songMap={songMap}
            calledSongIds={calledSongIds}
            size="md"
          />
        </div>

        {/* Legend */}
        <div className="px-4 pb-4 flex items-center gap-4 text-xs text-[var(--text-secondary)]">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-[var(--accent-teal)]" />
            <span>Called</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-[var(--bg-card)] border border-[var(--border-color)]" />
            <span>Not called</span>
          </div>
        </div>
      </div>
    </div>
  );
}
