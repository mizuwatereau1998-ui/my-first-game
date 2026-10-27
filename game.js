(() => {
  'use strict';
  const E = globalThis.WordPopEngine, dictionary = globalThis.WordPopWords;
  const $ = id => document.getElementById(id);
  $('vocabulary-count').textContent = dictionary.size.toLocaleString('ja-JP');
  const boardElement = $('board'), tiles = $('tiles');
  const tutorialPath = [16, 17, 18];
  const storageKey = 'word-pop-tutorial-complete-v1';
  let board, path = [], score = 0, found = [], busy = false, pointerId = null, lastPoint = null;
  let tutorialComplete = false;
  try { tutorialComplete = localStorage.getItem(storageKey) === 'true'; } catch { /* 保存不可でも遊べます。 */ }
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  function message(text, error = false) {
    $('feedback').textContent = text;
    $('feedback').classList.toggle('error', error);
  }
  function points(indices) {
    const rect = boardElement.getBoundingClientRect();
    return indices.map(index => {
      const tile = tiles.children[index].getBoundingClientRect();
      return `${tile.left + tile.width / 2 - rect.left},${tile.top + tile.height / 2 - rect.top}`;
    }).join(' ');
  }
  function drawPath() {
    $('selected-line').setAttribute('points', points(path));
    $('hint-line').setAttribute('points', !tutorialComplete && !busy && !path.length ? points(tutorialPath) : '');
  }
  function updateSelection() {
    [...tiles.children].forEach((tile, index) => {
      tile.classList.toggle('selected', path.includes(index));
      tile.setAttribute('aria-pressed', String(path.includes(index)));
    });
    const word = path.map(index => board[index]).join('');
    $('word-preview').textContent = word || '文字をつなげよう';
    $('word-preview').classList.toggle('active', !!word);
    $('word-length').textContent = `${path.length} / 6 letters`;
    drawPath();
  }
  function render(distances = []) {
    tiles.replaceChildren();
    board.forEach((letter, index) => {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = `tile${'AEIOU'.includes(letter) ? ' vowel' : ''}`;
      tile.textContent = letter;
      tile.dataset.index = index;
      tile.setAttribute('aria-label', `${Math.floor(index / E.COLS) + 1}行${index % E.COLS + 1}列 ${letter}`);
      tile.tabIndex = index === 0 ? 0 : -1;
      if (!tutorialComplete && tutorialPath.includes(index)) {
        tile.classList.add('hint');
        tile.dataset.step = tutorialPath.indexOf(index) + 1;
      }
      if (distances[index]) {
        tile.classList.add('falling');
        tile.style.setProperty('--fall-distance', distances[index]);
      }
      tiles.append(tile);
    });
    updateSelection();
  }
  function select(index) {
    if (busy) return;
    path = E.extendPath(path, index);
    updateSelection();
  }
  function indexAt(x, y) {
    const tile = document.elementFromPoint(x, y)?.closest('.tile');
    return tile && tiles.contains(tile) ? Number(tile.dataset.index) : null;
  }
  function moveAlong(x, y) {
    // 速いスワイプでも通過したマスを拾います。マス間の余白は無視します。
    const from = lastPoint || { x, y };
    const distance = Math.hypot(x - from.x, y - from.y);
    const steps = Math.max(1, Math.ceil(distance / 6));
    for (let step = 1; step <= steps; step++) {
      const fraction = step / steps;
      const index = indexAt(from.x + (x - from.x) * fraction, from.y + (y - from.y) * fraction);
      if (index !== null) select(index);
    }
    lastPoint = { x, y };
  }
  function releasePointer() {
    const previous = pointerId;
    pointerId = null;
    lastPoint = null;
    if (previous !== null && boardElement.hasPointerCapture(previous)) boardElement.releasePointerCapture(previous);
  }
  async function submit() {
    if (busy || !path.length) return;
    const selected = [...path], word = selected.map(index => board[index]).join('');
    if (!E.isWord(word, dictionary)) {
      message(word.length < 3 ? '3〜6文字の単語をつくってみよう。' : `${word} は単語帳に未登録。別のことばを探そう！`, true);
      path = [];
      updateSelection();
      return;
    }
    busy = true;
    $('restart-button').disabled = true;
    $('submit-button').disabled = true;
    boardElement.setAttribute('aria-busy', 'true');
    if (!tutorialComplete) {
      tutorialComplete = true;
      try { localStorage.setItem(storageKey, 'true'); } catch { /* 保存不可なら次回も案内します。 */ }
    }
    $('tutorial').hidden = true;
    $('hint-line').setAttribute('points', '');
    $('selected-line').setAttribute('points', '');
    selected.forEach(index => tiles.children[index].classList.add('popping'));
    message(`${word}！ +${word.length * 10} pt　いいね、その調子！`);
    await delay(240);
    const result = E.collapse(board, selected);
    board = result.board;
    const rescued = E.ensurePlayable(board, dictionary);
    if (rescued) [49, 50, 51].forEach(index => { result.distances[index] = 1; });
    path = [];
    render(result.distances);
    await delay(380);
    score += word.length * 10;
    found.push(word);
    $('score').textContent = score;
    $('found-count').textContent = found.length;
    const chip = document.createElement('span');
    chip.className = 'word-chip';
    chip.textContent = word;
    if (found.length === 1) $('found-words').replaceChildren();
    $('found-words').prepend(chip);
    // 画面上の履歴は直近30件。永続コレクションは次の開発段階で追加します。
    while ($('found-words').children.length > 30) $('found-words').lastElementChild.remove();
    if (rescued) message('次の単語も見つけられるよう、盤面に CAT を追加したよ。');
    busy = false;
    $('restart-button').disabled = false;
    $('submit-button').disabled = false;
    boardElement.setAttribute('aria-busy', 'false');
    [...tiles.children].forEach(tile => tile.classList.remove('falling'));
  }
  function start() {
    if (busy) return;
    releasePointer();
    board = E.createBoard();
    path = []; score = 0; found = [];
    $('score').textContent = '0';
    $('found-count').textContent = '0';
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'まだ見つかっていない、小さなことばが待っているよ。';
    $('found-words').replaceChildren(empty);
    $('tutorial').hidden = tutorialComplete;
    message(tutorialComplete ? '3〜6文字の英単語を探してみよう！' : 'まずは C → A → T をなぞってみよう！');
    render();
  }
  boardElement.addEventListener('pointerdown', event => {
    if (busy || pointerId !== null || !event.isPrimary || event.button !== 0 || indexAt(event.clientX, event.clientY) === null) return;
    event.preventDefault();
    path = [];
    pointerId = event.pointerId;
    boardElement.setPointerCapture(pointerId);
    moveAlong(event.clientX, event.clientY);
  });
  boardElement.addEventListener('pointermove', event => {
    if (event.pointerId !== pointerId) return;
    event.preventDefault();
    moveAlong(event.clientX, event.clientY);
  });
  boardElement.addEventListener('pointerup', event => {
    if (event.pointerId !== pointerId) return;
    moveAlong(event.clientX, event.clientY);
    releasePointer();
    submit();
  });
  function cancel() {
    if (busy) return;
    releasePointer(); path = []; updateSelection();
  }
  boardElement.addEventListener('pointercancel', cancel);
  boardElement.addEventListener('lostpointercapture', () => { if (pointerId !== null) cancel(); });
  window.addEventListener('blur', cancel);
  boardElement.addEventListener('keydown', event => {
    const tile = event.target.closest('.tile');
    if (!tile || busy) return;
    const index = Number(tile.dataset.index);
    const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
    if (offset) {
      event.preventDefault();
      const target = index + offset;
      if (target >= 0 && target < 56 && (Math.abs(offset) === 7 || Math.floor(target / 7) === Math.floor(index / 7))) {
        tile.tabIndex = -1; tiles.children[target].tabIndex = 0; tiles.children[target].focus();
      }
    } else if (event.key === ' ') { event.preventDefault(); select(index); }
    else if (event.key === 'Enter') { event.preventDefault(); submit(); }
    else if (event.key === 'Escape') { event.preventDefault(); cancel(); }
  });
  $('submit-button').addEventListener('click', submit);
  $('restart-button').addEventListener('click', () => {
    if (!busy && (!found.length || confirm('スコアと今回の履歴をリセットして、新しくはじめますか？'))) start();
  });
  $('help-button').addEventListener('click', () => { cancel(); $('help-dialog').showModal(); });
  $('close-help').addEventListener('click', () => $('help-dialog').close());
  new ResizeObserver(drawPath).observe(boardElement);
  start();
})();
