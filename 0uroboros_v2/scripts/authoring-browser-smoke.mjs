import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdtemp, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';

// Exercise real disk saves in an isolated file; never overwrite the user's pack.
const directory=await mkdtemp(join(tmpdir(),'ouroboros-authoring-browser-'));
const filePath=join(directory,'authored-content.json');
let middleware;
const server=await createServer({cacheDir:join(directory,'vite'),server:{host:'127.0.0.1',port:5174,strictPort:true},plugins:[{
 name:'isolated-authoring-check',enforce:'pre',configureServer(vite){
  vite.middlewares.use(async(req,res,next)=>{
   if(req.url?.split('?')[0]!=='/api/content')return next();
   try{
    if(!middleware){const {createContentApi}=await vite.ssrLoadModule('/server/contentApi.ts');middleware=createContentApi({filePath,loadModel:()=>vite.ssrLoadModule('/src/authoring/contentModel.ts')});}
    await middleware(req,res,next);
   }catch(error){next(error);}
  });
 },
}]});
let browser;
try {
 await server.listen();
 browser=await chromium.launch({headless:true,channel:'chrome'});
 const page=await browser.newPage({viewport:{width:1560,height:1080},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',error=>errors.push(String(error)));
 page.on('dialog',dialog=>dialog.accept());
 page.setDefaultTimeout(20000);
 const section=async name=>{await page.getByRole('navigation',{name:'Content sections'}).getByRole('button',{name,exact:true}).click();};
 const select=async id=>{await page.locator('[data-author-item="'+id+'"]').click();};
 const newItem=async kind=>{await page.getByRole('button',{name:'+ New '+kind,exact:true}).first().click();};
 const save=async()=>{await page.getByRole('button',{name:'Save to disk',exact:true}).click();await page.getByRole('status').filter({hasText:'Saved to disk.'}).waitFor();return JSON.parse(await readFile(filePath,'utf8'));};
 const loaded=async()=>{await page.getByRole('status').filter({hasText:'Saved content loaded from disk.'}).waitFor();};
 const addStep=async(region,operation,count,target)=>{await region.getByRole('button',{name:'+ Add effect',exact:true}).click();const row=region.locator('.au-recipe-editor-row').last();await row.getByLabel('Effect',{exact:true}).selectOption(operation);if(count!==undefined)await row.getByLabel('Count',{exact:true}).fill(String(count));if(target)await row.getByLabel('Target',{exact:true}).selectOption(target);return row;};
 await page.goto('http://127.0.0.1:5174/author');await loaded();
 assert.equal(await page.getByRole('button',{name:'Effect library',exact:true}).count(),0);
 assert.equal(await page.getByText('Reusable on reveal effects',{exact:true}).count(),0);
 for(const name of ['All','Base','Chaos','Hacker','VP','Crypto','Generated'])assert.equal(await page.getByRole('tab',{name,exact:true}).count(),1);
 await page.getByRole('tab',{name:'Hacker',exact:true}).click();
 const hackerIds=await page.locator('.au-card-row').evaluateAll(rows=>rows.map(row=>row.getAttribute('data-author-item')));
 assert(hackerIds.length>5);
 assert((await page.locator('.au-row-title small').allTextContents()).every(text=>text.includes('Hacker')));
 await page.getByRole('tab',{name:'Chaos',exact:true}).click();
 for(const id of hackerIds)assert.equal(await page.locator('[data-author-item="'+id+'"]').count(),1);
 await page.getByRole('tab',{name:'All',exact:true}).click();
 for(const key of ['cost','power']) {
  await page.getByRole('button',{name:'Sort by '+key,exact:true}).click();
  let values=await page.locator('.au-row-'+key).allTextContents();
  let numbers=values.filter(text=>text!=='—').map(Number);
  assert.deepEqual(numbers,[...numbers].sort((a,b)=>a-b));
  await page.getByRole('button',{name:'Sort by '+key,exact:true}).click();
  values=await page.locator('.au-row-'+key).allTextContents();numbers=values.filter(text=>text!=='—').map(Number);
  assert.deepEqual(numbers,[...numbers].sort((a,b)=>b-a));
 }
 await page.getByRole('button',{name:'Sort by name',exact:true}).click();
 const searchBox=await page.getByRole('searchbox',{name:'Search Cards',exact:true}).boundingBox();
 const createBox=await page.getByRole('button',{name:'+ New card',exact:true}).first().boundingBox();
 const listBox=await page.locator('.au-catalog-list').boundingBox();
 assert(searchBox.y+searchBox.height<listBox.y && createBox.x>=searchBox.x+searchBox.width);
 assert.equal(await page.locator('.au-card-row .au-thumb').count(),78);

 // A Generated form can be created here and selected from another card's recipe.
 await page.getByRole('tab',{name:'Generated',exact:true}).click();await newItem('card');
 await page.getByLabel('Name',{exact:true}).fill('Browser Form');
 await page.getByLabel('Power',{exact:true}).fill('9');
 await page.getByLabel('Card text',{exact:true}).fill('A generated form for this card recipe.');
 assert.equal(await page.getByRole('checkbox',{name:/^Generated/}).isChecked(),true);
 const formId=await page.getByLabel('ID',{exact:true}).inputValue();

 // Compose a unique recipe inside a new card, then prove a duplicate is independent.
 await page.getByRole('tab',{name:'Base',exact:true}).click();await newItem('card');
 await page.getByLabel('Name',{exact:true}).fill('Browser Recipe');
 await page.getByLabel('Cost',{exact:true}).fill('3');
 await page.getByLabel('Power',{exact:true}).fill('4');
 await page.getByLabel('Card text',{exact:true}).fill('Draw 2 cards. Gain 3 Crypto.');
 const recipeId=await page.getByLabel('ID',{exact:true}).inputValue();
 const reveal=page.getByRole('region',{name:'On reveal',exact:true});
 await addStep(reveal,'draw',2,'your-hand');await addStep(reveal,'crypto',3,'your-wallet');
 await page.getByRole('button',{name:'Duplicate',exact:true}).click();
 await page.getByLabel('Name',{exact:true}).fill('Browser Independent');
 const independentId=await page.getByLabel('ID',{exact:true}).inputValue();
 await reveal.locator('.au-recipe-editor-row').nth(0).getByLabel('Count',{exact:true}).fill('1');
 await reveal.locator('.au-recipe-editor-row').nth(1).getByLabel('Count',{exact:true}).fill('5');
 await select(recipeId);
 assert.equal(await reveal.locator('.au-recipe-editor-row').nth(0).getByLabel('Count',{exact:true}).inputValue(),'2');
 assert.equal(await reveal.locator('.au-recipe-editor-row').nth(1).getByLabel('Count',{exact:true}).inputValue(),'3');

 await newItem('card');
 await page.getByLabel('Name',{exact:true}).fill('Browser Morph');
 await page.getByLabel('Card text',{exact:true}).fill('Become Browser Form.');
 const morphId=await page.getByLabel('ID',{exact:true}).inputValue();
 const morph=await addStep(reveal,'morph');
 await morph.getByLabel('Search morph forms').fill('Browser Form');
 await morph.getByRole('checkbox',{name:'Browser Form',exact:true}).check();
 await morph.getByRole('button',{name:'Remove form 1',exact:true}).click();

 await section('Locations');await newItem('location');
 await page.getByLabel('Name',{exact:true}).fill('Browser Location');
 await page.getByLabel('Rule text',{exact:true}).fill('This Location has its own closure recipe.');
 await page.getByLabel('Reward text',{exact:true}).fill('Gain 2 Crypto and draw 1 card.');
 const locationId=await page.getByLabel('ID',{exact:true}).inputValue();
 const closure=page.getByRole('region',{name:'On closure',exact:true});
 await addStep(closure,'crypto',2);await addStep(closure,'draw',1);

 await section('Circuit rewards');
 // Keep only the new reward enabled in this isolated pack to exercise its whole recipe in play.
 for(const id of ['quantum_dividend','serpent_crown','integrity_patch']){await select(id);await page.getByRole('checkbox',{name:'Enabled',exact:true}).uncheck();}
 await newItem('circuit reward');
 await page.getByLabel('Name',{exact:true}).fill('Browser Circuit');
 await page.getByLabel('Reward text',{exact:true}).fill('Gain 3 Crypto and 2 VP.');
 const circuitId=await page.getByLabel('ID',{exact:true}).inputValue();
 const claim=page.getByRole('region',{name:'On claim',exact:true});
 await addStep(claim,'crypto',3);await addStep(claim,'vp',2);
 let saved=await save();
 assert.deepEqual(saved.document.cards.find(card=>card.id===recipeId).onReveal,[{kind:'draw',amount:2},{kind:'crypto',amount:3}]);
 assert.deepEqual(saved.document.cards.find(card=>card.id===independentId).onReveal,[{kind:'draw',amount:1},{kind:'crypto',amount:5}]);
 assert.deepEqual(saved.document.locations.find(item=>item.id===locationId).effects,[{kind:'crypto',amount:2},{kind:'draw',amount:1}]);
 assert.deepEqual(saved.document.circuitRewards.find(item=>item.id===circuitId).effects,[{kind:'crypto',amount:3},{kind:'vp',amount:2}]);
 assert(saved.document.cards.find(card=>card.id===formId).generated);
 assert(saved.document.cards.every(card=>!card.effectRefs));
 await page.reload();await loaded();
 await page.getByRole('searchbox',{name:'Search Cards',exact:true}).fill('Browser Recipe');await select(recipeId);
 assert.equal(await reveal.locator('.au-recipe-editor-row').nth(0).getByLabel('Count',{exact:true}).inputValue(),'2');
 assert.equal(await reveal.locator('.au-recipe-editor-row').nth(1).getByLabel('Count',{exact:true}).inputValue(),'3');
 await page.getByRole('searchbox',{name:'Search Cards',exact:true}).fill('');
 await select(recipeId);await page.locator('.au-effects-panel').scrollIntoViewIfNeeded();
 await mkdir(resolve('docs/evidence'),{recursive:true});
 await page.screenshot({path:'docs/evidence/item-recipe-workbench.png'});

 // An unapplied JSON draft survives form use and locks identity edits.
 await page.locator('.au-advanced > summary').click();
 const jsonEditor=page.getByLabel('Advanced item JSON');
 const pendingJson=(await jsonEditor.inputValue())+'\n';await jsonEditor.fill(pendingJson);
 assert.equal(await page.getByLabel('ID',{exact:true}).isDisabled(),true);
 assert.equal(await jsonEditor.inputValue(),pendingJson);
 await page.getByRole('button',{name:'Reset editor',exact:true}).click();
 assert.equal(await page.getByLabel('ID',{exact:true}).isEnabled(),true);
 const stale=await browser.newPage({viewport:{width:1400,height:900}});stale.on('dialog',dialog=>dialog.accept());
 await stale.goto('http://127.0.0.1:5174/author');await stale.getByRole('status').filter({hasText:'Saved content loaded from disk.'}).waitFor();
 await stale.getByLabel('Name',{exact:true}).fill('Stale edit');
 await page.getByLabel('Card text',{exact:true}).fill('Draw two cards, then gain three Crypto.');saved=await save();
 await stale.getByRole('button',{name:'Save to disk',exact:true}).click();
 await stale.getByRole('status').filter({hasText:'changed'}).waitFor();
 assert.equal(await stale.getByRole('button',{name:'Save to disk',exact:true}).isDisabled(),true);
 assert.equal(JSON.parse(await readFile(filePath,'utf8')).revision,saved.revision);

 // Use a saved card's local Morph recipe; the generated form never needs a market pile.
 const game=await browser.newPage({viewport:{width:1560,height:1000}});
 game.on('pageerror',error=>errors.push(String(error)));
 await game.addInitScript(()=>{let seed=341;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};});
 await game.goto('http://127.0.0.1:5174/');
 await game.getByRole('button',{name:/Enter evaluation build/}).click({timeout:60000});
 await game.getByRole('button',{name:'End Turn',exact:true}).waitFor();
 await game.getByRole('button',{name:'Normal pace',exact:true}).click();
 async function addCard(id,name){
  await game.getByRole('button',{name:'Card catalog',exact:true}).click();
  await game.getByRole('searchbox').fill(name);
  await game.locator('[data-catalog-id="'+id+'"]').getByRole('button',{name:'Add to test hand',exact:true}).click();
  await game.getByRole('button',{name:'Close card catalog',exact:true}).click();
  await game.getByRole('button',{name:'End Turn',exact:true}).waitFor();
 }
 async function deployCard(name,node){
  const hand=game.locator('.hand-card').filter({has:game.locator('.card-name',{hasText:name})}).first();
  const instance=await hand.getAttribute('data-card-id');await hand.click();
  await game.getByRole('dialog',{name:'Inspect '+name,exact:true}).getByRole('button',{name:String(node+1),exact:true}).click();
  await game.locator('.field-card[data-card-id="'+instance+'"]').waitFor();
  await game.locator('.arena.resolving').waitFor({state:'hidden'});
  return instance;
 }
 await addCard(morphId,'Browser Morph');
 const openNode=Number(await game.locator('button.location-plate').first().getAttribute('data-location-node'));
 const instanceId=await deployCard('Browser Morph',openNode);
 await game.getByRole('button',{name:'End Turn',exact:true}).click();
 await game.locator('[data-morphing-card="'+instanceId+'"]').waitFor();
 await game.locator('.field-card[data-card-id="'+instanceId+'"][aria-label="Inspect Browser Form"]').waitFor();
 assert.equal(await game.locator('.field-card[data-card-id="'+instanceId+'"] [data-card-power]').innerText(),'9');
 await game.getByRole('button',{name:'End Turn',exact:true}).waitFor();
 await addCard(formId,'Browser Form');await addCard(formId,'Browser Form');
 const remaining=[0,1,2,3,4].filter(node=>node!==openNode);
 await deployCard('Browser Form',remaining[0]);await deployCard('Browser Form',remaining[1]);
 await game.getByRole('button',{name:'End Turn',exact:true}).click();
 await game.getByRole('button',{name:'End Turn',exact:true}).waitFor();
 await game.getByRole('button',{name:'End Turn',exact:true}).click();
 await game.getByRole('button',{name:'Claim free privilege',exact:true}).waitFor({timeout:120000});
 const wallet=Number(await game.locator('[data-draft-resource="0-wallet"] b').innerText());
 const vp=Number(await game.locator('[data-draft-resource="0-vp"] b').innerText());
 await game.getByRole('button',{name:'Claim free privilege',exact:true}).click();
 await game.waitForFunction(expected=>Number(document.querySelector('[data-draft-resource="0-vp"] b')?.textContent)===expected,vp+2);
 assert.equal(Number(await game.locator('[data-draft-resource="0-wallet"] b').innerText()),wallet+3);
 assert.equal(await game.getByRole('button',{name:'Claimed',exact:true}).isDisabled(),true);
 await game.screenshot({path:'docs/evidence/item-recipe-circuit.png'});

 await page.setViewportSize({width:390,height:844});
 await page.locator('.au-effects-panel').scrollIntoViewIfNeeded();
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 assert(await page.getByRole('button',{name:'Save to disk',exact:true}).isVisible());
 await page.screenshot({path:'docs/evidence/item-recipe-mobile.png'});
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({passed:true,checks:['filters and numeric sorting','thumbnail list and top search','independent per-card recipes','per-Location recipes','multi-step Circuit recipe','generated form authoring','disk save and reload','stale save conflict','JSON draft preservation','live generated Morph','all Circuit steps presented','mobile layout'],isolatedFile:filePath,screenshot:'docs/evidence/item-recipe-workbench.png'}));
} catch(error) {
 const page=browser?.contexts()[0]?.pages()[0];
 if(page){await mkdir(resolve('docs/evidence'),{recursive:true});await page.screenshot({path:'docs/evidence/content-studio-check.png'});console.error((await page.locator('body').innerText()).slice(-3500));}
 throw error;
} finally { await browser?.close();await server.close(); }
