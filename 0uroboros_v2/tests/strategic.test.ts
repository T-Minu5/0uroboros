import { describe, expect, it } from "vitest";
import { EVALUATION_BASE_CARDS, EVALUATION_CHAOS_CARDS, EVALUATION_CRYPTO_CARDS, EVALUATION_VP_CARDS, createStrategicMarket } from "../src/evaluationMarket";
import { createSession, firstLegalSelection, seededRandom, type RuntimeSession, type RuntimeEvent } from "../src/runtime";
import { legalNodes, canDeploy, type Card } from "../src/game";

const make = (seed = 41) => createSession({ evaluationContent: true, strategicMarket: true, carryover: true, priorityPreference: "higher", random: seededRandom(seed) });
const card = (name: string, id = name): Card => ({ ...EVALUATION_BASE_CARDS.find(card => card.name === name)!, id });
const chaosCard = (name: string, id = name): Card => ({ ...EVALUATION_CHAOS_CARDS.find(card => card.name === name)!, id });
const vpCard = (name: string, id = name): Card => ({ ...EVALUATION_VP_CARDS.find(card => card.name === name)!, id });
function empty(session: RuntimeSession) {
  session.state.players.forEach(player => { player.hand = []; player.draw = []; player.discard = []; player.destroyed = []; });
}
function drain(session: RuntimeSession, choose = true) {
  const events: RuntimeEvent[] = [];
  while (session.pendingCount || (choose && session.state.choice)) {
    if (session.state.choice) events.push(session.choose(firstLegalSelection(session.state.choice)));
    else events.push(session.step()!.event);
    if (events.length > 600) throw new Error("Resolution stalled.");
  }
  return events;
}
function cycle(session: RuntimeSession, play = false) {
  const events: RuntimeEvent[] = drain(session);
  for (let turn = 1; turn <= 3; turn++) {
    if (play) for (const item of [...session.state.players[0].hand]) {
      const target = legalNodes(session.state.turn, session.state.nodeOrder).find(node => !canDeploy(item, session.state.players[0].actions, session.state.turn, node, session.state.nodes[node].cards[0].length, session.view().openNodes));
      if (target !== undefined) session.deploy(item.id, target);
    }
    session.endTurn(); events.push(...drain(session));
  }
  return events;
}
function draft(session: RuntimeSession) { cycle(session); return Date.now(); }

describe("Strategic evaluation Draft", () => {
  it("has four persistent Base piles, two rotating Base offers, and four rotating Chaos offers", () => {
    expect(EVALUATION_BASE_CARDS.length).toBeGreaterThan(12); expect(EVALUATION_VP_CARDS.length).toBeGreaterThanOrEqual(3); expect(EVALUATION_CRYPTO_CARDS.length).toBeGreaterThanOrEqual(3); expect(EVALUATION_CHAOS_CARDS.length).toBeGreaterThanOrEqual(5);
    const piles = createStrategicMarket(seededRandom(41));
    expect(piles.filter(pile => pile.category === "Base")).toHaveLength(4);
    expect(piles.filter(pile => pile.category !== "Crypto").every(pile => pile.supply === 8)).toBe(true);
    expect(piles.filter(pile => pile.category === "Crypto").every(pile => pile.supply === 16)).toBe(true);
    const other = createStrategicMarket(seededRandom(99));
    expect(other.filter(pile => pile.category === "Base")).toHaveLength(4);
    expect(new Set(piles.filter(pile => pile.category === "Base").map(pile => pile.id))).not.toEqual(new Set(other.filter(pile => pile.category === "Base").map(pile => pile.id)));
    const session = make(); draft(session);
    expect(session.state.market.filter(pile => pile.category === "Base")).toHaveLength(6);
    expect(session.state.market.filter(pile => pile.category === "Base" && pile.rotating)).toHaveLength(2);
    expect(session.state.market.filter(pile => pile.category === "Chaos")).toHaveLength(4);
    expect(session.state.market.filter(pile => pile.category === "Chaos").every(pile => pile.remaining?.join() === "2,2")).toBe(true);
    const stableIds = new Set(session.state.market.filter(pile => pile.category === "Base" && !pile.rotating).map(pile => pile.id));
    expect(session.state.market.filter(pile => pile.category === "Base" && pile.rotating).every(pile => !stableIds.has(pile.id))).toBe(true);
  });

  it("keeps shared purchases atomic while Chaos stock and cooldowns belong to each player", () => {
    const session = make(); const now = draft(session);
    session.state.players.forEach(player => { player.wallet = 80; });
    const shared = session.state.market.find(pile => pile.category === "Base" && !pile.rotating && pile.card.cost <= 30) ?? session.state.market[0];
    shared.supply = 1;
    session.buy(shared.id, now, 0);
    const untouched = session.state.players[1].wallet;
    expect(() => session.buy(shared.id, now, 1)).toThrow(/unavailable/);
    expect(session.state.players[1].wallet).toBe(untouched);
    const chaos = session.state.market.find(pile => pile.category === "Chaos" && (pile.card.cost ?? 0) <= 40)!;
    session.state.players.forEach(player => { player.wallet = Math.max(player.wallet, 80); });
    session.buy(chaos.id, now, 0); session.buy(chaos.id, now, 1);
    expect(chaos.remaining).toEqual([1, 1]);
    expect(() => session.buy(chaos.id, now + 1999, 0)).toThrow(/cooldown/);
    session.buy(chaos.id, now + 2000, 0);
    expect(chaos.remaining).toEqual([0, 1]);
    expect(() => session.buy(chaos.id, now + 4000, 0)).toThrow(/unavailable/);
    const baseOffers = session.state.market.filter(pile => pile.category === "Base" && pile.rotating).map(pile => pile.id);
    session.endDraft(0); session.endDraft(1); session.nextCycle(); cycle(session);
    expect(session.state.market.find(pile => pile.id === shared.id)!.supply).toBe(0);
    expect(session.state.market.filter(pile => pile.category === "Base" && pile.rotating)).toHaveLength(2);
    expect(session.state.market.filter(pile => pile.category === "Base" && pile.rotating).every(pile => pile.supply === 8)).toBe(true);
    expect(session.state.market.filter(pile => pile.category === "Base" && pile.rotating).some(pile => !baseOffers.includes(pile.id)) || EVALUATION_BASE_CARDS.length <= 6).toBe(true);
    expect(session.state.market.filter(pile => pile.category === "Chaos").every(pile => pile.remaining?.join() === "2,2")).toBe(true);
  });

  it("supports separate End Draft, undo until both finish, and authoritative expiry", () => {
    const session = make(); const now = draft(session);
    session.endDraft(0);
    expect(session.state.draftReady).toEqual([true, false]); expect(session.state.draftEnded).toBe(false);
    expect(() => session.nextCycle()).toThrow(/End Draft/);
    session.undoEndDraft(0, now); expect(session.state.draftReady).toEqual([false, false]);
    session.endDraft(0); session.endDraft(1);
    expect(() => session.undoEndDraft(0, now)).toThrow(/no longer/);
    expect(session.state.draftEnded).toBe(true);
    const timed = make(); draft(timed);
    expect(timed.expireDraft(timed.state.draftEndsAt! - 1)).toBeNull();
    expect(timed.expireDraft(timed.state.draftEndsAt!)).not.toBeNull();
    expect(timed.state.draftReady).toEqual([true, true]);
    expect(() => timed.buy(timed.state.market[0].id)).toThrow(/active Draft/);
  });
});

describe("Strategic card systems", () => {
  it("pauses for a mandatory move, excludes full destinations, and preserves revelation and ownership", () => {
    const session = make(); empty(session);
    const [source, full, target] = session.view().openNodes;
    session.state.players[0].hand = [card("Phase Runner", "mover")];
    session.state.nodes[full].cards[0] = Array.from({ length: 4 }, (_, i) => ({ card: card("Dash Relay", `block-${i}`), owner: 0, node: full, order: 100 + i, revealed: true }));
    session.deploy("mover", source); session.endTurn(); drain(session, false);
    expect(session.pendingCount).toBe(0); expect(session.step()).toBeNull();
    expect(session.state.choice?.options.map(option => option.id)).toEqual([`node-${target}`]);
    expect(() => session.choose(`node-${full}`)).toThrow(/legal/);
    const event = session.resolveChoiceTimeout();
    expect(event).toMatchObject({ kind: "move", sourceNode: source, targetNode: target });
    expect(session.state.nodes[target].cards[0][0]).toMatchObject({ owner: 0, revealed: true, card: { id: "mover" } });
    drain(session); expect(session.state.phase).toBe("runtime"); expect(session.state.turn).toBe(2);
  });

  it("legacy probability pushes its full amount to a linear neighbor and preserves modifier sum", () => {
    const session = make(); empty(session); session.state.nodeOrder=[0,1,2,3,4];
    session.state.players[0].hand = [{...card("Signal Surveyor", "telemetry"), power:2, onReveal:[{kind:"probability",amount:15}]}];
    session.deploy("telemetry", 2); session.endTurn();drain(session,false);
    expect(session.state.choice?.options.map(option=>option.id)).toEqual(["push-left","push-right"]);
    const event=session.choose("push-right");
    expect(event).toMatchObject({kind:"power",amount:3,sourceNode:2,targetNode:3});
    expect(session.state.nodes[2].powers[0]).toBe(-1);
    expect(session.state.nodes[3].powers[0]).toBe(3);
    expect(session.state.nodes.reduce((sum,node)=>sum+node.powerModifiers[0],0)).toBe(0);
    expect(session.state.nodes.every(node=>node.powerModifiers[1]===0)).toBe(true);
    drain(session);
  });

  it("supports scripted source choices from imported cards", () => {
    const session = make(); empty(session); const node = session.view().openNodes[0];
    session.state.players[0].hand = [card("Code Sniper", "sniper")];
    session.deploy("sniper", node); session.endTurn(); drain(session, false);
    expect(session.state.choice?.options).toEqual([
      { id: "actions", label: "+2 Actions" },
      { id: "draw", label: "+2 Cards" },
      { id: "crypto", label: "+2 Crypto" },
    ]);
    const event = session.choose("draw");
    expect(event).toMatchObject({ kind: "draw", amount: 0 });
    drain(session);
  });

  it("resolves a mandatory choice once, without applying an invented deadline", () => {
    const session = make(); empty(session); const node = session.view().openNodes[0];
    session.state.players[0].hand = [card("Code Sniper", "key")];
    session.deploy("key", node); session.endTurn(); drain(session, false);
    expect(session.state.choice?.options).toEqual([{ id: "actions", label: "+2 Actions" }, { id: "draw", label: "+2 Cards" }, { id: "crypto", label: "+2 Crypto" }]);
    expect(session.state.players[0].wallet).toBe(0);
    session.choose("crypto"); expect(session.state.players[0].wallet).toBe(2);
    expect(() => session.choose("crypto")).toThrow(/No choice/);
    drain(session); expect(session.state.phase).toBe("runtime");
  });

  it("uses imported VP cards for restore and scoring", () => {
    const session = make(); empty(session); const node = session.view().openNodes[0];
    session.state.players[0].servers.primary = 1800;
    session.state.players[0].hand = [vpCard("Basic Encryption", "basic"), vpCard("Quantum Archive", "archive")];
    session.deploy("basic", node); session.deploy("archive", node); session.endTurn();
    const events = drain(session).filter(event => event.kind === "restore");
    expect(events.map(event => event.amount)).toEqual([50, 150]);
    expect(session.state.players[0].servers.primary).toBe(2000);
    expect(session.state.players[0].totalVP).toBeGreaterThanOrEqual(4);
  });

  it("supports imported backup-targeting attacks", () => {
    const session = make(); empty(session); const node = session.view().openNodes[0];
    session.state.players[1].servers = { primary: 500, backup: 300 };
    session.state.players[0].hand = [chaosCard("Nyx Luna", "nyx"), chaosCard("1337 Speaker", "speaker")];
    session.deploy("nyx", node); session.deploy("speaker", node); session.endTurn();
    const events = drain(session).filter(event => event.kind === "drain");
    expect(events.map(event => [event.cardId, event.target, event.amount])).toEqual([
      ["nyx", "backup", 75],
      ["speaker", "backup", 200],
    ]);
    expect(session.state.players[1].servers).toEqual({ primary: 500, backup: 25 });
  });

  it("supports Hacker cards that mill and swing Server integrity", () => {
    const session = make(); empty(session); const node = session.view().openNodes[0];
    session.state.players[0].servers = { primary: 1500, backup: 1500 };
    session.state.players[1].servers = { primary: 2000, backup: 1500 };
    session.state.players[1].draw = [card("Dash Relay", "mill-1"), card("Slash-Dot", "mill-2"), card("Cache Crawler", "mill-3")];
    session.state.players[1].discard = [card("Cycle Cache", "mill-stock")];
    session.state.players[0].hand = [chaosCard("Sudo Demiurge", "sudo"), chaosCard("Cicada 3301", "cicada")];
    session.deploy("sudo", node); session.deploy("cicada", node); session.endTurn();
    const events = drain(session);
    expect(events.filter(event => event.cardId === "sudo" && event.kind === "trash")[0]).toMatchObject({ amount: 1, targetOwner: 1 });
    expect(events.filter(event => event.cardId === "cicada" && event.kind === "trash")[0]).toMatchObject({ amount: 2, targetOwner: 1 });
    expect(session.state.players[1].draw).toHaveLength(0);
    expect(session.state.players[1].discard.map(item => item.id)).toEqual(expect.arrayContaining(["mill-1", "mill-2", "mill-3"]));
    expect(session.state.players[1].servers.primary).toBe(1725);
    expect(session.state.players[0].servers.primary).toBe(1800);
    expect(events.filter(event => event.cardId === "sudo" && event.kind === "actions")[0]).toMatchObject({ amount: 1, targetOwner: 0 });
  });

  it("counts the deployment Cycle, resolves Duration from the bank next Cycle, then expires to Discard", () => {
    const session = make(); empty(session);
    session.state.players[0].hand = [card("Cycle Cache", "clock")];
    session.deploy("clock", session.view().openNodes[0]);
    const first = cycle(session);
    expect(first.filter(event => event.cardId === "clock" && event.kind === "crypto")).toHaveLength(1);
    expect(session.state.players[0].bank).toMatchObject([{ card: { id: "clock" }, enteredCycle: 1, expiresCycle: 2 }]);
    session.endDraft(0); session.endDraft(1); session.nextCycle();
    const second = cycle(session);
    const bankStart = second.findIndex(event => event.text.startsWith("Effect Bank resolves"));
    const income = second.findIndex(event => event.cardId === "clock" && event.kind === "crypto");
    expect(income).toBeGreaterThan(bankStart);
    expect(second[income].node).toBeUndefined();
    expect(session.state.players[0].bank).toEqual([]);
    expect(session.state.players[0].discard.some(card => card.id === "clock")).toBe(true);
  });

  it("enforces four bank slots and resolves stored cards oldest first", () => {
    const session = make(); empty(session);
    const player = session.state.players[0];
    player.bank = [4, 3, 2, 1].map(order => ({ card: { ...card("Cycle Cache", `bank-${order}`), duration: 99 }, enteredCycle: 1, order }));
    player.hand = [card("Cycle Cache", "overflow")];
    session.deploy("overflow", session.view().openNodes[0]);
    const events = cycle(session);
    expect(events.filter(event => event.cardId?.startsWith("bank-") && event.kind === "crypto").map(event => event.cardId)).toEqual(["bank-1", "bank-2", "bank-3", "bank-4"]);
    expect(player.bank).toHaveLength(4);
    expect(player.discard.some(card => card.id === "overflow")).toBe(true);
  });
});

describe("Unmodified-economy strategic match runs", () => {
  it("has both players acquire, reshuffle and deploy purchased cards over four Cycles across three seeds", () => {
    for (const seed of [3, 11, 42]) {
      const session = make(seed);
      const acquired = [new Set<string>(), new Set<string>()];
      const revealedPurchases = [new Set<string>(), new Set<string>()];
      let bought = 0;
      for (let index = 0; index < 4; index++) {
        const events = cycle(session, true);
        for (const event of events) if (event.kind === "reveal" && event.owner !== undefined && event.cardId && acquired[event.owner].has(event.cardId)) revealedPurchases[event.owner].add(event.cardId);
        expect(session.state.phase).toBe("draft");
        if (session.state.circuitEligible.includes(0)) session.claimCircuitReward(0);
        const now = Date.now();
        for (let beat = 0; beat < 35 && !session.state.draftEnded; beat++) {
          const time = now + beat * 2200;
          if (!session.state.draftReady[0]) {
            const affordable = session.state.market.filter(pile => (pile.remaining ? pile.remaining[0] : pile.supply) > 0 && pile.card.cost <= session.state.players[0].wallet);
            const holdings = [...session.state.players[0].draw, ...session.state.players[0].discard, ...session.state.players[0].bank.map(entry => entry.card)];
            const priorities = ["chronos-cache", "temporal-rift", "ghost-key", "quantum-telemetry", "banishing-ritual"];
            affordable.sort((a, b) => {
              const score = (item: typeof a) => (holdings.some(card => card.name === item.card.name) ? 20 : 0) + (priorities.includes(item.card.definitionId ?? "") ? priorities.indexOf(item.card.definitionId!) : 10);
              return score(a) - score(b);
            });
            if (affordable.length) {
              const purchase = session.buy(affordable[0].id, time, 0); acquired[0].add(purchase.cardId!); bought++;
            } else session.endDraft(0);
          }
          const bot = session.opponentDraftStep(time);
          if (bot?.kind === "purchase") { acquired[1].add(bot.cardId!); bought++; }
        }
        expect(session.state.draftEnded).toBe(true);
        const cards = session.state.players.flatMap((player, owner) => [...player.draw, ...player.hand, ...player.discard, ...player.destroyed, ...player.bank.map(entry => entry.card), ...session.state.nodes.flatMap(node => node.cards[owner].map(placement => placement.card))]).concat(session.state.trash);
        expect(cards).toHaveLength(20 + bought + cards.filter(card=>card.id.includes(":generated-")).length);
        expect(new Set(cards.map(card => card.id)).size).toBe(cards.length);
        expect(session.state.players.every(player => player.wallet >= 0 && player.bank.length <= 4)).toBe(true);
        session.nextCycle();
      }
      expect(acquired[0].size).toBeGreaterThan(2); expect(acquired[1].size).toBeGreaterThan(2);
      expect(revealedPurchases[0].size).toBeGreaterThan(0); expect(revealedPurchases[1].size).toBeGreaterThan(0);
    }
  });
});

describe("Strategic deadline presentation barrier", () => {
  it("does not expire or advance past a pending opponent claim, then completes normally", () => {
    const session = make(1);
    session.endTurn(); drain(session); session.endTurn(); drain(session); session.endTurn();
    let foundDraft = false;
    while (session.pendingCount) {
      if (session.step()!.event.kind === "draft") { foundDraft = true; break; }
    }
    expect(foundDraft).toBe(true); expect(session.pendingCount).toBe(1);
    const before = structuredClone(session.state);
    const expiredAt = session.state.draftEndsAt! + 1;
    expect(session.expireDraft(expiredAt)).toBeNull();
    expect(() => session.nextCycle()).toThrow(/finish resolution/);
    expect(session.state).toEqual(before);
    const pendingClaim = session.step()!;
    expect(pendingClaim.event.source).toBe("circuit");
    expect(pendingClaim.event.owner).toBe(1);
    expect(session.state.circuitReward.claimed).toContain(1);
    expect(session.pendingCount).toBe(0);
    expect(session.expireDraft(expiredAt)).not.toBeNull();
    expect(session.nextCycle().kind).toBe("cycle");
    expect(session.state.cycle).toBe(2);
    expect(session.step()).toBeNull();
  });

  it("uses the supplied Mega-Cache definition as five Crypto without deployable Power", () => {
    const mega = EVALUATION_CRYPTO_CARDS.find(card => card.name === "Mega-Cache")!;
    expect(mega).toMatchObject({ type: "Crypto", cost: 9, cryptoValue: 5 });
    expect(mega.power).toBeUndefined();
    const session = make(); empty(session);
    session.state.players[0].hand = [{ ...mega, id: "mega" }];
    const events = cycle(session);
    expect(events.find(event => event.cardId === "mega" && event.kind === "crypto")).toMatchObject({ amount: 5 });
  });
});

describe("Strategic adversarial scoring and lethal resolution", () => {
  it("finishes the lethal Glitch-Witch Node's remaining card effects and Location awards before stopping", () => {
    const session = make(); empty(session);
    session.state.turn = 3;
    const node = 1;
    session.state.nodes[node].location = { id: "award", name: "Occult archive", rule: "On collapse, the winner gains 2 Victory Points.", reward: "+2 VP.", effects: [{ kind: "vp", amount: 2 }] };
    const glitch: Card = { ...chaosCard("H3x1-D3x1", "lethal-glitch"), onCollapse: [{ kind: "drain", amount: 50 }] };
    const chronos = card("Cycle Cache", "remaining-card");
    session.state.nodes[node].cards[0] = [
      { card: glitch, owner: 0, node, order: 1, revealed: true },
      { card: chronos, owner: 0, node, order: 2, revealed: true },
    ];
    session.state.players[1].servers = { primary: 0, backup: 30 };
    session.state.players[0].bank = [{ card: card("Cycle Cache", "bank-must-not-fire"), enteredCycle: 1, expiresCycle: 2, order: 0 }];
    session.endTurn(); const events = drain(session);
    const lethal = events.findIndex(event => event.cardId === "lethal-glitch" && event.kind === "drain");
    const remaining = events.findIndex(event => event.cardId === "remaining-card" && event.kind === "crypto");
    const award = events.findIndex(event => event.node === node && event.kind === "vp");
    const over = events.findIndex(event => event.kind === "gameover");
    expect(lethal).toBeGreaterThanOrEqual(0);
    expect(remaining).toBeGreaterThan(lethal);
    expect(award).toBeGreaterThan(remaining);
    expect(over).toBeGreaterThan(award);
    expect(events.some(event => event.node !== undefined && event.node > node)).toBe(false);
    expect(events.some(event => event.cardId === "bank-must-not-fire")).toBe(false);
    expect(events.some(event => ["circuit", "draft"].includes(event.kind))).toBe(false);
    expect(session.state.players[0].destructionVP).toBe(12);
    expect(session.state.players[0].rewardVP).toBeGreaterThanOrEqual(2);
    expect(session.state.players[1].servers).toEqual({ primary: 0, backup: 0 });
    expect(session.state.phase).toBe("gameover");
    const score = session.view().finalScore![0];
    expect(score.locationVP).toBe(2);
    expect(score.destructionVP).toBe(12);
    expect(score.cardVP + score.locationVP + score.circuitVP + score.effectVP + score.destructionVP).toBe(score.total);
  });

  it("recovers an opponent-origin VP instance from shared Trash into the recovering owner's score only", () => {
    const session = make(); empty(session);
    const mass = EVALUATION_VP_CARDS.find(card => card.name === "Quantum Archive")!;
    const unit = EVALUATION_VP_CARDS.find(card => card.name === "Basic Encryption")!;
    const node = session.view().openNodes[0];
    session.state.trash = [{ ...mass, id: "1:formerly-owned-mass" }];
    session.state.players[1].destroyed = [{ ...unit, id: "1:permanently-destroyed" }];
    const seance: Card = {
      id: "seance",
      definitionId: "recursive-seance-test",
      name: "Salvage Relay",
      type: "Character",
      power: 2,
      cost: 3,
      art: "",
      effect: "On reveal, recover one card from shared Trash to your Discard.",
      onReveal: [{ kind: "recover" }],
    };
    session.state.players[0].hand = [seance];
    const stock = session.state.market.map(pile => ({ id: pile.id, supply: pile.supply }));
    expect(session.view().players.map(player => player.totalVP)).toEqual([0, 0]);
    session.deploy("seance", node); session.endTurn(); drain(session, false);
    expect(session.state.choice?.options.map(option => option.id)).toEqual(["1:formerly-owned-mass"]);
    session.choose("1:formerly-owned-mass");
    expect(session.view().players.map(player => player.totalVP)).toEqual([3, 0]);
    expect(session.state.players[0].discard.map(card => card.id)).toEqual(["1:formerly-owned-mass"]);
    expect(session.state.trash).toEqual([]);
    expect(session.state.players[1].destroyed.map(card => card.id)).toEqual(["1:permanently-destroyed"]);
    expect(session.state.market.map(pile => ({ id: pile.id, supply: pile.supply }))).toEqual(stock);
    drain(session);
    expect(session.view().players.map(player => player.totalVP)).toEqual([3, 0]);
  });

  it("counts actual VP market purchases in the final Draft before scoring", () => {
    const session = make(); draft(session);
    session.state.cycle = 16;
    const before = session.view().players[0].totalVP;
    const vpPiles = session.state.market.filter(pile => pile.category === "VP");
    expect(vpPiles).toHaveLength(3);
    const printed = vpPiles.map(pile => pile.card.vp!), bought = printed.reduce((sum, vp) => sum + vp, 0);
    session.state.players[0].wallet = vpPiles.reduce((sum, pile) => sum + pile.card.cost, 0) + 3;
    for (const pile of vpPiles) session.buy(pile.id);
    expect(session.state.players[0].wallet).toBe(3);
    expect(session.view().players[0].totalVP).toBe(before + bought);
    expect(session.state.players[0].discard.filter(card => card.id.includes("acquired")).map(card => card.vp)).toEqual(printed);
    expect(session.state.phase).toBe("draft");
    session.endDraft(0); session.endDraft(1); session.nextCycle();
    expect(session.state.phase).toBe("gameover");
    expect(session.state.players[0].totalVP).toBe(before + bought);
    expect(session.state.endedReason).toContain(`${before + bought} to`);
    const score = session.view().finalScore![0];
    expect(score.vpCards.filter(card => card.id.includes("acquired")).map(card => card.vp)).toEqual(printed);
    expect(score.cardVP + score.locationVP + score.circuitVP + score.effectVP + score.destructionVP).toBe(score.total);
  });
});
