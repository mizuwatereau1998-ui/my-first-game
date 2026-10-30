const dismissStartHelp = require('./dismiss-start-help.cjs');
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try {
  const page=await browser.newPage({viewport:{width:1200,height:1100}}), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install();
  const engine=fs.readFileSync(path.resolve(__dirname,'../engine.js'),'utf8');
  await page.route('**/engine.js*',r=>r.fulfill({contentType:'application/javascript',body:engine+`
   WordPopEngine.createBoard=()=>{const b=Array(56).fill('Z');b.splice(15,6,...'AFFORD');b.splice(35,3,...'CAT');b.splice(49,3,...'DOG');return b;};
  `}));
  const url=process.env.GAME_URL||'http://127.0.0.1:8000';
  async function enter(indices) {
   for(const i of indices){await page.locator('.tile').nth(i).focus();await page.keyboard.press('Space');}
   await page.keyboard.press('Enter');
  }
  async function sample(ms) {
   return page.locator('.discovery-burst').evaluate((e,ms)=>{
    for(const a of e.getAnimations({subtree:true})){a.pause();a.currentTime=ms;}
    const word=document.getElementById('discovery-word'),meaning=document.getElementById('discovery-meaning'),score=document.getElementById('discovery-score');
    const r=word.getBoundingClientRect(),b=document.getElementById('board').getBoundingClientRect();
    return {word:+getComputedStyle(word).opacity,scale:new DOMMatrixReadOnly(getComputedStyle(word).transform).a,
     meaning:+getComputedStyle(meaning).opacity,score:+getComputedStyle(score).opacity,
     parent:+getComputedStyle(e).opacity,inside:r.left>=b.left&&r.right<=b.right};
   },ms);
  }
  for(const width of [1200,390,320]) {
   await page.setViewportSize({width,height:1100});await page.goto(url);await dismissStartHelp(page, true);
   await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));
   await require('./set-test-cascades.cjs')(page);
   await enter([15,16,17,18,19,20]);
   await page.clock.runFor(240);
   assert.equal(await page.locator('#discovery-pop').isVisible(),false);
   assert.ok(await page.locator('.tile.falling').count()>0);
   await page.clock.runFor(379);assert.equal(await page.locator('#discovery-pop').isVisible(),false);
   await page.clock.runFor(1);assert.equal(await page.locator('#discovery-pop').isVisible(),true);
   assert.equal(await page.locator('.tile.falling').count(),0);
   let s=await sample(0);assert.equal(s.meaning,0);assert.equal(s.score,0);assert.ok(s.scale<.5);
   s=await sample(180);assert.ok(s.scale>1.1);assert.equal(s.meaning,0);assert.equal(s.score,0);assert.ok(s.inside);
   s=await sample(300);assert.ok(s.meaning>0&&s.meaning<1);assert.equal(s.score,0);
   s=await sample(550);assert.ok(Math.abs(s.scale-1)<.001);assert.equal(s.meaning,1);assert.ok(s.score>.9);
   assert.equal(await page.locator('#discovery-meaning').textContent(),'〜する余裕がある');
   assert.equal(await page.locator('#discovery-score').textContent(),'+60 pt');
   assert.equal(await page.locator('#discovery-pop').evaluate(e=>getComputedStyle(e,'::before').backgroundImage),'none');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.screenshot({path:`/workspace/scratch/word-pop/reward-${width}.png`,fullPage:true});
   s=await sample(900);assert.ok(s.parent>0&&s.parent<1);
   await page.clock.runFor(999);assert.equal(await page.locator('#discovery-pop').isVisible(),true);
   await page.clock.runFor(1);assert.equal(await page.locator('#discovery-pop').isVisible(),false);
   // 次の正解表示を古い削除タイマーで消さない。キー操作開始でも即消える。
   await enter([35,36,37]);await page.clock.runFor(620);
   assert.equal(await page.locator('#discovery-word').textContent(),'CAT');
   await page.clock.runFor(200);
   await enter([49,50,51]);await page.clock.runFor(620);
   assert.equal(await page.locator('#discovery-word').textContent(),'DOG');
   await page.clock.runFor(180); // 古いCATの表示終了時刻を通過。
   assert.equal(await page.locator('#discovery-pop').isVisible(),true);
   assert.equal(await page.locator('#discovery-word').textContent(),'DOG');
   assert.equal(await page.locator('#score').textContent(),'150');
   await page.locator('.tile').nth(24).focus();await page.keyboard.press('Space');
   assert.equal(await page.locator('#discovery-pop').isVisible(),false);
   await page.keyboard.press('Escape');
  }
  // 訳が未整備の登録語でも表示と得点を維持。
  const untranslated=await page.evaluate(()=>[...WordPopWords].find(w=>w.length===6&&!WordPopDictionary[w]));
  await page.route('**/engine.js*',r=>r.fulfill({contentType:'application/javascript',body:engine+`
   WordPopEngine.createBoard=()=>{const b=Array(56).fill('Z');b.splice(15,6,...${JSON.stringify(untranslated)});return b;};
  `}));
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto(url);await dismissStartHelp(page, true);
  await require('./set-test-cascades.cjs')(page);await enter([15,16,17,18,19,20]);await page.clock.runFor(620);
  assert.equal(await page.locator('#discovery-meaning').textContent(),'意味は準備中');
  assert.equal(await page.locator('#discovery-score').textContent(),'+60 pt');
  for(const selector of ['.discovery-burst','#discovery-word','#discovery-meaning','#discovery-score']) {
   assert.equal(await page.locator(selector).evaluate(e=>getComputedStyle(e).animationName),'none');
   assert.equal(await page.locator(selector).evaluate(e=>getComputedStyle(e).opacity),'1');
  }
  await page.clock.runFor(1000);assert.equal(await page.locator('#discovery-pop').isVisible(),false);
  assert.deepEqual(errors,[]);
  console.log('PASS: reward after landing / word overshoot / 200ms meaning / 350ms score / fade and cleanup / 6-letter mobile fit / input cancellation / untranslated word / reduced motion');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
