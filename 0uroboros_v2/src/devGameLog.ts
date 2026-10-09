import type { RuntimeEvent, RuntimeSession } from '@0uroboros/engine/runtime';

let sequence = 0;

/** Dev builds only: mirrors each game event plus the board, hands and banks to the local game log. */
export function logGameEvent(gameId: string | null, session: RuntimeSession | null, event: RuntimeEvent) {
  if (!import.meta.env.DEV || !gameId || !session) return;
  const { state } = session;
  const names = (cards: { name: string }[]) => cards.map(card => card.name);
  const entry = {
    seq: ++sequence, at: new Date().toISOString(), cycle: state.cycle, turn: state.turn, phase: state.phase, event,
    nodes: state.nodes.map(node => ({
      location: node.location?.name ?? null, powers: node.powers,
      cards: node.cards.map(side => side.map(placement => `${placement.card.name}${placement.revealed ? '' : ' (hidden)'}`)),
    })),
    players: state.players.map(player => ({
      actions: player.actions, wallet: player.wallet, hand: names(player.hand), bank: player.bank.map(entry => entry.card.name),
      discard: player.discard.length, draw: player.draw.length,
    })),
  };
  void fetch('/api/game-log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gameId, entry }) }).catch(() => undefined);
}
