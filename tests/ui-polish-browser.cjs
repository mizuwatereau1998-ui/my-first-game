const dismissStartHelp = require('./dismiss-start-help.cjs');
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try {
  const page=await browser.newPage({viewport:{width:1200,height:1100}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.GAME_URL||'http://127.0.0.1:8000');await dismissStartHelp(page, false);
  await page.evaluate(()=>document.fonts.ready);await page.waitForSelector('#pop-image img');
  await require('./set-test-cascades.cjs')(page);
  async function play(indices) {
   for(const i of indices){await page.locator('.tile').nth(i).focus();await page.keyboard.press('Space');}
   await page.keyboard.press('Enter');await page.waitForFunction(()=>document.getElementById('board').getAttribute('aria-busy')==='false');
  }
  await play([16,17,18]);
  for(let n=0;n<2;n++) {
   const answer=await page.evaluate(length=>WordPopEngine.straightWords([...document.querySelectorAll('.tile')].map(t=>t.textContent),WordPopLongWords).find(m=>m.word.length===length),n===0?6:5);
   assert.ok(answer);await play(answer.path);
  }
  await page.waitForFunction(()=>document.getElementById('discovery-pop').hidden);
  assert.equal(await page.locator('h1').textContent(),'Word Pop!');
  assert.equal(await page.locator('.game-tagline').textContent(),'なぞって単語をつくろう！');
  assert.equal(await page.locator('.recent-caption,.game-bottom,#word-note').count(),0);
  assert.equal(await page.locator('.word-chip').count(),3);
  assert.ok((await page.locator('.chip-count').allTextContents()).every(t=>/^\d+回$/.test(t)));
  const overlap=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
  fs.mkdirSync('/workspace/scratch/word-pop',{recursive:true});
  for(const width of [1200,1000,900,768,701,700,390,320]) {
   await page.setViewportSize({width,height:1100});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${width}: overflow`);
   const logo=await page.locator('.game-brand').boundingBox(),board=await page.locator('#board').boundingBox();
   const recent=await page.locator('.found-card').boundingBox();
   assert.ok(logo.height<100);assert.ok(board.y<380,`${width}: excessive header height`);
   if(width>700){assert.ok(recent.x>=board.x+board.width);assert.ok(Math.abs(recent.y-board.y)<2);}
   else assert.ok(recent.y>(await page.locator('.play-hud').boundingBox()).y);
   for(const state of ['idle','correct','chain2','chain3']) {
    await page.evaluate(s=>s==='idle'?WordPopCharacter.reset():WordPopCharacter.react(s==='correct'?1:s==='chain2'?2:3),state);
    const char=await page.locator('#pop-image').boundingBox();
    const face=[{x:char.x+char.width*.30,y:char.y+char.height*.22,width:char.width*.34,height:char.height*.24},
     {x:char.x+char.width*.19,y:char.y+char.height*.48,width:char.width*.62,height:char.height*.36}];
    for(const selector of ['.game-brand','.score-card','#help-button','#restart-button','#shuffle-button']) {
     const r=await page.locator(selector).boundingBox();
     for(const f of face)assert.equal(overlap(f,r),false,`${width} ${state}: character overlaps ${selector}`);
    }
   }
   for(const selector of ['#help-button','#restart-button','#shuffle-button'])assert.ok((await page.locator(selector).boundingBox()).height>=44);
   for(const card of await page.locator('.word-chip').all()) {
    const word=await card.locator('.chip-word').boundingBox(),count=await card.locator('.chip-count').boundingBox();
    assert.ok(count.x>=word.x+word.width,`${width}: count must stay on the right`);
    assert.equal(await card.evaluate(e=>e.scrollWidth<=e.clientWidth),true);
   }
   await page.evaluate(()=>WordPopCharacter.reset());
   if([1200,390,320].includes(width)) {
    // fixed背景も画面全体に写るよう、撮影時だけ全コンテンツを収める。
    await page.setViewportSize({width,height:Math.max(1100,Math.ceil(await page.evaluate(()=>document.documentElement.scrollHeight)))});
    await page.screenshot({path:`/workspace/scratch/word-pop/ui-polish-${width}.png`,fullPage:true});
   }
  }
  await page.locator('#help-button').click();assert.equal(await page.locator('#help-dialog').isVisible(),true);
  assert.match(await page.locator('#help-dialog').textContent(),/一直線/);
  await page.locator('#close-help').click();
  await require('./set-test-cascades.cjs')(page,true);assert.equal(await page.locator('#chain-toggle').count(),0);
  page.once('dialog',d=>d.accept());await page.locator('#restart-button').click();
  assert.equal(await page.locator('#score').textContent(),'0');assert.equal(await page.locator('.word-chip').count(),0);
  assert.deepEqual(errors,[]);
  console.log('PASS: logo / uncluttered text / right-hand counts / PC and mobile cards / header and character separation / 44px controls / help and retry / responsive screenshots');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
