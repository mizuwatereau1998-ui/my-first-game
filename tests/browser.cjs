const dismissStartHelp = require('./dismiss-start-help.cjs');
// Playwright と Chromium のある開発環境で実行するブラウザ検証。
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
  const errors=[];
  async function setup(options={}){
    const context=await browser.newContext(options);
    const page=await context.newPage();
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(process.env.GAME_URL || 'http://127.0.0.1:8000');await dismissStartHelp(page, false);
    await page.waitForSelector('.tile');
    await require('./set-test-cascades.cjs')(page);
    return {context,page};
  }
  async function center(page,i){const b=await page.locator('.tile').nth(i).boundingBox();return {x:b.x+b.width/2,y:b.y+b.height/2};}
  async function drag(page,indices){
    const start=await center(page,indices[0]); await page.mouse.move(start.x,start.y); await page.mouse.down();
    for(const i of indices.slice(1)){const p=await center(page,i);await page.mouse.move(p.x,p.y,{steps:8});}
    await page.mouse.up();
  }
  const {context,page}=await setup({viewport:{width:1200,height:960}});
  assert.equal(await page.evaluate(()=>WordPopWords.size),3000);
  assert.equal(await page.evaluate(()=>WordPopWords.has('AFFORD')),true);
  assert.equal(await page.evaluate(()=>WordPopWords.has('WENT')),false);
  assert.equal(await page.locator('.tile').count(),56);
  assert.equal(await page.locator('.tile.hint').count(),3);
  assert.equal(await page.locator('#tutorial').isVisible(),true);
  // L字をマウスでなぞっても CAT にならず CA のまま。
  const p16=await center(page,16),p17=await center(page,17),p24=await center(page,24);
  await page.mouse.move(p16.x,p16.y);await page.mouse.down();
  await page.mouse.move(p17.x,p17.y,{steps:5});await page.mouse.move(p24.x,p24.y,{steps:5});
  assert.equal(await page.locator('#word-preview').textContent(),'CA');
  await page.mouse.up();
  assert.equal(await page.locator('#score').textContent(),'0');
  await drag(page,[16,17,16]); // 直前に戻すと C だけになり不正解。
  assert.equal(await page.locator('#score').textContent(),'0');
  assert.equal(await page.locator('.tile').nth(16).textContent(),'C');
  assert.match(await page.locator('#feedback').textContent(),/3〜6/);
  const before=await page.locator('.tile').allTextContents();
  await drag(page,[16,17,18]);
  await page.waitForFunction(()=>document.getElementById('score').textContent==='30');
  assert.equal(await page.locator('.tile').count(),56);
  assert.equal(await page.locator('#tutorial').isVisible(),false);
  assert.equal(await page.locator('.tile.hint').count(),0);
  const after=await page.locator('.tile').allTextContents();
  for(const col of [2,3,4]){
    assert.equal(after[14+col],before[7+col]);
    assert.equal(after[7+col],before[col]);
    for(let row=3;row<8;row++)assert.equal(after[row*7+col],before[row*7+col]);
  }
  assert.equal(await page.locator('#found-words .chip-word').textContent(),'CAT');
  await page.locator('#chain-clock-note').waitFor({state:'hidden'});
  await drag(page,[35,36,37]);
  await page.waitForFunction(()=>document.getElementById('score').textContent==='60');
  assert.equal(await page.locator('#found-count').textContent(),'2');
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#restart-button').click();
  assert.equal(await page.locator('#score').textContent(),'0');
  assert.equal(await page.locator('#found-count').textContent(),'0');
  // キーボードでも選択・決定ができる。
  await page.locator('.tile').nth(16).focus();
  await page.keyboard.press('Space'); await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space'); await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space'); await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.getElementById('score').textContent==='30');
  // 別の新規ページで、縦の BOOK を実際になぞる。
  const vertical=await context.newPage(); await vertical.goto('http://127.0.0.1:8000');await dismissStartHelp(vertical, false);
  await require('./set-test-cascades.cjs')(vertical);
  await drag(vertical,[0,7,14,21]);
  await vertical.waitForFunction(()=>document.getElementById('score').textContent==='40');
  assert.equal(await vertical.locator('#found-words .chip-word').textContent(),'BOOK');
  await vertical.close();
  await page.reload();await dismissStartHelp(page, false);
  assert.equal(await page.locator('#tutorial').isVisible(),false);
  assert.equal(await page.locator('.tile.hint').count(),0);
  await page.locator('#help-button').click();assert.equal(await page.locator('#help-dialog').isVisible(),true);
  await page.locator('#close-help').click();
  page.once('dialog',dialog=>dialog.accept());await page.locator('#restart-button').click();
  assert.equal(await page.locator('.tile').count(),56);
  fs.mkdirSync('/workspace/scratch/word-pop',{recursive:true});
  await page.screenshot({path:'/workspace/scratch/word-pop/desktop.png',fullPage:true});
  // タッチは Chromium の実際の Touch イベントを送り Pointer Events に変換させる。
  const mobile=await setup({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  await mobile.page.screenshot({path:'/workspace/scratch/word-pop/mobile-tutorial.png',fullPage:true});
  const cdp=await mobile.context.newCDPSession(mobile.page);
  async function touchDrag(indices){
    const start=await center(mobile.page,indices[0]);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});
    for(let n=1;n<indices.length;n++){
      const from=await center(mobile.page,indices[n-1]), to=await center(mobile.page,indices[n]);
      for(let step=1;step<=6;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x+(to.x-from.x)*step/6,y:from.y+(to.y-from.y)*step/6}]});
    }
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }
  await touchDrag([16,17,18]);
  await mobile.page.waitForFunction(()=>document.getElementById('score').textContent==='30');
  assert.equal(await mobile.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  // 斜めの SUN も実際のタッチで選択する。
  await mobile.page.locator('#chain-clock-note').waitFor({state:'hidden'});
  await touchDrag([34,40,46]);
  await mobile.page.waitForFunction(()=>document.getElementById('score').textContent==='60');
  // タッチのキャンセルで単語が確定されない。
  const cancelStart=await center(mobile.page,35);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[cancelStart]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  assert.equal(await mobile.page.locator('.tile.selected').count(),0);
  assert.equal(await mobile.page.locator('#score').textContent(),'60');
  await mobile.page.screenshot({path:'/workspace/scratch/word-pop/mobile.png',fullPage:true});
  // 320px幅でも横スクロールしない。
  await mobile.page.setViewportSize({width:320,height:700});
  assert.equal(await mobile.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  // 別コンテキストで実際の連鎖・加点・操作ロック・終了を確認。
  const chainContext=await browser.newContext({viewport:{width:1200,height:960}});
  await chainContext.addInitScript(()=>{Math.random=()=>0;});
  const chainPage=await chainContext.newPage();
  chainPage.on('pageerror',e=>errors.push(e.message));
  // 実際の消去・落下によって中央にCATが成立する固定盤面。
  await chainPage.route('**/engine.js*', route=>route.fulfill({
    contentType:'application/javascript',
    body:fs.readFileSync(require('node:path').resolve(__dirname,'../engine.js'),'utf8') + `
      WordPopEngine.createBoard=()=>{
        const b=Array(56).fill('Z');b[16]='C';b[24]='A';b[25]='T';b.splice(21,3,'D','O','G');return b;
      };`
  }));
  await chainPage.goto(process.env.GAME_URL || 'http://127.0.0.1:8000');await dismissStartHelp(chainPage, false);
  await drag(chainPage,[21,22,23]);
  await chainPage.locator('.chain-ready').first().waitFor();
  assert.equal(await chainPage.locator('#restart-button').isDisabled(),true);
  assert.equal(await chainPage.locator('#shuffle-button').isDisabled(),true);
  assert.match(await chainPage.locator('#chain-banner').textContent(),/2 CHAIN!/);
  const highlighted=await chainPage.locator('.chain-ready').evaluateAll(tiles=>tiles.map(t=>Number(t.dataset.index)));
  assert.deepEqual(highlighted,[23,24,25]);
  await chainPage.waitForFunction(()=>document.getElementById('board').getAttribute('aria-busy')==='false');
  const chips=await chainPage.locator('.chip-word').allTextContents();
  assert.ok(chips.length>=2 && chips.length<=4);
  const expected=90; // 固定盤面の手動DOG30点＋2連鎖CAT60点。履歴は倍率ではなく発見回数を表示。
  assert.equal(Number(await chainPage.locator('#score').textContent()),expected);
  assert.equal(await chainPage.locator('#restart-button').isEnabled(),true);
  assert.equal(await chainPage.locator('.tile').count(),56);
  await chainPage.locator('#chain-clock-note').waitFor({state:'hidden'});
  assert.ok(await chainPage.evaluate(()=>WordPopEngine.straightWords(Array.from(document.querySelectorAll('.tile'),t=>t.textContent),WordPopEasyWords).length)>0);
  await chainPage.screenshot({path:'/workspace/scratch/word-pop/chains.png',fullPage:true});
  await chainContext.close();
  // ダウンロードして直接開く使い方でも追加語彙が読める。
  const local = await context.newPage();
  local.on('pageerror',e=>errors.push(e.message));
  let fileLoaded = false;
  try {
    await local.goto(require('node:url').pathToFileURL(require('node:path').resolve(__dirname,'../index.html')).href);await dismissStartHelp(local, false);
    fileLoaded = true;
  } catch (error) {
    if (!error.message.includes('ERR_BLOCKED_BY_ADMINISTRATOR')) throw error;
    console.log('SKIP: file:// direct-open check blocked by cloud browser policy (HTTP checks still required)');
  }
  if (fileLoaded) {
    assert.equal(await local.evaluate(()=>WordPopWords.size),3000);
    assert.equal(await local.locator('.tile').count(),56);
  }
  await local.close();
  assert.deepEqual(errors,[]);
  await browser.close();
  console.log('PASS: desktop mouse / mobile touch / backtracking / gravity / refill / vertical and diagonal words / keyboard / reset / tutorial persistence / cancel / responsive / no page errors');
})().catch(error=>{console.error(error);process.exit(1);});
