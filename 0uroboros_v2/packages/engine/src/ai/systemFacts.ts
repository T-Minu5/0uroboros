/**
 * The implemented game as plain data, compiled from the stored content and the rules constants
 * the runtime actually uses. Evaluators read this instead of importing the engine.
 */
import type { ContentDocument } from "../authoring/contentModel";
import { DRAFT_COPIES_PER_PLAYER, DRAFT_EARLY_COST_MAX, DRAFT_EARLY_CYCLES, DRAFT_OFFER_COUNT, DRAFT_PHASE_SUMMARY, DRAFT_SLOT_SUMMARY, DRAFT_SOLAR_MONK_COUNT } from "../evaluationMarket";
import { DEFAULT_BUILTIN_MODS } from "../builtinMods";
import { defaultMostCircuitsBonusVP, defaultServerVP, initialWeights, serverMaximums, type Card } from "../game";
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
      id: "noLocations", surface: "configure", label: "No location text",
      default: false, cohortDefault: false,
      notes: "When on, every Node is No Man's Land for the whole game (no Location effects). Configure label: No location text.",
    },
    {
      id: "middleNodesOnly", surface: "configure", label: "Short Circuit (3 Locations)",
      default: false, cohortDefault: false,
      notes: "Game mode Short Circuit: only Nodes 2–4 are in play; one opens each Runtime turn (random order). Nodes 1 and 5 stay closed — no deploys, moves, holograms, Power push/pull, Locations, or Collapse. Extended runtime (default) uses all five Nodes. Open-order weights use the first three buckets (30/25/20) on Short Circuit Nodes.",
    },
    {
      id: "tenCardDraft", surface: "configure", label: "10-card Draft",
      default: false, cohortDefault: false,
      notes: "Default Draft is 8 rotating offers (Action/Utility ×2, Hacker/Crypto ×2, Attack, Horror, Solar Monk, VP) with a soft floor of two +2 Crypto cards. When on, adds two Chaos fills for a 10-card offer.",
    },
    {
      id: "mostCircuitsBonusVP", surface: "configure", label: "Most Circuits end-game bonus VP",
      default: defaultMostCircuitsBonusVP, cohortDefault: 0,
      notes: "Awarded once at game end to the seat with more Circuit wins across completed Cycles (a Circuit win = strictly more Locations that Cycle). Ties award nothing. 0 disables. Eco-Strat set the initial default to 6; headless cohorts omit it unless the harness passes a value. Irrelevant when noLocations is on.",
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
      notes: "Including awardTrailing catch-up rewards. Those stay in the pool every game (Configure no longer toggles them).",
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
      notes: "Buckets 30/25/20/15/10 assign by open order (first Node to open gets 30, … last gets 10). Middle-Nodes tables use only 30/25/20. Probability transfer can still move weight during Runtime. ControlledWeight drives reveal priority; a Collapse particle Node is rolled from final weights for UI.",
    },
    {
      id: "actionCarryover", surface: "session-fixed", label: "Legacy session carryover flag",
      default: true, cohortDefault: true,
      notes: "There is no Action resource anymore. Sessions still require the carryover boolean for API compatibility; it does not change play. User-facing and cohort sessions pass carryover: true.",
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
      opening: "Extended runtime (default): a shuffled reveal order opens three Nodes on turn 1, four on turn 2, five on turn 3 (turns 2–3 also grant a draw at start). Short Circuit (middleNodesOnly): only Nodes 2–4 are in play; one opens each Runtime turn; Nodes 1 and 5 stay closed. Open Nodes stay playable until Collapse.",
      actions: "There is no Action resource. Characters and VP cards deploy free during Runtime; wallet Crypto settles at Draft, but generated Crypto with printed Power (e.g. Crypto-Shyte) can deploy. Legacy gainActions steps on cards are ignored.",
      midCycleDraw: "Fixed rule: each player draws 1 card at the start of Runtime turns 2 and 3.",
      draftCrypto: "Removed. There is no persistent Crypto shelf. Crypto-type cards appear in the rotating Hacker/Crypto Draft slots; Wallet also comes from Character Crypto effects and held Crypto that auto-resolves at Draft.",
      startingDeck: "Both seats use the active starting deck from content. Current Standard is weaker than older builds (mostly Shyte-Coin plus a thin Character/VP core), so early hands are softer and the Draft shapes the economy more.",
      deploy: "Cards deploy face down. Max 4 cards+holograms per seat per Node. Characters, VP and Crypto all deploy free. Crypto left in hand still auto-resolves cryptoValue at Draft; Crypto played fires onReveal/onCollapse (currency cards typically reprint their payout on reveal). Reveal alternates priority seat then other, chronological within a seat; each reveal fully resolves its onReveal before the next.",
      power: "Higher numeric Power controls a Node (negatives allowed; empty side is 0 so 0 beats negative). Equal totals tie and split ControlledWeight. ControlledWeight = sum of weights of Nodes you win + half the weights of ties; higher ControlledWeight gets next reveal priority (ties keep current).",
      primaryServer: serverMaximums.primary, backupServer: serverMaximums.backup,
      destructionVP: `Destroying a Primary Server gives +${defaultServerVP.primary} VP, a Backup +${defaultServerVP.backup} VP (Configure can change those awards). Losing both Servers ends the game after the current Collapse Node finishes; most VP still wins.`,
      drainRestore: "Drain damages available enemy Primary then Backup (clamps at 0, no spill). Restore repairs available Primary then Backup up to max and cannot resurrect a destroyed Server. Destroying a Server awards destruction VP once.",
      nodeWeights: initialWeights.join(", ") + " assigned by open order",
      collapse: "Resolve Nodes 1→5. At each Node: Location onCollapse → card onCollapse → recalculate Power → winner/tie → Location Reward. Then Effect Bank onCollapse (oldest first). Then a weight lottery picks a particle Node for the ControlledWeight UI; Circuit eligibility stays Location-lead based.",
      locations: "Each Cycle deals one Location onto each of the 5 Nodes (unless noLocations). Whoever has more Power at a Node when it collapses wins that Location and its collapse effects fire once with the winner as the actor. 'Ongoing' effects fire at the start of turns 2 and 3 for whoever leads the Node then; 'when a card is played here' effects fire for that card's owner. Text says who benefits: you (the winner), your opponent (the loser), both players, the player with the least VP. A Location that rewards the loser, or hands out Glitch/Shyte-Coin junk, is worth conceding; one that draws, Drains or pays VP is worth contesting. Locations won also count toward the Circuit Reward. 'read' is the default AI's valuation at Cycle 8.",
      circuit: "Whoever won more Locations in the Cycle is eligible for one random Circuit Reward; a Locations-won tie makes both eligible for a normal (non-trailing) Circuit Reward — awardTrailing catch-up rewards are excluded from that draw. When Location counts differ, a reward with awardTrailing goes instead to the trailing player: lower VP once each enemy Server still standing adds the share of its destruction VP matching the share of its health already lost (both eligible when level). Catch-up (awardTrailing) rewards stay in the pool every game — Configure no longer toggles them — but they only apply when Location counts differ.",
      runtimeHacks: "Secret authored reveal combos. After a card's reveal effects (and Location on-play / opening schedule queued with that reveal) finish, if that seat has revealed every required card inside the hack's window (game, Cycle, Runtime turn, same Node across the game, or same Node within one Cycle), both seats see the award modal; only the unlocking seat gets the reward (usually a card into hand). Each hack fires at most once per seat per game. Face-down deploys do not count.",
      draft: "Spendable Crypto comes from Character effects, Crypto cards bought from the rotating Hacker/Crypto slots, and any held Crypto that auto-resolves at Draft. Default Draft is 8 fixed slots (Action/Utility ×2, Hacker/Crypto ×2, Attack, Horror, Solar Monk, VP) with a soft floor of two cards that gain +2 Crypto (Crypto-type cards count via cryptoValue); Configure tenCardDraft expands to 10 with two Chaos fills. There is no persistent Crypto shelf. Crypto/Wallet resets each Cycle; unspent Crypto is lost. Bought cards go to the Discard. Draft lasts up to 90 seconds.",
      zones: "Draw, Hand, Discard, Nodes (board), Effect Bank (duration cards), Trash (shared, recoverable when text allows), Destroyed (permanent). End-of-Cycle: remaining hand to Discard; new Cycle draws 5.",
      mods: "Mods attach to host cards (Circuit/collection awards often choose between two hosts, prefer unmodded). Built-ins include double printed effects, Power aura to allies at the Location, and movable-each-turn. Authored mods (Aura Farming, Lefty, etc.) add hooks such as onReveal / recurring. Holograms: a card can create a hologram at the mirrored Node (1↔5, 2↔4; center does nothing); holograms occupy a slot, add Power, cannot be targeted, and clear after that Node's Collapse.",
      vpSources: "Final VP = destruction VP (Server kills) + printed VP on owned cards in active zones (Draw/Hand/Discard/Nodes; Destroyed excluded) + Location/Circuit/effect VP tracked as reward VP. When mostCircuitsBonusVP > 0, the seat with more Circuit wins across completed Cycles (strict Location lead per Cycle) also gets that bonus once at game end, counted as circuit VP; ties award nothing. Market VP is the printed VP on bought VP-category cards.",
      victory: "Most VP after the Cycle 16 Draft, or when a player loses both Servers (finish current Collapse Node, skip remaining Nodes/Draft). Equal VP is a tie.",
      setup: "Configurable per game — see facts.configurable. Read those flags before assuming mid-cycle draws or Locations are in play. Crypto is drafted from Hacker/Crypto slots (no shelf). Trailing Circuit Rewards are always in the pool. Cohorts use Configure defaults unless noted in configurable.cohortDefault.",
    },
    configurable: configurableFacts(),
    market: {
      gameCharacterPiles: 0, gameVpPiles: 0,
      currency: "none — no persistent Crypto shelf; Crypto-type cards rotate through Hacker/Crypto Draft slots (2 copies per player when offered)",
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
