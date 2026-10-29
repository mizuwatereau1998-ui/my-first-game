const dismissStartHelp = require('./dismiss-start-help.cjs');
const {chromium}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs'),path=require('node:path');
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});try{
 const context=await browser.newContext({viewport:{width:1200,height:1100}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install();await page.goto(process.env.GAME_URL||'http://127.0.0.1:8000');await dismissStartHelp(page, true);await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));
 await page.waitForSelector('.has-pop-image img');
 const source=()=>page.locator('#pop-image img').getAttribute('src').then(src=>src.split('?')[0]);
 assert.match(await source(),/pop_idle.png$/);
 assert.equal(await page.locator('.mascot').isVisible(),false);
 for(const [chain,name] of [[1,'correct'],[2,'chain2'],[3,'chain3'],[4,'chain3']]){
  await page.evaluate(n=>WordPopCharacter.react(n),chain);await page.waitForFunction(expected=>document.querySelector('#pop-image img') && new URL(document.querySelector('#pop-image img').src).pathname.endsWith(expected),`pop_${name}.png`);
  assert.match(await source(),new RegExp(`pop_${name}.png$`));
  await page.clock.runFor(2000);assert.equal(await page.locator('.character-space').getAttribute('data-pop-state'),chain>=3?'chain3':name);
 }
 await page.evaluate(()=>WordPopCharacter.finish());await page.clock.runFor(649);assert.match(await source(),/pop_chain3.png$/);await page.clock.runFor(1);assert.match(await source(),/pop_idle.png$/);
 // 直前の演出終了タイマーが、次の正解を通常へ戻さない。
 await page.evaluate(()=>{WordPopCharacter.react(1);WordPopCharacter.finish();});await page.clock.runFor(500);await page.evaluate(()=>WordPopCharacter.react(2));await page.clock.runFor(500);assert.match(await source(),/pop_chain2.png$/);
 await page.evaluate(()=>WordPopCharacter.reset());
 for(const width of [1200,390,320]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await page.locator('#pop-image').evaluate(e=>getComputedStyle(e).pointerEvents),'none');await page.screenshot({path:`/workspace/scratch/word-pop/pop-${width}.png`,fullPage:true});}
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('#pop-image img').evaluate(e=>getComputedStyle(e).animationName),'none');
 // ゲーム本体が連鎖ごとに呼ぶことも確認。表示テスト用に連鎖候補を固定する。
 await page.route('**/engine.js*',r=>r.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.resolve(__dirname,'../engine.js'),'utf8')+`\nlet calls=0;WordPopEngine.findCascade=(before,result,easy)=>{if(++calls>2)return null;const p=WordPopEngine.findWord(result.board,easy);return p?{path:p,word:p.map(i=>result.board[i]).join('')}:null;};`}));
 await page.reload();await dismissStartHelp(page, true);await page.evaluate(()=>{window.states=[];new MutationObserver(()=>states.push(document.querySelector('.character-space').dataset.popState)).observe(document.querySelector('.character-space'),{attributes:true,attributeFilter:['data-pop-state']});});
 for(const i of [16,17,18]){await page.locator('.tile').nth(i).focus();await page.keyboard.press('Space');}await page.keyboard.press('Enter');await page.clock.runFor(5500);
 const states=await page.evaluate(()=>states);assert.deepEqual(states,['correct','chain2','chain3','idle']);
 // 画像が1枚もなくても仮表示・単語判定・得点は動く。
 await page.unroute('**/engine.js*');await page.route('**/assets/characters/*.png*',r=>r.fulfill({status:404,body:''}));await page.reload();await dismissStartHelp(page, true);await require('./set-test-cascades.cjs')(page);
 assert.equal(await page.locator('.mascot').isVisible(),true);for(const i of [16,17,18]){await page.locator('.tile').nth(i).focus();await page.keyboard.press('Space');}await page.keyboard.press('Enter');await page.clock.runFor(2000);assert.equal(await page.locator('#score').textContent(),'30');assert.equal(await page.locator('.mascot').isVisible(),true);
 assert.deepEqual(errors,[]);console.log('PASS: all four PNGs / 3+ mapping / no idle mid-chain / delayed idle / stale timer canceled / mobile / reduced motion / missing images keep game playable');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
