/**
 * The implemented game as plain data, compiled from the stored content and the rules constants
 * the runtime actually uses. Evaluators read this instead of importing the engine.
 */
import type { ContentDocument } from "../authoring/contentModel";
import { CURRENCY_PILES, DRAFT_COPIES_PER_PLAYER, DRAFT_EARLY_COST_MAX, DRAFT_EARLY_CYCLES, DRAFT_OFFER_COUNT, DRAFT_PHASE_SUMMARY, DRAFT_SLOT_SUMMARY, DRAFT_SOLAR_MONK_COUNT } from "../evaluationMarket";
import { DEFAULT_BUILTIN_MODS } from "../builtinMods";
import { defaultServerVP, initialWeights, serverMaximums, type Card } from "../game";
import { compileForSelfPlay } from "./selfPlay";
import { locationRead } from "./strategy";

export type ConfigurableFact = {
  id: string;
  /** Where Mel changes it today. */
  surface: "configure" | "content-studio" | "code-constant" | "session-fixed";
  label: string;
  default: string | number | boolean;
  /** What Eco-Strat / league self-play uses unless noted otherwise. */
  cohortDefault: string | number | boolean;
  notes: string;
};

export type SystemFacts = {
  rules: Record<string, string | number>;
  /** Pieces Mel can change today, with defaults and cohort assumptions. */
  configurable: ConfigurableFact[];
  market: Record<string, string | number>;
  startingDeck: { name: string; count: number }[];
  cards: { id: string; name: string; pool: string; type: string; cardClass?: string; cost: number; power: number; vp?: number; cryptoValue?: number; duration?: number; text: string }[];
  locations: { id: string; name: string; rule: string; read: string }[];
  circuitRewards: { id: string; name: string; text: string; awardTrailing?: boolean }[];
  mods: { id: string; name: string; badge?: string; text: string; kind: "authored" | "builtin" }[];
};

/** Per-game Configure options, authored content Mel edits in Studio, and fixed session policies. */
export function configurableFacts(): ConfigurableFact[] {
  return [
    {
      id: "serverVP.primary", surface: "configure", label: "Primary Server destruction VP",
      default: defaultServerVP.primary, cohortDefault: defaultServerVP.primary,
      notes: "VP awarded when you destroy the enemy Primary. Configure UI; not Server integrity.",
    },
    {
      id: "serverVP.backup", surface: "configure", label: "Backup Server destruction VP",
      default: defaultServerVP.backup, cohortDefault: defaultServerVP.backup,
      notes: "VP awarded when you destroy the enemy Backup. Configure UI; not Server integrity.",
    },
    {
      id: "draftCrypto", surface: "configure", label: "Draft Crypto shelf",
      default: false, cohortDefault: false,
      notes: "When on, Shyte-Coin / Byte-Coin / Kilo-Coin / Mega-Cache sit beside the rotating Draft offer. Off by default: Crypto comes from Character effects and held Crypto cards.",
    },
    {
      id: "noLocations", surface: "configure", label: "No Locations",
      default: false, cohortDefault: false,
      notes: "When on, every Node is No Man's Land for the whole game (no Location effects).",
    },
    {
      id: "noTrailingRewards", surface: "configure", label: "No trailing Circuit Rewards",
      default: true, cohortDefault: true,
      notes: "Defaults on. Configure shows 'Include trailing rewards' unchecked by default; checking it turns this off so catch-up Circuit Rewards stay in the pool.",
    },
    {
      id: "turnSeconds", surface: "configure", label: "Runtime turn timer",
      default: "off", cohortDefault: "off",
      notes: "Optional countdown per Runtime turn in human games. Headless cohorts are untimed.",
    },
    {
      id: "startingDeck", surface: "configure", label: "Starting deck",
      default: "active pack deck", cohortDefault: "active pack deck",
      notes: "Configure can pick among authored startingDecks. Cohorts use the pack's activeStartingDeckId.",
    },
    {
      id: "opponent", surface: "configure", label: "Opponent",
      default: "first authored opponent", cohortDefault: "mirror Strat-G / league agents",
      notes: "Human games pick an authored opponent. Eco cohorts and league matches are AI-vs-AI under their own harness.",
    },
    {
      id: "cards", surface: "content-studio", label: "Market / generated cards",
      default: "authored pack", cohortDefault: "authored pack",
      notes: "Costs, Power, VP, Crypto value, duration, effect steps, pool (Base/Chaos/VP/Crypto), enable flags. Primary balance surface.",
    },
    {
      id: "locations", surface: "content-studio", label: "Locations",
      default: "authored pack", cohortDefault: "authored pack",
      notes: "Collapse / ongoing / on-play effects and conditions. Dealt one per Node each Cycle unless noLocations.",
    },
    {
      id: "circuitRewards", surface: "content-studio", label: "Circuit Rewards",
      default: "authored pack", cohortDefault: "authored pack",
      notes: "Including awardTrailing catch-up rewards. Filtered out when noTrailingRewards is on.",
    },
    {
      id: "runtimeHacks", surface: "content-studio", label: "Runtime Hacks",
      default: "authored pack", cohortDefault: "authored pack",
      notes: "Secret reveal combos (game/cycle/turn/location/locationCycle windows). Unlock once per seat per hack after the completing reveal resolves; award typically gains a card into hand. Not a Configure option.",
    },
    {
      id: "mods", surface: "content-studio", label: "Authored mods",
      default: "authored pack", cohortDefault: "authored pack",
      notes: "Attachable modifiers (e.g. Aura Farming, Lefty, Superpositioning hooks). Built-in mods also exist in code.",
    },
    {
      id: "startingDecks", surface: "content-studio", label: "Starting deck definitions",
      default: "authored pack", cohortDefault: "active deck",
      notes: "Named decks Mel authors; Configure picks which one a human game uses.",
    },
    {
      id: "serverIntegrity", surface: "code-constant", label: "Server integrity (Primary / Backup HP)",
      default: `${serverMaximums.primary} / ${serverMaximums.backup}`, cohortDefault: `${serverMaximums.primary} / ${serverMaximums.backup}`,
      notes: "Full HP of both Servers. Not in Configure UI today — change in engine constants. Aggression damage targets this total plus opponent Restores.",
    },
    {
      id: "nodeWeights", surface: "code-constant", label: "Initial Circuit probability weights",
      default: initialWeights.join("/"), cohortDefault: initialWeights.join("/"),
      notes: "Nodes 1–5 start at these weights (sum 100). Probability transfer moves weight between Nodes during Runtime.",
    },
    {
      id: "actionCarryover", surface: "session-fixed", label: "Runtime Action carryover",
      default: true, cohortDefault: true,
      notes: "Unspent Actions carry between Runtime turns inside a Cycle. Never between Cycles. User-facing and cohort sessions use carryover: true.",
    },
    {
      id: "priorityPreference", surface: "session-fixed", label: "Next-reveal priority from ControlledWeight",
      default: "higher", cohortDefault: "higher",
      notes: "Higher ControlledWeight gets next reveal priority; ties keep current priority. User-facing and cohorts use higher.",
    },
  ];
}

export function systemFacts(document: ContentDocument): SystemFacts {
  const content = compileForSelfPlay(document);
  const pool = (card: Card) => content.chaosCards.some(item => item.id === card.id) ? "Chaos" : content.vpCards.some(item => item.id === card.id) ? "VP" : content.cryptoCards.some(item => item.id === card.id) ? "Crypto" : "Base";
  const deck = new Map<string, number>();
  for (const card of content.startingDeck) deck.set(card.name, (deck.get(card.name) ?? 0) + 1);
  const authoredMods = (content.mods ?? []).map(mod => {
    const hooks = (["onReveal", "onCollapse", "recurring"] as const).filter(hook => Array.isArray(mod[hook]) && mod[hook]!.length);
    return {
      id: mod.id, name: mod.name, kind: "authored" as const,
      text: hooks.length ? `${mod.name} (${hooks.join(", ")})` : mod.name,
    };
  });
  const builtinMods = (Object.keys(DEFAULT_BUILTIN_MODS) as (keyof typeof DEFAULT_BUILTIN_MODS)[]).map(id => ({
    id, name: DEFAULT_BUILTIN_MODS[id].name, badge: DEFAULT_BUILTIN_MODS[id].badge, text: DEFAULT_BUILTIN_MODS[id].text, kind: "builtin" as const,
  }));
  return {
    rules: {
      format: "Two-player competitive deck-builder. Runtime Mode: three deployment turns per Cycle, then Wave Collapse, then Draft. Up to 16 Cycles.",
      cycleLoop: "Runtime (turns 1–3) → Wave Collapse (Nodes 1–5, then Effect Bank) → probabilistic Circuit selection → End of Cycle cleanup → Draft → End Draft → New Cycle (Wallet 0, new Locations, start-of-Cycle effects, draw 5).",
      cycles: 16, runtimeTurnsPerCycle: 3, handSize: 5, nodes: 5, maxCardsPerSidePerNode: 4,
      opening: "Turn 1 opens Nodes 1–3 (+2 Actions). Turn 2 opens Node 4 (+1 Action) and each player draws 1. Turn 3 opens Node 5 (+1 Action) and each player draws 1. Open Nodes stay playable until Collapse.",
      actions: "2 Actions on turn 1; later turns carry unspent Actions over, +1 per turn, plus Action effects. Each Character costs 1 Action; VP cards cost none; Crypto cannot be deployed. Actions never carry between Cycles.",
      midCycleDraw: "Fixed rule: each player draws 1 card at the start of Runtime turns 2 and 3.",
      draftCrypto: "Setup option (default off): when on, a persistent Crypto shelf (Shyte-Coin, Byte-Coin, Kilo-Coin, Mega-Cache) sits beside the rotating Draft offer. When off, Crypto cards are not for sale — Wallet income comes from Character effects and any Crypto already held.",
      startingDeck: "Both seats use the active starting deck from content. Current Standard is weaker than older builds (mostly Shyte-Coin plus a thin Character/VP core), so early hands are softer and the Draft shapes the economy more.",
      deploy: "Cards deploy face down. Max 4 cards+holograms per seat per Node. Character costs 1 Action; VP costs 0; Crypto cannot deploy. Reveal alternates priority seat then other, chronological within a seat; each reveal fully resolves its onReveal before the next.",
      power: "Higher numeric Power controls a Node (negatives allowed; empty side is 0 so 0 beats negative). Equal totals tie and split ControlledWeight. ControlledWeight = sum of weights of Nodes you win + half the weights of ties; higher ControlledWeight gets next reveal priority (ties keep current).",
      primaryServer: serverMaximums.primary, backupServer: serverMaximums.backup,
      destructionVP: `Destroying a Primary Server gives +${defaultServerVP.primary} VP, a Backup +${defaultServerVP.backup} VP (Configure can change those awards). Losing both Servers ends the game after the current Collapse Node finishes; most VP still wins.`,
      drainRestore: "Drain damages available enemy Primary then Backup (clamps at 0, no spill). Restore repairs available Primary then Backup up to max and cannot resurrect a destroyed Server. Destroying a Server awards destruction VP once.",
      nodeWeights: initialWeights.join(", "),
      collapse: "Resolve Nodes 1→5. At each Node: Location onCollapse → card onCollapse → recalculate Power → winner/tie → Location Reward. Then Effect Bank onCollapse (oldest first). Then one Node is selected by final probability weights for Circuit eligibility (winner of that Node; both if tied).",
      locations: "Each Cycle deals one Location onto each of the 5 Nodes (unless noLocations). Whoever has more Power at a Node when it collapses wins that Location and its collapse effects fire once with the winner as the actor. 'Ongoing' effects fire at the start of turns 2 and 3 for whoever leads the Node then; 'when a card is played here' effects fire for that card's owner. Text says who benefits: you (the winner), your opponent (the loser), both players, the player with the least VP. A Location that rewards the loser, or hands out Glitch/Shyte-Coin junk, is worth conceding; one that draws, Drains or pays VP is worth contesting. Locations won also count toward the Circuit Reward. 'read' is the default AI's valuation at Cycle 8.",
      circuit: "Whoever won more Locations in the Cycle is eligible for one random Circuit Reward; a tie makes both eligible. A reward with awardTrailing goes instead to the trailing player: lower VP once each enemy Server still standing adds the share of its destruction VP matching the share of its health already lost (both eligible when level). noTrailingRewards is on by default and removes those catch-up rewards from the pool; Configure's 'Include trailing rewards' turns them back on.",
      runtimeHacks: "Secret authored reveal combos. After a card's reveal effects (and Location on-play / opening schedule queued with that reveal) finish, if that seat has revealed every required card inside the hack's window (game, Cycle, Runtime turn, same Node across the game, or same Node within one Cycle), both seats see the award modal; only the unlocking seat gets the reward (usually a card into hand). Each hack fires at most once per seat per game. Face-down deploys do not count.",
      draft: "Spendable Crypto comes from Character effects (many Base and Chaos cards now print Crypto; the rotating offer reserves two slots for Base/Chaos cards that gain Crypto — one costing 2–5, one any amount) and any held Crypto cards that resolve at Draft. Crypto/Wallet resets each Cycle; unspent Crypto is lost. Bought cards go to the Discard. Draft lasts up to 90 seconds. Each Draft is a fresh 10-card rotating offer. Optional setup (draftCrypto, default off): a persistent Crypto shelf sits beside the offer.",
      zones: "Draw, Hand, Discard, Nodes (board), Effect Bank (duration cards), Trash (shared, recoverable when text allows), Destroyed (permanent). End-of-Cycle: remaining hand to Discard; new Cycle draws 5.",
      mods: "Mods attach to host cards (Circuit/collection awards often choose between two hosts, prefer unmodded). Built-ins include double printed effects, Power aura to allies at the Location, and movable-each-turn. Authored mods (Aura Farming, Lefty, etc.) add hooks such as onReveal / recurring. Holograms: a card can create a hologram at the mirrored Node (1↔5, 2↔4; center does nothing); holograms occupy a slot, add Power, cannot be targeted, and clear after that Node's Collapse.",
      vpSources: "Final VP = destruction VP (Server kills) + printed VP on owned cards in active zones (Draw/Hand/Discard/Nodes; Destroyed excluded) + Location/Circuit/effect VP tracked as reward VP. Market VP is the printed VP on bought VP-category cards.",
      victory: "Most VP after the Cycle 16 Draft, or when a player loses both Servers (finish current Collapse Node, skip remaining Nodes/Draft). Equal VP is a tie.",
      setup: "Configurable per game — see facts.configurable. Read those flags before assuming Crypto piles, mid-cycle draws, Locations, or trailing Circuit Rewards are in play. Cohorts use Configure defaults unless noted in configurable.cohortDefault.",
    },
    configurable: configurableFacts(),
    market: {
      gameCharacterPiles: 0, gameVpPiles: 0,
      currency: "optional Crypto shelf when draftCrypto is on: " + (CURRENCY_PILES.length ? CURRENCY_PILES.map(pile => `${pile.cardId} x${pile.supply}`).join(", ") : "none") + "; otherwise Crypto comes from Character effects",
      rotatingOffersPerDraft: DRAFT_OFFER_COUNT, rotatingSolarMonksPerDraft: `${DRAFT_SOLAR_MONK_COUNT} Solar-monk slot when any is enabled (VP Character: 1 Action to play)`, rotatingCopiesPerPlayer: DRAFT_COPIES_PER_PLAYER,
      rotatingOfferSlots: DRAFT_SLOT_SUMMARY,
      rotatingOfferRules: DRAFT_PHASE_SUMMARY,
      earlyCycleCostCap: `Cycles 1–${DRAFT_EARLY_CYCLES}: offered cards cost 1–${DRAFT_EARLY_COST_MAX} Crypto`,
    },
    startingDeck: [...deck].map(([name, count]) => ({ name, count })),
    // Generated cards are omitted unless a player starts with them (Shyte-Coin is generated content).
    cards: content.cards.filter(card => !card.generated || content.startingDeck.some(start => (start.definitionId ?? start.id) === (card.definitionId ?? card.id))).map(card => ({
      id: card.definitionId ?? card.id, name: card.name, pool: pool(card), type: card.type, ...(card.cardClass ? { cardClass: card.cardClass } : {}),
      cost: card.cost, power: card.power ?? 0, ...(card.vp ? { vp: card.vp } : {}), ...(card.cryptoValue !== undefined ? { cryptoValue: card.cryptoValue } : {}),
      ...(card.duration ? { duration: card.duration } : {}), text: card.effect,
    })),
    locations: content.locations.map(location => ({ id: location.id, name: location.name, rule: location.rule, read: locationRead(location) })),
    circuitRewards: content.circuitRewards.map(reward => ({ id: reward.id, name: reward.name, text: reward.text ?? reward.name, ...(reward.awardTrailing ? { awardTrailing: true } : {}) })),
    mods: [...builtinMods, ...authoredMods],
  };
}
