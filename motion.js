// 見た目専用。ゲームの乱数・盤面・得点には触れない。
(() => {
  const board = document.getElementById('board');
  const tiles = document.getElementById('tiles');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let layer = null, cleanupTimer = null;
  function clear() {
    clearTimeout(cleanupTimer);
    cleanupTimer = null;
    layer?.remove();
    layer = null;
  }
  function burst(indices, chain) {
    clear();
    if (reducedMotion.matches) return;
    layer = document.createElement('div');
    layer.className = 'tile-effects';
    layer.dataset.chain = chain;
    layer.setAttribute('aria-hidden', 'true');
    // 独立したレイヤーに置き、落下によるタイル再描画でも光を残す。
    board.append(layer);
    const bounds = tiles.getBoundingClientRect();
    const frame = board.getBoundingClientRect();
    layer.style.left = `${bounds.left - frame.left - board.clientLeft}px`;
    layer.style.top = `${bounds.top - frame.top - board.clientTop}px`;
    layer.style.width = `${bounds.width}px`;
    layer.style.height = `${bounds.height}px`;
    const fragment = document.createDocumentFragment();
    const counts = [0, 3, 5, 7, 9];
    indices.forEach((index, order) => {
      const tile = tiles.children[index];
      for (let n = 0; n < counts[chain]; n++) {
        const spark = document.createElement('i');
        spark.className = `pop-spark${n % 2 ? ' pop-dot' : ''}`;
        const angle = (n / counts[chain] * 2 + order * .37) * Math.PI;
        const radius = tile.offsetWidth * (.5 + (n % 3) * .15);
        spark.style.left = `${tile.offsetLeft + tile.offsetWidth / 2}px`;
        spark.style.top = `${tile.offsetTop + tile.offsetHeight / 2}px`;
        spark.style.setProperty('--spark-x', `${Math.cos(angle) * radius}px`);
        spark.style.setProperty('--spark-y', `${Math.sin(angle) * radius - 10}px`);
        spark.style.setProperty('--spark-turn', `${n % 2 ? -100 : 100}deg`);
        spark.style.setProperty('--spark-delay', `${100 + order * 12}ms`);
        fragment.append(spark);
      }
    });
    if (chain >= 3) {
      const halo = document.createElement('i');
      halo.className = 'chain-halo';
      fragment.append(halo);
    }
    if (chain === 4) {
      for (let n = 0; n < 12; n++) {
        const star = document.createElement('i');
        star.className = 'celebration-star';
        star.style.left = `${n % 2 ? 95 : 5}%`;
        star.style.top = `${10 + Math.floor(n / 2) * 15}%`;
        star.style.setProperty('--spark-delay', `${100 + n * 18}ms`);
        fragment.append(star);
      }
    }
    layer.append(fragment);
    // 上限67要素。連続正解・リトライでも前の粒子とタイマーを残さない。
    cleanupTimer = setTimeout(clear, 1000);
  }
  globalThis.WordPopMotion = { burst, clear };
})();
