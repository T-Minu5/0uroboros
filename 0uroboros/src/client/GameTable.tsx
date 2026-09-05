/**
 * One seat's view of the match.
 *
 * This component composes the 3D board and the 2D HUD and dispatches moves. It
 * holds only interaction state (which card is selected, whether debug is open).
 * All game questions are answered by selectors, which delegate to the engine.
 */

import { useEffect, useMemo, useState } from 'react';
import type { BoardProps } from 'boardgame.io/react';

import type { NodeIndex, OuroborosState, PlayerID } from '../game/types';
import { CIRCUIT_REWARD_DEFINITIONS } from '../game/content/circuitRewards';
import { hasLegalDraftAction } from '../game/engine/draft';
import type { MarketCategory } from '../game/engine/draft';
import {
  bankView,
  handView,
  marketView,
  nodeViews,
  opponentOf,
  phaseLabel,
  statusView,
} from './selectors';
import { Board3D } from './board/Board3D';
import { NodeHeaders } from './hud/NodeHeaders';
import { ProbabilityStrip } from './hud/ProbabilityStrip';
import { PlayerStatus } from './hud/PlayerStatus';
import { EffectBankRow } from './hud/EffectBankRow';
import { HandRail } from './hud/HandRail';
import { DraftPanel } from './hud/DraftPanel';
import { PhaseAnnouncement } from './hud/PhaseAnnouncement';
import { DebugPanel } from './debug/DebugPanel';

export type GameTableProps = BoardProps<OuroborosState>;

export function GameTable({ G, ctx, moves, playerID }: GameTableProps) {
  const viewer = (playerID ?? '0') as PlayerID;
  const rival = opponentOf(viewer);

  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);

  const inCircuit = ctx.phase === 'circuit';
  const inDraft = ctx.phase === 'draft';
  const endedTurn = G.players[viewer].endedTurn;
  const windowOpen = inCircuit && !endedTurn;

  const hand = useMemo(() => handView(G, viewer, windowOpen), [G, viewer, windowOpen]);
  const nodes = useMemo(() => nodeViews(G, viewer), [G, viewer]);
  const localStatus = statusView(G, viewer);
  const rivalStatus = statusView(G, rival);

  const selected = hand.find((entry) => entry.card.instanceId === selectedInstanceId) ?? null;
  const legalNodes = selected?.legalNodes ?? [];

  // Drop a stale selection when the card leaves hand or the window closes.
  useEffect(() => {
    if (selectedInstanceId && !selected) setSelectedInstanceId(null);
  }, [selectedInstanceId, selected]);

  const deployTo = (index: number) => {
    if (!selected) return;
    if (!selected.legalNodes.includes(index as NodeIndex)) return;
    moves.deployCard(selected.card.instanceId, index as NodeIndex);
    setSelectedInstanceId(null);
  };

  const gameover = ctx.gameover as
    | { outcome: 'win'; winner: PlayerID; reason: string }
    | { outcome: 'tie'; reason: string }
    | undefined;

  return (
    <div className="table">
      <div className="table__rival">
        <PlayerStatus
          status={rivalStatus}
          side="rival"
          label={`Player ${rival}`}
          showWallet={inDraft}
        />
      </div>

      <div className="clock">
        <span className="clock__cycle">Cycle {G.cycle}</span>
        <span className="clock__phase">{phaseLabel(G.phase)}</span>
        {inCircuit ? <span>Window {G.turn + 1} of {G.nodes.length}</span> : null}

        <button
          type="button"
          className="toggle table__debug"
          data-on={debugOpen}
          onClick={() => setDebugOpen((open) => !open)}
        >
          Debug
        </button>
      </div>

      <ProbabilityStrip nodes={nodes} />

      <div className="table__board">
        <EffectBankRow slots={bankView(G, rival)} label="Opponent bank" />

        <div className="board">
          <NodeHeaders nodes={nodes} legalNodes={legalNodes} />

          <Board3D
            nodes={nodes}
            legalNodes={legalNodes}
            selectedNode={null}
            onSelectNode={deployTo}
          />
        </div>

        <PhaseAnnouncement phase={G.phase} cycle={G.cycle} />

        {inDraft ? (
          <DraftPanel
            wallet={G.players[viewer].wallet}
            market={marketView(G, viewer)}
            reward={{
              definition: G.market.circuitReward.rewardId
                ? (CIRCUIT_REWARD_DEFINITIONS[G.market.circuitReward.rewardId] ?? null)
                : null,
              eligible: G.market.circuitReward.eligible.includes(viewer),
              claimed: G.market.circuitReward.claimed.includes(viewer),
            }}
            endedDraft={G.players[viewer].endedDraft}
            canUndoEndDraft={
              G.players[viewer].endedDraft &&
              !G.players[rival].endedDraft &&
              hasLegalDraftAction(G, viewer)
            }
            opponentEndedDraft={G.players[rival].endedDraft}
            onBuy={(category: MarketCategory, slotIndex: number) =>
              moves.draftBuy(category, slotIndex)
            }
            onClaimReward={() => moves.claimReward()}
            onEndDraft={() => moves.endDraft()}
            onUndoEndDraft={() => moves.undoEndDraft()}
          />
        ) : null}

        {debugOpen ? (
          <DebugPanel
            G={G}
            bgioPhase={ctx.phase}
            viewer={viewer}
            onClose={() => setDebugOpen(false)}
          />
        ) : null}

        {gameover ? (
          <div className="result">
            <span className="result__headline">
              {gameover.outcome === 'tie'
                ? 'Draw'
                : gameover.winner === viewer
                  ? 'Victory'
                  : 'Defeat'}
            </span>
            <span className="result__reason">
              {`${gameover.reason} · Cycle ${G.cycle}`}
            </span>
            <span className="result__reason">
              {`Victory Points ${localStatus.victoryPoints} to ${rivalStatus.victoryPoints}`}
            </span>
          </div>
        ) : null}
      </div>

      <EffectBankRow slots={bankView(G, viewer)} label="Your bank" />

      <div className="table__local">
        <PlayerStatus
          status={localStatus}
          side="local"
          label={`Player ${viewer} (you)`}
          showWallet={inDraft}
        />
      </div>

      <HandRail
        hand={hand}
        selectedInstanceId={selectedInstanceId}
        windowOpen={windowOpen}
        endedTurn={endedTurn}
        onSelect={setSelectedInstanceId}
        onEndDeployment={() => moves.endDeployment()}
        onConcede={() => moves.concede()}
      />

    </div>
  );
}
