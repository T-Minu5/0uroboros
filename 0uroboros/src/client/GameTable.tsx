/**
 * One seat's view of the match.
 *
 * This component composes the 3D board and the 2D HUD and dispatches moves. It
 * holds only interaction state (which card is selected, whether debug is open).
 * All game questions are answered by selectors, which delegate to the engine.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BoardProps } from 'boardgame.io/react';

import { getActiveConfig } from '../game/OuroborosGame';
import { circuitWindowCount } from '../game/config/defaults';
import type { NodeIndex, OuroborosState, PlayerID } from '../game/types';
import { CIRCUIT_REWARD_DEFINITIONS } from '../game/content/circuitRewards';
import { hasLegalDraftAction } from '../game/engine/draft';
import type { MarketCategory } from '../game/engine/draft';
import {
  bankView,
  cardPowerOf,
  definitionOf,
  handView,
  marketView,
  nodeBlockReason,
  nodeViews,
  opponentOf,
  statusView,
} from './selectors';
import { actionCostToDeploy } from '../game/engine/actions';
import {
  collapseIsBlocking,
  collapseTheaterReady,
  displayedPhaseKind,
  displayedPhaseSubtitle,
  displayedPhaseTitle,
} from './presentationPhase';
import { Board3D } from './board/Board3D';
import { NodeHeaders } from './hud/NodeHeaders';
import { ProbabilityStrip } from './hud/ProbabilityStrip';
import { PlayerStatus } from './hud/PlayerStatus';
import { EffectBankRow } from './hud/EffectBankRow';
import { FxOverlay } from './hud/FxOverlay';
import { HandRail } from './hud/HandRail';
import { DraftPanel } from './hud/DraftPanel';
import { circuitAnnouncement, PhaseAnnouncement } from './hud/PhaseAnnouncement';
import { CollapseTheaterOverlay } from './hud/CollapseTheater';
import { applyCollapseSnapshot, useCollapseTheater } from './collapseTheater';
import { PlayLog } from './hud/PlayLog';
import { InspectPlate } from './hud/InspectPlate';
import { DebugPanel } from './debug/DebugPanel';
import { EffectResolve } from './hud/EffectResolve';
import { CausalHudPath } from './hud/CausalHudPath';
import { CITY_URL } from './visual/boardArt';
import type { LaneScreenBox } from './board/spatialGrammar';
import { isGlobalPresentationKind } from './board/spatialGrammar';
import type { DragPointer } from './board/DragGhost';
import {
  CardFlightOverlay,
  defaultHandRect,
  rectFromCard,
  type CardFlight,
} from './hud/CardFlightOverlay';
import { isVisuallyRevealed, useRevealPlayback } from './revealPlayback';
import { nodeIndexFromLaneBoxes, nodeIndexFromPoint } from './board/boardLayout';
import { useResolutionPlayback } from './fxPlayback';
import { usePresentationSpeed } from './presentation/speed';
import { PRESENTATION_TIMING } from './presentation/timing';
import { collapseReportId } from './presentation/queue';
import { lookShowcaseEnabled, lookShowcaseFxEvent } from './lookShowcase';

export type GameTableProps = BoardProps<OuroborosState>;

export function GameTable({ G, ctx, moves, playerID }: GameTableProps) {
  const viewer = (playerID ?? '0') as PlayerID;
  const rival = opponentOf(viewer);
  const lookShowcase = useMemo(() => lookShowcaseEnabled(), []);
  const lookFx = useMemo(() => (lookShowcase ? lookShowcaseFxEvent(1) : null), [lookShowcase]);

  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [hoveredInstanceId, setHoveredInstanceId] = useState<string | null>(null);
  const [draggingInstanceId, setDraggingInstanceId] = useState<string | null>(null);
  const [dragPointer, setDragPointer] = useState<DragPointer | null>(null);
  const [hoveredNode, setHoveredNode] = useState<number | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [flight, setFlight] = useState<CardFlight | null>(null);
  const [hiddenCardIds, setHiddenCardIds] = useState<Set<string>>(new Set());
  const [boardInspectId, setBoardInspectId] = useState<string | null>(null);
  const [focusedBoardCard, setFocusedBoardCard] = useState<string | null>(null);
  const [laneBoxes, setLaneBoxes] = useState<LaneScreenBox[] | null>(null);
  const [collapseReadyAt, setCollapseReadyAt] = useState(0);
  const [collapseForcedComplete, setCollapseForcedComplete] = useState(false);
  const [landPulse, setLandPulse] = useState<{ key: number; nodeIndex: number } | null>(null);
  const speed = usePresentationSpeed();
  const timing = PRESENTATION_TIMING[speed];

  const revealPlayed = useRevealPlayback(G.revealQueue, G.revealSerial);
  const visuallyRevealed = useCallback(
    (instanceId: string, revealed: boolean) =>
      isVisuallyRevealed(instanceId, revealed, G.revealQueue, revealPlayed),
    [G.revealQueue, revealPlayed],
  );
  const revealDone = G.revealQueue.length === 0 || revealPlayed >= G.revealQueue.length;
  const fxRevealed = useCallback(
    (instanceId: string) => isVisuallyRevealed(instanceId, true, G.revealQueue, revealPlayed),
    [G.revealQueue, revealPlayed],
  );
  const fx = useResolutionPlayback(G.fxQueue ?? [], fxRevealed, revealDone, timing.effectMinimumReadMs);
  const reducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const theater = useCollapseTheater(
    G.collapseReport,
    collapseTheaterReady(ctx.phase ?? '', G.phase, revealDone),
    viewer,
    speed,
    reducedMotion,
  );
  const collapseId = G.collapseReport ? collapseReportId(G.collapseReport.serial) : null;
  const presentation = {
    ctxPhase: ctx.phase ?? '',
    gPhase: G.phase,
    revealDone,
    collapseSerial: G.collapseReport?.serial ?? G.collapseSerial,
    collapsePresentedSerial: theater.presentedSerial,
    hasCollapseReport: Boolean(G.collapseReport),
    collapseReportId: collapseId,
    presentedReportComplete: theater.reportComplete,
  };
  const phaseKind = displayedPhaseKind(presentation);
  const collapseBlocking =
    !collapseForcedComplete &&
    (collapseIsBlocking(presentation) ||
      (Boolean(G.collapseReport) &&
        !theater.reportComplete &&
        (ctx.phase === 'draft' || G.phase === 'waveCollapse')));

  const inCircuit = ctx.phase === 'circuit';
  const inDraft = ctx.phase === 'draft' && !collapseBlocking;
  const endedTurn = G.players[viewer].endedTurn;
  const windowOpen = inCircuit && !endedTurn;

  const hand = useMemo(() => handView(G, viewer, windowOpen), [G, viewer, windowOpen]);
  const nodes = useMemo(() => {
    const views = nodeViews(G, viewer, {
      isRevealed: (card) => visuallyRevealed(card.instanceId, card.revealed),
      powerOf: (card) => fx.power(card.instanceId) ?? cardPowerOf(card),
    }).map((node) => ({
      ...node,
      probability: fx.chance(node.index) ?? node.probability,
    }));
    if (!theater.active || !G.collapseReport) return views;
    return applyCollapseSnapshot(
      views,
      G.collapseReport,
      viewer,
      theater.highlightSelection,
    );
  }, [G, viewer, visuallyRevealed, fx, theater]);
  const localStatus = statusView(G, viewer);
  const rivalStatus = statusView(G, rival);

  const selected = hand.find((entry) => entry.card.instanceId === selectedInstanceId) ?? null;
  const dragging = hand.find((entry) => entry.card.instanceId === draggingInstanceId) ?? null;
  const boardInspectCard = boardInspectId ? G.cards[boardInspectId] : undefined;
  const boardInspect =
    boardInspectCard && visuallyRevealed(boardInspectCard.instanceId, boardInspectCard.revealed)
      ? { definition: definitionOf(boardInspectCard) }
      : null;
  const legalNodes = (dragging ?? selected)?.legalNodes ?? [];
  const inspectOpen = !draggingInstanceId && (Boolean(selected) || Boolean(boardInspect));
  const fxSourceName = fx.activeGroup[0]?.sourceInstanceId
    ? definitionOf(G.cards[fx.activeGroup[0].sourceInstanceId]).name
    : null;

  // Drop a stale selection when the card leaves hand or the window closes.
  useEffect(() => {
    if (selectedInstanceId && !selected) setSelectedInstanceId(null);
  }, [selectedInstanceId, selected]);

  const finishFlight = useCallback((instanceId: string) => {
    setFlight(null);
    setHiddenCardIds((current) => {
      if (!current.has(instanceId)) return current;
      const next = new Set(current);
      next.delete(instanceId);
      return next;
    });
  }, []);

  const deployTo = (
    index: number,
    instanceId = selected?.card.instanceId,
    origin?: { clientX: number; clientY: number },
  ) => {
    const entry = hand.find((item) => item.card.instanceId === instanceId);
    if (!entry) return false;
    if (!entry.legalNodes.includes(index as NodeIndex)) return false;
    const fromRect =
      flight?.instanceId === entry.card.instanceId
        ? flight.fromRect
        : rectFromCard(entry.card.instanceId) ??
          defaultHandRect(
            origin?.clientX ?? window.innerWidth / 2,
            origin?.clientY ?? window.innerHeight - 80,
          );
    const toSlot = nodes.find((node) => node.index === index)?.selfCards.length ?? 0;
    setHiddenCardIds((current) => new Set(current).add(entry.card.instanceId));
    setFlight({
      instanceId: entry.card.instanceId,
      definition: entry.definition,
      card: entry.card,
      fromRect,
      pointer: origin ? { x: origin.clientX, y: origin.clientY } : undefined,
      toNode: index,
      toSlot,
      phase: 'commit',
    });
    setLandPulse({ key: Date.now(), nodeIndex: index });
    moves.deployCard(entry.card.instanceId, index as NodeIndex);
    setSelectedInstanceId(null);
    setDraggingInstanceId(null);
    setHoveredNode(null);
    return true;
  };

  useEffect(() => {
    setCollapseForcedComplete(false);
  }, [G.collapseReport?.serial]);

  useEffect(() => {
    if (!theater.active) {
      setCollapseReadyAt(0);
      return;
    }
    const started = Date.now();
    setCollapseReadyAt(started + (theater.event?.holdMs ?? timing.collapseTitleMs));
  }, [theater.active, theater.event?.id, theater.event?.holdMs, timing.collapseTitleMs]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      if (theater.active && Date.now() >= collapseReadyAt) {
        event.preventDefault();
        theater.advanceNow();
        return;
      }
      if (fx.activeGroup.length > 0) {
        event.preventDefault();
        fx.advanceNow();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [theater, collapseReadyAt, fx]);

  const gameover = ctx.gameover as
    | { outcome: 'win'; winner: PlayerID; reason: string }
    | { outcome: 'tie'; reason: string }
    | undefined;

  return (
    <div
      className="table"
      style={{ ['--arena' as string]: CITY_URL ? `url("${CITY_URL}")` : 'none' }}
      data-look={lookShowcase ? 'true' : undefined}
      data-phase={phaseKind}
      data-dragging={draggingInstanceId ?? ''}
      data-hover={hoveredInstanceId ?? ''}
      data-hover-node={hoveredNode ?? ''}
      data-draft={inDraft}
      data-focus-node={theater.focusNode ?? fx.focusNode ?? (lookShowcase ? 3 : '')}
    >
      <div className="table__rival">
        <PlayerStatus
          status={rivalStatus}
          side="rival"
          label={`Player ${rival}`}
          showWallet={inDraft}
          fx={fx}
        />
      </div>

      <div className="clock" data-kind={phaseKind}>
        <PlayLog entries={G.log} />
        <div className="clock__core">
          <div className="clock__stack">
            <span className="clock__cycle">{displayedPhaseSubtitle(
              phaseKind,
              G.cycle,
              G.turn,
              G.mode === 'shortCircuit' ? 1 : circuitWindowCount(getActiveConfig()),
            )}</span>
            <span className="clock__phase">
              {displayedPhaseTitle(phaseKind, G.turn)}
            </span>
          </div>
          {phaseKind === 'runtime' || phaseKind === 'reveal' ? (
            <div className="clock__actions" data-empty={G.players[viewer].actions === 0}>
              <span className="clock__actions-label">Actions</span>
              <span className="clock__actions-value">{G.players[viewer].actions}</span>
              {G.players[viewer].pendingActions > 0 ? (
                <span className="clock__actions-pending">{`pending ${G.players[viewer].pendingActions}`}</span>
              ) : null}
            </div>
          ) : null}
          {inDraft ? (
            <div className="clock__actions" data-kind="wallet">
              <span className="clock__actions-label">Wallet</span>
              <span className="clock__actions-value">{G.players[viewer].wallet}</span>
            </div>
          ) : null}
          <div className="clock__score">
            <span>{`You ${localStatus.victoryPoints}`}</span>
            <span>{`Them ${rivalStatus.victoryPoints}`}</span>
          </div>
        </div>
        <span className="clock__timer">Playtest: no countdown</span>
        <button
          type="button"
          className="toggle table__debug"
          data-on={debugOpen}
          onClick={() => setDebugOpen((open) => !open)}
        >
          Debug
        </button>
        <PhaseAnnouncement
          announcement={
            collapseBlocking
              ? null
              : inDraft
                ? {
                    key: `draft:${G.cycle}:${G.collapseSerial}`,
                    title: 'Draft',
                    subtitle: `Cycle ${G.cycle}`,
                  }
                : circuitAnnouncement(G.phase, G.cycle, G.turn, G.revealSerial)
          }
        />
      </div>

      <ProbabilityStrip
        nodes={nodes}
        fx={fx}
        measuring={theater.measuring || lookShowcase}
        selectedNode={theater.highlightSelection ? theater.selectedNode : lookShowcase ? 2 : null}
      />

        <div className="table__board">
        <EffectBankRow className="bank--rival" slots={bankView(G, rival)} label="Opponent bank" />

        <div className="board">
          <NodeHeaders
            nodes={nodes}
            legalNodes={legalNodes}
            selected={Boolean(selected || dragging)}
            nodeReasons={
              (dragging ?? selected)
                ? Object.fromEntries(
                    nodes.map((node) => [
                      node.index,
                      nodeBlockReason(
                        G,
                        viewer,
                        (dragging ?? selected)!.card.instanceId,
                        node.index,
                      ),
                    ]),
                  )
                : {}
            }
            onSelectNode={(index) => deployTo(index)}
            isCardFaceUp={(card) => visuallyRevealed(card.instanceId, card.revealed)}
            powerOf={(card) => fx.power(card.instanceId) ?? cardPowerOf(card)}
            fx={fx}
            collapsingNode={theater.focusNode}
            focusedCardId={focusedBoardCard}
            onFocusCard={setFocusedBoardCard}
            onInspectCard={(id) => {
              if (draggingInstanceId) return;
              setBoardInspectId(id);
            }}
            hiddenCardIds={hiddenCardIds}
            laneBoxes={laneBoxes}
            dragging={Boolean(dragging)}
            hoveredNode={hoveredNode}
            ghostName={dragging?.definition.name ?? null}
            openingNodes={
              G.phase === 'circuitDeploy' ? (getActiveConfig().nodeOpenSchedule[G.turn] ?? []) : []
            }
            localBeat={
              theater.event && !isGlobalPresentationKind(theater.event.kind) ? theater.event : null
            }
            canContinue={theater.active && Date.now() >= collapseReadyAt}
            onContinue={theater.advanceNow}
          />

          <Board3D
            nodes={nodes}
            legalNodes={legalNodes}
            selectedNode={hoveredNode}
            onSelectNode={(index) => deployTo(index)}
            onHoverNode={setHoveredNode}
            visuallyRevealed={visuallyRevealed}
            hitCardIds={fx.hitCardIds}
            sourceCardId={fx.active?.sourceInstanceId ?? (lookShowcase ? 'look-source' : null)}
            focusNode={theater.focusNode ?? fx.focusNode ?? (lookShowcase ? 3 : null)}
            collapsingNode={
              lookShowcase
                ? 2
                : theater.event &&
                    (theater.event.kind === 'location_resolution' ||
                      theater.event.kind === 'node_result' ||
                      theater.event.kind === 'location_reward')
                  ? theater.focusNode
                  : null
            }
            hiddenCardIds={hiddenCardIds}
            viewer={viewer}
            fxEvent={fx.active ?? lookFx}
            sourceName={fxSourceName ?? (lookShowcase ? 'Look Showcase Pulse' : null)}
            measuring={theater.measuring || lookShowcase}
            atmosphere={
              inDraft ? 'draft' : theater.measuring || lookShowcase ? 'collapse' : 'play'
            }
            selectedCollapseNode={
              theater.highlightSelection ? theater.selectedNode : lookShowcase ? 2 : null
            }
            ghostLegal={
              hoveredNode !== null &&
              Boolean(dragging) &&
              legalNodes.includes(hoveredNode as (typeof legalNodes)[number])
            }
            onLaneLayout={setLaneBoxes}
            onInspectCard={(id) => {
              if (draggingInstanceId) return;
              setBoardInspectId(id);
            }}
            ghost={
              dragging && dragPointer
                ? {
                    definition: dragging.definition,
                    card: dragging.card,
                    pointer: dragPointer,
                  }
                : null
            }
          />
        </div>

        {fx.activeGroup.length > 0 &&
        (fx.active?.kind === 'nodeFocus' || fx.active?.kind === 'collapseSelect') ? (
          <EffectResolve
            events={fx.activeGroup}
            sourceName={fxSourceName}
            canContinue
            onContinue={fx.advanceNow}
          />
        ) : null}

        <CausalHudPath
          event={fx.active ?? lookFx}
          viewer={viewer}
          sourceName={fxSourceName ?? (lookShowcase ? 'Look Showcase Pulse' : null)}
        />
        <FxOverlay event={fx.active ?? lookFx} viewer={viewer} sourceName={fxSourceName} land={landPulse} />

        <CollapseTheaterOverlay
          theater={theater}
          pending={collapseBlocking && !theater.active}
          canContinue={collapseBlocking && (!theater.active || Date.now() >= collapseReadyAt)}
          onContinue={() => {
            if (!theater.active) setCollapseForcedComplete(true);
            else theater.advanceNow();
          }}
        />

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

        {inspectOpen && selected ? (
          <InspectPlate
            definition={selected.definition}
            blockedReason={selected.definition.kind === 'crypto' ? null : selected.blockedReason}
            legalCount={selected.legalNodes.length}
            actions={G.players[viewer].actions}
            actionCost={actionCostToDeploy(selected.definition.kind)}
          />
        ) : inspectOpen && boardInspect ? (
          <InspectPlate
            definition={boardInspect.definition}
            blockedReason={null}
            legalCount={0}
            actions={G.players[viewer].actions}
            actionCost={0}
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
        <EffectBankRow className="bank--local" slots={bankView(G, viewer)} label="Your bank" />
      </div>

      <div className="table__local">
        <PlayerStatus
          status={localStatus}
          side="local"
          label={`Player ${viewer} (you)`}
          showWallet={inDraft}
          fx={fx}
        />
      </div>

      <HandRail
        hand={hand}
        selectedInstanceId={selectedInstanceId}
        focusedInstanceId={hoveredInstanceId ?? selectedInstanceId}
        windowOpen={windowOpen}
        endedTurn={endedTurn}
        draggingInstanceId={draggingInstanceId}
        onFocus={(id) => {
          if (draggingInstanceId) return;
          setHoveredInstanceId(id);
        }}
        onSelect={(id) => {
          if (draggingInstanceId) return;
          setSelectedInstanceId(id);
          setBoardInspectId(null);
        }}
        onDragActive={(id) => {
          setDraggingInstanceId(id);
          setSelectedInstanceId(null);
          setBoardInspectId(null);
          setFocusedBoardCard(null);
          setHoveredInstanceId(null);
          if (!id) return;
          const entry = hand.find((item) => item.card.instanceId === id);
          if (!entry) return;
          setFlight({
            instanceId: id,
            definition: entry.definition,
            card: entry.card,
            fromRect: rectFromCard(id) ?? defaultHandRect(window.innerWidth / 2, window.innerHeight - 80),
            toNode: null,
            toSlot: 0,
            phase: 'follow',
          });
        }}
        onDragMove={(pointer) => {
          setDragPointer(pointer);
          const over = nodeIndexFromLaneBoxes(pointer.clientX, pointer.clientY, laneBoxes);
          if (over !== null) setHoveredNode(over);
          setFlight((current) =>
            current?.phase === 'follow'
              ? { ...current, pointer: { x: pointer.clientX, y: pointer.clientY } }
              : current,
          );
        }}
        onDragEnd={(pointer) => {
          const overlayNode = nodeIndexFromPoint(pointer.clientX, pointer.clientY);
          const target = hoveredNode ?? overlayNode;
          const dropped =
            draggingInstanceId !== null && target !== null
              ? deployTo(target, draggingInstanceId, {
                  clientX: pointer.clientX,
                  clientY: pointer.clientY,
                })
              : false;
          if (!dropped) {
            setFlight((current) =>
              current?.phase === 'follow'
                ? {
                    ...current,
                    phase: 'return',
                    pointer: { x: pointer.clientX, y: pointer.clientY },
                  }
                : current,
            );
          }
          setDragPointer(null);
          setHoveredNode(null);
        }}
        onEndDeployment={() => moves.endDeployment()}
        onConcede={() => moves.concede()}
      />

      {flight ? (
        <CardFlightOverlay
          flight={flight}
          durationMs={timing.cardDeployMs}
          onDone={finishFlight}
        />
      ) : null}

    </div>
  );
}
