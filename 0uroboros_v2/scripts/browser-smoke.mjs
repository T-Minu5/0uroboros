import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
const errors=[],evidence={cycles:[],deployments:0,purchases:0,inspectPass:false,dragInspectPass:true,errors};
page.on('pageerror',e=>errors.push(e.stack));
await page.addInitScript(()=>{let seed=341;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};});
try {
 await page.goto('http://127.0.0.1:5173');
 await page.evaluate(()=>{
  window.nodeOpeningTimes=[];let last=0;
  const observer=new MutationObserver(()=>{const count=document.querySelectorAll('.location-plate').length;if(count>last&&count<=3){window.nodeOpeningTimes.push({count,time:performance.now()});last=count;}});
  observer.observe(document.body,{childList:true,subtree:true});window.openingObserver=observer;
 });
 await page.getByRole('button',{name:'Enter evaluation build'}).click();
 await page.waitForTimeout(250);
 if(await page.locator('.hand-card').count()!==5)throw new Error('Opening deal must show all five cards');
 evidence.fiveCardOpening=true;
 if(await page.locator(".sealed-location").count()!==5)throw new Error("All Nodes must begin visually closed");
 evidence.allNodesInitiallyClosed=true;
 await page.screenshot({path:'docs/evidence/five-card-opening.png'});
 await page.waitForFunction(()=>!document.querySelector('.end-turn')?.disabled);
 if(await page.locator('.hand-card,.cache-card').count()!==5)throw new Error('Crypto transfer must preserve all five cards');
 evidence.cryptoTransferConserved=true;
 const openings=await page.evaluate(()=>{window.openingObserver.disconnect();return window.nodeOpeningTimes;});
 if(openings.map(item=>item.count).join()!=='1,2,3')throw new Error('Initial Nodes must open one at a time');
 evidence.openingIntervals=openings.slice(1).map((item,index)=>Math.round(item.time-openings[index].time));
 if(evidence.openingIntervals.some(interval=>interval<650||interval>1050))throw new Error('Opening interval differs from 800ms');
 if(await page.locator('.card-type,.power-badge .icon,.power-status').count())throw new Error('Removed badges/icons remain');
 if(await page.locator('.resources>.stat-vp').count()!==2)throw new Error('Both players need VP stats');
 if(await page.locator('.dc-readout>small .icon').count()!==4)throw new Error('Database icons must sit beside Data Center names');
 const colors=await page.locator('.local-console .resources>span').evaluateAll(els=>els.map(el=>getComputedStyle(el).color));
 if(colors.join('|')!=='rgb(39, 226, 255)|rgb(31, 255, 177)|rgb(255, 204, 18)')throw new Error('Incorrect resource colors');
 evidence.resourceColors=colors;
 await page.screenshot({path:'docs/evidence/runtime-initial.png'});
 const sealed=page.locator('.sealed-location');
 evidence.closedNodes=await sealed.count();
 const startingWeights=await page.locator(".node-weight").allTextContents();
 if(startingWeights.map(value=>parseInt(value)).sort((a,b)=>a-b).join()!=="10,15,20,25,30")throw new Error("Incorrect starting weights");
 evidence.randomWeightPlacement=startingWeights;
 if(evidence.closedNodes!==2)throw new Error("Expected two sealed Nodes on turn 1");
 if(await sealed.locator(".location-rule,.location-reward").count())throw new Error("Closed Node leaked content");
 const location=page.locator('[aria-label*="Inspect"]').filter({hasText:/Data exchange|Occult archive|Quantum commons|Signal tower|Breach relay/}).first();
 if(await location.count()){await location.click();await page.getByRole('dialog').waitFor();evidence.locationInspect=true;await page.keyboard.press('Escape');}

 const hand=page.locator('.hand-card');
 if(await hand.count()) {await hand.first().click();await page.getByRole('dialog').waitFor();evidence.inspectPass=true;await page.getByRole('button',{name:'Close card inspect'}).click();}

 for(let cycle=1;cycle<=2;cycle++){
  if(cycle===2)await page.getByRole('button',{name:'Normal pace'}).click();
  let sawCollapse=false;
  for(let turn=1;turn<=3;turn++){
   await page.waitForFunction(({cycle,turn})=>document.querySelector('.phase-label')?.textContent===`CYCLE ${String(cycle).padStart(2,'0')} / RUNTIME ${turn} OF 3`,{cycle,turn});
   if(await page.locator('.sealed-location').count()!==3-turn)throw new Error('Incorrect randomized reveal count');
   const ids=await hand.evaluateAll(els=>els.map(el=>el.getAttribute('data-card-id')));
   for(const id of ids){
    const card=page.locator(`.hand-card[data-card-id="${id}"]`);
    if(!await card.count())continue;
    const targets=page.locator('.local-drop:not(.sealed)');
    for(let n=0;n<await targets.count();n++){
     const before=await hand.count();
     await card.dragTo(targets.nth(n));
     await page.waitForTimeout(600);
     if(await page.getByRole('dialog').count())throw new Error('Dragging opened inspect');
     if(await hand.count()<before){evidence.deployments++;break;}
    }
   }
   if(turn===3){
    await page.screenshot({path:'docs/evidence/populated-board-final.png'});
    const overlap=await page.evaluate(()=>{
     const weights=[...document.querySelectorAll('.node-weight')].map(e=>e.getBoundingClientRect());
     return [...document.querySelectorAll('.local-drop .field-card')].some(e=>{const a=e.getBoundingClientRect();return weights.some(b=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top);});
    });
    if(overlap)throw new Error('Local deployed card overlaps probability marker');
    evidence.noProbabilityOverlap=true;
   }
   if(await page.locator('.node-event').count())throw new Error('Redundant card effect text box rendered');
   await page.locator('.end-turn').click();
   const deadline=Date.now()+65000;
   while(Date.now()<deadline){
    const phase=await page.locator('.phase-label').innerText();
    if(phase.includes('COLLAPSE'))sawCollapse=true;
    if(await page.locator('.effect-path.drain').count()&&!evidence.drainEvidence){await page.screenshot({path:'docs/evidence/drain-in-play.png'});evidence.drainEvidence=true;}
    if(phase.includes('COLLAPSE')&&!evidence.collapseEvidence){await page.screenshot({path:'docs/evidence/collapse-in-play.png'});evidence.collapseEvidence=true;}
    if(turn<3&&phase.includes(`RUNTIME ${turn+1} OF 3`)&&await page.locator('.end-turn').isEnabled())break;
    if(turn===3&&await page.locator('.draft-overlay').count())break;
    // Read presence and style together: a fast effect can unmount between two browser calls.
    const effectColors=await page.evaluate(()=>Object.fromEntries(['restore','crypto','draw','actions'].flatMap(kind=>{
     const path=document.querySelector(`.effect-path.${kind}`);return path?[[kind,getComputedStyle(path).color]]:[];
    })));
    for(const [kind,color] of [['restore','rgb(255, 204, 18)'],['crypto','rgb(31, 255, 177)'],['draw','rgb(65, 133, 255)'],['actions','rgb(39, 226, 255)']]){
     if(kind in effectColors){const actual=effectColors[kind];if(actual!==color)throw new Error(`Wrong ${kind} effect color: ${actual}`);(evidence.effectColors??={})[kind]=actual;}
    }
    if(await page.locator('.node-event').count())throw new Error('Effect narration returned during resolution');
    await page.waitForTimeout(180);
   }
  }
  await page.locator('.draft-overlay').waitFor({timeout:5000});
  await page.waitForFunction(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent==='End Draft');return button&&!button.disabled;});
  if(!sawCollapse)throw new Error('Draft appeared without observed Collapse');
  if(await page.locator('.cycle-recap').count()!==1)throw new Error('Missing Cycle result');
  await page.screenshot({path:`docs/evidence/draft-cycle-${cycle}.png`,animations:"disabled"});
  const claim=page.getByRole('button',{name:'Claim free privilege',exact:true});
  if(await claim.count()){await claim.click();await page.getByRole('button',{name:'Claimed',exact:true}).waitFor();await page.waitForTimeout(1200);evidence.privilegeClaims=(evidence.privilegeClaims||0)+1;}
  const buy=page.locator('.market-card>button:last-child:not(:disabled)').first();
  if(await buy.count()) {await buy.click();evidence.purchases++;await page.waitForTimeout(150);if(!await page.getByRole('button',{name:/Added to Discard/}).count())throw new Error('Missing purchase feedback');}
  await page.getByRole('button',{name:'End Draft',exact:true}).click();
  await page.getByRole('button',{name:'Next Cycle',exact:true}).click();
  evidence.cycles.push({cycle,collapseObserved:true,draftReached:true,nextCycleReached:true});
  console.log('Completed browser Cycle',cycle,cycle===1?'normal pace':'fast pace');
 }
 await page.screenshot({path:'docs/evidence/cycle-3-browser.png'});
 evidence.finalPhase=await page.locator('.phase-label').innerText();
 evidence.consoleErrors=errors.length;
 if(errors.length)throw new Error(errors.join('\n'));
 console.log(JSON.stringify(evidence,null,2));
} catch(error){evidence.failure=error.stack;console.log(error.stack);await page.screenshot({path:'docs/evidence/browser-failure.png'});process.exitCode=1;}
finally{writeFileSync('docs/evidence/browser-play.json',JSON.stringify(evidence,null,2));await browser.close();}
