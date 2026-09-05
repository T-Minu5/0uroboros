/**
 * 0uroboros boardgame.io game definition.
 *
 * The documented state machine in 05_TECHNICAL_REQUIREMENTS.md section 19 has
 * more states than there are boardgame.io phases here, because a boardgame.io
 * phase represents a window in which moves are legal. States that accept no
 * player input (Location setup, Start of Cycle, draw, Wave Collapse, cleanup)
 * run inside the surrounding phase hooks and are recorded on `G.phase` so the
 * debug panel and presentation layer still see every documented state.
 *
 * Two move-accepting phases exist:
 *   circuit -> deployment windows and reveals
 *   draft   -> simultaneous purchasing
 *
 * Runtime and Short-Circuit share this structure entirely. They differ only in
 * how many deployment windows run and when Nodes open, which is configuration
 * rather than a separate rules path.
 */

import { INVALID_MOVE, Stage } from 'boardgame.io/core';
import type { Ctx, Game, Move } from 'boardgame.io';

import type { NodeIndex, OuroborosState, PlayerID } from './types';
import { DEFAULT_CONFIG, type OuroborosConfig } from './config/defaults';
import { fromBoardgameRandom, type RandomAPI } from './engine/random';
import {
  beginDraft,
  beginNextCycle,
  createInitialState,
  drawHands,
  postCollapseCleanup,
  setupLocations,
  startOfCycle,
} from './engine/cycle';
import { canDeploy, deploy, revealCard } from './engine/deploy';
import { buildRevealQueue } from './engine/reveal';
import { nextRevealPriority } from './engine/power';
import { runWaveCollapse } from './engine/collapse';
import {
  claimCircuitReward,
  endDraft,
  hasLegalDraftAction,
  purchase,
  type MarketCategory,
} from './engine/draft';
import { isEliminated } from './engine/dataCenters';
import { finalResult } from './engine/scoring';
import { playerView } from './playerView';
import { addLog } from './engine/log';

/**
 * Active configuration.
 *
 * Module-level state is acceptable in Phase 1 because a Local match hosts one
 * game. Moving to a dedicated server means threading config through setupData
 * per match, which is an additive change.
 */
let activeConfig: OuroborosConfig = DEFAULT_CONFIG;

export function setActiveConfig(config: OuroborosConfig): void {
  activeConfig = config;
}

export function getActiveConfig(): OuroborosConfig {
  return activeConfig;
}

/** boardgame.io plugin bundle available inside moves and hooks. */
interface GameArgs {
  G: OuroborosState;
  ctx: Ctx;
  random: {
    Die: (spotvalue: number) => number;
    Number: () => number;
    Shuffle: <T>(deck: T[]) => T[];
  };
  playerID?: string;
}

function rng(args: GameArgs): RandomAPI {
  return fromBoardgameRandom(args.random);
}

/** Total deployment windows in a Cycle. Short-Circuit uses a single window. */
function totalWindows(G: OuroborosState): number {
  return G.mode === 'shortCircuit' ? 1 : activeConfig.nodeCount;
}

function bothEndedTurn(G: OuroborosState): boolean {
  return G.players['0'].endedTurn && G.players['1'].endedTurn;
}

function bothEndedDraft(G: OuroborosState): boolean {
  return G.players['0'].endedDraft && G.players['1'].endedDraft;
}

function resetEndedTurn(G: OuroborosState): void {
  G.players['0'].endedTurn = false;
  G.players['1'].endedTurn = false;
}

// --- Moves ---

/** Deploy a card from hand to a Node during a deployment window. */
const deployCard: Move<OuroborosState> = (args, instanceId: string, nodeIndex: NodeIndex) => {
  const gameArgs = args as unknown as GameArgs;
  const { G, playerID } = gameArgs;
  if (!playerID) return INVALID_MOVE;
  const player = playerID as PlayerID;

  // A player who has closed their window may not keep deploying.
  if (G.players[player].endedTurn) return INVALID_MOVE;
  if (!canDeploy(G, player, instanceId, nodeIndex, activeConfig).ok) return INVALID_MOVE;

  deploy(G, player, instanceId, nodeIndex, activeConfig, rng(gameArgs));
};

/** End the deployment window early for this player. */
const endDeployment: Move<OuroborosState> = (args) => {
  const { G, playerID } = args as unknown as GameArgs;
  if (!playerID) return INVALID_MOVE;
  const player = playerID as PlayerID;
  if (G.players[player].endedTurn) return INVALID_MOVE;

  G.players[player].endedTurn = true;
  addLog(G, 'phase', `Player ${player} ended their deployment window.`);
};

/** Purchase a card from the Draft market. */
const draftBuy: Move<OuroborosState> = (
  args,
  category: MarketCategory,
  slotIndex: number,
) => {
  const gameArgs = args as unknown as GameArgs;
  const { G, playerID } = gameArgs;
  if (!playerID) return INVALID_MOVE;
  const player = playerID as PlayerID;
  if (G.players[player].endedDraft) return INVALID_MOVE;

  // Ordering and cooldown use a server-derived clock, never a client timestamp.
  const now = G.logSeq * activeConfig.repeatPurchaseCooldownMs;
  const result = purchase(G, player, category, slotIndex, activeConfig, rng(gameArgs), now);
  if (!result.ok) return INVALID_MOVE;
};

/** Claim the privileged Circuit Reward offering. */
const claimReward: Move<OuroborosState> = (args) => {
  const gameArgs = args as unknown as GameArgs;
  const { G, playerID } = gameArgs;
  if (!playerID) return INVALID_MOVE;
  const result = claimCircuitReward(
    G,
    playerID as PlayerID,
    activeConfig,
    rng(gameArgs),
  );
  if (!result.ok) return INVALID_MOVE;
};

const endDraftMove: Move<OuroborosState> = (args) => {
  const { G, playerID } = args as unknown as GameArgs;
  if (!playerID) return INVALID_MOVE;
  const player = playerID as PlayerID;
  if (G.players[player].endedDraft) return INVALID_MOVE;

  G.players[player].endedDraft = true;
  addLog(G, 'draft', `Player ${player} ended Draft.`);
};

/**
 * Undo End Draft.
 * Allowed while the opponent has not ended and this player still has at least
 * one valid Draft action available.
 */
const undoEndDraft: Move<OuroborosState> = (args) => {
  const { G, playerID } = args as unknown as GameArgs;
  if (!playerID) return INVALID_MOVE;
  const player = playerID as PlayerID;
  const opponent: PlayerID = player === '0' ? '1' : '0';

  if (!G.players[player].endedDraft) return INVALID_MOVE;
  if (G.players[opponent].endedDraft) return INVALID_MOVE;
  if (!hasLegalDraftAction(G, player)) return INVALID_MOVE;

  G.players[player].endedDraft = false;
  addLog(G, 'draft', `Player ${player} resumed Draft.`);
};

const concede: Move<OuroborosState> = (args) => {
  const { G, playerID } = args as unknown as GameArgs;
  if (!playerID) return INVALID_MOVE;
  const player = playerID as PlayerID;

  G.players[player].conceded = true;
  G.gameOverReason = 'concession';
  addLog(G, 'system', `Player ${player} conceded.`);
};

// --- Cycle hooks ---

/**
 * Everything from NEW_CYCLE through the first Node opening.
 * These states accept no player input, so they run as one hook.
 */
function beginCycle(G: OuroborosState, random: RandomAPI): void {
  G.phase = 'locationSetup';
  setupLocations(G, random);

  G.phase = 'startCycleEffects';
  startOfCycle(G, activeConfig, random);

  G.phase = 'drawHand';
  drawHands(G, activeConfig, random);

  G.turn = 0;
  G.windowsCompleted = 0;
  resetEndedTurn(G);

  if (G.mode === 'shortCircuit') {
    // All Locations reveal at once and a single deployment window runs.
    G.nodes.forEach((node) => {
      node.state = 'open';
    });
    G.phase = 'shortCircuitDeploy';
    addLog(G, 'phase', 'Short-Circuit deployment window opens with all Nodes revealed.');
    return;
  }

  G.nodes[0].state = 'open';
  G.phase = 'circuitDeploy';
  addLog(G, 'phase', 'Node 1 opens.');
}

/**
 * Close a deployment window.
 *
 * Two reveal moments exist. First, cards at already-open Nodes reveal once the
 * window closes. Then the next Node opens and any cards previously committed
 * there reveal as its opening sequence, before the next deployment window. That
 * second pass is why a card committed to Node 4 on turn 3 reveals when Node 4
 * opens rather than waiting for turn 4 to finish.
 */
function closeWindow(G: OuroborosState, random: RandomAPI): void {
  G.phase = 'reveal';
  const windowReveals = runRevealSequence(G, random);

  // Next-window reveal priority follows controlled probability weight, and is
  // fixed once per turn rather than recalculated after each reveal.
  G.revealPriority = nextRevealPriority(G);
  G.windowsCompleted += 1;
  resetEndedTurn(G);

  let openingReveals: string[] = [];
  if (G.windowsCompleted < totalWindows(G)) {
    G.turn = G.windowsCompleted;
    const opening = G.nodes[G.turn];
    if (opening) {
      opening.state = 'open';
      addLog(G, 'phase', `Node ${G.turn + 1} opens.`);
      // Opening reveal sequence for cards already committed to this Node.
      openingReveals = runRevealSequence(G, random);
    }
    G.phase = 'circuitDeploy';
  }

  // One chronological queue for the client. Window-close reveals play first,
  // then the newly opened Node's waiting cards, never in parallel.
  const sequence = [...windowReveals, ...openingReveals];
  if (sequence.length > 0) {
    G.revealQueue = sequence;
    G.revealSerial += 1;
  }
}

/** Reveal every currently eligible card. Returns the order they resolved. */
function runRevealSequence(G: OuroborosState, random: RandomAPI): string[] {
  const queue = buildRevealQueue(G);
  for (const instanceId of queue) {
    revealCard(G, instanceId, activeConfig, random);
  }
  return queue;
}

/**
 * Wave Collapse through the Draft transition.
 * Returns false when the match ended, in which case Draft must be skipped.
 */
function closeCircuit(G: OuroborosState, random: RandomAPI): boolean {
  G.phase = 'waveCollapse';
  const result = runWaveCollapse(G, activeConfig, random);

  G.phase = 'cleanup';
  postCollapseCleanup(G, activeConfig, random);

  if (result.endedEarly || isEliminated(G, '0') || isEliminated(G, '1')) {
    G.phase = 'endgame';
    G.gameOverReason = 'dataCenterDestruction';
    return false;
  }

  // The Draft of the final Cycle still runs, because purchases affect Victory
  // Points before the comparison.
  G.phase = 'draft';
  beginDraft(G, result.circuitRewardEligible, activeConfig, random);
  return true;
}

// --- Game definition ---

export const OuroborosGame: Game<OuroborosState> = {
  name: 'ouroboros',

  setup: ({ random }) => createInitialState('runtime', activeConfig, fromBoardgameRandom(random)),

  playerView: ({ G, playerID }) => playerView(G, playerID),

  /**
   * Both players act during the same window, so every player is always active.
   * Stage.NULL keeps players active without entering a named stage, which would
   * otherwise hide the phase-level moves.
   */
  turn: {
    activePlayers: { all: Stage.NULL },
  },

  phases: {
    /**
     * Circuit Phase.
     *
     * onBegin covers Cycle setup. Each turn is one deployment window. onEnd
     * covers Wave Collapse, cleanup, and the Draft transition.
     */
    circuit: {
      start: true,

      onBegin: (args) => {
        const gameArgs = args as unknown as GameArgs;
        beginCycle(gameArgs.G, rng(gameArgs));
      },

      moves: { deployCard, endDeployment, concede },

      turn: {
        activePlayers: { all: Stage.NULL },

        /** A window closes when both players end it, or on timeout in production. */
        endIf: ({ G }) => bothEndedTurn(G),

        onEnd: (args) => {
          const gameArgs = args as unknown as GameArgs;
          closeWindow(gameArgs.G, rng(gameArgs));
        },
      },

      /** The phase ends once every deployment window has closed and revealed. */
      endIf: ({ G }) => G.windowsCompleted >= totalWindows(G),

      onEnd: (args) => {
        const gameArgs = args as unknown as GameArgs;
        closeCircuit(gameArgs.G, rng(gameArgs));
      },

      next: 'draft',
    },

    /** Draft Phase. Simultaneous, public, server-authoritative. */
    draft: {
      onBegin: (args) => {
        const { G } = args as unknown as GameArgs;
        G.phase = 'draft';
      },

      moves: { draftBuy, claimReward, endDraft: endDraftMove, undoEndDraft, concede },

      endIf: ({ G }) => bothEndedDraft(G),

      onEnd: (args) => {
        const { G } = args as unknown as GameArgs;
        endDraft(G);

        if (G.cycle >= activeConfig.cycleLimit) {
          // The Cycle limit is reached, so Victory Points are compared now.
          G.phase = 'endgame';
          G.gameOverReason = 'cycleLimit';
          return;
        }
        beginNextCycle(G);
      },

      next: 'circuit',
    },
  },

  /**
   * Single authority for match end.
   *
   * boardgame.io evaluates this after every processed event, so setting
   * `gameOverReason` inside a hook ends the match immediately and prevents the
   * next phase from starting. That is what makes Draft skip when a player loses
   * both Data Centers mid-Collapse.
   */
  endIf: ({ G }) => {
    if (G.gameOverReason) return finalResult(G, G.gameOverReason);
    if (isEliminated(G, '0') || isEliminated(G, '1')) {
      return finalResult(G, 'dataCenterDestruction');
    }
    return undefined;
  },
};

export const MOVE_NAMES = [
  'deployCard',
  'endDeployment',
  'draftBuy',
  'claimReward',
  'endDraft',
  'undoEndDraft',
  'concede',
] as const;
