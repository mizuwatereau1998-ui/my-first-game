const dismissStartHelp = require('./dismiss-start-help.cjs');
const {chromium}=require('playwright');const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});try{
 const context=await browser.newContext({viewport:{width:1200,height:1100}});await context.addInitScript(()=>localStorage.setItem('word-pop-tutorial-complete-v1','true'));
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.install();await page.goto(process.env.GAME_URL||'http://127.0.0.1:8000');await dismissStartHelp(page, true);await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));
 await page.locator('#chain-toggle').uncheck();
 await page.clock.runFor(15000);assert.equal(await page.locator('.idle-hint').count(),5);
 await page.locator('#chain-toggle').check();await page.clock.runFor(15000);assert.equal(await page.locator('.idle-hint').count(),6);
 await page.locator('#chain-toggle').uncheck();
 let expectedScore=0;
 for(const length of [5,6,6,5,6,6]){
  const match=await page.evaluate(n=>WordPopEngine.straightWords(Array.from(document.querySelectorAll('.tile'),t=>t.textContent),WordPopLongWords).find(m=>m.word.length===n),length);
  assert.ok(match,`missing ${length}-letter word`);
  for(const index of match.path){await page.locator('.tile').nth(index).focus();await page.keyboard.press('Space');}
  await page.keyboard.press('Enter');await page.clock.runFor(2000);
  expectedScore+=length*10;assert.equal(Number(await page.locator('#score').textContent()),expectedScore);
  assert.equal(await page.locator('.chip-word').first().textContent(),match.word);
  assert.equal(await page.locator('.chip-meaning').first().textContent(),await page.evaluate(w=>WordPopDictionary[w],match.word));
  assert.ok(await page.evaluate(()=>!!WordPopEngine.findWord(Array.from(document.querySelectorAll('.tile'),t=>t.textContent),WordPopLongWords)));
 }
 await page.screenshot({path:'/workspace/scratch/word-pop/long-words.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(errors,[]);console.log('PASS: five/six-letter idle hints / six real long-word clears / ongoing refill / meanings / scores / mobile layout');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
