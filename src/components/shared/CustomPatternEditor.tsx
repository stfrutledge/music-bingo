import { useEffect, useState } from 'react';
import type { BingoPattern } from '../../types';
import { createCustomPattern } from '../../lib/patterns';
import { Button } from './Button';

interface CustomPatternEditorProps {
  isOpen: boolean;
  onSave: (pattern: BingoPattern) => void;
  onCancel: () => void;
}

const CENTER = 12; // Free space — always lit, never editable

function emptyGrid(): boolean[][] {
  return Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => false));
}

export function CustomPatternEditor({ isOpen, onSave, onCancel }: CustomPatternEditorProps) {
  const [name, setName] = useState('');
  const [grid, setGrid] = useState<boolean[][]>(emptyGrid);

  // Reset whenever the editor is opened
  useEffect(() => {
    if (isOpen) {
      setName('');
      setGrid(emptyGrid());
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const toggleCell = (row: number, col: number) => {
    if (row === 2 && col === 2) return; // free space locked
    setGrid(prev => prev.map((r, ri) => r.map((c, ci) => (ri === row && ci === col ? !c : c))));
  };

  const selectedCount = grid.flat().filter(Boolean).length;

  const handleSave = () => {
    if (selectedCount === 0) return;
    onSave(createCustomPattern(name, grid));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="custom-pattern-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 dialog-backdrop"
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div className="relative bg-[var(--bg-card)] rounded-lg shadow-xl max-w-sm w-full dialog-content p-6">
        <h2 id="custom-pattern-title" className="text-lg font-bold text-[var(--text-primary)]">
          Create Custom Pattern
        </h2>
        <p className="text-sm text-[var(--text-secondary)] mt-1 mb-4">
          Tap squares to mark which must be filled to win. The center is a free space.
        </p>

        {/* Name */}
        <label className="block text-xs text-[var(--text-secondary)] mb-1" htmlFor="custom-pattern-name">
          Pattern name
        </label>
        <input
          id="custom-pattern-name"
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Diamond"
          maxLength={40}
          className="input w-full mb-5"
        />

        {/* Grid editor */}
        <div className="flex justify-center mb-2">
          <div className="grid grid-cols-5 gap-1.5 bg-[var(--border-color)] p-1.5 rounded-lg">
            {grid.flat().map((isActive, idx) => {
              const row = Math.floor(idx / 5);
              const col = idx % 5;
              const isCenter = idx === CENTER;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => toggleCell(row, col)}
                  disabled={isCenter}
                  aria-label={isCenter ? 'Free space' : `Square ${row + 1},${col + 1}`}
                  aria-pressed={isCenter || isActive}
                  className={`w-11 h-11 rounded-md transition-colors ${
                    isCenter
                      ? 'bg-[var(--accent-teal)] cursor-default'
                      : isActive
                      ? 'bg-[var(--accent-green)]'
                      : 'bg-[var(--bg-hover)] hover:bg-[var(--bg-card)] border border-[var(--border-color)]'
                  }`}
                >
                  {isCenter && (
                    <span className="text-[10px] font-semibold text-white">FREE</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between mb-5">
          <span className="text-xs text-[var(--text-muted)]">
            {selectedCount} square{selectedCount === 1 ? '' : 's'} selected
          </span>
          <button
            type="button"
            onClick={() => setGrid(emptyGrid())}
            className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline"
          >
            Clear
          </button>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={selectedCount === 0}>
            Save Pattern
          </Button>
        </div>
      </div>
    </div>
  );
}
