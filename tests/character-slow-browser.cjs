const {chromium, devices} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox']});
  const root = process.env.GAME_URL || 'http://127.0.0.1:8000/';
  const png = route => fs.readFileSync(path.resolve(__dirname, '../assets/characters', path.basename(new URL(route.request().url()).pathname)));
  try {
    for (const device of ['iPhone 13', 'Pixel 7']) {
      const context = await browser.newContext(devices[device]), page = await context.newPage();
      const held = [], names = new Set(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      let ready;
      const requested = new Promise(resolve => { ready = resolve; });
      await page.clock.install();
      await page.route('**/assets/characters/*.png*', route => {
        held.push(route); names.add(path.basename(new URL(route.request().url()).pathname));
        if (names.size === 4) ready();
      });
      await page.goto(root, {waitUntil: 'domcontentloaded'}); await requested;
      await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
      await page.clock.runFor(60000);
      assert.equal(await page.locator('#pop-image img').count(), 0);
      assert.ok(held.every(r => !new URL(r.request().url()).searchParams.has('retry')), '遅延だけでは再取得しない');
      await require('./dismiss-start-help.cjs')(page, true);
      await require('./set-test-cascades.cjs')(page);
      for (const i of [16, 17, 18]) { await page.locator('.tile').nth(i).focus(); await page.keyboard.press('Space'); }
      await page.keyboard.press('Enter'); await page.clock.runFor(620);
      assert.equal(await page.locator('#score').textContent(), '30', '画像取得中もゲームを開始できる');
      await page.evaluate(() => WordPopCharacter.react(3));
      for (const route of held) await route.fulfill({contentType: 'image/png', body: png(route)});
      await page.waitForFunction(() => document.querySelector('#pop-image img')?.src.includes('pop_chain3.png'));
      for (const [chain, file] of [[0, 'idle'], [1, 'correct'], [2, 'chain2'], [3, 'chain3']]) {
        await page.evaluate(n => n ? WordPopCharacter.react(n) : WordPopCharacter.reset(), chain);
        await page.waitForFunction(file => {
          const image = document.querySelector('#pop-image img');
          return image?.src.includes(`pop_${file}.png`) && image.naturalWidth > 0;
        }, file);
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
    // エラーで通常の再試行を使い切っても、回線の復帰時に再取得できる。
    const context = await browser.newContext(devices['iPhone 13']), page = await context.newPage();
    let recovered = false, count = 0;
    await page.addInitScript(() => {
      window.characterImageErrors = 0;
      const NativeImage = window.Image;
      window.Image = class extends NativeImage {
        constructor(...args) {
          super(...args);
          this.addEventListener('error', () => { window.characterImageErrors++; });
        }
      };
    });
    await page.clock.install();
    await page.route('**/assets/characters/*.png*', async route => {
      count++;
      if (!recovered) await route.fulfill({status: 503, body: 'temporarily offline'});
      else await route.fulfill({contentType: 'image/png', body: png(route)});
    });
    await page.goto(root); await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
    await page.waitForFunction(() => characterImageErrors >= 4);
    await page.clock.runFor(1200);
    await page.waitForFunction(() => characterImageErrors >= 8);
    await page.clock.runFor(2400);
    await page.waitForFunction(() => characterImageErrors >= 12);
    const exhausted = count; assert.ok(exhausted >= 12);
    await page.clock.runFor(60000); assert.equal(count, exhausted, 'エラー中は無限に再試行しない');
    recovered = true;
    await page.evaluate(() => { window.dispatchEvent(new Event('online')); window.dispatchEvent(new Event('online')); });
    await page.waitForSelector('.has-pop-image img');
    await page.evaluate(() => WordPopCharacter.react(3));
    await page.waitForFunction(() => document.querySelector('#pop-image img')?.src.includes('pop_chain3.png'));
    assert.ok(count <= exhausted + 4, 'onlineの重複でも同じ画像を並行取得しない');
    await context.close();
    console.log('PASS: 60-second delayed images finish on iPhone/Android profiles / playable while loading / all four poses / current pose on arrival / bounded error retries / online recovery without duplicate requests');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
