const {chromium,devices}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});try{
 const root=process.env.GAME_URL||'http://127.0.0.1:8000/';
 for(const device of ['iPhone 13','Pixel 7']){
  const context=await browser.newContext(devices[device]),page=await context.newPage(),errors=[],requests=new Map();page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install();await page.route('**/assets/characters/*.png*',async route=>{
   const u=new URL(route.request().url()),n=(requests.get(u.pathname)||0)+1;requests.set(u.pathname,n);
   assert.ok(u.searchParams.has('v'));
   if(!u.searchParams.has('retry'))await route.fulfill({status:404,body:'cached error'});else await route.fulfill({response:await route.fetch()});
  });
  await page.goto(root);await page.clock.pauseAt(await page.evaluate(()=>Date.now()+100));
  await page.waitForFunction(()=>document.querySelector('.mascot') && !document.querySelector('.character-space').classList.contains('has-pop-image'));
  await page.clock.runFor(1500);await page.waitForSelector('.has-pop-image img');
  for(const[chain,name]of[[0,'idle'],[1,'correct'],[2,'chain2'],[3,'chain3']]){
   await page.evaluate(n=>n?WordPopCharacter.react(n):WordPopCharacter.reset(),chain);
   await page.waitForFunction(file=>new URL(document.querySelector('#pop-image img').src).pathname.endsWith(file),`pop_${name}.png`);
   assert.equal(await page.locator('#pop-image img').evaluate(i=>i.naturalWidth>0),true);
  }
  assert.ok([...requests.values()].every(n=>n<=3));assert.deepEqual(errors,[]);await context.close();
 }
 // HTMLの場所が変わっても、画像はcharacter.jsを基準に取得する。
 const context=await browser.newContext(devices['iPhone 13']),page=await context.newPage();
 const html=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8').replace(/(src|href)="([^" ]+\.(?:js|css)(?:\?[^" ]*)?)"/g,(_,attr,file)=>`${attr}="${new URL(file,root).href}"`);
 await page.route('**/nested/play.html',r=>r.fulfill({contentType:'text/html',body:html}));await page.goto(new URL('nested/play.html',root).href);
 await page.waitForSelector('.has-pop-image img');assert.ok(await page.locator('#pop-image img').evaluate(i=>i.naturalWidth>0));
 console.log('PASS: mobile cache-error recovery / versioned assets / all four poses after retry / bounded requests / script-relative asset paths');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
