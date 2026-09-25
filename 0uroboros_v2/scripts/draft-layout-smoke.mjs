import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1600,height:1000}});
const report={errors:[],layouts:[]};
page.on('pageerror',error=>report.errors.push(String(error)));
page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());});
try{
 await page.addInitScript(()=>{let state=31;Math.random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};});
 await page.goto('http://127.0.0.1:5173');
 await page.getByRole('button',{name:'Normal pace',exact:true}).click();
 await page.getByRole('button',{name:'Enter evaluation build'}).click();
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
  await page.locator('.strategic-draft').evaluate(el=>{el.scrollTop=el.scrollHeight;});
  await page.waitForTimeout(300);
  const layout=await page.evaluate(()=>{
   const heading=document.querySelector('.draft-heading').getBoundingClientRect();
   const button=document.querySelector('.draft-end-controls button').getBoundingClientRect();
   const cards=[...document.querySelectorAll('.market-card')];
   return {walletColor:getComputedStyle(document.querySelector('.draft-wallet b')).color,headingTop:heading.top,buttonVisible:button.top>=66&&button.bottom<=innerHeight-36&&button.right<=innerWidth,cardCount:cards.length,overflow:document.querySelector('.strategic-draft').scrollWidth>innerWidth};
  });
  if(layout.walletColor!=='rgb(31, 255, 177)'||!layout.buttonVisible||layout.cardCount!==18||layout.overflow)throw new Error(JSON.stringify(layout));
  report.layouts.push({width,...layout});
  await page.screenshot({path:`docs/evidence/strategic-draft-scrolled-${width}.png`});
 }
 if(report.errors.length)throw new Error(report.errors.join('\n'));
 report.passed=true;
}catch(error){report.failure=String(error);process.exitCode=1;}
finally{writeFileSync('docs/evidence/strategic-draft-layout.json',JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify(report,null,2));}
