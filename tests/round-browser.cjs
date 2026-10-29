const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const dismissHelp=require('./dismiss-start-help.cjs');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try {
  const page=await browser.newPage({viewport:{width:1200,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.clock.install();
  const url=process.env.GAME_URL||'http://127.0.0.1:8000';
  const engine=fs.readFileSync(path.resolve(__dirname,'../engine.js'),'utf8');
  const game=fs.readFileSync(path.resolve(__dirname,'../game.js'),'utf8');
  async function load(){await page.goto(url);await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));}
  async function enter(indices){for(const i of indices){await page.locator('.tile').nth(i).focus();await page.keyboard.press('Space');}await page.keyboard.press('Enter');}
  async function hidden(value){await page.evaluate(value=>{Object.defineProperty(document,'hidden',{configurable:true,value});document.dispatchEvent(new Event('visibilitychange'));},value);}
  await load();
  assert.equal(await page.locator('#help-dialog').isVisible(),true);
  assert.equal(await page.locator('#help-progress').textContent(),'1 / 3');
  assert.equal(await page.locator('.help-page:visible').count(),1);
  await page.clock.runFor(180000);assert.equal(await page.locator('#time-left').textContent(),'0:30');
  await page.locator('.tile').nth(16).dispatchEvent('keydown',{key:' '});
  assert.equal(await page.locator('.tile.selected').count(),0);
  await dismissHelp(page,true);await page.clock.runFor(1000);
  assert.equal(await page.locator('#time-left').textContent(),'1:29');
  // 各ページから1回の×で閉じられ、開き直すと必ず先頭。
  for(let n=0;n<3;n++) {
   await page.locator('#help-button').click();
   assert.equal(await page.locator('#help-progress').textContent(),'1 / 3');
   for(let i=0;i<n;i++)await page.locator('#help-next').click();
   assert.equal(await page.locator('#help-progress').textContent(),`${n+1} / 3`);
   const time=await page.locator('#time-left').textContent();await page.clock.runFor(20000);
   assert.equal(await page.locator('#time-left').textContent(),time);
   await dismissHelp(page,true);
  }
  await page.locator('#help-button').click();await page.locator('#help-next').click();
  await page.locator('#help-back').click();assert.equal(await page.locator('#help-progress').textContent(),'1 / 3');
  await page.locator('#help-next').click();await page.locator('#help-next').click();
  assert.equal(await page.locator('#help-play').isVisible(),true);
  await hidden(true);const paused=await page.locator('#time-left').textContent();
  await page.locator('#help-play').click();await page.clock.runFor(30000);
  assert.equal(await page.locator('#time-left').textContent(),paused);
  await hidden(false);await page.clock.runFor(1000);
  assert.notEqual(await page.locator('#time-left').textContent(),paused);
  // 既存の初回CAT保存状態に関係なく、再読み込みでも自動表示。
  await page.evaluate(()=>localStorage.setItem('word-pop-tutorial-complete-v1','true'));
  await page.reload();assert.equal(await page.locator('#help-dialog').isVisible(),true);
  await dismissHelp(page,true);
  assert.equal(await page.locator('#word-preview').textContent(),'');
  assert.equal(await page.locator('.play-hud #available-count,.game-bottom').count(),0);
  page.once('dialog',d=>d.dismiss());await page.locator('#restart-button').click();
  await page.clock.runFor(1000);assert.equal(await page.locator('#time-left').textContent(),'1:29');
  page.once('dialog',d=>d.accept());await page.locator('#restart-button').click();
  assert.equal(await page.locator('#time-left').textContent(),'1:30');
  assert.equal(await page.locator('#help-dialog').isVisible(),false);
  // 実操作による重複集計と、確定結果の整合。
  await page.route('**/engine.js*',r=>r.fulfill({contentType:'application/javascript',body:engine+`
   WordPopEngine.createBoard=()=>{const b=Array(56).fill('Z');b.splice(16,3,...'CAT');b.splice(35,3,...'CAT');return b;};
  `}));
  await load();await dismissHelp(page,true);await require('./set-test-cascades.cjs')(page);
  for(const indices of [[16,17,18],[35,36,37]]){await enter(indices);await page.clock.runFor(620);}
  await page.clock.runFor(80000);
  assert.equal(await page.locator('.time-warning').count(),1);
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.locator('#time-left').evaluate(e=>getComputedStyle(e).animationName),'none');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.clock.runFor(9000);assert.equal(await page.locator('#time-left').textContent(),'0:00');
  await page.clock.runFor(600);
  assert.equal(await page.locator('#result-dialog').isVisible(),true);
  assert.equal(await page.locator('#result-score').textContent(),'60');
  assert.equal(await page.locator('#result-count').textContent(),'2');
  assert.equal(await page.locator('#result-chain').textContent(),'1');
  assert.equal(await page.locator('.result-word').count(),1);
  assert.equal(await page.locator('.result-times').textContent(),'2回');
  await page.keyboard.press('Escape');assert.equal(await page.locator('#result-dialog').isVisible(),true);
  for(let i=0;i<3;i++) {
   await page.locator('#retry-button').click();
   assert.equal(await page.locator('#score').textContent(),'0');assert.equal(await page.locator('#found-count').textContent(),'0');
   assert.equal(await page.locator('.word-chip').count(),0);assert.equal(await page.locator('#word-preview').textContent(),'');
   assert.equal(await page.locator('#time-left').textContent(),'1:30');assert.equal(await page.locator('#help-dialog').isVisible(),false);
   await page.clock.runFor(1000);assert.equal(await page.locator('#time-left').textContent(),'1:29');
   await page.clock.runFor(89000);await page.clock.runFor(600);
   assert.equal(await page.locator('#result-score').textContent(),'0');assert.equal(await page.locator('#result-chain').textContent(),'0');
  }
  // 消去前・落下中・連鎖予告中の時間切れでも古い加算を残さない。
  await page.route('**/game.js*',r=>r.fulfill({contentType:'application/javascript',body:game.replace('const ROUND_SECONDS = 30','const ROUND_SECONDS = 2')}));
  for(const wait of [1800,1600]) {
   if(wait===0)await page.route('**/engine.js*',r=>r.fulfill({contentType:'application/javascript',body:engine+`
    WordPopEngine.createBoard=()=>{const b=Array(56).fill('Z');for(const i of [0,16,35,49])b.splice(i,3,...'CAT');return b;};
    WordPopEngine.findCascade=(before,result)=>{const p=WordPopEngine.findWord(result.board,WordPopEasyWords);return {word:p.map(i=>result.board[i]).join(''),path:p};};
   `}));
   await load();await dismissHelp(page,true);if(wait)await require('./set-test-cascades.cjs')(page);
   await page.clock.runFor(wait);await enter([16,17,18]);await page.clock.runFor(2000-wait);
   assert.equal(await page.locator('#timeup-toast').isVisible(),true);
   assert.equal(await page.locator('#result-dialog').isVisible(),false);
   await page.locator('.tile').nth(24).focus();await page.keyboard.press('Space');await page.keyboard.press('Enter');
   assert.equal(await page.locator('.tile.selected').count(),0);
   await page.clock.runFor(600);
   assert.equal(await page.locator('#result-score').textContent(),wait?'0':'30');
   const result=await page.locator('#result-score').textContent();
   await page.clock.runFor(5000);assert.equal(await page.locator('#result-score').textContent(),result);
   await page.locator('#retry-button').click();await page.clock.runFor(1000);
   assert.equal(await page.locator('#score').textContent(),'0');assert.equal(await page.locator('#time-left').textContent(),'0:01');
   assert.equal(await page.locator('.tile-effects,.tile.popping,.tile.falling').count(),0);
  }
  // 1秒制で、古い連鎖待ちの期限がリトライ直後に来る境界も検証する。
  await page.route('**/game.js*',r=>r.fulfill({contentType:'application/javascript',body:game.replace('const ROUND_SECONDS = 30','const ROUND_SECONDS = 1')}));
  await load();await dismissHelp(page,true);await require('./set-test-cascades.cjs')(page);await enter([16,17,18]);
  await page.clock.runFor(1000);await page.clock.runFor(600);
  await page.locator('#retry-button').click();await require('./set-test-cascades.cjs')(page);await enter([16,17,18]);
  await page.clock.runFor(300);assert.equal(await page.locator('#board').getAttribute('aria-busy'),'true');
  assert.equal(await page.locator('#score').textContent(),'0');
  await page.clock.runFor(320);assert.equal(await page.locator('#score').textContent(),'30');
  await page.unroute('**/game.js*');
  await page.route('**/engine.js*',r=>r.fulfill({contentType:'application/javascript',body:engine+`
    WordPopEngine.createBoard=()=>{const b=Array(56).fill('Z');for(const i of [0,16,35,49])b.splice(i,3,...'CAT');return b;};
    WordPopEngine.findCascade=(before,result)=>{const p=WordPopEngine.findWord(result.board,WordPopEasyWords);return p?{word:p.map(i=>result.board[i]).join(''),path:p}:null;};
  `}));
  // 確定した最大4連鎖と倍率得点が結果へ引き継がれる。
  await load();await dismissHelp(page,true);await enter([16,17,18]);await page.clock.runFor(6380);
  assert.equal(await page.locator('#found-count').textContent(),'4');
  await page.clock.runFor(90000);await page.clock.runFor(600);
  assert.equal(await page.locator('#result-chain').textContent(),'4');
  assert.equal(await page.locator('#result-score').textContent(),'300');
  await page.unroute('**/engine.js*');
  await page.route('**/engine.js*',r=>r.fulfill({contentType:'application/javascript',body:engine+`
   WordPopEngine.createBoard=()=>{const b=Array(56).fill('Z');['APPLE','ORANGE','BANANA','WINTER','SCHOOL','RABBIT','TURTLE','MONKEY'].forEach((w,n)=>b.splice(n*7,w.length,...w));b[6]='C';b[13]='A';b[20]='T';return b;};
  `}));
  await load();await dismissHelp(page,true);await require('./set-test-cascades.cjs')(page);
  for(const [n,w] of ['APPLE','ORANGE','BANANA','WINTER','SCHOOL','RABBIT','TURTLE','MONKEY'].entries()){
   await enter(Array.from({length:w.length},(_,i)=>n*7+i));await page.clock.runFor(620);
   assert.equal(await page.locator('#found-count').textContent(),String(n+1),w);
  }
  await page.clock.runFor(90000);await page.clock.runFor(600);
  assert.equal(await page.locator('.result-word').count(),8);
  fs.mkdirSync('/workspace/scratch/word-pop',{recursive:true});
  for(const [width,height] of [[1200,900],[390,844],[320,568],[740,360]]) {
   await page.setViewportSize({width,height});
   assert.equal(await page.locator('#result-words').evaluate(e=>e.scrollHeight>e.clientHeight&&e.clientHeight>=60),true);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   const retry=await page.locator('#retry-button').boundingBox();
   const scoreBounds=await page.locator('#result-score').boundingBox();
   assert.ok(retry.width>200);assert.ok(retry.y>=0&&retry.y+retry.height<=height,`${width}: retry must stay visible`);
   assert.ok(scoreBounds.y>=0&&scoreBounds.y+scoreBounds.height<=height,`${width}: score must stay visible`);
   await page.screenshot({path:`/workspace/scratch/word-pop/result-${width}.png`,fullPage:false});
  }
  await page.locator('#retry-button').click();await page.locator('#help-button').click();
  for(const [width,height] of [[1200,900],[390,844],[320,568],[740,360]]) {
   await page.setViewportSize({width,height});
   for(let n=0;n<3;n++) {
    if(n)await page.locator('#help-next').click();
    const rect=await page.locator('#help-dialog').boundingBox(),close=await page.locator('#close-help').boundingBox();
    assert.ok(rect.x>=0&&rect.x+rect.width<=width&&rect.y>=0&&rect.y+rect.height<=height);
    assert.ok(close.y>=rect.y&&close.y+close.height<=rect.y+rect.height);
    await page.screenshot({path:`/workspace/scratch/word-pop/help-${width}-${n+1}.png`,fullPage:false});
   }
   await dismissHelp(page,true);await page.locator('#help-button').click();
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: 3-page help and every-page close / reload / countdown start / help and visibility pause / reset confirmation / results and duplicate counts / repeated retry / expiry during erase, fall and cascade / result scrolling / responsive dialogs');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
