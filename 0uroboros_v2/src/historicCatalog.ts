import source from '../assets/card_art/cards.json';
import { type Card, type EvaluationEffect as Effect } from './game';

type Recipe = Pick<Card,'onReveal'|'duration'|'durationPeriod'|'schedule'|'recurring'>;
const e=(kind:Effect['kind'],amount?:number,extra:Partial<Effect>={}):Effect=>({kind,...(amount===undefined?{}:{amount}),...extra});
const gain=(cardId:string):Effect=>e('gain',1,{cardId,destination:'top'});
const schedule=(at:number,effects:Effect[],timing:'start'|'end'='start')=>({at,effects,timing});
function repeated(turns:number,effects:Effect[],future=false):Recipe {
 return {duration:turns+(future?1:0),durationPeriod:'runtime',onReveal:future?[]:effects,schedule:Array.from({length:future?turns:turns-1},(_,i)=>schedule(i+2,effects))};
}
const attack=(amount:number,target?:'primary'|'backup')=>e('drain',amount,target?{target}:{});
const both=(amount:number)=>[attack(amount,'primary'),attack(amount,'backup')];
const draft=e('transferPower',1);
const exclusions:Record<string,string>={
 'skinwalker':'Morph generator','leviathan-form':'Skinwalker form','spider-form':'Skinwalker form','wasp-form':'Skinwalker form','viper-form':'Skinwalker form','wolf-form':'Skinwalker form',
 'cyptoAlchemist':'Morph generator','alchemic-shyte':'Crypto Alchemist form','alchemic-byte':'Crypto Alchemist form','alchemic-kilo':'Crypto Alchemist form','alchemic-mega':'Crypto Alchemist form',
 'entropic-infantry':'Morph generator','alphaTeam':'Infantry form','bravoTeam':'Infantry form','charlieTeam':'Infantry form',
 'heisenberg-hag':'Excluded Cat generator','merchant-of-chaos':'Excluded Widget generator','schrodinger-box':'Generated Cat box',
 'mary-mallon':'Evolving form generator','maryMalice':'Mary evolution','maryMalware':'Mary evolution','typhoidMary':'Mary evolution',
 'glitch-witch':'Generated Glitch mechanic','glitch':'Generated Glitch token',
};
for(const card of source.cards) if(card.types.includes('cat'))exclusions[card.id]='Generated Cat';else if(card.types.includes('widget'))exclusions[card.id]='Generated Widget';
export const HISTORIC_EXCLUSIONS=source.cards.filter(card=>exclusions[card.id]).map(card=>({id:card.id,name:card.name,reason:exclusions[card.id]}));
export const HISTORIC_SOURCE_METADATA=Object.fromEntries(source.cards.map(card=>[card.id,{id:card.id,name:card.name,cost:card.cost,types:card.types,description:card.description,effects:card.effects,artwork:card.artwork}]));

const recipes:Record<string,Recipe>={
 'atomic-unit':repeated(5,[e('actions',1)]),
 'atomic-mass':repeated(3,[e('draw',1)]),
 'thorn-shadow':{onReveal:[e('actions',2),e('crypto',1)],duration:2,durationPeriod:'runtime',schedule:[schedule(2,[e('actions',1),e('crypto',1)])]},
 'dash-dot':{onReveal:[e('draw',1),e('actions',2)]},
 'slash-dot':{onReveal:[e('draw',3)]},
 'the-inbetweener':{onReveal:[e('random',undefined,{options:[{id:'actions',label:'+2 Actions',effects:[e('actions',2)]},{id:'cards',label:'+2 Cards',effects:[e('draw',2)]}]}),draft,e('crypto',1)]},
 'wave-card':{onReveal:[e('actions',2),draft,e('crypto',1)]},
 'particle-card':{onReveal:[e('draw',2),draft,e('crypto',1)]},
 'dotkrawler':{onReveal:[e('draw',1),draft,e('actions',2)]},
 'quantum-telementry':{onReveal:[e('actions',2),draft,e('crypto',2)]},
 'byte-drone':repeated(3,[e('crypto',2)],true),
 'recursive-seance':repeated(6,[e('crypto',1)]),
 'cowl-obscyra':{onReveal:[e('actions',2),e('draw',1)]},
 'infernal-kernel':{onReveal:[e('actions',1),e('draw',1),draft,e('crypto',1)]},
 'the-tesseract-magi':repeated(6,[e('draw',1)],true),
 'root-rune':{onReveal:[e('actions',2),e('draw',3)]},
 'astra-ascii':{onReveal:[e('actions',2),e('draw',1),draft,e('crypto',2)]},
 'shiva-of-cern':{onReveal:[e('actions',1),e('draw',4),e('crypto',2)]},
 'nyx-luna':{onReveal:[attack(75,'backup'),e('actions',1)]},
 'rezz-razor':{onReveal:[attack(75),e('actions',1),e('draw',1)]},
 'rezz-blade':{onReveal:[attack(100),e('actions',2),e('draw',1)]},
 'invocation-of-the-sword':{onReveal:[e('handDiscard',2,{opponent:true,chooser:'opponent'}),attack(100)]},
 'bushido-io':{onReveal:[attack(100)],duration:4,durationPeriod:'runtime',schedule:[schedule(2,[attack(75)]),schedule(3,[attack(75)]),schedule(4,[attack(75)]),schedule(4,[e('crypto',2)],'end')]},
 'bloodlet-drone':repeated(8,[attack(100)]),
 'h3x1-d3x1':{onReveal:[attack(250)]},
 '1337_speaker':{onReveal:[attack(200,'backup'),e('actions',1)]},
 'qubit-kid':{duration:2,durationPeriod:'runtime',onReveal:[],schedule:[schedule(2,[e('handDiscard',1,{opponent:true,chooser:'owner'})])]},
 'chrome-mitchell':{onReveal:both(200)},
 'delta-wave':{onReveal:both(300)},
 'system-seppuku':{onReveal:[e('selfDestroyBackup')]},
 'sudo-demiurge':{onReveal:[e('mill',1),attack(175),e('actions',1)]},
 'cicada-3301':{onReveal:[e('mill',2),attack(100),e('restore',300)]},
 'subroutine_succubus':{onReveal:[e('mill',1),attack(150),e('restore',150),e('crypto',2)]},
 'iterative-incubus':repeated(4,[attack(150),e('restore',150),e('actions',1),e('crypto',1)]),
 'node-feratu':{onReveal:[attack(225),e('restore',225),e('actions',1)]},
 'the-azimuthal-kill':{onReveal:[attack(200)],duration:5,durationPeriod:'runtime',schedule:[schedule(2,[attack(25)]),schedule(3,[attack(25)]),schedule(4,[attack(25)]),schedule(5,[attack(25),attack(450,'backup')])]},
 'tihkal-hound':{onReveal:[attack(300)],duration:4,durationPeriod:'runtime',schedule:[schedule(2,[attack(150)]),schedule(3,[attack(150),e('crypto',3)]),schedule(4,[attack(150)])]},
 'veil-of-cthulhu':{onReveal:[e('mill',2),attack(600),e('restore',300)]},
 'night-scythe':{onReveal:[e('handTrash',1)]},
 'superpositioning':{onReveal:[e('handDiscard',3,{optional:true,then:[e('draw',3)]}),e('actions',1)]},
 'summon-the-acolytes':{onReveal:[e('draw',4),e('handDiscard',3)]},
 'temporal-rift':{onReveal:[],duration:4,durationPeriod:'runtime',schedule:[schedule(4,[e('draw',4)])]},
 'ghost-key':{onReveal:[e('crypto',1),draft,e('handTrash',1)]},
 'banishing-ritual':{onReveal:[e('scry',5,{optional:true}),e('actions',1)]},
 'opulent-void':{onReveal:[e('handTrash',3,{min:1})]},
 'sacrifical-sigil':{onReveal:[e('handDiscard',2,{optional:true,then:[e('crypto',3),draft]})]},
 'byte-heist':{onReveal:[gain('byte-coin'),e('actions',1),e('draw',1)]},
 'code-sniper':{onReveal:[e('choice',undefined,{prompt:'Choose one: +2 Actions, +2 Cards, or +2 Crypto.',options:[{id:'actions',label:'+2 Actions',effects:[e('actions',2)]},{id:'draw',label:'+2 Cards',effects:[e('draw',2)]},{id:'crypto',label:'+2 Crypto',effects:[e('crypto',2)]}]})]},
 'kilo-cycle':{onReveal:[],duration:3,durationPeriod:'runtime',schedule:[schedule(3,[gain('kilo-coin')],'end')]},
 'chronos-cache':{onReveal:[],duration:3,durationPeriod:'runtime',schedule:[schedule(3,[gain('mega-cache')],'end')]},
 'shyte-coin':{},'byte-coin':{},'kilo-coin':{},'mega-cache':{},
 'basic-encryption':{onReveal:[e('restore',50)]},'vault-encryption':{onReveal:[e('restore',100)]},'quantum-archive':{onReveal:[e('restore',150)]},
 'bios-archive':{duration:99,durationPeriod:'runtime',onReveal:[],recurring:[e('restore',75)]},
 'esoteric-encryption':{onReveal:[e('restore',150)]},
 'neural-wetware':{duration:99,durationPeriod:'runtime',onReveal:[],recurring:[e('restore',75)]},
 'zenith-worx':{onReveal:[e('restore',300)]},
 'zenith-wetware':{duration:99,durationPeriod:'runtime',onReveal:[],recurring:[e('restore',100)]},
 'razor-blade-jade':{onReveal:[...both(100),e('actions',1),e('draw',1)]},
 'dit-bot':repeated(4,[e('draw',2)],true),
 'owl-king':{onReveal:[e('restore',100),attack(300),e('actions',1),e('draw',1),e('crypto',4)]},
};
// Existing assigned Node Power remains independent of historic healing/VP text.
const retainedPower:Record<string,number>={'slash-dot':3,'dash-dot':2,'dotkrawler':1,'rezz-razor':4,'rezz-blade':3,'chronos-cache':1,'temporal-rift':4,'quantum-telementry':2,'banishing-ritual':1,'recursive-seance':2,'ghost-key':2,'root-rune':3,'shiva-of-cern':4,'code-sniper':2,'basic-encryption':1,'vault-encryption':2,'quantum-archive':3,'h3x1-d3x1':4,'1337_speaker':2,'nyx-luna':2,'sudo-demiurge':3,'cicada-3301':4,'subroutine_succubus':3,'node-feratu':3,'veil-of-cthulhu':5,'chrome-mitchell':4,'delta-wave':5};
export const HISTORIC_CARDS:readonly Card[]=source.cards.filter(card=>!exclusions[card.id]).map(card=>{
 const recipe=recipes[card.id];if(!recipe)throw new Error(`Unimplemented historic card recipe: ${card.id}`);
 const type=card.types.includes('crypto')?'Crypto':card.types.includes('encryptedVolume')?'VP':'Character';
 const vp=type==='VP'?Number(card.effects.find(text=>/\d+vp/i.test(text))?.match(/\d+/)?.[0]):undefined;
 const cryptoValue=type==='Crypto'?Number(card.effects.join(' ').match(/\+(\d+) crypto/i)?.[1]):undefined;
 return {id:card.id,definitionId:card.id,name:card.name,type,cost:card.cost,art:card.artwork,effect:card.description,...(type==='Crypto'?{cryptoValue}:{power:retainedPower[card.id]??(type==='VP'?vp:Math.max(1,Math.min(5,Math.ceil(card.cost/2))))}),...(vp!==undefined?{vp}:{}),...recipe};
});
export function historicCategory(card:Card):'Base'|'VP'|'Crypto'|'Chaos'{
 if(card.type!=='Character')return card.type;
 const types=HISTORIC_SOURCE_METADATA[card.definitionId??card.id]?.types??[];
 return types.some(type=>type==='attack'||type==='power')?'Chaos':'Base';
}
