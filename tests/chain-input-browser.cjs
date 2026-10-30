const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox']});
  try {
    const page = await browser.newPage({viewport: {width: 1200, height: 1000}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install();
    const engine = fs.readFileSync(path.resolve(__dirname, '../engine.js'), 'utf8');
    await page.route('**/engine.js*', route => route.fulfill({contentType: 'application/javascript', body: engine + `
      Math.random = () => .99;
      WordPopEngine.createBoard = () => {
        const b = Array(56).fill('Z');
        for (let row = 0; row < 7; row++) b.splice(row * 7, 3, ...'CAT');
        b.splice(49, 6, ...'ORANGE'); return b;
      };
      WordPopEngine.refillLongWords = result => result;
      window.autoEnabled = true;
      WordPopEngine.findCascade = (before, result) => {
        if (!autoEnabled) return null;
        for (let row = 0; row < 8; row++) {
          const p = [row * 7, row * 7 + 1, row * 7 + 2];
          if (p.map(i => result.board[i]).join('') === 'CAT') return {word: 'CAT', path: p};
        }
        return null;
      };
    `}));
    async function load(auto = true) {
      await page.goto(process.env.GAME_URL || 'http://127.0.0.1:8000');
      await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
      await page.evaluate(value => { autoEnabled = value; }, auto);
      await page.evaluate(() => {
        window.helpClosed = new Promise(resolve => document.getElementById('help-dialog').addEventListener('close', resolve, {once: true}));
        document.getElementById('help-dialog').close();
      });
      await page.clock.runFor(50);
      await page.evaluate(() => helpClosed);
    }
    async function enter(indices) {
      for (const index of indices) {
        await page.locator('.tile').nth(index).focus();
        await page.keyboard.press('Space');
      }
      await page.keyboard.press('Enter');
    }
    async function wordPath(word) {
      return page.evaluate(word => {
        const board = [...document.querySelectorAll('.tile')].map(t => t.textContent);
        return WordPopEngine.straightWords(board, new Set([word]))[0].path;
      }, word);
    }
    // 自動候補がある状態で手動の6文字を優先。二重確定・無効語・アニメ中の入力も確認。
    await load();
    await enter([0, 1, 2]);
    await page.locator('.tile').nth(49).focus(); await page.keyboard.press('Space');
    assert.equal(await page.locator('.tile.selected').count(), 0, '手動確定の消去中は再選択しない');
    await page.clock.runFor(620);
    assert.equal(await page.locator('#board').getAttribute('aria-busy'), 'false');
    const frozen = await page.locator('#time-left').textContent();
    await enter([4, 5, 6]); // ZZZ は不正解。
    assert.equal(await page.locator('#score').textContent(), '30');
    await enter(await wordPath('ORANGE'));
    await page.keyboard.press('Enter');
    await page.clock.runFor(620);
    assert.equal(await page.locator('#score').textContent(), '150');
    assert.equal(await page.locator('#found-count').textContent(), '2');
    assert.equal(await page.locator('#discovery-label').textContent(), '2 CHAIN!');
    assert.equal(await page.locator('#discovery-word').textContent(), 'ORANGE');
    await page.clock.runFor(1000 + 300 + 620);
    assert.equal(await page.locator('#score').textContent(), '240');
    assert.equal(await page.locator('#time-left').textContent(), frozen);
    await page.clock.runFor(5 * 1920);
    assert.equal(await page.locator('#found-count').textContent(), '8');
    assert.equal(await page.locator('#score').textContent(), '1140');
    assert.equal(await page.locator('#discovery-label').textContent(), '8 CHAIN!');
    assert.ok(await page.locator('.pop-spark').count() > 0, '5連鎖以上も粒子を表示');
    await page.clock.runFor(1000);
    const resumed = await page.locator('#time-left').textContent();
    await page.clock.runFor(2000);
    assert.notEqual(await page.locator('#time-left').textContent(), resumed);
    await page.clock.runFor(31000);
    await page.clock.runFor(600);
    assert.equal(await page.locator('#result-chain').textContent(), '8');
    assert.equal(await page.locator('#result-count').textContent(), '8');
    assert.equal(await page.locator('#result-score').textContent(), '1140');

    // 自動候補がなくても、手動発見で何度でも延長。スマホ幅で実スワイプ。
    await page.setViewportSize({width: 390, height: 844});
    await load(false);
    for (let chain = 1; chain <= 7; chain++) {
      const indices = await wordPath('CAT');
      const boxes = await Promise.all(indices.map(i => page.locator('.tile').nth(i).boundingBox()));
      await page.mouse.move(boxes[0].x + boxes[0].width / 2, boxes[0].y + boxes[0].height / 2);
      await page.mouse.down();
      for (const box of boxes.slice(1)) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {steps: 8});
      await page.mouse.up();
      await page.clock.runFor(620);
      assert.equal(await page.locator('#score').textContent(), String(30 * chain * (chain + 1) / 2));
      assert.equal(await page.locator('#found-count').textContent(), String(chain));
    }
    assert.match(await page.locator('[data-word="CAT"]').textContent(), /7回/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#restart-button').click();
    await page.clock.runFor(2500);
    assert.equal(await page.locator('#score').textContent(), '0');
    assert.equal(await page.locator('#found-count').textContent(), '0');
    assert.equal(await page.locator('#chain-clock-note').isVisible(), false);
    await enter(await wordPath('CAT')); await page.clock.runFor(620);
    assert.equal(await page.locator('#discovery-label').textContent(), 'NICE FIND!');
    assert.equal(await page.locator('#score').textContent(), '30');
    assert.deepEqual(errors, []);
    console.log('PASS: unlimited mixed/automatic/manual chains / multiplier and result / invalid and duplicate submissions / animation lock / mobile swipe / clock / reset');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
