import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
const errors=[];page.on('pageerror',error=>errors.push(String(error)));
page.setDefaultTimeout(30000);
await page.addInitScript(()=>{let seed=341;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};});
const handCard=name=>page.locator('.hand-card').filter({has:page.locator('.card-name',{hasText:name})});
const fieldCard=id=>page.locator(`.field-card[data-card-id="${id}"]`);
async function add(name,id){
 await page.getByRole('button',{name:'Card catalog',exact:true}).click();
 await page.getByRole('searchbox').fill(name);
 await page.locator(`[data-catalog-id="${id}"]`).getByRole('button',{name:'Add to test hand',exact:true}).click();
 await page.getByRole('button',{name:'Close card catalog',exact:true}).click();
 await page.getByRole('button',{name:'End Turn',exact:true}).waitFor();
 return await handCard(name).getAttribute('data-card-id');
}
async function deploy(name,node){
 await handCard(name).click();
 await page.getByRole('dialog',{name:`Inspect ${name}`,exact:true}).getByRole('button',{name:String(node+1),exact:true}).click();
 await page.locator('.arena.resolving').waitFor({state:'hidden'});
}
async function chooseCard(id){await page.locator(`[data-choice-option="card-${id}"]`).click();}
async function move(id,owner){
 await chooseCard(id);
 const destination=page.locator('[data-choice-option^="node-"]').first();
 const node=Number((await destination.getAttribute('data-choice-option')).slice(5));
 await destination.click();
 await page.locator(`[data-moving-card="${id}"]`).waitFor();
 await page.locator(`[data-lane-node="${node}"][data-lane-owner="${owner}"] .field-card[data-card-id="${id}"]`).waitFor();
 return node;
}
try{
 await page.goto('http://127.0.0.1:5173/');
 await page.getByRole('button',{name:/Enter evaluation build/}).click({timeout:60000});
 await page.getByRole('button',{name:'End Turn',exact:true}).waitFor();
 await page.getByRole('button',{name:'Normal pace',exact:true}).click();
 const amplifierId=await add('Signal Amplifier','eval-signal-amplifier');
 await add('Relocation Relay','eval-relocation-relay');
 const node=Number(await page.locator('button.location-plate').first().getAttribute('data-location-node'));
 await deploy('Signal Amplifier',node);await deploy('Relocation Relay',node);
 await page.getByRole('button',{name:'End Turn',exact:true}).click();
 await chooseCard(amplifierId);
 await page.waitForFunction(id=>document.querySelector(`.field-card[data-card-id="${id}"] [data-card-power]`)?.textContent==='4',amplifierId);
 assert.equal(await fieldCard(amplifierId).locator('.boosted').count(),1);
 const movedNode=await move(amplifierId,0);
 await page.getByRole('button',{name:'End Turn',exact:true}).waitFor();
 assert.equal(await fieldCard(amplifierId).locator('[data-card-power]').innerText(),'4');

 await add('Power Siphon','eval-power-siphon');await add('Hostile Reroute','eval-hostile-reroute');
 await deploy('Power Siphon',node);
 await page.getByRole('button',{name:'End Turn',exact:true}).click();
 const target=page.locator('[data-choice-option^="card-"]').first();
 await target.waitFor();
 const opponentId=(await target.getAttribute('data-choice-option')).slice(5);
 const original=Number(await fieldCard(opponentId).locator('[data-card-power]').innerText());
 await target.click();
 await page.waitForFunction(({id,expected})=>Number(document.querySelector(`.field-card[data-card-id="${id}"] [data-card-power]`)?.textContent)===expected,{id:opponentId,expected:Math.max(0,original-2)});
 assert.equal(await fieldCard(opponentId).locator('.reduced').count(),original>0?1:0);
 await page.getByRole('button',{name:'End Turn',exact:true}).waitFor();
 await deploy('Hostile Reroute',node);
 await page.getByRole('button',{name:'End Turn',exact:true}).click();
 const enemyNode=await move(opponentId,1);
 await page.waitForFunction(()=>!document.querySelector('[data-moving-card]'));
 assert.equal(Number(await fieldCard(opponentId).locator('[data-card-power]').innerText()),Math.max(0,original-2));
 await mkdir('docs/evidence',{recursive:true});await page.screenshot({path:'docs/evidence/card-movement-power.png'});
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({passed:true,checks:['own card +2 badge','own card visibly moves','opponent card -2 badge','opponent card visibly moves','modifiers follow moved card'],movedNode,enemyNode}));
}catch(error){
 await mkdir('docs/evidence',{recursive:true});await page.screenshot({path:'docs/evidence/card-effects-check.png'});
 console.error((await page.locator('body').innerText()).slice(-2500));throw error;
}finally{await browser.close();}
