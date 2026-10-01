import { describe, expect, it } from 'vitest';
import { compileContent, createDefaultContent, materializeItemRecipes, validateContent } from '../src/authoring/contentModel';
import { HISTORIC_SOURCE_METADATA } from '../src/historicCatalog';
import { starterCards, type Card } from '../src/game';
import { createSession, seededRandom, type RuntimeSession } from '../src/runtime';

function drain(game: RuntimeSession) {
  const events = [];
  while (game.pendingCount) {
    events.push(game.step()!.event);
    if (events.length > 500) throw new Error('Item recipe resolution stalled.');
  }
  return events;
}

describe('item-owned recipe materialization', () => {
  it('resolves old references into ordered, isolated inline arrays without changing the source document', () => {
    const document=createDefaultContent();
    const card=document.cards.find(item=>item.definitionId==='eval-relocation-relay')!;
    card.onReveal=[{kind:'crypto',amount:1}];
    card.effectRefs={onReveal:['card-draw','card-gain-crypto']};
    document.locations[0].effectIds=['location-crypto'];
    document.locations[1].effectIds=['location-crypto'];
    document.effects.push({id:'circuit-composite',name:'Composite',description:'Two steps.',scope:'circuit',effects:[{kind:'vp',amount:2},{kind:'crypto',amount:3}]});
    document.circuitRewards[0].effectId='circuit-composite';
    const original=structuredClone(document);
    const materialized=materializeItemRecipes(document);
    expect(document).toEqual(original);
    const ownCard=materialized.cards.find(item=>item.definitionId==='eval-relocation-relay')!;
    expect(ownCard.effectRefs).toBeUndefined();
    expect(ownCard.onReveal).toEqual([{kind:'crypto',amount:1},{kind:'draw',amount:1},{kind:'crypto',amount:1}]);
    expect(materialized.locations[0].effectIds).toBeUndefined();
    expect(materialized.locations[0].effects).toEqual([...document.locations[0].effects,{kind:'crypto',amount:1}]);
    expect(materialized.circuitRewards[0].effectId).toBeUndefined();
    expect(materialized.circuitRewards[0].effects).toEqual([{kind:'vp',amount:2},{kind:'crypto',amount:3}]);
    expect(materialized.circuitRewards[0].effect).toEqual({kind:'vp',amount:2});
    expect(materializeItemRecipes(materialized)).toEqual(materialized);
    expect(compileContent(document)).toEqual(compileContent(materialized));
    ownCard.onReveal![1].amount=99;
    expect(document.effects.find(effect=>effect.id==='card-draw')!.effects[0].amount).toBe(1);
    (materialized.locations[0].effects.at(-1) as {amount:number}).amount=99;
    expect(materialized.locations[1].effects.at(-1)?.amount).toBe(1);
  });

  it('rejects unknown or wrong-scope legacy references even when a direct Circuit array is authoritative', () => {
    const document=createDefaultContent();
    document.circuitRewards[0].effects=[{kind:'vp',amount:4}];
    document.circuitRewards[0].effectId='missing';
    expect(()=>materializeItemRecipes(document)).toThrow(/Unknown circuit recipe reference/);
    document.circuitRewards[0].effectId='card-draw';
    expect(()=>materializeItemRecipes(document)).toThrow(/must have circuit scope/);
  });
});

describe('multi-step Circuit reward recipes', () => {
  function rewardSession() {
    const document=createDefaultContent();
    document.circuitRewards[0].effects=[{kind:'crypto',amount:2},{kind:'vp',amount:3},{kind:'restorePrimary',amount:50}];
    document.circuitRewards.slice(1).forEach(reward=>{reward.enabled=false;});
    const content=compileContent(document);
    const game=createSession({carryover:true,priorityPreference:'higher',strategicMarket:true,evaluationContent:true,random:seededRandom(19),content});
    game.state.phase='draft';
    game.state.draftEndsAt=Date.now()+90_000;
    game.state.circuitEligible=[0,1];
    game.state.circuitReward.definition=content.circuitRewards[0];
    game.state.players.forEach(player=>{player.hand=[];player.draw=[];player.discard=[];player.servers.primary=1900;});
    return {game,content};
  }

  it('claims all steps in order for each player with event ownership and one-claim gating', () => {
    const {game}=rewardSession();
    const first=game.claimCircuitReward(0);
    expect(first).toMatchObject({kind:'crypto',source:'circuit',owner:0,targetOwner:0,target:'wallet',amount:2,before:0,after:2});
    expect(game.pendingCount).toBe(2);
    expect(()=>game.claimCircuitReward(0)).toThrow(/already claimed/);
    expect(()=>game.claimCircuitReward(1)).toThrow(/active Draft/);
    const local=drain(game);
    expect(local.map(event=>[event.kind,event.owner,event.targetOwner,event.amount])).toEqual([['vp',0,0,3],['restore',0,0,50]]);
    const other=game.claimCircuitReward(1);
    expect(other).toMatchObject({kind:'crypto',owner:1,targetOwner:1,amount:2});
    const opponent=drain(game);
    expect(opponent.map(event=>[event.kind,event.owner,event.targetOwner,event.amount])).toEqual([['vp',1,1,3],['restore',1,1,50]]);
    expect(game.state.players.map(player=>[player.wallet,player.rewardVP,player.servers.primary])).toEqual([[2,3,1950],[2,3,1950]]);
    expect(game.state.circuitReward.claimed).toEqual([0,1]);
    expect(()=>game.claimCircuitReward(0)).toThrow(/already claimed/);
    expect(new Set([first,...local,other,...opponent].map(event=>event.id)).size).toBe(6);
  });

  it('queues every opponent step after Draft begins and leaves the local claim available', () => {
    const {game}=rewardSession();
    game.state.phase='runtime'; game.state.turn=3;
    game.state.circuitReward.definition=null;
    game.state.circuitEligible=[];
    game.state.players.forEach(player=>{player.hand=[];player.draw=[];player.discard=[];});
    game.endTurn();
    const events=drain(game);
    const draft=events.findIndex(event=>event.kind==='draft');
    const opponent=events.filter(event=>event.source==='circuit'&&event.owner===1);
    expect(draft).toBeGreaterThanOrEqual(0);
    expect(opponent.map(event=>event.kind)).toEqual(['crypto','vp','restore']);
    expect(events.findIndex(event=>event.id===opponent[0].id)).toBeGreaterThan(draft);
    expect(game.state.circuitReward.claimed).toEqual([1]);
    expect(game.claimCircuitReward(0).kind).toBe('crypto');
    expect(drain(game).map(event=>event.kind)).toEqual(['vp','restore']);
  });
});

describe('generated cards and card class metadata', () => {
  it('seeds Horror from historic power metadata and rejects invalid Hacker and generated starters', () => {
    const document=createDefaultContent();
    const horror=document.cards.find(card=>HISTORIC_SOURCE_METADATA[card.definitionId??card.id]?.types.includes('power'))!;
    expect(horror.cardClass).toBe('Horror');
    expect(horror.pool).toBe('Chaos');
    const base=document.cards.find(card=>card.definitionId==='eval-relocation-relay')!;
    base.cardClass='Hacker';
    expect(validateContent(document)).toEqual(expect.arrayContaining([expect.stringContaining('Hacker cards must be Chaos Characters')]));
    base.cardClass='Utility';
    const starter=document.cards.find(card=>card.definitionId==='slash-dot')!;
    starter.generated=true;
    expect(validateContent(document)).toEqual(expect.arrayContaining([
      expect.stringContaining('starting deck and must remain enabled'),
    ]));
  });

  it('lets Generated cards take any type and class while keeping them out of Draft', () => {
    const document=createDefaultContent();
    document.cards.push(
      {id:'gen-horror',definitionId:'gen-horror',name:'Gen Horror',type:'Character',power:2,cost:0,art:'/x.png',effect:'',onReveal:[],pool:'Chaos',enabled:true,cardClass:'Horror',generated:true},
      {id:'gen-vp',definitionId:'gen-vp',name:'Gen VP',type:'VP',power:0,vp:-1,cost:0,art:'/x.png',effect:'',pool:'VP',enabled:true,generated:true},
      {id:'gen-coin',definitionId:'gen-coin',name:'Gen Coin',type:'Crypto',cryptoValue:1,cost:0,art:'/x.png',effect:'',pool:'Crypto',enabled:true,generated:true},
    );
    expect(validateContent(document)).toEqual([]);
    const content=compileContent(document);
    const ids=['gen-horror','gen-vp','gen-coin'];
    expect(content.cards.filter(card=>ids.includes(card.definitionId!)).map(card=>card.cardClass??card.type)).toEqual(['Horror','VP','Crypto']);
    expect([...content.baseCards,...content.chaosCards,...content.vpCards,...content.cryptoCards].some(card=>ids.includes(card.definitionId!))).toBe(false);
  });

  it('retains enabled generated definitions for gain and Morph while excluding every market pool', () => {
    const document=createDefaultContent();
    const generated:typeof document.cards[number]={...starterCards[0],id:'generated-sentinel',definitionId:'generated-sentinel',name:'Sentinel',art:'/forms/sentinel.png',effect:'Generated sentinel.',onReveal:[],pool:'Base',enabled:true,cardClass:'Utility',generated:true};
    document.cards.push(generated);
    const content=compileContent(document);
    expect(content.cards.find(card=>card.definitionId==='generated-sentinel')).toMatchObject({generated:true,cardClass:'Utility'});
    expect([...content.baseCards,...content.chaosCards,...content.vpCards,...content.cryptoCards].some(card=>card.definitionId==='generated-sentinel')).toBe(false);
    const game=createSession({carryover:true,priorityPreference:'higher',strategicMarket:true,random:seededRandom(19),content});
    game.state.players.forEach(player=>{player.hand=[];player.draw=[];player.discard=[];});
    expect(game.state.market.some(pile=>pile.card.definitionId==='generated-sentinel')).toBe(false);
    const source:Card={...starterCards[0],id:'source',name:'Source',onReveal:[
      {kind:'gain',cardId:'generated-sentinel',amount:2,destination:'hand'},
      {kind:'morph',formIds:['generated-sentinel']},
    ]};
    game.state.players[0].hand.push(source);
    game.deploy('source',0); game.endTurn();
    const events=drain(game);
    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({kind:'draw',definitionId:'generated-sentinel',amount:2}),expect.objectContaining({kind:'morph',definitionId:'generated-sentinel',cardId:'source'})]));
    expect(game.state.players[0].hand.filter(card=>card.definitionId==='generated-sentinel')).toHaveLength(2);
    expect(game.state.nodes[0].cards[0][0].card).toMatchObject({id:'source',definitionId:'generated-sentinel',generated:true});
  });
});
