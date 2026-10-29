const dismissStartHelp = require('./dismiss-start-help.cjs');
const {chromium}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs'),path=require('node:path');
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});try{
const context=await browser.newContext({viewport:{width:1200,height:1100}}),page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/engine.js',r=>r.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.resolve(__dirname,'../engine.js'),'utf8')+`\nWordPopEngine.createBoard=()=>{const b=Array(56).fill('Z');b.splice(16,3,...'CAT');b.splice(35,3,...'CAT');b.splice(49,3,...'DOG');b.splice(46,3,...'SUN');return b;};`}));
await page.goto(process.env.GAME_URL||'http://127.0.0.1:8000');await dismissStartHelp(page, false);await require('./set-test-cascades.cjs')(page);await page.waitForSelector('#pop-image img');
async function play(p){for(const i of p){await page.locator('.tile').nth(i).focus();await page.keyboard.press('Space');}await page.keyboard.press('Enter');await page.waitForFunction(()=>document.getElementById('board').getAttribute('aria-busy')==='false');}
await play([16,17,18]);await play([35,36,37]);await play([49,50,51]);await play([46,47,48]);
assert.deepEqual(await page.locator('.chip-word').allTextContents(),['SUN','DOG','CAT']);assert.deepEqual(await page.locator('.chip-count').allTextContents(),['1回','1回','2回']);assert.equal(await page.locator('#score').textContent(),'120');assert.equal(await page.locator('#found-count').textContent(),'4');assert.equal(await page.locator('#word-note,.meaning-card').count(),0);
const overlap=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
for(const width of [1200,390,320]){
 await page.setViewportSize({width,height:1100});
 const frame=await page.locator('#board').boundingBox(),char=await page.locator('#pop-image').boundingBox(),first=await page.locator('.tile').first().boundingBox();
 assert.equal(Math.round(char.width),width>700?238:180);assert.ok(char.y+char.height<=first.y);
 // 透過余白を除く中央の顔・前髪が操作パネルを隠さないこと。
 const visibleParts=[
  {x:char.x+char.width*.30,y:char.y+char.height*.22,width:char.width*.34,height:char.height*.24},
  {x:char.x+char.width*.19,y:char.y+char.height*.48,width:char.width*.62,height:char.height*.36}
 ];
 for(const selector of ['#help-button','#restart-button','#shuffle-button'])for(const part of visibleParts)assert.equal(overlap(part,await page.locator(selector).boundingBox()),false,`${width} ${selector}`);
 for(const state of ['correct','chain2','chain3']){await page.evaluate(s=>WordPopCharacter.react(s==='correct'?1:s==='chain2'?2:3),state);assert.ok((await page.locator('#pop-image').boundingBox()).y+char.height<=first.y);}
 await page.evaluate(()=>WordPopCharacter.reset());
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:`/workspace/scratch/word-pop/refined-${width}.png`,fullPage:true});
}
assert.deepEqual(errors,[]);console.log('PASS: no memo / distinct recent words and counts / unchanged total score / 1.4x character / responsive controls / frame anchor for all poses');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
