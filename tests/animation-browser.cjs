const dismissStartHelp = require('./dismiss-start-help.cjs');
// 実際のCSS移動と入力ロックを検証。連鎖の段階表示だけは候補を固定する。
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium', args:['--no-sandbox']});
  try {
    const page = await browser.newPage({viewport:{width:1200,height:1100}});
    fs.mkdirSync('/workspace/scratch/word-pop',{recursive:true});
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.clock.install();
    const engine = fs.readFileSync(path.resolve(__dirname,'../engine.js'),'utf8');
    await page.route('**/engine.js*', r => r.fulfill({contentType:'application/javascript',body:engine + `
      WordPopEngine.createBoard=()=>{const b=Array(56).fill('Z');b.splice(16,3,...'CAT');return b;};
    `}));
    const url = process.env.GAME_URL || 'http://127.0.0.1:8000';
    async function load() {
      await page.goto(url);await dismissStartHelp(page, true);
      await page.clock.pauseAt(await page.evaluate(() => Date.now()+1000));
      await require('./set-test-cascades.cjs')(page);
    }
    async function select(indices) {
      for (const i of indices) {
        await page.locator('.tile').nth(i).focus();
        await page.keyboard.press('Space');
      }
    }
    async function sampleFall(index, time) {
      return page.locator('.tile').nth(index).evaluate((tile, time) => {
        for (const a of tile.getAnimations()) { a.pause(); a.currentTime=time; }
        const r=tile.getBoundingClientRect();
        return {top:r.top,bottom:r.bottom};
      }, time);
    }
    for (const width of [1200,390,320]) {
      await page.setViewportSize({width,height:1100});
      await load();
      const original = await page.locator('.tile').evaluateAll(ts => ts.map(t=>({top:t.getBoundingClientRect().top, color:t.dataset.color,letter:t.textContent,height:t.offsetHeight})));
      await select([16,17,18]);
      assert.equal(await page.locator('.tile.selected').count(),3);
      if(width===1200) await page.screenshot({path:'/workspace/scratch/word-pop/polished-selection.png',fullPage:true});
      // 直前に戻すと最後の文字だけが自然に戻る。
      await select([17]);
      assert.equal(await page.locator('.tile.selected').count(),2);
      await select([18]);
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#board').getAttribute('aria-busy'),'true');
      assert.deepEqual(await page.locator('.tile.popping').evaluateAll(ts=>ts.map(t=>t.style.getPropertyValue('--pop-delay'))),['0ms','12ms','24ms']);
      assert.equal(await page.locator('.tile-effects .pop-spark').count(),9);
      assert.equal(await page.locator('.tile-effects').evaluate(e=>getComputedStyle(e).pointerEvents),'none');
      await page.clock.runFor(240);
      // 行間隔の固定値ではなく、落下前の文字の位置から出発する。
      assert.equal(await page.locator('.tile').nth(16).getAttribute('data-color'),original[9].color);
      assert.equal(await page.locator('.tile').nth(16).textContent(),original[9].letter);
      const first = await sampleFall(16,0);
      assert.ok(Math.abs(first.top-original[9].top)<1,`${width}: wrong source position`);
      const fresh = await sampleFall(2,0);
      assert.ok(fresh.bottom <= original[2].top+1,`${width}: refill must enter from above`);
      const early=await sampleFall(16,60), middle=await sampleFall(16,120), late=await sampleFall(16,180);
      assert.ok(middle.top-early.top < late.top-middle.top,`${width}: fall must accelerate`);
      const landed=await sampleFall(16,380), bouncing=await sampleFall(16,330);
      assert.ok(bouncing.bottom<landed.bottom,`${width}: missing landing bounce`);
      const lockedTile = await page.locator('.tile').nth(24).boundingBox();
      await page.mouse.move(lockedTile.x+lockedTile.width/2,lockedTile.y+lockedTile.height/2);
      await page.mouse.down();
      assert.equal(await page.locator('.tile.selected').count(),0);
      await page.mouse.up();
      await select([24]);
      assert.equal(await page.locator('.tile.selected').count(),0);
      assert.equal(await page.locator('#restart-button').isDisabled(),true);
      await page.clock.runFor(380);
      assert.equal(await page.locator('#score').textContent(),'30');
      assert.equal(await page.locator('#board').getAttribute('aria-busy'),'false');
      await page.clock.runFor(1000);
      assert.equal(await page.locator('.tile-effects,.tile.falling,.tile.popping').count(),0);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      // 続けて単語を消しても粒子・ロック・得点処理が残らない。
      for (let n=0;n<3;n++) {
        const answer=await page.evaluate(()=>WordPopEngine.findWord([...document.querySelectorAll('.tile')].map(t=>t.textContent),WordPopWords));
        assert.ok(answer);
        await select(answer);await page.keyboard.press('Enter');await page.clock.runFor(2000);
        assert.equal(await page.locator('#board').getAttribute('aria-busy'),'false');
        assert.equal(await page.locator('.tile-effects').count(),0);
      }
    }
    // 粒子がまだ残る時間にリトライしても即座に削除される。
    await load();await select([16,17,18]);await page.keyboard.press('Enter');
    await page.clock.runFor(620);
    assert.equal(await page.locator('.tile-effects').count(),1);
    page.once('dialog',d=>d.accept());await page.locator('#restart-button').click();
    assert.equal(await page.locator('.tile-effects').count(),0);
    assert.equal(await page.locator('#score').textContent(),'0');
    // 4連鎖の上限と表示の段階。実ゲームの候補判定はNode/既存ブラウザテストで検証。
    await page.route('**/engine.js*', r=>r.fulfill({contentType:'application/javascript',body:engine+`
      WordPopEngine.createBoard=()=>{const b=Array(56).fill('Z');for(const i of [0,16,35,49])b.splice(i,3,...'CAT');return b;};
      window.cascadeCalls=0;
      WordPopEngine.findCascade=(before,result)=>{cascadeCalls++;const p=WordPopEngine.findWord(result.board,WordPopEasyWords);return {word:p.map(i=>result.board[i]).join(''),path:p};};
    `}));
    await load();await require('./set-test-cascades.cjs')(page,true);
    await select([16,17,18]);await page.keyboard.press('Enter');
    for (let chain=1;chain<=4;chain++) {
      assert.equal(await page.locator('.tile-effects').getAttribute('data-chain'),String(chain));
      assert.equal(await page.locator('.character-space').getAttribute('data-pop-state'),chain===1?'correct':chain===2?'chain2':'chain3');
      assert.equal(await page.locator('.chain-halo').count(),chain>=3?1:0);
      assert.equal(await page.locator('.celebration-star').count(),chain===4?12:0);
      assert.equal(await page.locator('#discovery-pop').isVisible(),false);
      await page.clock.runFor(240);
      assert.equal(await page.locator('#discovery-pop').isVisible(),false);
      await page.clock.runFor(380);
      assert.equal(await page.locator('#discovery-pop').isVisible(),true);
      assert.equal(await page.locator('#discovery-label').textContent(),chain===1?'NICE FIND!':`${chain} CHAIN!`);
      if(chain===4) {
        await page.locator('.discovery-burst').evaluate(e=>{for(const a of e.getAnimations({subtree:true})){a.pause();a.currentTime=550;}});
        await page.screenshot({path:'/workspace/scratch/word-pop/polished-chain4-mobile.png',fullPage:true});
      }
      if(chain<4) {
        await page.clock.runFor(1000);
        assert.equal(await page.locator('#discovery-pop').isVisible(),false);
        assert.equal(await page.locator('#board').getAttribute('aria-busy'),'true');
        // 消去予告中に次の表情へ先走らず、弾け始めに切り替える。
        await page.clock.runFor(299);
        assert.equal(await page.locator('.tile.popping').count(),0);
        await page.clock.runFor(1);
      }
    }
    assert.equal(await page.evaluate(()=>cascadeCalls),3);
    assert.equal(await page.locator('#found-count').textContent(),'4');
    assert.equal(await page.locator('#board').getAttribute('aria-busy'),'false');
    await page.clock.runFor(1500);
    assert.equal(await page.locator('.tile-effects').count(),0);
    assert.equal(await page.locator('.character-space').getAttribute('data-pop-state'),'idle');
    await page.emulateMedia({reducedMotion:'reduce'});await load();
    await select([16,17,18]);await page.keyboard.press('Enter');
    assert.equal(await page.locator('.tile-effects').count(),0);
    assert.equal(await page.locator('.tile.popping').first().evaluate(e=>getComputedStyle(e).animationName),'none');
    await page.clock.runFor(240);
    assert.equal(await page.locator('.tile.falling').first().evaluate(e=>getComputedStyle(e).transform),'none');
    await page.clock.runFor(380);
    assert.equal(await page.locator('#score').textContent(),'30');
    assert.deepEqual(errors,[]);
    console.log('PASS: responsive source/landing positions / acceleration / bounce / stagger / input lock / repeated clears / particle cleanup / 2–4 chain timing and cap / reduced motion');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
