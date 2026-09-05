/**
 * Client layer verification.
 *
 * Renders the real HUD from real game state to confirm that the presentation
 * layer reports what the rules actually say. The 3D board is stubbed because
 * WebGL is not available here; its job is spatial presentation, and every value
 * a player reads is rendered by the 2D layer tested below.
 */

import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../src/client/board/Board3D', () => ({
  Board3D: () => null,
}));

import { GameTable } from '../src/client/GameTable';
import { NodeHeaders } from '../src/client/hud/NodeHeaders';
import { ProbabilityStrip } from '../src/client/hud/ProbabilityStrip';
import { PlayerStatus } from '../src/client/hud/PlayerStatus';
import { CardFace } from '../src/client/hud/CardFace';
import {
  handView,
  marketView,
  nodeViews,
  statusView,
  definitionOf,
} from '../src/client/selectors';
import { addToHand, createHarness, openNodes, placeCardAtNode, setLocation } from './helpers';
import type { OuroborosState, PlayerID } from '../src/game/types';
import { CARD_DEFINITIONS } from '../src/game/content/cards';
import { damageDataCenter } from '../src/game/engine/dataCenters';
import { transferProbability } from '../src/game/engine/probability';
import { playerView } from '../src/game/playerView';

/** Render GameTable for one seat with a no-op move dispatcher. */
function renderTable(G: OuroborosState, viewer: PlayerID, phase: 'circuit' | 'draft'): string {
  const moves = new Proxy({}, { get: () => () => undefined }) as Record<string, () => void>;
  // The boardgame.io board props contract is far wider than what the table
  // reads, so only the fields the component actually uses are supplied.
  const props = {
    G,
    ctx: { phase, gameover: undefined },
    moves,
    playerID: viewer,
  } as unknown as Parameters<typeof GameTable>[0];

  return renderToStaticMarkup(<GameTable {...props} />);
}

describe('Node headers', () => {
  it('shows Power for both players and names the leader', () => {
    const { state } = createHarness();
    openNodes(state, [0]);
    placeCardAtNode(state, '0', 'monolith_core', 0, { revealed: true }); // 9 Power
    placeCardAtNode(state, '1', 'cipher_runner', 0, { revealed: true }); // 3 Power

    const html = renderToStaticMarkup(
      <NodeHeaders nodes={nodeViews(state, '0')} legalNodes={[]} />,
    );
    expect(html).toContain('>9<');
    expect(html).toContain('>3<');
    expect(html).toContain('You lead');
  });

  it('reports a tie rather than inventing a winner', () => {
    const { state } = createHarness();
    openNodes(state, [0]);
    placeCardAtNode(state, '0', 'cipher_runner', 0, { revealed: true });
    placeCardAtNode(state, '1', 'cipher_runner', 0, { revealed: true });

    const html = renderToStaticMarkup(
      <NodeHeaders nodes={nodeViews(state, '0')} legalNodes={[]} />,
    );
    expect(html).toContain('Tied');
  });

  it('hides the Location of a closed Node', () => {
    const { state } = createHarness();
    setLocation(state, 2, 'occult_archive');

    const html = renderToStaticMarkup(
      <NodeHeaders nodes={nodeViews(state, '0')} legalNodes={[]} />,
    );
    expect(html).toContain('Location hidden');
    expect(html).not.toContain('Occult archive');
  });

  it('reveals the Location once the Node opens', () => {
    const { state } = createHarness();
    setLocation(state, 0, 'occult_archive');
    openNodes(state, [0]);

    const html = renderToStaticMarkup(
      <NodeHeaders nodes={nodeViews(state, '0')} legalNodes={[]} />,
    );
    expect(html).toContain('Occult archive');
  });

  it('marks legal Nodes so legality is taught before the attempt', () => {
    const { state } = createHarness();
    const html = renderToStaticMarkup(
      <NodeHeaders nodes={nodeViews(state, '0')} legalNodes={[1, 3]} />,
    );
    const legalCount = html.split('data-legal="true"').length - 1;
    expect(legalCount).toBe(2);
  });
});

describe('Probability strip', () => {
  it('renders the distribution at the configured precision', () => {
    const { state, config } = createHarness();
    transferProbability(state, 0, 4, 0.5, config);

    const html = renderToStaticMarkup(<ProbabilityStrip nodes={nodeViews(state, '0')} />);
    // 29.5% keeps its half point while whole numbers stay whole.
    expect(html).toContain('29.5%');
    expect(html).toContain('25%');
  });

  it('marks the Collapse selection as its own beat', () => {
    const { state } = createHarness();
    state.collapseSelectedNode = 3;

    const html = renderToStaticMarkup(<ProbabilityStrip nodes={nodeViews(state, '0')} />);
    expect(html).toContain('Selected');
  });
});

describe('Player status', () => {
  it('renders both Data Centers separately', () => {
    const { state } = createHarness();
    const html = renderToStaticMarkup(
      <PlayerStatus status={statusView(state, '0')} side="local" label="You" showWallet={false} />,
    );
    expect(html).toContain('Primary DC');
    expect(html).toContain('Backup DC');
    expect(html).toContain('2000/2000');
    expect(html).toContain('1500/1500');
  });

  it('marks a destroyed Data Center without merging the pools', () => {
    const { state, config } = createHarness();
    damageDataCenter(state, '0', 2000, config);

    const html = renderToStaticMarkup(
      <PlayerStatus status={statusView(state, '0')} side="local" label="You" showWallet={false} />,
    );
    expect(html).toContain('Primary DC down');
    // The Backup pool is untouched, because damage does not spill.
    expect(html).toContain('1500/1500');
  });

  it('shows the Wallet only during Draft', () => {
    const { state } = createHarness();
    state.players['0'].wallet = 6;

    const hidden = renderToStaticMarkup(
      <PlayerStatus status={statusView(state, '0')} side="local" label="You" showWallet={false} />,
    );
    const shown = renderToStaticMarkup(
      <PlayerStatus status={statusView(state, '0')} side="local" label="You" showWallet />,
    );
    expect(hidden).not.toContain('Wallet');
    expect(shown).toContain('Wallet');
  });

  it('shows reveal priority so players can predict reveal order', () => {
    const { state } = createHarness();
    state.revealPriority = '0';

    expect(
      renderToStaticMarkup(
        <PlayerStatus status={statusView(state, '0')} side="local" label="You" showWallet={false} />,
      ),
    ).toContain('Reveal priority');
    expect(
      renderToStaticMarkup(
        <PlayerStatus status={statusView(state, '1')} side="rival" label="Them" showWallet={false} />,
      ),
    ).toContain('Second to reveal');
  });
});

describe('Card presentation', () => {
  it('shows name, type, and rules text', () => {
    const html = renderToStaticMarkup(
      <CardFace definition={CARD_DEFINITIONS.echo_analyst} />,
    );
    expect(html).toContain('Echo analyst');
    expect(html).toContain('Character');
    expect(html).toContain('On reveal, gain 2 Power.');
  });

  it('renders live Power including modifiers', () => {
    const { state } = createHarness();
    const id = placeCardAtNode(state, '0', 'cipher_runner', 0);
    state.cards[id].powerMods = 4;

    const html = renderToStaticMarkup(
      <CardFace definition={definitionOf(state.cards[id])} card={state.cards[id]} />,
    );
    // Base 3 plus 4 modifiers reads as 7.
    expect(html).toContain('>7<');
  });

  it('marks a Duration card as such', () => {
    const html = renderToStaticMarkup(<CardFace definition={CARD_DEFINITIONS.serpent_loop} />);
    expect(html).toContain('Duration');
  });

  it('renders the unplayable state with a reason', () => {
    const html = renderToStaticMarkup(
      <CardFace
        definition={CARD_DEFINITIONS.crypto_shard}
        playable={false}
        blockedReason="Not played at Nodes"
      />,
    );
    expect(html).toContain('data-playable="false"');
    expect(html).toContain('Not played at Nodes');
  });
});

describe('Hand deployability', () => {
  it('marks Crypto cards as never deployable at Nodes', () => {
    const { state } = createHarness();
    addToHand(state, '0', 'crypto_shard');

    const [entry] = handView(state, '0', true);
    expect(entry.legalNodes).toEqual([]);
    expect(entry.blockedReason).toBe('Not played at Nodes');
  });

  it('lists legal Nodes for a deployable card', () => {
    const { state } = createHarness();
    addToHand(state, '0', 'cipher_runner');
    state.nodes[1].state = 'collapsed';

    const [entry] = handView(state, '0', true);
    expect(entry.legalNodes).toEqual([0, 2, 3, 4]);
    expect(entry.blockedReason).toBeNull();
  });

  it('blocks the whole hand once the window is closed', () => {
    const { state } = createHarness();
    addToHand(state, '0', 'cipher_runner');

    const [entry] = handView(state, '0', false);
    expect(entry.blockedReason).toBe('Window closed');
  });
});

describe('Market view', () => {
  it('reports affordability against the Wallet', () => {
    const { state } = createHarness();
    state.players['0'].wallet = 3;

    const view = marketView(state, '0');
    const cheap = view.find((slot) => slot.definition.cost <= 3);
    const dear = view.find((slot) => slot.definition.cost > 3);
    expect(cheap?.blockedReason).toBeNull();
    expect(dear?.blockedReason).toBe('Not enough Crypto');
  });

  it('reports a sold-out slot', () => {
    const { state } = createHarness();
    state.players['0'].wallet = 99;
    state.market.base[0].supply = 0;

    const view = marketView(state, '0');
    const sold = view.find((slot) => slot.category === 'base' && slot.slotIndex === 0);
    expect(sold?.blockedReason).toBe('Sold out');
  });
});

describe('Full table render', () => {
  it('renders the Circuit view with clock, probability, banks, and hand', () => {
    const { state } = createHarness();
    openNodes(state, [0]);
    addToHand(state, '0', 'cipher_runner');
    addToHand(state, '0', 'crypto_shard');
    state.phase = 'circuitDeploy';

    const html = renderTable(state, '0', 'circuit');
    expect(html).toContain('Cycle 1');
    expect(html).toContain('Deploy');
    expect(html).toContain('Window 1 of 5');
    expect(html).toContain('Your bank');
    expect(html).toContain('Opponent bank');
    expect(html).toContain('Player 0 (you)');
    expect(html).toContain('Cipher runner');
    // The Crypto card is present but explicitly unplayable.
    expect(html).toContain('Not played at Nodes');
  });

  it('renders the Draft view with market and Circuit Reward', () => {
    const { state } = createHarness();
    state.phase = 'draft';
    state.players['0'].wallet = 8;
    state.market.circuitReward = {
      rewardId: 'serpent_crown',
      eligible: ['0'],
      claimed: [],
    };

    const html = renderTable(state, '0', 'draft');
    expect(html).toContain('Draft');
    expect(html).toContain('Circuit Reward');
    expect(html).toContain('Serpent crown');
    expect(html).toContain('Base offerings');
    expect(html).toContain('Chaos offerings');
    expect(html).toContain('Claim');
  });

  it('does not leak opponent hand contents into the seat markup', () => {
    const { state } = createHarness();
    // Give the opponent a distinctive card, then apply the server-side filter.
    addToHand(state, '1', 'monolith_core');

    const filtered = playerView(state, '0');

    const html = renderTable(filtered, '0', 'circuit');
    expect(html).not.toContain('Monolith core');
  });
});
