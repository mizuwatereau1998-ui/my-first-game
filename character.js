// ポップンの表示だけを管理。画像の読込や演出がゲーム進行を待たせることはありません。
(() => {
  const host = document.querySelector('.character-space');
  const slot = document.getElementById('pop-image');
  if (!host || !slot) return;
  const files = { idle:'pop_idle.png', correct:'pop_correct.png', chain2:'pop_chain2.png', chain3:'pop_chain3.png' };
  const loaded = new Map();
  let state = 'idle', returnTimer = null;
  function display() {
    // 一部の表情が欠けている場合は通常画像、それもなければCSSの仮表示。
    const image = loaded.get(state) || loaded.get('idle');
    host.classList.toggle('has-pop-image', !!image);
    if (image) slot.replaceChildren(image);
    else slot.replaceChildren();
  }
  function setState(next, bounce = false) {
    state = next;
    host.dataset.popState = next;
    host.classList.remove('pop-react');
    display();
    if (bounce) {
      void host.offsetWidth;
      host.classList.add('pop-react');
    }
  }
  for (const [name, filename] of Object.entries(files)) {
    const image = new Image();
    image.alt = ''; image.draggable = false;
    image.onload = () => { loaded.set(name, image); display(); };
    image.onerror = () => { loaded.delete(name); display(); };
    image.src = `assets/characters/${filename}`;
  }
  globalThis.WordPopCharacter = {
    react(chain) {
      clearTimeout(returnTimer);
      setState(chain >= 3 ? 'chain3' : chain === 2 ? 'chain2' : 'correct', true);
    },
    finish() {
      // 連鎖ループの終了後だけ通常へ戻す。次の正解が来たらこのタイマーを取り消す。
      clearTimeout(returnTimer);
      returnTimer = setTimeout(() => setState('idle'), 650);
    },
    reset() { clearTimeout(returnTimer); setState('idle'); }
  };
})();
