const {chromium}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs');
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});try{
 const context=await browser.newContext({viewport:{width:1222,height:1287}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.goto(process.env.GAME_URL||'http://127.0.0.1:8000');
 await page.locator('#chain-toggle').uncheck();
 assert.equal(await page.locator('.tile').count(),56);
 assert.equal(await page.locator('.brand,.intro,h1').count(),0);
 assert.equal(await page.locator('.character-space').isVisible(),true);
 assert.ok(await page.locator('.tile').evaluateAll(ts=>new Set(ts.map(t=>t.dataset.color)).size)>=6);
 const board=await page.locator('#board').boundingBox(),recent=await page.locator('.found-card').boundingBox();assert.ok(recent.x>board.x+board.width);
 async function play(indices){for(const i of indices){await page.locator('.tile').nth(i).focus();await page.keyboard.press('Space');}await page.keyboard.press('Enter');await page.waitForFunction(()=>document.getElementById('board').getAttribute('aria-busy')==='false');}
 await play([16,17,18]);await play([35,36,37]);await play([34,40,46]);
 assert.deepEqual(await page.locator('.chip-word').allTextContents(),['SUN','DOG','CAT']);
 assert.deepEqual(await page.locator('.chip-meaning').allTextContents(),['太陽','犬','猫']);
 const next=await page.evaluate(()=>WordPopEngine.findWord(Array.from(document.querySelectorAll('.tile'),t=>t.textContent),WordPopEasyWords));
 await play(next);assert.equal(await page.locator('.word-chip').count(),3);assert.equal(await page.locator('#found-count').textContent(),'4');
 await page.locator('.word-chip').last().click();assert.equal(await page.locator('.meaning-word').textContent(),await page.locator('.word-chip').last().getAttribute('data-word'));
 await page.waitForFunction(()=>document.getElementById('discovery-pop').hidden);
 fs.mkdirSync('/workspace/scratch/word-pop',{recursive:true});
 await page.screenshot({path:'/workspace/scratch/word-pop/pastel-desktop.png',fullPage:true});
 for(const width of [390,320]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await page.locator('.tile').count(),56);await page.screenshot({path:`/workspace/scratch/word-pop/pastel-${width}.png`,fullPage:true});}
 assert.deepEqual(errors,[]);console.log('PASS: pastel layout / title removed / 7x8 / varied glossy tiles / right-hand translated recent three / eviction / history / mobile widths');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
