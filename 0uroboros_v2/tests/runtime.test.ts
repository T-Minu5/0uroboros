import { describe, expect, it } from "vitest";
import { createSession, seededRandom, type RuntimeSession } from "../src/runtime";
import { starterCards } from "../src/game";

const make = (seed = 7) => createSession({ carryover: false, priorityPreference: "higher", random: seededRandom(seed), practiceMarket: [starterCards[0], starterCards[1]] });
function drain(session: RuntimeSession) {
  const events = [];
  let step;
  while ((step = session.step())) {
    events.push(step.event);
    if (events.length > 500) throw new Error("Resolution failed to terminate.");
  }
  return events;
}
function cycle(session: RuntimeSession) {
  for (let turn = 1; turn <= 3; turn++) { session.endTurn(); drain(session); }
}
function ownedCount(session: RuntimeSession, owner: 0 | 1) {
  const player = session.state.players[owner];
  return player.draw.length + player.hand.length + player.discard.length + player.destroyed.length + session.state.nodes.reduce((sum, node) => sum + node.cards[owner].length, 0);
}

describe("Local Runtime session", () => {
  it("requires explicit unresolved policies and mirrors opening without exposing hidden identities", () => {
    const session = make();
    expect(session.state.players[0].hand.map(card => card.name)).toEqual(session.state.players[1].hand.map(card => card.name));
    expect(session.state.players[0].hand).toHaveLength(5);
    const view = session.view();
    expect(view.players[1].hand.every(card => card.hidden && !("name" in card))).toBe(true);
    expect(view.players[0].draw.every(card => !("name" in card))).toBe(true);
    expect(view.players[0].totalVP).toBe(4);
    expect(view.unresolved.length).toBeGreaterThan(0);
  });

  it("deploys face down, blocks illegal input, and reveals separately before effects", () => {
    const session = make();
    const card = session.state.players[0].hand.find(card => card.type !== "Crypto")!;
    session.deploy(card.id, 0);
    expect(session.state.nodes[0].cards[0][0].revealed).toBe(false);
    expect(session.state.nodes[0].powers[0]).toBe(0);
    session.endTurn();
    expect(() => session.deploy(card.id, 1)).toThrow(/Runtime/);
    expect(() => session.endTurn()).toThrow(/resolution/);
    const masked = session.view().nodes.flatMap(node => node.cards[1]);
    expect(masked.every(card => "hidden" in card.card)).toBe(true);
    const events = drain(session);
    const reveal = events.findIndex(event => event.kind === "reveal" && event.cardId === card.id);
    const effect = events.findIndex(event => event.cardId === card.id && event.kind !== "reveal");
    expect(reveal).toBeGreaterThanOrEqual(0);
    expect(effect).toBeGreaterThan(reveal);
    expect(session.state.turn).toBe(2);
    expect(session.state.phase).toBe("runtime");
  });

  it("defers OnReveal Actions to the next turn and preserves actual draw zones", () => {
    const session = make();
    const player = session.state.players[0];
    player.hand = [{ ...starterCards[1], id: "test-dash" }];
    player.draw = [{ ...starterCards[0], id: "test-slash" }];
    player.discard = [];
    session.deploy("test-dash", 0);
    expect(player.actions).toBe(1);
    session.endTurn();
    let actionSeen = false;
    while (session.pendingCount) {
      const step = session.step()!;
      if (step.event.owner === 0 && step.event.kind === "actions") {
        actionSeen = true;
        expect(player.actions).toBe(1);
        expect(player.pendingActions).toBe(1);
      }
    }
    expect(actionSeen).toBe(true);
    expect(player.actions).toBe(2);
    expect(player.pendingActions).toBe(0);
    expect(player.hand.some(card => card.id === "test-slash")).toBe(true);
    expect(player.draw).toHaveLength(0);
  });

  it("sequences all Nodes, Effect Bank, then one Circuit selection before Draft", () => {
    const session = make();
    session.endTurn(); drain(session);
    session.endTurn(); drain(session);
    session.endTurn();
    const events = drain(session);
    expect(events.filter(event => event.kind === "location").map(event => event.node)).toEqual([0, 1, 2, 3, 4]);
    const circuit = events.findIndex(event => event.kind === "circuit");
    const finalReward = events.findIndex(event => event.kind === "reward" && event.node === 4);
    const bank = events.findIndex(event => (event.text.startsWith("Effect Bank") || event.text.startsWith("No Duration cards")));
    const draft = events.findIndex(event => event.kind === "draft");
    expect(finalReward).toBeLessThan(bank);
    expect(bank).toBeLessThan(circuit);
    expect(circuit).toBeLessThan(draft);
    expect(events.filter(event => event.kind === "circuit")).toHaveLength(1);
    expect(session.state.phase).toBe("draft");
    expect(session.state.players[0].wallet).toBe(session.state.players[0].discard.filter(card => card.type === "Crypto").reduce((sum, card) => sum + (card.name === "Kilo-Coin" ? 3 : 2), 0));
    expect(session.state.players[0].hand).toHaveLength(0);
    expect(ownedCount(session, 0)).toBe(10);
  });

  it("purchases atomically to Discard, enforces cooldown, and keeps acquired cards next Cycle", () => {
    const session = make(); cycle(session);
    const player = session.state.players[0];
    player.wallet = 10;
    const pile = session.state.market[0];
    const now = Date.now();
    session.buy(pile.id, now);
    expect(pile.supply).toBe(7);
    expect(player.wallet).toBe(6);
    expect(ownedCount(session, 0)).toBe(11);
    expect(() => session.buy(pile.id, now + 1000)).toThrow(/cooldown/);
    expect(pile.supply).toBe(7);
    session.buy(session.state.market[1].id, now + 1000);
    expect(ownedCount(session, 0)).toBe(12);
    session.endDraft(); session.nextCycle();
    expect(player.wallet).toBe(0);
    expect(player.hand).toHaveLength(5);
    expect(ownedCount(session, 0)).toBe(12);
    expect(session.state.market[0].supply).toBe(7);
  });

  it("deals the remaining deck first and fills each new-Cycle hand from shuffled Discard", () => {
    const session = make(); cycle(session);
    const remaining = session.state.players.map((player, owner) => {
      const cards = [...player.draw, ...player.discard];
      const count = owner === 0 ? 2 : 4;
      player.draw = cards.slice(0, count);
      player.discard = cards.slice(count);
      return [...player.draw];
    });
    session.endDraft(); session.nextCycle();
    session.state.players.forEach((player, owner) => {
      expect(player.hand).toHaveLength(5);
      expect(player.hand.slice(0, remaining[owner].length)).toEqual(remaining[owner]);
      expect(player.discard).toEqual([]);
      expect(player.draw).toHaveLength(5);
      expect(ownedCount(session, owner as 0 | 1)).toBe(10);
    });
  });

  it("runs repeated three-turn Cycles without cloning or losing cards", () => {
    const session = make();
    for (let index = 1; index <= 3; index++) {
      cycle(session);
      expect(session.state.phase).toBe("draft");
      expect(ownedCount(session, 0)).toBe(10);
      expect(ownedCount(session, 1)).toBe(10);
      session.endDraft(); session.nextCycle();
      expect(session.state.cycle).toBe(index + 1);
      expect(session.state.players[0].hand).toHaveLength(5);
      expect(session.state.players[0].pendingActions).toBe(0);
    }
  });

  it("finishes Cycle 16 Draft before scoring approved live VP", () => {
    const session = make();
    for (let index = 1; index <= 16; index++) {
      cycle(session);
      expect(session.state.phase).toBe("draft");
      session.endDraft(); session.nextCycle();
    }
    expect(session.state.cycle).toBe(16);
    expect(session.state.phase).toBe("gameover");
    expect(session.state.players[0].totalVP).toBe(4);
    expect(session.state.endedReason).toMatch(/VP/);
  });

  it("uses no fabricated market when no development fixture was supplied", () => {
    const session = createSession({ carryover: true, priorityPreference: "lower", random: seededRandom(4) });
    expect(session.state.market).toEqual([]);
    expect(session.state.nodes.every(node => node.location === null)).toBe(true);
  });
});

describe("Session edge conditions", () => {
  it("awards destruction VP and ends when the opponent loses both Data Centers", () => {
    const session = make();
    session.state.players[0].hand = [{ ...starterCards[3], id: "fatal-razor" }];
    session.state.players[1].centers = { primary: 0, backup: 50 };
    session.state.players[1].hand = [];
    session.deploy("fatal-razor", 0);
    session.endTurn();
    const events = drain(session);
    expect(session.state.players[1].centers).toEqual({ primary: 0, backup: 0 });
    expect(session.state.players[0].destructionVP).toBe(12);
    expect(session.state.phase).toBe("gameover");
    expect(events.filter(event => event.kind === "gameover")).toHaveLength(1);
    expect(events.some(event => event.kind === "draft")).toBe(false);
  });

  it("gives tied selected Node eligibility to both while keeping rewards unresolved", () => {
    const session = make();
    session.state.players[1].hand = [];
    session.state.players[1].draw = [];
    cycle(session);
    expect(session.state.circuitEligible).toEqual([0, 1]);
    expect(session.state.players[0].destructionVP).toBe(0);
    expect(session.state.players[1].destructionVP).toBe(0);
  });

  it("rejects late purchases without spending Crypto or stock", () => {
    const session = make(); cycle(session);
    session.state.players[0].wallet = 10;
    const pile = session.state.market[0];
    expect(() => session.buy(pile.id, session.state.draftEndsAt! + 1)).toThrow(/deadline/);
    expect(pile.supply).toBe(8);
    expect(session.state.players[0].wallet).toBe(10);
  });
});

describe("Resolution presentation data", () => {
  it("discards starter deployments before Draft Crypto and expires turn-three Actions", () => {
    const session = make();
    session.endTurn(); drain(session);
    session.endTurn(); drain(session);
    const player = session.state.players[0];
    player.hand.push({ ...starterCards[1], id: "late-dash" });
    player.hand.push({ ...starterCards[5], id: "late-crypto" });
    player.actions = 1;
    session.deploy("late-dash", 4);
    session.endTurn();
    let cleaned = false;
    let cryptoSeen = false;
    while (session.pendingCount) {
      const { event } = session.step()!;
      if (event.text.startsWith("End of Cycle.")) {
        cleaned = true;
        expect(session.state.nodes.every(node => node.cards.every(cards => cards.length === 0))).toBe(true);
        expect(player.discard.some(card => card.id === "late-dash")).toBe(true);
        expect(player.pendingActions).toBe(0);
      }
      if (event.kind === "crypto" && event.cardId === "late-crypto") {
        cryptoSeen = true;
        expect(cleaned).toBe(true);
        expect(event.after! - event.before!).toBe(2);
      }
    }
    expect(cryptoSeen).toBe(true);
    session.endDraft(); session.nextCycle();
    expect(player.actions).toBe(2);
    expect(player.pendingActions).toBe(0);
  });

  it("reports actual clamped Drain target values for source-to-target animation", () => {
    const session = make();
    session.state.players[0].hand = [{ ...starterCards[3], id: "clamped-razor" }];
    session.state.players[1].hand = [];
    session.state.players[1].centers = { primary: 30, backup: 1500 };
    session.deploy("clamped-razor", 0);
    session.endTurn();
    const effect = drain(session).find(event => event.kind === "drain")!;
    expect(effect).toMatchObject({ amount: 30, before: 30, after: 0, target: "primary", targetOwner: 1, owner: 0 });
    expect(session.state.players[1].centers.backup).toBe(1500);
  });
});

describe("State and visibility invariants", () => {
  it("preserves ownership, capacity and hidden-information boundaries across varied three-Cycle play", () => {
    for (let seed = 1; seed <= 12; seed++) {
      const session = createSession({ carryover: true, priorityPreference: "higher", random: seededRandom(seed) });
      const assertState = () => {
        for (const owner of [0, 1] as const) {
          const player = session.state.players[owner];
          const cards = [...player.draw, ...player.hand, ...player.discard, ...player.destroyed, ...session.state.nodes.flatMap(node => node.cards[owner].map(placement => placement.card))];
          expect(cards).toHaveLength(10);
          expect(new Set(cards.map(card => card.id)).size).toBe(10);
          expect(player.actions).toBeGreaterThanOrEqual(0);
          expect(player.centers.primary).toBeGreaterThanOrEqual(0);
          expect(player.centers.primary).toBeLessThanOrEqual(2000);
          expect(player.centers.backup).toBeGreaterThanOrEqual(0);
          expect(player.centers.backup).toBeLessThanOrEqual(1500);
          expect(session.state.nodes.every(node => node.cards[owner].length <= 4)).toBe(true);
        }
        const view = session.view();
        for (const card of [...view.players[0].draw, ...view.players[1].draw, ...view.players[1].hand]) expect(Object.keys(card).sort()).toEqual(["hidden", "id"]);
        for (const placement of view.nodes.flatMap(node => node.cards[1])) if (!placement.revealed) expect(Object.keys(placement.card).sort()).toEqual(["hidden", "id"]);
      };
      for (let cycleIndex = 0; cycleIndex < 3; cycleIndex++) {
        for (let turn = 1; turn <= 3; turn++) {
          for (const card of [...session.state.players[0].hand]) {
            if (card.type === "Crypto") continue;
            if (card.type === "Character" && session.state.players[0].actions === 0) continue;
            const target = session.state.nodes.findIndex((node, index) => session.view().openNodes.includes(index) && node.cards[0].length < 4);
            if (target !== -1) session.deploy(card.id, target);
          }
          assertState();
          session.endTurn();
          while (session.pendingCount) { session.step(); assertState(); }
        }
        session.endDraft(); session.nextCycle(); assertState();
      }
    }
  });

  it("returns detached presentation snapshots, not mutable authority references", () => {
    const session = make();
    const view = session.view();
    const originalName = session.state.players[0].hand[0].name;
    view.players[0].hand[0].name = "modified outside engine";
    view.players[0].centers.primary = 0;
    const originalWeight = session.state.weights[0];
    view.weights[0] = 100;
    expect(session.state.players[0].hand[0].name).toBe(originalName);
    expect(session.state.players[0].centers.primary).toBe(2000);
    expect(session.state.weights[0]).toBe(originalWeight);
  });
});

describe("Approved VP scoring", () => {
  it("counts Vault Encryption in active owned zones and excludes Destroyed", () => {
    const session = make();
    const player = session.state.players[0];
    player.draw = [{ ...starterCards[8], id: "draw-vault" }];
    player.hand = [{ ...starterCards[8], id: "hand-vault" }];
    player.discard = [{ ...starterCards[8], id: "discard-vault" }];
    player.destroyed = [{ ...starterCards[8], id: "destroyed-vault" }];
    player.destructionVP = 8;
    session.deploy("hand-vault", 0);
    expect(session.view().players[0].totalVP).toBe(14);
    expect(session.view().players[1].totalVP).toBe(4);
  });

  it("counts a Vault purchased in the final Draft before choosing the winner", () => {
    const session = createSession({ carryover: true, priorityPreference: "higher", random: seededRandom(5), practiceMarket: [starterCards[8]] });
    cycle(session);
    session.state.cycle = 16;
    session.state.players[0].wallet = 3;
    session.buy(session.state.market[0].id);
    expect(session.state.players[0].totalVP).toBe(6);
    expect(session.state.phase).toBe("draft");
    session.endDraft(); session.nextCycle();
    expect(session.state.phase).toBe("gameover");
    expect(session.state.winner).toBe(0);
    expect(session.state.endedReason).toMatch(/You win, 6 to 4 VP/);
  });

  it("reports a tie when both final totals match", () => {
    const session = make(); cycle(session);
    session.state.cycle = 16;
    session.endDraft(); session.nextCycle();
    expect(session.state.winner).toBeNull();
    expect(session.state.endedReason).toMatch(/Tie, 4 to 4 VP/);
  });

  it("chooses winner by total VP after lethal Drain, not by surviving Data Centers alone", () => {
    const session = make();
    session.state.players[0].draw = [];
    session.state.players[0].hand = [{ ...starterCards[3], id: "lethal" }];
    session.state.players[0].discard = [];
    session.state.players[1].hand = [];
    session.state.players[1].draw = [];
    session.state.players[1].discard = [];
    session.state.players[1].destructionVP = 20;
    session.state.players[1].centers = { primary: 0, backup: 20 };
    session.deploy("lethal", 0); session.endTurn(); drain(session);
    expect(session.state.players[0].totalVP).toBe(12);
    expect(session.state.players[1].totalVP).toBe(20);
    expect(session.state.winner).toBe(1);
    expect(session.state.endedReason).toMatch(/Opponent wins, 12 to 20 VP/);
  });
});


describe("Closed-Node content visibility", () => {
  it("hides identity, rules and rewards until the scheduled Node opens", () => {
    const locations = Array.from({length:5}, (_, i) => ({id:`secret-${i}`,name:`Location secret ${i}`,rule:`Rule secret ${i}`,reward:`Reward secret ${i}`}));
    const session = createSession({carryover:true,priorityPreference:'higher',random:seededRandom(4),locations});
    const assertVisibility=()=>{
      const view=session.view();
      expect(view).not.toHaveProperty('nodeOrder');
      view.nodes.forEach((node,index)=>{
        expect(node.location).toEqual(view.openNodes.includes(index)?locations[index]:null);
        if(!view.openNodes.includes(index))expect(JSON.stringify(view)).not.toContain(`secret ${index}`);
        expect(session.state.nodes[index].location).toEqual(locations[index]);
      });
    };
    assertVisibility();
    for(let turn=1;turn<=3;turn++){session.endTurn();drain(session);assertVisibility();}
    session.endDraft();session.nextCycle();assertVisibility();
  });
});

describe("Planning and Location-count rulings", () => {
  it("undoes all placements with exact hand order, Actions and deployment order, without drawing randomness", () => {
    let draws = 0;
    const random = seededRandom(4);
    const session = createSession({carryover:true,priorityPreference:"higher",random:()=>{draws++;return random();}});
    const player = session.state.players[0];
    player.hand = [{...starterCards[0],id:"a"},{...starterCards[8],id:"b"},{...starterCards[1],id:"c"}];
    const before = structuredClone(session.state), count = draws;
    session.deploy("a",4); session.deploy("b",3); session.deploy("c",0);
    const orders = session.state.nodes.flatMap(node=>node.cards[0]).map(card=>card.order).sort();
    expect(session.view().planningCardIds).toHaveLength(3);
    expect(session.view().canUndoPlanning).toBe(true);
    session.undoAllPlanning();
    expect(session.state).toEqual(before);
    expect(draws).toBe(count);
    expect(session.view().canUndoPlanning).toBe(false);
    session.deploy("a",4); session.deploy("b",3); session.deploy("c",0);
    expect(session.state.nodes.flatMap(node=>node.cards[0]).map(card=>card.order).sort()).toEqual(orders);
    session.endTurn();
    expect(()=>session.undoAllPlanning()).toThrow(/reversible/);
    expect(session.view().planningCardIds).toEqual([]);
  });

  it("reveals unopened placements only when their Node opens and before new planning", () => {
    const session=make();session.state.nodeOrder=[0,1,2,3,4];
    session.state.players[1].hand=[];
    session.state.players[0].hand=[{...starterCards[1],id:"opening-dash"},{...starterCards[8],id:"last-node"}];
    session.deploy("opening-dash",3);session.deploy("last-node",4);
    session.endTurn();
    let step;let seenOpening=false;
    while((step=session.step())) {
      if(step.event.kind==='turn'&&step.event.text.includes('Node 4 opens')) {
        seenOpening=true;expect(step.view.phase).toBe('reveal');
        expect(session.state.nodes[3].cards[0][0].revealed).toBe(false);
        expect(()=>session.deploy("last-node",0)).toThrow(/Runtime/);
      }
      if(step.event.cardId==='opening-dash')expect(seenOpening).toBe(true);
    }
    expect(session.state.phase).toBe('runtime');
    expect(session.state.nodes[3].cards[0][0].revealed).toBe(true);
    expect(session.state.nodes[4].cards[0][0].revealed).toBe(false);
    expect(session.state.players[0].pendingActions).toBe(1);
    session.endTurn();const events=drain(session);
    expect(events.filter(event=>event.kind==='reveal'&&event.cardId==='last-node')).toHaveLength(1);
    expect(events.filter(event=>event.cardId==='opening-dash')).toHaveLength(0);
  });

  it.each([[3,2,[0]],[2,3,[1]],[2,2,[0,1]],[0,0,[0,1]]] as const)("awards Circuit for Location wins %s–%s, independent of weights", (a,b,eligible)=>{
    const session=make();session.state.turn=3;
    session.state.players.forEach(player=>player.hand=[]);
    session.state.weights=[100,0,0,0,0];
    for(let node=0;node<a+b;node++) {
      const owner=node<a?0:1;
      session.state.nodes[node].cards[owner].push({card:{...starterCards[8],id:`winner-${node}`,onReveal:[]},owner,node,order:node,revealed:true});
    }
    session.endTurn();drain(session);
    expect(session.state.circuitEligible).toEqual(eligible);
    expect(session.state.selectedNode).toBe(null);
  });

  it("uses Location count for priority and retains current priority on tied counts",()=>{
    const session=make();session.state.nodeOrder=[0,1,2,3,4];session.state.priority=1;
    session.state.players.forEach(player=>player.hand=[]);
    session.state.weights=[1,1,98,0,0];
    for(const [node,owner] of [[0,0],[1,0],[2,1]] as const)session.state.nodes[node].cards[owner].push({card:{...starterCards[8],id:`priority-${node}`},owner,node,order:node,revealed:true});
    session.endTurn();drain(session);expect(session.state.priority).toBe(0);
    session.state.nodes[1].cards[0]=[];
    session.endTurn();drain(session);expect(session.state.priority).toBe(0);
  });
});

it("targeted Data Center effects cannot revive or repeatedly award a destroyed center",()=>{
  const session=make();session.state.nodeOrder=[0,1,2,3,4];
  session.state.players[1].hand=[];session.state.players[1].centers.backup=50;
  session.state.players[0].centers.primary=0;
  session.state.players[0].hand=[{...starterCards[0],id:'targeted',onReveal:[{kind:'drain',target:'backup',amount:100},{kind:'drain',target:'backup',amount:100},{kind:'restore',target:'primary',amount:100}]}];
  session.deploy('targeted',0);session.endTurn();const events=drain(session);
  expect(events.filter(event=>event.kind==='drain').map(event=>event.amount)).toEqual([50,0]);
  expect(session.state.players[0].destructionVP).toBe(12);
  expect(session.state.players[0].centers.primary).toBe(0);
});
