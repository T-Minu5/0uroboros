/** Pace, Card catalog, Content Studio, Evaluation build and Background live behind the header Settings menu. */
export async function openSettings(page){
 if(await page.locator('.settings-popover').count())return;
 await page.getByRole('button',{name:'Settings',exact:true}).click();
 await page.locator('.settings-popover').waitFor();
}

export async function closeSettings(page){
 if(await page.locator('.settings-popover').count())await page.locator('.settings-scrim').click();
}

/** Picks 'Real lighting' or 'Studio' on the General tab; each has its own floor background list. Leaves the menu closed. */
export async function chooseLighting(page,name){
 await openSettings(page);
 await page.getByRole('tab',{name:'General',exact:true}).click();
 await page.getByRole('radiogroup',{name:'Lighting',exact:true}).getByRole('radio',{name,exact:true}).click();
 await closeSettings(page);
}

/** Clicks a Settings entry on whichever tab holds it, then leaves the menu closed. */
export async function useSetting(page,name,{exact=false}={}){
 await openSettings(page);
 const entry=page.getByRole('button',{name,exact});
 let found=await entry.count()>0;
 for(const tab of await page.locator('.settings-tabs [role=tab]').all()){
  if(found)break;
  await tab.click();
  found=await entry.count()>0;
 }
 if(found)await entry.click();
 await closeSettings(page);
 return found;
}
