(() => {
  'use strict';
  const E = globalThis.WordPopEngine, dictionary = globalThis.WordPopWords;
  const $ = id => document.getElementById(id);
  $('vocabulary-count').textContent = dictionary.size.toLocaleString('ja-JP');
  const easyWords = globalThis.WordPopEasyWords;
  const boardElement = $('board'), tiles = $('tiles');
  const tutorialPath = [16, 17, 18];
  const storageKey = 'word-pop-tutorial-complete-v1';
  let board, path = [], score = 0, found = [], busy = false, pointerId = null, lastPoint = null;
  let tutorialComplete = false;
  try { tutorialComplete = localStorage.getItem(storageKey) === 'true'; } catch { /* 保存不可でも遊べます。 */ }
  const IDLE_HINT_MS = 15000;
  let hintTimer = null;
  function clearIdleHint() {
    clearTimeout(hintTimer);
    hintTimer = null;
    for (const tile of tiles.children) {
      tile.classList.remove('idle-hint');
      tile.removeAttribute('data-hint-step');
      tile.style.removeProperty('--hint-order');
    }
    $('idle-hint-note').hidden = true;
  }
  function scheduleIdleHint() {
    clearIdleHint();
    if (busy || path.length || pointerId !== null || document.hidden || $('help-dialog').open) return;
    hintTimer = setTimeout(() => {
      hintTimer = null;
      if (busy || path.length || pointerId !== null || document.hidden || $('help-dialog').open) return;
      const answer = !tutorialComplete ? tutorialPath :
        (E.findWord(board, easyWords) || E.findWord(board, dictionary));
      if (!answer) return;
      answer.forEach((index, order) => {
        const tile = tiles.children[index];
        tile.classList.add('idle-hint');
        tile.dataset.hintStep = order + 1;
        tile.style.setProperty('--hint-order', order);
      });
      $('idle-hint-note').hidden = false;
    }, IDLE_HINT_MS);
  }
  function showMeaning(word) {
    const heading = document.createElement('strong');
    heading.className = 'meaning-word';
    heading.lang = 'en';
    heading.textContent = word;
    const meaning = document.createElement('p');
    meaning.className = 'meaning-text';
    meaning.textContent = globalThis.WordPopDictionary[word] || '日本語の意味は準備中です';
    $('word-note').replaceChildren(heading, meaning);
  }
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
    clearIdleHint();
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
    clearIdleHint();
    const selected = [...path], word = selected.map(index => board[index]).join('');
    if (!E.isWord(word, dictionary)) {
      message(word.length < 3 ? '3〜6文字の単語をつくってみよう。' : `${word} は単語帳に未登録。別のことばを探そう！`, true);
      path = [];
      updateSelection();
      scheduleIdleHint();
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
    $('chain-banner').hidden = true;
    $('hint-line').setAttribute('points', '');
    $('selected-line').setAttribute('points', '');
    const chainEnabled = $('chain-toggle').checked;
    $('chain-toggle').disabled = true;
    let match = {word, path: selected}, chain = 1;
    try {
      while (match) {
        const earned = match.word.length * 10 * chain;
        showMeaning(match.word);
        if (chain > 1) {
          $('chain-banner').hidden = false;
          $('chain-banner').textContent = `${chain} CHAIN!  ${match.word}  +${earned} pt`;
          match.path.forEach(index => tiles.children[index].classList.add('chain-ready'));
          message(`落下で ${match.word} がそろった！ ${chain}連鎖！`);
          await delay(600);
        } else {
          message(`${match.word}！ +${earned} pt`);
        }
        match.path.forEach(index => tiles.children[index].classList.add('popping'));
        await delay(240);
        const before = [...board];
        const result = E.collapse(board, match.path);
        board = result.board;
        path = [];
        render(result.distances);
        await delay(380);
        score += earned;
        found.push(match.word);
        $('score').textContent = score;
        $('found-count').textContent = found.length;
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.dataset.word = match.word;
        chip.setAttribute('aria-label', `${match.word} の意味を確認`);
        chip.className = 'word-chip';
        chip.textContent = chain > 1 ? `${match.word} ×${chain}` : match.word;
        if (found.length === 1) $('found-words').replaceChildren();
        $('found-words').prepend(chip);
        while ($('found-words').children.length > 30) $('found-words').lastElementChild.remove();
        match = chainEnabled && chain <= E.MAX_CASCADES
          ? E.findCascade(before, result, easyWords) : null;
        if (match) chain++;
      }
      // 3,000語のどれかではなく、身近な短い語を最低1つ残します。
      const rescued = E.ensurePlayable(board, easyWords);
      if (rescued) render();
      const count = new Set(E.straightWords(board, easyWords).map(m => m.word)).size;
      $('available-count').textContent = `見つけやすい単語 ${count} 個`;
      message(chain > 1 ? `${chain}連鎖！ 次の単語も一直線に探してみよう。` : 'いいね！ 次の単語もまっすぐ探してみよう。');
    } finally {
      busy = false;
      $('restart-button').disabled = false;
      $('submit-button').disabled = false;
      $('chain-toggle').disabled = false;
      boardElement.setAttribute('aria-busy', 'false');
      [...tiles.children].forEach(tile => tile.classList.remove('falling', 'chain-ready'));
      scheduleIdleHint();
    }
  }

  function start() {
    if (busy) return;
    clearIdleHint();
    releasePointer();
    board = E.createBoard();
    path = []; score = 0; found = [];
    $('score').textContent = '0';
    $('found-count').textContent = '0';
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'まだ見つかっていない、小さなことばが待っているよ。';
    $('found-words').replaceChildren(empty);
    const note = document.createElement('p');
    note.className = 'meaning-empty';
    note.textContent = '見つけた単語の意味が、ここに表示されるよ。';
    $('word-note').replaceChildren(note);
    $('tutorial').hidden = tutorialComplete;
    message(tutorialComplete ? '3〜6文字の英単語を探してみよう！' : 'まずは C → A → T をなぞってみよう！');
    $('chain-banner').hidden = true;
    $('available-count').textContent = `見つけやすい単語 ${new Set(E.straightWords(board, easyWords).map(m => m.word)).size} 個`;
    render();
    scheduleIdleHint();
  }
  boardElement.addEventListener('pointerdown', event => {
    if (busy || pointerId !== null || !event.isPrimary || event.button !== 0 || indexAt(event.clientX, event.clientY) === null) return;
    event.preventDefault();
    clearIdleHint();
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
    releasePointer(); path = []; updateSelection(); scheduleIdleHint();
  }
  boardElement.addEventListener('pointercancel', cancel);
  boardElement.addEventListener('lostpointercapture', () => { if (pointerId !== null) cancel(); });
  window.addEventListener('blur', () => { cancel(); clearIdleHint(); });
  boardElement.addEventListener('keydown', event => {
    const tile = event.target.closest('.tile');
    if (!tile || busy) return;
    scheduleIdleHint();
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
  $('help-button').addEventListener('click', () => { cancel(); $('help-dialog').showModal(); clearIdleHint(); });
  $('close-help').addEventListener('click', () => { $('help-dialog').close(); scheduleIdleHint(); });
  $('help-dialog').addEventListener('close', scheduleIdleHint);
  document.addEventListener('visibilitychange', scheduleIdleHint);
  window.addEventListener('focus', scheduleIdleHint);
  $('found-words').addEventListener('click', event => {
    const chip = event.target.closest('[data-word]');
    if (!chip) return;
    showMeaning(chip.dataset.word);
    scheduleIdleHint();
  });
  $('chain-toggle').addEventListener('change', scheduleIdleHint);
  new ResizeObserver(drawPath).observe(boardElement);
  start();
})();
