// プレイを検証する既存テストは、自動表示の遊び方を実際の×操作で閉じる。
module.exports = async function dismissStartHelp(page, virtualClock = false) {
  // 既存の長い回帰シナリオは、選択UIで90秒を選ぶ。30秒初期値は別の仕様テストで検証。
  if (await page.locator('#round-duration').inputValue() === '30') await page.locator('#round-duration').selectOption('90', {force:true});
  await page.evaluate(() => {
    window.startHelpClosed = new Promise(resolve => document.getElementById('help-dialog').addEventListener('close', () => resolve(true), {once:true}));
  });
  await page.locator('#close-help').click();
  if (virtualClock) await page.clock.runFor(50);
  await page.evaluate(() => startHelpClosed);
};
