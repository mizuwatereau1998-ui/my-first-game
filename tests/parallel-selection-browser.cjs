const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox']});
  try {
    for (const touch of [false, true]) {
      const context = await browser.newContext({viewport: {width: touch ? 390 : 1200, height: 1000}, hasTouch: touch, isMobile: touch});
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.clock.install();
      const engine = fs.readFileSync(path.resolve(__dirname, '../engine.js'), 'utf8');
      await page.route('**/engine.js*', route => route.fulfill({contentType: 'application/javascript', body: engine + `
        Math.random = () => .99;
        WordPopEngine.createBoard = () => {
          const b = Array(56).fill('Z'); b.splice(0, 6, ...'ORANGE');
          for (let row = 2; row < 8; row++) b.splice(row * 7, 3, ...'CAT');
          b[6] = 'D'; b[13] = 'O'; b[20] = 'G'; return b;
        };
        WordPopEngine.refillLongWords = r => r;
        WordPopEngine.findCascade = (before, result, words, selected = []) => {
          for (let row = 7; row >= 0; row--) {
            const p = [row * 7, row * 7 + 1, row * 7 + 2];
            if (!p.some(i => selected.includes(i)) && p.map(i => result.board[i]).join('') === 'CAT') return {word: 'CAT', path: p};
          }
          return null;
        };
      `}));
      await page.goto(process.env.GAME_URL || 'http://127.0.0.1:8000');
      await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
      await require('./dismiss-start-help.cjs')(page, true);
      for (const i of [6, 13, 20]) { await page.locator('.tile').nth(i).focus(); await page.keyboard.press('Space'); }
      await page.keyboard.press('Enter'); await page.clock.runFor(620);
      const cdp = touch ? await context.newCDPSession(page) : null;
      const centers = await Promise.all([0, 1, 2, 3, 4, 5].map(async i => {
        const b = await page.locator('.tile').nth(i).boundingBox(); return {x: b.x + b.width / 2, y: b.y + b.height / 2};
      }));
      async function begin(p) {
        if (touch) await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [p]});
        else { await page.mouse.move(p.x, p.y); await page.mouse.down(); }
      }
      async function move(p) {
        if (touch) await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [p]});
        else await page.mouse.move(p.x, p.y, {steps: 8});
        if (touch) await page.clock.runFor(16);
      }
      async function release() {
        if (touch) await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
        else await page.mouse.up();
      }
      await begin(centers[0]); for (const p of centers.slice(1)) await move(p);
      await page.waitForFunction(() => document.getElementById('word-preview').textContent === 'ORANGE');
      assert.equal(await page.locator('#word-preview').textContent(), 'ORANGE', JSON.stringify({touch, centers, selected: await page.locator('.tile.selected').allTextContents()}));
      await page.clock.runFor(3840); // 指を離さず、2回の自動連鎖と落下を通過。
      assert.equal(await page.locator('#score').textContent(), '180');
      assert.equal(await page.locator('#found-count').textContent(), '3');
      assert.equal(await page.locator('#word-preview').textContent(), 'ORANGE');
      assert.equal(await page.locator('.tile.selected').count(), 6);
      const selected = await page.locator('.tile.selected').evaluateAll(ts => ts.map(t => Number(t.dataset.index)));
      assert.deepEqual(selected, [3, 4, 5, 14, 15, 16]);
      const line = await page.locator('#selected-line').getAttribute('points');
      assert.equal(line.trim().split(/\s+/).length, 6);
      assert.equal(await page.locator('#found-words [data-word="ORANGE"]').count(), 0);
      // 次の自動消去の最中に離す。自動処理の後、手動語を1回だけ加算。
      await page.clock.runFor(1400);
      assert.equal(await page.locator('#board').getAttribute('aria-busy'), 'true');
      await release();
      await page.locator('#submit-button').dispatchEvent('click');
      await page.clock.runFor(520 + 620);
      assert.equal(await page.locator('#score').textContent(), '600');
      assert.equal(await page.locator('#found-count').textContent(), '5');
      assert.equal(await page.locator('#discovery-word').textContent(), 'ORANGE');
      assert.equal(await page.locator('#discovery-label').textContent(), '5 CHAIN!');
      assert.match(await page.locator('[data-word="ORANGE"]').textContent(), /1回/);
      // 自動連鎖の予告中に、新しい選択を始めて確定することもできる。
      await page.reload(); await require('./dismiss-start-help.cjs')(page, true);
      for (const i of [6, 13, 20]) { await page.locator('.tile').nth(i).focus(); await page.keyboard.press('Space'); }
      await page.keyboard.press('Enter'); await page.clock.runFor(1620);
      assert.equal(await page.locator('#board').getAttribute('aria-busy'), 'true');
      for (let i = 0; i < 6; i++) {
        const b = await page.locator('.tile').nth(i).boundingBox(), p = {x: b.x + b.width / 2, y: b.y + b.height / 2};
        if (!i) await begin(p); else await move(p);
      }
      await page.waitForFunction(() => document.getElementById('word-preview').textContent === 'ORANGE');
      await page.evaluate(() => { window.released = new Promise(resolve => document.getElementById('board').addEventListener('pointerup', resolve, {once: true})); });
      await release(); await page.evaluate(() => released);
      await page.clock.runFor(1540);
      assert.equal(await page.locator('#score').textContent(), '270');
      assert.equal(await page.locator('#found-count').textContent(), '3');
      assert.equal(await page.locator('#discovery-word').textContent(), 'ORANGE');
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log('PASS: mouse and real touch hold / automatic chains continue / selected block identity and line survive falls / release during automatic pop / queued manual multiplier / no duplicate');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
