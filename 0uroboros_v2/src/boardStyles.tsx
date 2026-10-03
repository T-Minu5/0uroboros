import { createContext, useContext } from 'react';

export type BoardStyle = 'classic' | 'neon';
export const BOARD_STYLES = [{ id: 'neon', label: 'Neon' }, { id: 'classic', label: 'Classic' }] as const;
export const BOARD_STYLE_KEY = 'ouroboros.boardStyle';
export const DEFAULT_BOARD_STYLE: BoardStyle = 'classic';

export function loadBoardStyle(): BoardStyle {
  try { return localStorage.getItem(BOARD_STYLE_KEY) === 'neon' ? 'neon' : DEFAULT_BOARD_STYLE; }
  catch { return DEFAULT_BOARD_STYLE; }
}
export function saveBoardStyle(style: BoardStyle) {
  try { localStorage.setItem(BOARD_STYLE_KEY, style); } catch { /* Session-only when storage is unavailable. */ }
}
const BoardStyleContext = createContext<BoardStyle>(DEFAULT_BOARD_STYLE);
export const BoardStyleProvider = BoardStyleContext.Provider;
export const useBoardStyle = () => useContext(BoardStyleContext);

export function BoardStylePicker({ value, onChange }: { value: BoardStyle; onChange: (style: BoardStyle) => void }) {
  return <div className='lane-pattern-picker' role='radiogroup' aria-label='Board style'>
    <small>Board style</small><div>{BOARD_STYLES.map(option => <button key={option.id} type='button' role='radio' aria-checked={value === option.id} onClick={() => onChange(option.id)}>{option.label}</button>)}</div>
  </div>;
}
