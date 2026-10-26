import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { useSetting } from './settings-menu.mjs';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1600,height:1000}});
const report={errors:[],layouts:[]};
page.on('pageerror',error=>report.errors.push(String(error)));
page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());});
try{
 await page.addInitScript(()=>{let state=31;Math.random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};});
 await page.goto('http://127.0.0.1:5173');
 await page.getByRole('button',{name:'Enter evaluation build'}).click({timeout:60000});
 await page.waitForFunction(()=>document.querySelector('.end-turn')&&!document.querySelector('.end-turn').disabled,null,{timeout:120000});
 await useSetting(page,'Normal pace',{exact:true});
 for(let turn=1;turn<=3;turn++){
  await page.waitForFunction(turn=>document.querySelector('.phase-label')?.textContent.includes(`RUNTIME ${turn} OF 3`)&&!document.querySelector('.end-turn')?.disabled,turn,{timeout:120000});
  await page.locator('.end-turn').click();
 }
 await page.locator('.strategic-draft').waitFor({timeout:120000});
 await page.waitForTimeout(600);
 for(const width of [1600,1366]){
  await page.setViewportSize({width,height:width===1600?1000:900});
  await page.locator('.strategic-draft').evaluate(el=>{el.scrollTop=0;});
  await page.waitForTimeout(300);
  await page.screenshot({path:`docs/evidence/strategic-draft-layout-${width}.png`});
  await page.locator('.draft-market-board').evaluate(el=>{el.scrollTop=el.scrollHeight;});
  await page.waitForTimeout(300);
  const layout=await page.evaluate(()=>{
   const footer=document.querySelector('.draft-footer').getBoundingClientRect();
   const button=document.querySelector('.draft-end-controls button').getBoundingClientRect();
   const top=[...document.querySelectorAll('[data-market-section="draft-top"] .market-card')];
   const bottom=[...document.querySelectorAll('[data-market-section="draft-bottom"] .market-card')];
   const cards=[...document.querySelectorAll('.market-card')];
   const box=el=>el.querySelector('.market-art').getBoundingClientRect();
   const topBox=top[0]?box(top[0]):null;
   const bottomBox=bottom[0]?box(bottom[0]):null;
   return {
    fullCards:cards.every(card=>{const b=box(card);return Math.abs(b.height/b.width-236/170)<.02;}),
    costBadges:document.querySelectorAll('.market-art [data-card-cost]').length,
    acquireButtons:document.querySelectorAll('.market-card .market-acquire').length,
    topAboveBottom:topBox&&bottomBox?topBox.bottom<=bottomBox.top+2:false,
    boardOverflow:(el=>el.scrollHeight-el.clientHeight)(document.querySelector('.draft-market-board')),
    walletColor:getComputedStyle(document.querySelector('.draft-wallet-hero .wallet-hero-value b')).color,
    footerBottom:footer.bottom,
    buttonVisible:button.top>=66&&button.bottom<=innerHeight-8&&button.right<=innerWidth,
    cardCount:cards.length,
    rows:{top:top.length,bottom:bottom.length,base:document.querySelectorAll('.market-row-base .market-card').length,vp:document.querySelectorAll('.market-vp-grid .market-card').length},
    overflow:document.querySelector('.strategic-draft').scrollWidth>innerWidth,
   };
  });
  if(!layout.fullCards||layout.costBadges!==0||!layout.topAboveBottom||layout.walletColor!=='rgb(31, 255, 177)'||!layout.buttonVisible||layout.rows.top!==5||layout.rows.bottom!==5||layout.rows.base!==0||layout.rows.vp!==0||layout.cardCount!==10||layout.overflow)throw new Error(JSON.stringify(layout));
  report.layouts.push({width,...layout});
  await page.screenshot({path:`docs/evidence/strategic-draft-scrolled-${width}.png`});
 }
 if(report.errors.length)throw new Error(report.errors.join('\n'));
 report.passed=true;
}catch(error){report.failure=String(error);process.exitCode=1;}
finally{writeFileSync('docs/evidence/strategic-draft-layout.json',JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify(report,null,2));}
