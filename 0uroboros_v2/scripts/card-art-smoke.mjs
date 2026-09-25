import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1366,height:900}});
const result={errors:[]};
page.on('pageerror',error=>result.errors.push(String(error)));
try{
 await page.addInitScript(()=>{let seed=341;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};});
 await page.goto('http://127.0.0.1:5173/');
 await page.getByRole('button',{name:'Enter evaluation build'}).click();
 await page.waitForFunction(()=>[...document.querySelectorAll('.hand-card img.card-art')].length===5&&[...document.querySelectorAll('.hand-card img.card-art')].every(image=>image.complete&&image.naturalWidth>0));
 result.cards=await page.locator('.hand-card img.card-art').evaluateAll(images=>images.map(image=>({name:image.alt,src:image.getAttribute('src'),width:image.naturalWidth})));
 if(!result.cards.some(card=>card.name==='Vault Encryption'&&card.src.endsWith('/volume/2vp-b.png')))throw new Error('Real Vault art was not rendered');
 if(!result.cards.some(card=>card.name==='Byte-Coin'&&card.src.endsWith('/crypto/byte-coin.png')))throw new Error('Real Byte-Coin art was not rendered');
 if(await page.locator('.hand-card .missing-art').count())throw new Error('Obsolete placeholder treatment remains');
 await page.waitForTimeout(1400);
 await page.screenshot({path:'docs/evidence/imported-card-art.png'});
 if(result.errors.length)throw new Error(result.errors.join('\n'));
 result.passed=true;
}catch(error){result.failure=String(error);process.exitCode=1;}
finally{writeFileSync('docs/evidence/imported-card-art.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));await browser.close();}
