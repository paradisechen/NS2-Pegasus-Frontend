/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Delete, Globe, X } from 'lucide-react';
import type { AdaptivePalette } from '../types/skyline';
import type { Switch2LayoutMetrics } from '../utils/rp5Layout';

interface SwitchKeyboardModalProps {
  title: string;
  initialValue: string;
  palette: AdaptivePalette;
  metrics: Switch2LayoutMetrics;
  onConfirm: (val: string) => void;
  onClose: () => void;
}

const ROW_1 = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
const ROW_2 = ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'];
const ROW_3 = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'];
const ROW_4 = ['z', 'x', 'c', 'v', 'b', 'n', 'm'];

export function SwitchKeyboardModal({
  title,
  initialValue,
  palette,
  metrics,
  onConfirm,
  onClose,
}: SwitchKeyboardModalProps) {
  const [value, setValue] = useState(initialValue);
  const [uppercase, setUppercase] = useState(false);
  const [symbols, setSymbols] = useState(false);

  const handleKey = (ch: string) => {
    const formatted = uppercase ? ch.toUpperCase() : ch;
    setValue((v) => v + formatted);
  };

  const handleBackspace = () => {
    setValue((v) => v.slice(0, -1));
  };

  const currentRows = symbols
    ? [['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'], ['@', '#', '$', '_', '&', '-', '+', '(', ')', '/'], ['*', '"', "'", ':', ';', '!', '?', ',', '.']]
    : [ROW_1, ROW_2, ROW_3, ROW_4];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid="switch-keyboard-modal"
      className="animate-ns2-fade absolute inset-0 z-50 bg-black/85 flex flex-col items-center justify-end p-6 select-none"
    >
      <div
        className="w-full max-w-3xl rounded-2xl p-5 flex flex-col gap-4 shadow-2xl"
        style={{
          backgroundColor: palette.overlaySheetBg || '#1E212A',
          border: `2px solid ${palette.borderPrimary}`,
          color: palette.overlayText || '#FFFFFF',
        }}
      >
        <div className="flex items-center justify-between">
          <div className="font-ud-bold text-base">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full hover:bg-white/10 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="relative flex items-center">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            className="w-full px-4 py-3 rounded-xl text-lg font-mono-tabular bg-black/40 border border-white/20 text-white focus:outline-none focus:border-[#4FD1FF]"
          />
          {value && (
            <button
              type="button"
              onClick={() => setValue('')}
              className="absolute right-3 px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-xs font-ud-bold"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex flex-col gap-2 pt-1">
          {currentRows.map((row, rIdx) => (
            <div key={rIdx} className="flex items-center justify-center gap-1.5">
              {row.map((ch) => {
                const label = uppercase && !symbols ? ch.toUpperCase() : ch;
                return (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => handleKey(ch)}
                    className="flex-1 py-3 rounded-lg bg-white/10 hover:bg-white/20 active:bg-white/30 text-base font-ud-bold text-white cursor-pointer shadow-sm transition-transform active:scale-95"
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          ))}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => setUppercase((u) => !u)}
              className="px-4 py-3 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-ud-bold text-white cursor-pointer"
            >
              {uppercase ? 'ABC' : 'abc'}
            </button>
            <button
              type="button"
              onClick={() => setSymbols((s) => !s)}
              className="px-4 py-3 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-ud-bold text-white cursor-pointer flex items-center gap-1"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{symbols ? 'ABC' : '123!?'}</span>
            </button>
            <button
              type="button"
              onClick={() => handleKey(' ')}
              className="flex-1 py-3 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-ud-bold text-white cursor-pointer"
            >
              SPACE
            </button>
            <button
              type="button"
              onClick={handleBackspace}
              className="px-5 py-3 rounded-lg bg-white/15 hover:bg-white/25 text-white cursor-pointer flex items-center justify-center"
            >
              <Delete className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onConfirm(value)}
              className="px-7 py-3 rounded-lg font-ud-bold text-white cursor-pointer"
              style={{ backgroundColor: palette.borderPrimary || '#E60012' }}
            >
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
