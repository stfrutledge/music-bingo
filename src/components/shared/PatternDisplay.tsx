import type { BingoPattern } from '../../types';

interface PatternDisplayProps {
  pattern: BingoPattern;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  selected?: boolean;
  onClick?: () => void;
}

const sizeMap = {
  sm: 'w-12 h-12',
  md: 'w-20 h-20',
  lg: 'w-32 h-32',
};

const cellSizeMap = {
  sm: 'w-2 h-2',
  md: 'w-3 h-3',
  lg: 'w-5 h-5',
};

export function PatternDisplay({
  pattern,
  size = 'md',
  showLabel = true,
  selected = false,
  onClick,
}: PatternDisplayProps) {
  return (
    <div
      onClick={onClick}
      className={`
        flex flex-col items-center gap-1
        ${onClick ? 'cursor-pointer hover:opacity-80' : ''}
        ${selected ? 'ring-2 ring-[var(--accent-green)] ring-offset-2 ring-offset-[var(--ring-offset)] rounded-lg p-1' : ''}
      `}
    >
      <div
        className={`
          ${sizeMap[size]}
          grid grid-cols-5 gap-px
          bg-[var(--border-color)] p-0.5 rounded
        `}
      >
        {pattern.grid.flat().map((isActive, idx) => (
          <div
            key={idx}
            className={`
              ${cellSizeMap[size]}
              rounded-sm
              ${idx === 12 ? 'bg-[var(--accent-teal)]' : isActive ? 'bg-[var(--accent-green)]' : 'bg-[var(--bg-card)]'}
            `}
          />
        ))}
      </div>
      {showLabel && (
        <span className="text-xs text-[var(--text-secondary)] text-center">{pattern.name}</span>
      )}
    </div>
  );
}
