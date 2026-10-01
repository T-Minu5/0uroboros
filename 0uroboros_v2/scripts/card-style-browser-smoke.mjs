import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { useSetting } from './settings-menu.mjs';
import { mkdir, readFile } from 'node:fs/promises';

const evidence='docs/evidence/card-styles';
await mkdir(evidence,{recursive:true});
const original=await readFile('content/authored-content.json','utf8');
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1560,height:1080},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
page.on('dialog',d=>d.accept());page.setDefaultTimeout(25000);
const preview=page.getByRole('complementary',{name:'Card preview'});
const examples=[
 ['tihkal-hound','hacker','power'],['dotkrawler','action','runtime'],['rezz-blade','attack','attack'],
 ['night-scythe','utility','utility'],['byte-coin','crypto','crypto'],['vault-encryption','vp','volume'],
];
try{
 await page.goto('http://127.0.0.1:5173/author');
 await page.getByRole('status').filter({hasText:'loaded from disk'}).waitFor();
 await page.evaluate(()=>document.fonts.ready);
 for(const [id,style,icon] of examples){
  await page.locator(`[data-author-item="${id}"]`).click();
  const face=preview.locator('.cf-card');
  assert.equal(await face.getAttribute('data-card-style'),style);
  assert.equal(await face.locator('[data-card-cost]').count(),0);
  const art=await page.getByLabel('Artwork path',{exact:true}).inputValue();
  assert.equal(await face.locator('.cf-art').getAttribute('src'),art);
  assert(await face.locator(`img[src$="icon-${icon}.svg"]`).count());
  const duration=await page.getByLabel('Duration',{exact:true}).inputValue();
  assert.equal(await face.locator('[data-card-duration]').count(),duration?1:0);
  const size=await face.locator('.cf-title').evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
  assert(size>=14-0.2&&size<=20+0.2,`${style}: title ${size}px should be between visual 14px and 20px`);
  await preview.getByRole('button',{name:'Draft',exact:true}).click();
  assert.equal(await face.locator('[data-card-cost]').count(),1);
  const cost=await page.getByLabel('Cost',{exact:true}).inputValue();
  assert.equal(await face.locator('[data-card-cost]').getAttribute('data-card-cost'),cost);
  const box=await face.boundingBox();
  await page.screenshot({path:`${evidence}/${style}.png`,clip:{x:box.x-8,y:box.y-8,width:box.width+24,height:box.height+16}});
  await preview.getByRole('button',{name:'In play',exact:true}).click();
 }
 await page.locator('[data-author-item="tihkal-hound"]').click();
 await page.getByLabel('Name',{exact:true}).fill('An Extremely Long Card Name That Must Be Truncated');
 const title=preview.locator('.cf-title');
 await page.waitForFunction(()=>document.querySelector('.au-preview-column .cf-title')?.dataset.titleFit==='truncated');
 const fitted=await title.evaluate(el=>({font:parseFloat(getComputedStyle(el).fontSize),overflow:getComputedStyle(el).textOverflow,fit:el.dataset.titleFit,title:el.title}));
 assert(Math.abs(fitted.font-14)<0.2 && fitted.overflow==='ellipsis' && fitted.fit==='truncated');
 assert.equal(fitted.title,'An Extremely Long Card Name That Must Be Truncated');
 await page.getByLabel('Name',{exact:true}).fill('Hex');
 await page.waitForFunction(()=>document.querySelector('.au-preview-column .cf-title')?.dataset.titleFit==='exact');
 await page.getByLabel('Name',{exact:true}).fill('Tihkal Hound');
 await page.getByLabel('Duration',{exact:true}).fill('');
 assert.equal(await preview.locator('[data-card-duration]').count(),0);
 await page.getByLabel('Duration',{exact:true}).fill('99');
 assert((await preview.locator('[data-card-duration]').innerText()).includes('∞'));
 await page.getByLabel('Duration',{exact:true}).fill('4');
 await page.locator('.au-editor').evaluate(el=>el.scrollTop=0);
 await page.screenshot({path:`${evidence}/authoring.png`});
 await page.setViewportSize({width:390,height:844});
 await preview.scrollIntoViewIfNeeded();
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert(await title.evaluate(el=>{const px=parseFloat(getComputedStyle(el).fontSize);return px>=14-0.2&&px<=20+0.2;}));
 await page.screenshot({path:`${evidence}/mobile.png`});
 // All editor edits are unsaved and intentionally discarded.
 await page.setViewportSize({width:1600,height:1000});
 await page.addInitScript(()=>{let seed=341;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};});
 await page.goto('http://127.0.0.1:5173/');
 await page.getByRole('button',{name:/Enter evaluation build/}).click({timeout:60000});
 const ready=()=>page.waitForFunction(()=>document.querySelector('.end-turn') && !document.querySelector('.end-turn').disabled && !document.querySelector('.arena.resolving'));
 await ready();
 await useSetting(page,'Normal pace',{exact:true});
 assert.equal(await page.locator('.hand [data-card-cost]').count(),0);
 assert(await page.locator('.hand .cf-card').count()>0);
 const card=page.locator('.hand .hand-card').first();const id=await card.getAttribute('data-card-id');
 const rect=await card.boundingBox();
 await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down();await page.mouse.move(rect.x+rect.width/2+20,rect.y+rect.height/2-30,{steps:6});
 await page.locator('.pointer-card .cf-card').waitFor();
 assert.equal(await page.locator('.pointer-card [data-card-cost]').count(),0);
 await page.keyboard.press('Escape');await page.mouse.up();await page.locator('.pointer-card').waitFor({state:'detached'});
 await card.click();
 const inspect=page.getByRole('dialog',{name:/Inspect /});
 assert.equal(await inspect.locator('[data-card-cost]').count(),0);
 await inspect.getByRole('button',{name:'1',exact:true}).click();await ready();
 assert.equal(await page.locator(`.field-card[data-card-id="${id}"] .cf-card`).count(),1);
 await page.locator(`.field-card[data-card-id="${id}"]`).evaluate(async el=>Promise.all(el.getAnimations().map(animation=>animation.finished)));
 assert(await page.locator(`.field-card[data-card-id="${id}"]`).evaluate(el=>Math.abs(el.getBoundingClientRect().height-el.querySelector('.cf-card').getBoundingClientRect().height)<1));
 await page.screenshot({path:`${evidence}/board.png`});
 // A full Cycle checks actual Draft surfaces, not just the authoring toggle.
 let marketCount=0;
 if(!process.argv.includes('--quick')){
 for(let turn=1;turn<=3;turn++){
  await ready();await page.getByRole('button',{name:'End Turn',exact:true}).click();
  if(turn<3)await page.waitForFunction(n=>document.querySelector('.phase-label')?.textContent.includes(`RUNTIME ${n} OF 3`),turn+1,{timeout:60000});
 }
 await page.getByRole('region',{name:'Evaluation Draft',exact:true}).waitFor({timeout:120000});
 await page.waitForFunction(()=>document.querySelector('.market-art .cf-card'));
 marketCount=await page.locator('.market-art .cf-card').count();
 assert(marketCount>=12);
 assert.equal(await page.locator('.market-art [data-card-cost]').count(),marketCount);
 await page.locator('.market-art').first().click({button:'right'});
 assert.equal(await page.getByRole('dialog',{name:/Inspect /}).locator('[data-card-cost]').count(),1);
 await page.getByRole('button',{name:'Close card inspect',exact:true}).click();
 await page.screenshot({path:`${evidence}/draft.png`});
 }
 assert.deepEqual(errors,[]);
 assert.equal(await readFile('content/authored-content.json','utf8'),original);
 console.log(JSON.stringify({passed:true,quick:process.argv.includes('--quick'),checks:['six exact Figma variants and existing art','conditional Duration and permanent badge','Draft-only cost','authored title size and fit-before-truncation','responsive preview','pointer drag retains shared face','face-up deployment',...(process.argv.includes('--quick')?[]:['actual Draft and inspection badges'])],marketCount,evidence}));
}catch(error){await page.screenshot({path:`${evidence}/failure.png`});console.error((await page.locator('body').innerText()).slice(-2200));throw error;}
finally{await browser.close();}
