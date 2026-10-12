/**
 * Rebuilds a game from its replay: the same seed, rules and seat names, then every recorded command at its recorded
 * time. AI decisions draw from the seeded random source, so the rebuilt Log matches the one the table produced.
 */
import type { PlayerId } from "@0uroboros/engine/game";
import type { CompiledContent } from "@0uroboros/engine/authoring/contentModel";
import type { StrategyProfile } from "@0uroboros/engine/ai/strategy";
import { pickOpponent } from "@0uroboros/engine/ai/opponents";
import { createSession, seededRandom, type RuntimeEvent, type RuntimeSession } from "@0uroboros/engine/runtime";
import type { Command } from "@0uroboros/protocol/messages";
import type { ReplayRecord, SystemCommand } from "./store";

export type ReplayResult = { session: RuntimeSession; events: RuntimeEvent[] };

/** `strategy` overrides the profile; otherwise an `ai` table replays with the pack opponent its settings recorded. */
export function replayGame(replay: ReplayRecord, content: CompiledContent, strategy?: StrategyProfile): ReplayResult {
  const clock = { now: replay.startedAt };
  const profile = strategy ?? (replay.mode === "ai" ? pickOpponent(content.opponents, replay.settings.opponent)?.profile : undefined);
  const session = createSession({
    content, strategicMarket: true, evaluationContent: true,
    carryover: replay.settings.carryover, priorityPreference: replay.settings.priorityPreference,
    noLocations: replay.settings.noLocations, noTrailingRewards: replay.settings.noTrailingRewards,
    random: seededRandom(replay.seed), aiSeats: replay.aiSeats, seatNames: replay.seatNames, recordDecisions: false,
    ...(profile ? { strategy: profile } : {}),
    now: () => clock.now,
  });
  const events: RuntimeEvent[] = [];
  const drain = () => {
    for (let guard = 0; !session.state.choice && session.pendingCount; guard++) {
      if (guard > 10_000) throw new Error("Replay resolution failed to terminate.");
      events.push(session.step()!.event);
    }
  };
  drain();
  for (const record of replay.commands) {
    clock.now = record.at;
    const event = record.command.type === "system"
      ? runSystem(session, record.command, clock.now)
      : runCommand(session, record.seat as PlayerId, record.command, clock.now);
    if (event) events.push(event);
    drain();
    if (session.state.phase === "gameover") break;
  }
  return { session, events };
}

function runCommand(session: RuntimeSession, seat: PlayerId, command: Command, now: number): RuntimeEvent | null {
  switch (command.type) {
    case "deploy": return session.deploy(command.cardId, command.node, seat);
    case "relocate": return session.relocateCard(command.cardId, command.node, seat);
    case "undoPlanning": return session.undoAllPlanning(seat);
    case "endTurn": return session.endTurn(seat);
    case "undoEndTurn": return session.undoEndTurn(seat);
    case "choose": return session.choose(command.selection, seat);
    case "claimCircuit": return session.claimCircuitReward(seat, now);
    case "buy": return session.buy(command.pileId, now, seat);
    case "endDraft": return session.endDraft(seat);
    case "undoEndDraft": return session.undoEndDraft(seat, now);
    case "concede": return session.resign(seat);
  }
}

function runSystem(session: RuntimeSession, command: SystemCommand, now: number): RuntimeEvent | null {
  switch (command.action) {
    case "expireDraft": return session.expireDraft(now);
    case "nextCycle": return session.nextCycle();
    case "choiceTimeout": return session.resolveChoiceTimeout();
    case "autoEndTurn": return session.endTurn(command.seat!);
    case "inactivityConcede": return session.concedeForInactivity(command.seat!);
    case "aiDraftStep": return session.opponentDraftStep(now, command.seat!);
    case "forfeit": return session.resign(command.seat!, command.reason);
    case "abandon": return session.endSessionNow();
  }
}
