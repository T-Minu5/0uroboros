import {chromium} from 'playwright';
import {writeFileSync} from 'node:fs';
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1600,height:1000}}),result={errors:[]};
page.on('pageerror',e=>result.errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:5173');
 if(await page.getByLabel('Runtime timer seconds').inputValue()!=='')throw new Error('Runtime duration must have no invented default');
 await page.getByLabel('Runtime timer seconds').fill('2');
 await page.getByRole('button',{name:'Enter evaluation build'}).click();
 await page.waitForFunction(()=>document.querySelector('.end-turn')?.getAttribute('aria-label')==='End Turn');
 result.configuredMax=await page.getByRole('progressbar',{name:'Turn countdown'}).getAttribute('aria-valuemax');
 await page.waitForFunction(()=>document.querySelector('.phase-label')?.textContent.includes('RUNTIME 2 OF 3'),{},{timeout:60000});
 await page.waitForFunction(()=>document.querySelector('.end-turn')?.getAttribute('data-countdown-rate')==='1.25',{},{timeout:3000});
 result.penaltyRate=await page.locator('.end-turn').getAttribute('data-countdown-rate');
 if(result.penaltyRate!=='1.25')throw new Error('Missing inactivity countdown penalty');
 await page.locator('.purchase-confirm').getByText('Automatic concession after two consecutive no-input Runtime turns.',{exact:true}).waitFor({timeout:60000});
 result.concession=true;await page.screenshot({path:'docs/evidence/timer-concession.png'});
 await page.reload();await page.getByLabel('Runtime timer seconds').fill('2');await page.getByRole('button',{name:'Enter evaluation build'}).click();
 await page.waitForFunction(()=>document.querySelector('.end-turn')?.getAttribute('aria-label')==='End Turn');
 const card=page.locator('.hand>.hand-card').first();const box=await card.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+12,box.y+box.height/2-12);await page.locator('.pointer-card').waitFor();
 await page.waitForFunction(()=>!document.querySelector('.pointer-card')&&document.querySelector('.phase-label')?.textContent.includes('REVEAL'),{},{timeout:10000});await page.mouse.up();result.heldCardReturnedOnExpiry=true;
 await page.waitForFunction(()=>document.querySelector('.end-turn')?.getAttribute('aria-label')==='End Turn',{},{timeout:60000});await page.locator('.hand>.hand-card').first().click();await page.getByRole('dialog').waitFor();result.inspectWorksAfterExpiry=true;
 if(result.errors.length)throw new Error(result.errors.join('\n'));console.log(result);
}catch(e){result.failure=e.stack;process.exitCode=1;console.error(e);await page.screenshot({path:'docs/evidence/timer-failure.png'});}
finally{writeFileSync('docs/evidence/timer-qa.json',JSON.stringify(result,null,2));await browser.close();}
