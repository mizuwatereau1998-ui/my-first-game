// ポップンの表示だけを管理。画像の読込や演出がゲーム進行を待たせることはありません。
(() => {
  const host = document.querySelector('.character-space');
  const slot = document.getElementById('pop-image');
  if (!host || !slot) return;
  const files = { idle:'pop_idle.png', correct:'pop_correct.png', chain2:'pop_chain2.png', chain3:'pop_chain3.png' };
  // HTMLの位置ではなく、このスクリプトと同じディレクトリから解決する。
  const scriptUrl = document.currentScript?.src || document.baseURI;
  const assetBase = new URL('assets/characters/', scriptUrl);
  const IMAGE_VERSION = 'popun-20261029-1';
  const loaded = new Map();
  let state = 'idle', returnTimer = null;
  function display() {
    // 一部の表情が欠けている場合は通常画像、それもなければCSSの仮表示。
    const image = loaded.get(state) || loaded.get('idle');
    host.classList.toggle('has-pop-image', !!image);
    if (image && slot.firstElementChild !== image) slot.replaceChildren(image);
    else if (!image) slot.replaceChildren();
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
  function load(name, attempt = 0) {
    const image = new Image();
    image.alt = ''; image.draggable = false; image.decoding = 'async';
    image.fetchPriority = name === 'idle' ? 'high' : 'low';
    let settled = false;
    const timeout = setTimeout(failed, 12000);
    function failed() {
      if (settled) return;
      settled = true; clearTimeout(timeout);
      image.onload = image.onerror = null;
      display();
      // 常時の再取得はせず、失敗した画像だけ最大2回までキャッシュを避けて再試行。
      if (attempt < 2) setTimeout(() => load(name, attempt + 1), 1200 * (attempt + 1));
    }
    image.onload = () => {
      if (settled) return;
      settled = true; clearTimeout(timeout);
      if (!image.naturalWidth || !image.naturalHeight) { settled = false; failed(); return; }
      loaded.set(name, image); display();
    };
    image.onerror = failed;
    const url = new URL(files[name], assetBase);
    url.searchParams.set('v', IMAGE_VERSION);
    if (attempt) url.searchParams.set('retry', `${attempt}-${Date.now().toString(36)}`);
    image.src = url.href;
  }
  for (const name of Object.keys(files)) load(name);
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
