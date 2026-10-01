/** Pace, Card catalog, Content Studio, Evaluation build and Background live behind the header Settings menu. */
export async function openSettings(page){
 if(await page.locator('.settings-popover').count())return;
 await page.getByRole('button',{name:'Settings',exact:true}).click();
 await page.locator('.settings-popover').waitFor();
}

export async function closeSettings(page){
 if(await page.locator('.settings-popover').count())await page.locator('.settings-scrim').click();
}

/** Clicks a Settings entry, then leaves the menu closed. */
export async function useSetting(page,name,{exact=false}={}){
 await openSettings(page);
 const entry=page.getByRole('button',{name,exact});
 const found=await entry.count()>0;
 if(found)await entry.click();
 await closeSettings(page);
 return found;
}
