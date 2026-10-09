/**
 * Deterministic game telemetry. The runtime feeds every event it emits through `record`;
 * nothing here reads hidden state or changes the game. Evaluators interpret these facts,
 * they never recompute them.
 */
import type { PlayerId } from "../game";

export type Pair = [number, number];
export type EffectSource = "card" | "location" | "circuit";
export type TelemetryEvent = {
  kind: string; text: string; owner?: PlayerId; targetOwner?: PlayerId; cardId?: string; definitionId?: string;
  source?: EffectSource; sourceName?: string; amount?: number; before?: number; after?: number; target?: string;
};
export type CardIdentity = { definitionId: string; name: string; cost: number; type: string; cardClass?: string };
export type CardTelemetry = CardIdentity & {
  plays: Pair; drain: Pair; restore: Pair; draw: Pair; actions: Pair; crypto: Pair; vp: Pair;
};
export type SourceTelemetry = { name: string; drain: Pair; restore: Pair; draw: Pair; actions: Pair; crypto: Pair; vp: Pair };
/** `vp` is what the destroyer scored (0 for destroying its own Server); absent in games recorded before it was tracked. */
export type Destruction = { cycle: number; turn: number; victim: PlayerId; server: "primary" | "backup"; by: PlayerId; source: EffectSource; sourceId: string; vp?: number };
export type CycleTelemetry = { cycle: number; drain: Pair; restore: Pair; events: number };
export type GameTelemetry = {
  events: number;
  /** Server damage dealt by each seat, and how much of it came from cards, Locations and Circuit Rewards. */
  drainDealt: Pair; restoreDone: Pair;
  drainBySource: Record<EffectSource, Pair>; restoreBySource: Record<EffectSource, Pair>;
  /** Restores that found no damaged Server, or healed nothing. */
  wastedRestores: Pair; restoreEvents: Pair; drainEvents: Pair;
  drawn: Pair; actionsGained: Pair; cryptoGained: Pair; vpGained: Pair;
  destructions: Destruction[];
  cards: Record<string, CardTelemetry>;
  locations: Record<string, SourceTelemetry>;
  circuit: Record<string, SourceTelemetry>;
  perCycle: CycleTelemetry[];
  /** Player-experience signals: outcomes that fizzled, random results, choices made. */
  failedOutcomes: Pair; randomResults: number; choices: Pair;
};

const pair = (): Pair => [0, 0];
const FAILED = /: No target\.$|: No Power to shift\.$| skipped\.$|payment declined\.$|chained effects cancelled\.$/;
const DESTRUCTION_VP = /\+(\d+) destruction VP\./;
const sourceStats = (name: string): SourceTelemetry => ({ name, drain: pair(), restore: pair(), draw: pair(), actions: pair(), crypto: pair(), vp: pair() });

export function emptyTelemetry(): GameTelemetry {
  return {
    events: 0, drainDealt: pair(), restoreDone: pair(),
    drainBySource: { card: pair(), location: pair(), circuit: pair() }, restoreBySource: { card: pair(), location: pair(), circuit: pair() },
    wastedRestores: pair(), restoreEvents: pair(), drainEvents: pair(),
    drawn: pair(), actionsGained: pair(), cryptoGained: pair(), vpGained: pair(),
    destructions: [], cards: {}, locations: {}, circuit: {}, perCycle: [],
    failedOutcomes: pair(), randomResults: 0, choices: pair(),
  };
}

type Clock = () => { cycle: number; turn: number };
type Resolver = (cardId: string) => CardIdentity | undefined;
type Effect = "drain" | "restore" | "draw" | "actions" | "crypto" | "vp";

export class TelemetryCollector {
  readonly data = emptyTelemetry();
  /** Circuit Reward effects carry the reward's display name; the runtime tells us the definition id. */
  circuitId: string | null = null;
  circuitName: string | null = null;
  private identities = new Map<string, CardIdentity>();

  constructor(private clock: Clock, private resolve: Resolver) {}

  /** Remembers a card's identity while it is still findable, so later events still attribute after it leaves play. */
  noteCard(cardId: string, identity: CardIdentity) { this.identities.set(cardId, identity); }

  record(event: TelemetryEvent) {
    const data = this.data, { cycle, turn } = this.clock();
    data.events++;
    let row = data.perCycle[data.perCycle.length - 1];
    if (!row || row.cycle !== cycle) { row = { cycle, drain: pair(), restore: pair(), events: 0 }; data.perCycle.push(row); }
    row.events++;
    const owner = event.owner, amount = Math.max(0, event.amount ?? 0);
    if (owner !== undefined && FAILED.test(event.text)) data.failedOutcomes[owner]++;
    if (event.kind === "choice") {
      if (/random result/.test(event.text)) data.randomResults++;
      else if (owner !== undefined && !FAILED.test(event.text)) data.choices[owner]++;
    }
    if (event.kind === "reveal" && owner !== undefined && event.cardId) { const card = this.card(event.cardId); if (card) card.plays[owner]++; }
    if (owner === undefined) return;
    const source = this.sourceOf(event);
    const beneficiary = (event.kind === "drain" ? owner : event.targetOwner ?? owner) as PlayerId;
    switch (event.kind) {
      case "drain": {
        const victim = (event.targetOwner ?? (1 - owner)) as PlayerId;
        data.drainEvents[owner]++;
        data.drainDealt[owner] += amount; data.drainBySource[source][owner] += amount; row.drain[owner] += amount;
        if ((event.target === "primary" || event.target === "backup") && (event.before ?? 0) > 0 && event.after === 0) {
          data.destructions.push({ cycle, turn, victim, server: event.target, by: owner, source, sourceId: this.sourceId(event), vp: Number(DESTRUCTION_VP.exec(event.text)?.[1] ?? 0) });
        }
        this.attribute(event, "drain", owner, amount);
        return;
      }
      case "restore":
        data.restoreEvents[beneficiary]++;
        if (amount === 0) data.wastedRestores[beneficiary]++;
        data.restoreDone[beneficiary] += amount; data.restoreBySource[source][beneficiary] += amount; row.restore[beneficiary] += amount;
        this.attribute(event, "restore", beneficiary, amount);
        return;
      case "draw": data.drawn[beneficiary] += amount; this.attribute(event, "draw", beneficiary, amount); return;
      case "actions": data.actionsGained[beneficiary] += amount; this.attribute(event, "actions", beneficiary, amount); return;
      case "crypto": data.cryptoGained[beneficiary] += amount; this.attribute(event, "crypto", beneficiary, amount); return;
      case "vp": data.vpGained[beneficiary] += amount; this.attribute(event, "vp", beneficiary, amount); return;
    }
  }

  private sourceOf(event: TelemetryEvent): EffectSource {
    if (event.cardId?.startsWith("location:")) return "location";
    if (event.cardId?.startsWith("circuit:")) return "circuit";
    return event.source === "location" || event.source === "circuit" ? event.source : "card";
  }

  private sourceId(event: TelemetryEvent): string {
    const id = event.cardId ?? "";
    if (id.startsWith("location:")) return id.slice("location:".length);
    if (id.startsWith("circuit:")) return this.circuitId ?? id.slice("circuit:".length);
    return this.card(id)?.definitionId ?? (event.definitionId ?? "unknown");
  }

  private card(cardId: string): CardTelemetry | undefined {
    if (cardId.startsWith("location:") || cardId.startsWith("circuit:")) return undefined;
    let identity = this.identities.get(cardId);
    if (!identity) { identity = this.resolve(cardId); if (identity) this.identities.set(cardId, identity); }
    if (!identity) return undefined;
    return this.data.cards[identity.definitionId] ??= { ...identity, plays: pair(), drain: pair(), restore: pair(), draw: pair(), actions: pair(), crypto: pair(), vp: pair() };
  }

  private attribute(event: TelemetryEvent, effect: Effect, side: PlayerId, amount: number) {
    const id = event.cardId;
    if (!id || !amount) return;
    if (id.startsWith("location:")) { const key = id.slice("location:".length); (this.data.locations[key] ??= sourceStats(event.sourceName ?? key))[effect][side] += amount; return; }
    if (id.startsWith("circuit:")) { const key = this.circuitId ?? id.slice("circuit:".length); (this.data.circuit[key] ??= sourceStats(this.circuitName ?? key))[effect][side] += amount; return; }
    const card = this.card(id);
    // Card effects credit the card's owner, whoever they benefit.
    if (card) card[effect][event.owner ?? side] += amount;
  }
}
