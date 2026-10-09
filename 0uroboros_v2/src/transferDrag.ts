import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { TransferChoice as Transfer } from './runtime';

type Legs = Transfer['moves'][string];
export type TransferDrag = { from: number; over: number | null; x: number; y: number };
/** What the board and the dialog's diagram both draw: who glows, who is mid-drag, and the Power each would end on. */
export type TransferView = {
  nodes: number[]; sources: number[]; targets: number[]; from: number | null; over: number | null;
  delta: Record<number, number>; option: string | null; amount: number;
  begin: (event: ReactPointerEvent<HTMLElement>, node: number) => void;
};

const DRAG_THRESHOLD = 4;
const taken = (legs: Legs, from: number) => legs.reduce((sum, leg) => sum + (leg.from === from ? leg.amount : 0), 0);
const sourcesOf = (transfer: Transfer) => [...new Set(Object.values(transfer.moves).flatMap(legs => legs.map(leg => leg.from)))];
const targetsFrom = (transfer: Transfer, from: number) => [...new Set(Object.values(transfer.moves).flatMap(legs => legs.filter(leg => leg.from === from).map(leg => leg.to)))];
const optionFor = (transfer: Transfer, from: number, to: number) => Object.keys(transfer.moves).find(id => transfer.moves[id].some(leg => leg.from === from && leg.to === to)) ?? null;
function optionDelta(legs: Legs) {
  const delta: Record<number, number> = {};
  for (const leg of legs) { delta[leg.from] = (delta[leg.from] ?? 0) - leg.amount; delta[leg.to] = (delta[leg.to] ?? 0) + leg.amount; }
  return delta;
}

/** The drop target under the pointer. Inside the dialog only its diagram counts, so the board beneath it never catches a drop. */
function nodeAt(x: number, y: number) {
  const inside = (element: Element) => { const r = element.getBoundingClientRect(); return r.width > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; };
  const dialog = document.querySelector('.choice-dialog.has-transfer');
  const inDialog = !!dialog && inside(dialog);
  const hit = [...document.querySelectorAll<HTMLElement>('[data-transfer-node]')].find(element => inside(element) && !!element.closest('.choice-dialog') === inDialog);
  return hit ? Number(hit.dataset.transferNode) : null;
}

/** Drag Power from one highlighted location to a neighbour, on the board or in the diagram; a valid drop makes the choice. */
export function useTransferDrag(transfer: Transfer | undefined, choiceId: number | undefined, choose: (id: string) => void, hoverOption: string | null): { view: TransferView | null; drag: TransferDrag | null } {
  const [drag, setDrag] = useState<TransferDrag | null>(null);
  const latest = useRef({ transfer, choose, drag }); latest.current = { transfer, choose, drag };
  const pending = useRef<{ from: number; x: number; y: number; pointer: number } | null>(null);

  useEffect(() => { setDrag(null); pending.current = null; }, [choiceId, !!transfer]);
  useEffect(() => {
    const move = (event: PointerEvent) => {
      const { transfer, drag } = latest.current;
      if (!transfer) return;
      const start = pending.current;
      if (!drag && (!start || start.pointer !== event.pointerId || Math.hypot(event.clientX - start.x, event.clientY - start.y) < DRAG_THRESHOLD)) return;
      event.preventDefault();
      const from = drag?.from ?? start!.from;
      const node = nodeAt(event.clientX, event.clientY);
      const over = node !== null && targetsFrom(transfer, from).includes(node) ? node : null;
      setDrag({ from, over, x: event.clientX, y: event.clientY });
    };
    const finish = (commit: boolean) => {
      const { transfer, choose, drag } = latest.current;
      pending.current = null;
      if (!drag) return;
      setDrag(null);
      const id = commit && transfer && drag.over !== null ? optionFor(transfer, drag.from, drag.over) : null;
      if (id) choose(id);
    };
    const up = () => finish(true), cancel = () => finish(false);
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && latest.current.drag) { event.preventDefault(); finish(false); } };
    window.addEventListener('pointermove', move, { passive: false }); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel); window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel); window.removeEventListener('keydown', escape);
    };
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle('transfer-dragging', !!drag);
    return () => document.documentElement.classList.remove('transfer-dragging');
  }, [!!drag]);

  if (!transfer) return { view: null, drag: null };
  const sources = sourcesOf(transfer);
  const option = drag ? (drag.over !== null ? optionFor(transfer, drag.from, drag.over) : null) : hoverOption;
  const fromOptions = drag ? Object.values(transfer.moves).filter(legs => legs.some(leg => leg.from === drag.from)) : [];
  const amount = drag ? taken(option ? transfer.moves[option] : fromOptions[0] ?? [], drag.from) : 0;
  const delta = option ? optionDelta(transfer.moves[option]) : drag ? { [drag.from]: -amount } : {};
  return {
    drag,
    view: {
      nodes: transfer.nodes.map(entry => entry.node), sources, targets: drag ? targetsFrom(transfer, drag.from) : [],
      from: drag?.from ?? null, over: drag?.over ?? null, delta, option, amount,
      begin: (event, node) => {
        if (!event.isPrimary || event.button !== 0 || !sources.includes(node) || latest.current.drag) return;
        event.preventDefault();
        pending.current = { from: node, x: event.clientX, y: event.clientY, pointer: event.pointerId };
      },
    },
  };
}
