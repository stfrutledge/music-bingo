import type { Song } from '../../types';

interface BingoGridProps {
  slots: string[];
  songMap: Map<string, Song>;
  calledSongIds?: Set<string>;
  highlightedSlots?: number[];
  patternSlots?: number[];
  size?: 'sm' | 'md' | 'lg';
  onCellClick?: (slotIndex: number) => void;
}

const sizeClasses = {
  sm: 'text-[8px] p-0.5',
  md: 'text-xs p-1',
  lg: 'text-sm p-2',
};

export function BingoGrid({
  slots,
  songMap,
  calledSongIds = new Set(),
  highlightedSlots = [],
  patternSlots = [],
  size = 'md',
  onCellClick,
}: BingoGridProps) {
  const highlightSet = new Set(highlightedSlots);
  const patternSet = new Set(patternSlots);

  return (
    <div className="grid grid-cols-5 gap-0.5 bg-navy-600 p-0.5 rounded-lg">
      {Array.from({ length: 25 }).map((_, gridIndex) => {
        const isFreeSpace = gridIndex === 12;
        const slotIndex = gridIndex > 12 ? gridIndex - 1 : gridIndex;

        if (isFreeSpace) {
          return (
            <div
              key={gridIndex}
              className={`
                flex items-center justify-center
                bg-indigo-600 rounded
                aspect-square
                ${sizeClasses[size]}
              `}
            >
              <span className="font-bold text-white">FREE</span>
            </div>
          );
        }

        const songId = slots[slotIndex];
        const song = songMap.get(songId);
        const isCalled = calledSongIds.has(songId);
        const isHighlighted = highlightSet.has(slotIndex);
        const isPatternCell = patternSet.has(slotIndex);

        let bgClass = 'bg-navy-800';
        if (isHighlighted) {
          bgClass = 'bg-green-600';
        } else if (isCalled) {
          bgClass = 'bg-indigo-600';
        }

        return (
          <div
            key={gridIndex}
            onClick={() => onCellClick?.(slotIndex)}
            className={`
              flex flex-col items-center justify-center
              ${bgClass}
              ${isPatternCell && !isCalled ? 'ring-2 ring-yellow-400 ring-inset' : ''}
              rounded aspect-square overflow-hidden
              ${sizeClasses[size]}
              ${onCellClick ? 'cursor-pointer hover:opacity-80' : ''}
            `}
          >
            {song && (
              <>
                <span className="font-medium text-white text-center leading-tight line-clamp-2">
                  {song.title}
                </span>
                <span className="text-slate-400 text-center leading-tight line-clamp-1 mt-0.5">
                  {song.artist}
                </span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
