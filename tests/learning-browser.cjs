const dismissStartHelp = require('./dismiss-start-help.cjs');
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try {
 const context=await browser.newContext({viewport:{width:1200,height:1000}});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install();
 await page.goto(process.env.GAME_URL||'http://127.0.0.1:8000');await dismissStartHelp(page, true);
 await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));
 await require('./set-test-cascades.cjs')(page); // 停止した時計で、ここから15秒を計測。
 const before=await page.locator('.tile').allTextContents();
 await page.clock.runFor(14999);assert.equal(await page.locator('.idle-hint').count(),0);
 await page.clock.runFor(1);assert.equal(await page.locator('.idle-hint').count(),3);
 assert.deepEqual(await page.locator('.idle-hint').evaluateAll(ts=>ts.map(t=>t.dataset.index)),['16','17','18']);
 assert.equal(await page.locator('#score').textContent(),'0');
 assert.deepEqual(await page.locator('.tile').allTextContents(),before);
 assert.equal(await page.locator('.idle-hint').first().evaluate(t=>getComputedStyle(t).animationName),'hint-wiggle');
 await page.screenshot({path:'/workspace/scratch/word-pop/idle-hint.png',fullPage:true});
 const first=await page.locator('.tile').nth(16).boundingBox();
 await page.mouse.move(first.x+first.width/2,first.y+first.height/2);await page.mouse.down();
 assert.equal(await page.locator('.idle-hint').count(),0);
 await page.clock.runFor(20000);assert.equal(await page.locator('.idle-hint').count(),0);
 await page.mouse.up(); // 短すぎる不正解後はタイマーを再開。
 await page.clock.runFor(15000);assert.equal(await page.locator('.idle-hint').count(),3);
 await page.locator('#help-button').click();
 await page.clock.runFor(20000);assert.equal(await page.locator('.idle-hint').count(),0);
 // close はブラウザから非同期配送され、時計を進める呼び出しの後に届く場合がある。
 // 最後のタイマー再設定を行う close イベントを受けてから15秒を検証する。
 await page.evaluate(()=>{window.helpClosed=new Promise(resolve=>document.getElementById('help-dialog').addEventListener('close',()=>resolve(true),{once:true}));});
 await page.locator('#close-help').click();await page.clock.runFor(100);
 await page.evaluate(()=>helpClosed);
 await page.clock.runFor(14999);assert.equal(await page.locator('.idle-hint').count(),0);
 await page.clock.runFor(1);
 assert.equal(await page.locator('.idle-hint').count(),3);
 await page.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await page.locator('.idle-hint').first().evaluate(t=>getComputedStyle(t).animationName),'none');
 page.once('dialog',d=>d.accept());await page.locator('#restart-button').click();
 async function keyboardWord(start,length){
  await page.locator('.tile').nth(start).focus();
  for(let n=0;n<length;n++){await page.keyboard.press('Space');if(n<length-1)await page.keyboard.press('ArrowRight');}
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('.idle-hint').count(),0);
  await page.clock.runFor(10000); // 消去・落下を進める。実際に10秒待たない。
  await page.waitForFunction(()=>document.getElementById('board').getAttribute('aria-busy')==='false');
 }
 await keyboardWord(16,3);
 assert.equal(await page.locator('.chip-word').first().textContent(),'CAT');
 assert.equal(await page.locator('.chip-meaning').first().textContent(),'猫');
 await keyboardWord(35,3);
 assert.equal(await page.locator('.chip-meaning').first().textContent(),'犬');
 const score=await page.locator('#score').textContent();
 await page.locator('[data-word="CAT"]').click();
 assert.equal(await page.locator('[data-word=CAT] .chip-meaning').textContent(),'猫');
 assert.equal(await page.locator('[data-word=CAT]').getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('#score').textContent(),score);
 await page.clock.runFor(15000);
 // 補充後の現在の盤面で、本当に登録単語を指しているか確認。
 assert.equal(await page.evaluate(()=>{
  const tiles=[...document.querySelectorAll('.tile.idle-hint')].sort((a,b)=>Number(a.dataset.hintStep)-Number(b.dataset.hintStep));
  const indices=tiles.map(t=>Number(t.dataset.index)),word=tiles.map(t=>t.textContent).join('');
  return WordPopWords.has(word)&&indices.slice(1).every((i,n)=>WordPopEngine.adjacent(indices[n],i))&&
    indices.slice(2).every((i,n)=>i-indices[n+1]===indices[1]-indices[0]);
 }),true);
 page.once('dialog',d=>d.accept());await page.locator('#restart-button').click();
 assert.equal(await page.locator('.idle-hint').count(),0);
 assert.equal(await page.locator('.word-chip').count(),0);
 assert.equal(await page.locator('#score').textContent(),'0');
 // 意味未整備でも登録語は正解。訳を捏造せず準備中を表示。
 await page.route('**/engine.js*',route=>route.fulfill({contentType:'application/javascript',body:
  fs.readFileSync(path.resolve(__dirname,'../engine.js'),'utf8')+`\nWordPopEngine.createBoard=()=>{const b=Array(56).fill('Z');b.splice(16,5,...'ATLAS');return b;};`}));
 await page.reload();await dismissStartHelp(page, true);await require('./set-test-cascades.cjs')(page);
 await keyboardWord(16,5);
 assert.equal(await page.locator('.chip-word').first().textContent(),'ATLAS');
 assert.equal(await page.locator('.chip-meaning').first().textContent(),'意味は準備中');
 assert.equal(await page.locator('#score').textContent(),'50');
 await page.screenshot({path:'/workspace/scratch/word-pop/meaning.png',fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('PASS: 15-second idle timer / valid current-board hint / input and dialog suppression / restart / reduced motion / meanings / history / untranslated accepted word');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
