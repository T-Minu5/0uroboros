import {chromium} from 'playwright';
import {writeFileSync} from 'node:fs';
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1366,height:900}}),result={errors:[]};
page.on('pageerror',e=>result.errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:5173');await page.getByRole('button',{name:'Enter evaluation build'}).click();
 await page.waitForFunction(()=>document.querySelector('.end-turn')?.getAttribute('aria-label')==='End Turn');
 await page.getByRole('button',{name:'Normal pace'}).click();
 await page.screenshot({path:'docs/evidence/motion-board-1366.png'});
 result.layout=await page.evaluate(()=>{const wallet=document.querySelector('.crypto-cache').getBoundingClientRect(),hand=[...document.querySelectorAll('.hand>.hand-card')].map(e=>e.getBoundingClientRect()),button=document.querySelector('.end-turn').getBoundingClientRect();return {clear:hand.every(r=>r.right<=wallet.left||r.bottom<=wallet.top),walletTop:wallet.top,handArch:Math.min(...hand.map(r=>r.top)),buttonRight:button.right};});
 if(!result.layout.clear||result.layout.buttonRight>1366)throw new Error('Small-window wallet/control overlap');
 await page.evaluate(()=>{window.selectionReview={indices:[],earlyResult:false,landed:false};let start=0;const watch=()=>{const app=document.querySelector('.app');if(app?.dataset.eventKind==='circuit'){if(!start)start=performance.now();const index=[...document.querySelectorAll('.sealed-location')].findIndex(e=>e.classList.contains('selection-focus'));if(index>=0&&window.selectionReview.indices.at(-1)!==index)window.selectionReview.indices.push(index);const message=document.querySelector('.circuit-event');if(message){if(performance.now()-start<700)window.selectionReview.earlyResult=true;window.selectionReview.landed=true;}}requestAnimationFrame(watch);};watch();});
 for(let turn=1;turn<=3;turn++){
  await page.locator('.end-turn').click();
  if(turn<3)await page.waitForFunction(()=>document.querySelector('.end-turn')?.getAttribute('aria-label')==='End Turn',{},{timeout:60000});
 }
 await page.waitForFunction(()=>document.querySelector('.app')?.getAttribute('data-event-kind')==='circuit',{},{timeout:60000});
 await page.waitForTimeout(350);await page.screenshot({path:'docs/evidence/circuit-node-scan.png'});
 await page.locator('.draft-overlay').waitFor({timeout:60000});result.selection=await page.evaluate(()=>window.selectionReview);
 if(result.selection.indices.length<5||result.selection.earlyResult||!result.selection.landed)throw new Error('Circuit selection revealed incorrectly');
 if(result.errors.length)throw new Error(result.errors.join('\n'));console.log(result);
}catch(e){result.failure=e.stack;process.exitCode=1;console.error(e);await page.screenshot({path:'docs/evidence/selection-failure.png'});}
finally{writeFileSync('docs/evidence/selection-qa.json',JSON.stringify(result,null,2));await browser.close();}
