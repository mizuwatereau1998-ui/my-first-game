const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
 const context=await browser.newContext({viewport:{width:1200,height:1000}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install();await page.goto(process.env.GAME_URL||'http://127.0.0.1:8000');
 await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));
 await page.locator('#chain-toggle').uncheck();
 async function enterWord(start,length){await page.locator('.tile').nth(start).focus();for(let n=0;n<length;n++){await page.keyboard.press('Space');if(n<length-1)await page.keyboard.press('ArrowRight');}await page.keyboard.press('Enter');}
 assert.equal(await page.locator('#discovery-pop').isVisible(),false);
 await enterWord(16,3);
 await page.clock.runFor(239);assert.equal(await page.locator('#discovery-pop').isVisible(),false);
 await page.clock.runFor(1);
 assert.equal(await page.locator('#discovery-pop').isVisible(),true);
 assert.equal(await page.locator('#discovery-word').textContent(),'CAT');
 assert.equal(await page.locator('#discovery-meaning').textContent(),'猫');
 assert.equal(await page.locator('#discovery-score').textContent(),'+30 pt');
 assert.equal(await page.locator('#discovery-pop').evaluate(e=>getComputedStyle(e).pointerEvents),'none');
 // 見た目を確認するためにアニメーションだけを途中で停止（タイマーやルールは変えない）。
 await page.locator('.discovery-burst').evaluate(e=>{for(const a of e.getAnimations()){a.pause();a.currentTime=450;}});
 await page.screenshot({path:'/workspace/scratch/word-pop/discovery-popup.png',fullPage:true});
 await page.clock.runFor(380);
 assert.equal(await page.locator('#score').textContent(),'30');
 assert.equal(await page.locator('#board').getAttribute('aria-busy'),'false');
 assert.equal(await page.locator('#discovery-pop').isVisible(),true);
 // 表示中でも背後の文字をマウス選択できる。操作すると演出は消える。
 const b=await page.locator('.tile').nth(24).boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();
 assert.equal(await page.locator('#discovery-pop').isVisible(),false);
 assert.equal(await page.locator('.tile.selected').count(),1);await page.mouse.up();
 // 連鎖のたびに単語・訳・連鎖ラベルが切り替わり、最後は自動で消える。
 await page.route('**/engine.js',r=>r.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.resolve(__dirname,'../engine.js'),'utf8')+`\n// 偶然の追加連鎖で最終履歴が変わらないよう、補充文字だけをZに固定する。\nMath.random=()=>.99;WordPopEngine.createBoard=()=>{const b=Array(56).fill('Z');b[16]='C';b[24]='A';b[25]='T';b.splice(21,3,'D','O','G');return b;};`}));
 await page.reload();
 await page.evaluate(()=>{window.popups=[];new MutationObserver(()=>popups.push([document.getElementById('discovery-word').textContent,document.getElementById('discovery-meaning').textContent,document.getElementById('discovery-label').textContent])).observe(document.getElementById('discovery-word'),{childList:true});});
 await enterWord(21,3);await page.clock.runFor(5000);
 const popups=await page.evaluate(()=>popups);
 assert.ok(popups.some(([w,m])=>w==='DOG'&&m==='犬'));
 assert.ok(popups.some(([w,m,c])=>w==='CAT'&&m==='猫'&&c==='2 CHAIN!'));
 assert.equal(await page.locator('#discovery-pop').isVisible(),false);
 assert.equal(await page.locator('.chip-word').first().textContent(),'CAT');
 // スマホ幅・6文字・長めの日本語訳・動きを減らす設定。
 await page.setViewportSize({width:320,height:800});await page.emulateMedia({reducedMotion:'reduce'});
 await page.route('**/engine.js',r=>r.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.resolve(__dirname,'../engine.js'),'utf8')+`\nWordPopEngine.createBoard=()=>{const b=Array(56).fill('Z');b.splice(15,6,...'AFFORD');return b;};`}));
 await page.reload();await page.locator('#chain-toggle').uncheck();
 await enterWord(15,6);await page.clock.runFor(240);
 assert.equal(await page.locator('#discovery-word').textContent(),'AFFORD');
 assert.equal(await page.locator('#discovery-meaning').textContent(),'〜する余裕がある');
 assert.equal(await page.locator('.discovery-burst').evaluate(e=>getComputedStyle(e).animationName),'none');
 const bounds=await page.evaluate(()=>{const a=document.getElementById('discovery-word').getBoundingClientRect(),b=document.getElementById('board').getBoundingClientRect();return a.left>=b.left&&a.right<=b.right&&document.documentElement.scrollWidth<=innerWidth;});assert.equal(bounds,true);
 await page.screenshot({path:'/workspace/scratch/word-pop/discovery-mobile.png',fullPage:true});
 await page.clock.runFor(1400);assert.equal(await page.locator('#discovery-pop').isVisible(),false);
 assert.deepEqual(errors,[]);
 console.log('PASS: popup at deletion / word and translation / pointer passthrough / chain replacement / timed cleanup / mobile six-letter fit / reduced motion');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
