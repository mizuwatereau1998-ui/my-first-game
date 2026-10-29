// 単語/入力/演出の分離テスト専用。製品UIには連鎖OFFを設けない。
module.exports = async function setTestCascades(page, enabled = false) {
  await page.evaluate(enabled => {
    const engine = WordPopEngine;
    if (!enabled) {
      if (!engine.__testCascade) engine.__testCascade = engine.findCascade;
      engine.findCascade = () => null;
    } else if (engine.__testCascade) {
      engine.findCascade = engine.__testCascade; delete engine.__testCascade;
    }
    window.dispatchEvent(new Event('focus'));
  }, enabled);
};
