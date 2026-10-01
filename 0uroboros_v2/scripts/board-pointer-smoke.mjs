import {chromium} from 'playwright';
import {writeFileSync} from 'node:fs';
import {useSetting} from './settings-menu.mjs';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1600,height:1000}});
await page.addInitScript(()=>{let seed=341;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};});
const evidence={errors:[],checks:[],viewports:[]};
page.on('pageerror',e=>evidence.errors.push(e.message));
page.on('console',e=>{if(e.type()==='error')evidence.errors.push(e.text());});
const assert=(condition,message)=>{if(!condition)throw new Error(message);evidence.checks.push(message);};
const rect=locator=>locator.boundingBox();
const countCards=()=>page.locator('.hand .hand-card').count();
const ready=()=>page.waitForFunction(()=>{const button=document.querySelector('.end-turn');return button&&!button.disabled;});
async function begin(card){
 const a=await rect(card);await page.mouse.move(a.x+a.width*.55,a.y+a.height*.38);await page.waitForTimeout(230);
 const settled=await rect(card);const start={x:settled.x+settled.width*.55,y:settled.y+settled.height*.38};
 await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+7,start.y-7);
 await page.locator('.pointer-card').waitFor();return start;
}
async function moveToLane(node,edge='lower'){
 const a=await rect(page.locator(`[data-lane-drop="${node}"]`));
 const point={x:a.x+(edge==='left'?8:edge==='right'?a.width-8:a.width/2),y:a.y+(edge==='upper'?10:edge==='lower'?a.height-13:a.height/2)};
 await page.mouse.move(point.x,point.y,{steps:9});await page.waitForTimeout(50);return point;
}
try{
 await page.goto('http://127.0.0.1:5173');await page.getByRole('button',{name:'Enter evaluation build'}).click();await ready();
 const initial=await countCards();const card=page.locator('.hand .hand-card').first();const id=await card.getAttribute('data-card-id');
 const open=(await page.locator('.lane-drop-target:not(.sealed)').evaluateAll(elements=>elements.map(e=>Number(e.dataset.laneDrop))));
 const closed=Number(await page.locator('.lane-drop-target.sealed').first().getAttribute('data-lane-drop'));
 assert(await page.locator('.location-plate.drop-highlight').count()===0,'Idle has no drop highlights');
 await begin(card);
 await page.mouse.move(800,720);await page.waitForTimeout(40);
 const offset=()=>page.locator('.pointer-card').evaluate(el=>{const [x,y]=el.style.transform.match(/translate3d\(([-\d.]+)px, ([-\d.]+)px/).slice(1).map(Number);return {x,y};});
 const b=await offset();await page.mouse.move(847,689);await page.waitForTimeout(40);
 const c=await offset();
 assert(Math.abs((c.x-b.x)-47)<1&&Math.abs((c.y-b.y)+31)<1,'Dragged card follows pointer delta without lag or re-centering');
 assert(await card.evaluate(el=>getComputedStyle(el).opacity)==='0','Card lifts cleanly out of the hand');
 await moveToLane(open[0],'left');
 assert(await page.locator('.location-plate.drop-highlight').count()===1,'Exactly one Location illuminates on lane hover');
 assert(await page.locator(`[data-location-node="${open[0]}"].drop-highlight`).count()===1,'Full lane edge selects its Location');
 await moveToLane(open[1],'right');
 assert(await page.locator('.location-plate.drop-highlight').count()===1&&await page.locator(`[data-location-node="${open[1]}"].drop-highlight`).count()===1,'Hover light transfers without leaving other lanes lit');
 await moveToLane(closed,'lower');
 assert(await page.locator('.location-plate.drop-highlight').count()===0,'Closed lane does not advertise a valid drop');
 const offBoard=async()=>{await page.mouse.move(120,420,{steps:6});await page.waitForTimeout(50);};
 await offBoard();await page.mouse.up();
 const retry=await rect(card);await page.mouse.move(retry.x+retry.width/2,retry.y+retry.height/2);await page.mouse.down();await page.mouse.move(retry.x+retry.width/2+8,retry.y+retry.height/2-8);
 assert(await page.locator('.pointer-card').count()===1&&await page.locator('.pointer-card').evaluate(el=>getComputedStyle(el).opacity)==='1','Immediate re-grab replaces the returning preview with one visible card');
 await offBoard();
 await page.mouse.up();
 const springing=await page.locator('.pointer-card').evaluate(el=>el.style.transform).catch(()=>'');
 assert(/rotateZ\(/.test(springing),'Released card springs home with its swing');
 await page.waitForTimeout(1000);
assert(await countCards()===initial&&await page.locator('.pointer-card').count()===0,'Invalid drop returns the card and preserves the hand');
 assert(await page.getByRole('dialog').count()===0,'Invalid drag does not open card inspect');
 await begin(card);await moveToLane(open[0]);await page.keyboard.press('Escape');await page.waitForTimeout(220);await page.mouse.up();
 assert(await countCards()===initial&&await page.getByRole('dialog').count()===0,'Escape cancels a drag without deploying or inspecting');
 await begin(card);await moveToLane(open[0],'lower');
 const target=await rect(page.locator(`[data-node-drop="${open[0]}"]`));const lane=await rect(page.locator(`[data-lane-drop="${open[0]}"]`));
 assert(lane.y+lane.height-13>target.y+target.height,'Test release is below the compact card placement grid');
 await page.screenshot({path:'docs/evidence/pointer-lane-hover.png'});
 const ghost=await rect(page.locator('.pointer-card'));await page.mouse.up();
 const flight=await rect(page.locator('.flying-card'));
 assert(flight&&Math.hypot((flight.x+flight.width/2)-(ghost.x+ghost.width/2),(flight.y+flight.height/2)-(ghost.y+ghost.height/2))<35,'Release flight starts at the dragged card');
 await page.waitForTimeout(520);
 assert(await countCards()===initial-1&&await page.locator(`[data-node-drop="${open[0]}"] [data-card-id="${id}"]`).count()===1,'Full-lane drop deploys exactly one card into its placement grid');
 assert(await page.getByRole('dialog').count()===0,'Successful drag does not open inspect');
 await page.locator('.hand .hand-card').first().click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');
 assert(await page.getByRole('dialog').count()===0,'Click inspect still works after dragging');
 for(const viewport of [{width:1600,height:1000},{width:1366,height:900}]){
  await page.setViewportSize(viewport);await page.waitForTimeout(400);
  const layout=await page.evaluate(()=>{
   const rect=e=>e.getBoundingClientRect();
   const hand=[...document.querySelectorAll('.hand .hand-card')].map(rect),stats=rect(document.querySelector('.local-console'));
   const percentage=[...document.querySelectorAll('.node-weight')].map(rect),servers=[...document.querySelectorAll('.server.near')].map(rect);
   const weightsClear=percentage.every(a=>servers.every(b=>a.right<=b.left||a.left>=b.right||a.bottom<=b.top||a.top>=b.bottom));
   const handGap=Math.min(...hand.map(r=>r.top))-stats.bottom;
   const scoreGaps=[...document.querySelectorAll('.power-badge.opponent b')].map((el,i)=>rect(document.querySelector(`[data-location-node="${i}"]`)).top-rect(el).bottom);
   const farDuration=rect(document.querySelector('.duration.far>small'));
   const wallet=rect(document.querySelector('.crypto-cache')),handTop=rect(document.querySelector('.hand')).top;
   return {walletAligned:Math.abs(wallet.top-handTop)<2,weightsClear,handGap,scoreGaps,farDurationTop:farDuration.top,headerBottom:rect(document.querySelector('.topline')).bottom};
  });
  evidence.viewports.push({viewport,layout});console.log(JSON.stringify({viewport,layout}));
  assert(layout.walletAligned&&layout.weightsClear&&layout.handGap>=30&&Math.min(...layout.scoreGaps)>=1&&layout.farDurationTop>=layout.headerBottom,'Layout keeps percentages, scores, hand and instruments clear at '+viewport.width);
  await page.screenshot({path:`docs/evidence/board-interaction-${viewport.width}.png`});
 }
 await page.setViewportSize({width:1600,height:1000});
 await useSetting(page,'Normal pace');await page.locator('.end-turn').click();await ready();
 const winnerEvidence=await page.evaluate(()=>[...document.querySelectorAll('[data-lane-lit="winner"]')].map(el=>({side:el.classList.contains('local-drop')?'local':'opponent',cards:el.querySelectorAll('.field-card').length})));
 assert(winnerEvidence.length>0,'Resolved leading lanes illuminate');evidence.winnerLanes=winnerEvidence;
 await page.waitForTimeout(1100);
 await page.screenshot({path:'docs/evidence/winning-lanes.png'});
 const nextCard=page.locator('.hand .hand-card').first();await begin(nextCard);
 const nextOpen=Number(await page.locator('.lane-drop-target:not(.sealed)').first().getAttribute('data-lane-drop'));await moveToLane(nextOpen,'upper');
 assert(await page.locator('[data-lane-lit="winner"]').count()===0&&await page.locator('.location-plate.drop-highlight').count()===1,'Dragging temporarily shows only the hovered lane even when other lanes lead');
 await page.keyboard.press('Escape');await page.mouse.up();await page.waitForTimeout(220);
 assert(await page.locator('[data-lane-lit="winner"]').count()===winnerEvidence.length,'Leading-lane lighting returns when the drag ends');
 if(evidence.errors.length)throw new Error(evidence.errors.join('\n'));
 console.log(JSON.stringify(evidence,null,2));
}catch(error){evidence.failure=error.stack;console.error(error);await page.screenshot({path:'docs/evidence/pointer-failure.png'});process.exitCode=1;}
finally{writeFileSync('docs/evidence/board-pointer-qa.json',JSON.stringify(evidence,null,2));await browser.close();}
