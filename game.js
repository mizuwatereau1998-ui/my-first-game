(() => {
  'use strict';
  const E = globalThis.WordPopEngine, dictionary = globalThis.WordPopWords;
  const $ = id => document.getElementById(id);
  $('vocabulary-count').textContent = dictionary.size.toLocaleString('ja-JP');
  const easyWords = globalThis.WordPopEasyWords;
  const longWords = globalThis.WordPopLongWords;
  const boardElement = $('board'), tiles = $('tiles');
  const tutorialPath = [16, 17, 18];
  const storageKey = 'word-pop-tutorial-complete-v1';
  let board, path = [], score = 0, found = [], busy = false, pointerId = null, lastPoint = null;
  let tutorialComplete = false;
  try { tutorialComplete = localStorage.getItem(storageKey) === 'true'; } catch { /* 保存不可でも遊べます。 */ }
  const ROUND_SECONDS = 30; // 1プレイの制限時間。ここだけ変えれば表示も追従する。
  let selectedSeconds = ROUND_SECONDS, cascadePaused = false;
  let phase = 'intro', remainingMs = ROUND_SECONDS * 1000, deadline = null;
  let clockTimer = null, resultTimer = null, roundId = 0, maxChain = 0;
  const pendingDelays = new Map();
  let chainSession = null;
  let pathAnimation = null, selectionStep = null;
  function updateClock() {
    const seconds = Math.ceil(remainingMs / 1000);
    $('time-left').parentElement.classList.toggle('time-paused', cascadePaused && phase === 'playing');
    $('chain-clock-note').hidden = !cascadePaused || phase !== 'playing';
    $('shuffle-button').disabled = phase !== 'playing' || busy || !!chainSession || score < 100 || document.hidden || $('help-dialog').open || $('audio-dialog').open;
    $('time-left').textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    $('time-left').parentElement.classList.toggle('time-warning', seconds > 0 && seconds <= 10);
  }
  function pauseClock() {
    if (deadline !== null) remainingMs = Math.max(0, deadline - performance.now());
    deadline = null;
    clearTimeout(clockTimer); clockTimer = null;
    updateClock();
    if (phase === 'playing' && remainingMs === 0) finishRound();
  }
  function resumeClock() {
    if (phase !== 'playing' || cascadePaused || document.hidden || $('help-dialog').open || $('audio-dialog').open || deadline !== null) return;
    deadline = performance.now() + remainingMs;
    function tick() {
      remainingMs = Math.max(0, deadline - performance.now());
      updateClock();
      if (remainingMs === 0) finishRound();
      else clockTimer = setTimeout(tick, Math.min(100, remainingMs));
    }
    tick();
  }
  function invalidateRound() {
    roundId++;
    for (const [timer, resolve] of pendingDelays) { clearTimeout(timer); resolve(false); }
    pendingDelays.clear();
    chainSession = null;
    cancelAnimationFrame(pathAnimation); pathAnimation = null;
  }
  function roundActive(id) {
    if (phase === 'playing' && deadline !== null && performance.now() >= deadline) finishRound();
    return id === roundId && phase === 'playing';
  }
  function canInteract() { return roundActive(roundId) && !$('help-dialog').open && !$('audio-dialog').open && !document.hidden; }
  function finishRound() {
    if (phase !== 'playing') return;
    phase = 'timeup'; cascadePaused = false;
    pauseClock(); remainingMs = 0; updateClock(); invalidateRound();
    clearIdleHint(); hideDiscovery(); globalThis.WordPopMotion?.clear();
    releasePointer(); path = []; busy = false;
    render();
    $('chain-banner').hidden = true;
    boardElement.setAttribute('aria-busy', 'false');
    boardElement.setAttribute('aria-disabled', 'true');
    for (const id of ['restart-button','shuffle-button','help-button']) $(id).disabled = true;
    globalThis.WordPopCharacter?.reset();
    $('result-score').textContent = score;
    $('result-count').textContent = found.length;
    $('result-chain').textContent = maxChain;
    $('result-words').replaceChildren();
    const counts = new Map();
    for (const word of found) counts.set(word, (counts.get(word) || 0) + 1);
    for (const word of [...new Set([...found].reverse())]) {
      const item = document.createElement('li');
      for (const [name,text] of [['result-word',word],['result-meaning',globalThis.WordPopDictionary[word] || '意味は準備中'],['result-times',`${counts.get(word)}回`]]) {
        const span = document.createElement('span'); span.className = name; span.textContent = text;
        if (name === 'result-word') span.lang = 'en';
        item.append(span);
      }
      $('result-words').append(item);
    }
    if (!found.length) {
      const empty = document.createElement('li'); empty.textContent = '次はどんな単語が見つかるかな？'; $('result-words').append(empty);
    }
    if ($('help-dialog').open) $('help-dialog').close();
    $('timeup-toast').hidden = false;
    resultTimer = setTimeout(() => {
      resultTimer = null; $('timeup-toast').hidden = true; phase = 'result';
      $('result-dialog').showModal();
    }, 600);
  }
  const IDLE_HINT_MS = 15000;
  let hintTimer = null;
  let lastLongHintLength = 6;
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
    if (phase !== 'playing' || busy || path.length || pointerId !== null || document.hidden || $('help-dialog').open || $('audio-dialog').open) return;
    hintTimer = setTimeout(() => {
      hintTimer = null;
      if (phase !== 'playing' || busy || path.length || pointerId !== null || document.hidden || $('help-dialog').open || $('audio-dialog').open) return;
      const longMatches = E.straightWords(board, longWords);
      const longMatch = longMatches.find(match => match.word.length !== lastLongHintLength) || longMatches[0];
      const answer = !tutorialComplete ? tutorialPath :
        (longMatch?.path || E.findWord(board, easyWords) || E.findWord(board, dictionary));
      if (tutorialComplete && longMatch) lastLongHintLength = longMatch.word.length;
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
  let inspectedWord = null;
  function showMeaning(word) {
    inspectedWord = word;
    for (const card of $('found-words').querySelectorAll('[data-word]')) {
      card.setAttribute('aria-pressed', String(card.dataset.word === word));
    }
  }
  function renderRecentWords() {
    const counts = new Map();
    for (const word of found) counts.set(word, (counts.get(word) || 0) + 1);
    const recent = [...new Set([...found].reverse())];
    $('found-words').replaceChildren();
    for (const word of recent) {
      const card = document.createElement('button');
      card.type = 'button'; card.className = 'word-chip'; card.dataset.word = word;
      card.setAttribute('aria-label', `${word}、${globalThis.WordPopDictionary[word] || '意味は準備中'}、発見${counts.get(word)}回`);
      for (const [className, text] of [['chip-word',word],['chip-meaning',globalThis.WordPopDictionary[word] || '意味は準備中'],['chip-count',`${counts.get(word)}回`]]) {
        const span = document.createElement('span');span.className = className;span.textContent = text;
        if (className === 'chip-word') span.lang = 'en';
        card.append(span);
      }
      $('found-words').append(card);
    }
    showMeaning(inspectedWord);
  }
  const REWARD_MS = 1000;
  let discoveryTimer = null;
  function hideDiscovery() {
    clearTimeout(discoveryTimer);
    discoveryTimer = null;
    $('discovery-pop').hidden = true;
    $('discovery-pop').classList.remove('show');
  }
  function showDiscovery(word, chain, earned) {
    hideDiscovery();
    $('discovery-word').textContent = word;
    $('discovery-meaning').textContent = globalThis.WordPopDictionary[word] || '意味は準備中';
    $('discovery-label').textContent = chain > 1 ? `${chain} CHAIN!` : 'NICE FIND!';
    $('discovery-score').textContent = `+${earned} pt`;
    $('discovery-pop').classList.toggle('is-chain', chain > 1);
    $('discovery-pop').dataset.chain = chain;
    $('discovery-pop').hidden = false;
    // 連鎖で同じ単語が続いたときも、出現アニメーションを最初から再生。
    void $('discovery-pop').offsetWidth;
    $('discovery-pop').classList.add('show');
    discoveryTimer = setTimeout(hideDiscovery, REWARD_MS);
  }
  const delay = (ms, id) => new Promise(resolve => {
    const timer = setTimeout(() => { pendingDelays.delete(timer); resolve(roundActive(id)); }, ms);
    pendingDelays.set(timer, resolve);
  });
  function waitForChainInput(session, id, automatic) {
    return new Promise(resolve => {
      session.expired = false;
      const timer = setTimeout(() => {
        session.expired = true;
        session.resume();
      }, REWARD_MS);
      session.resume = () => {
        // 選択を保ったまま、重ならない自動候補の処理を続ける。
        if (session.expired && (automatic() || (pointerId === null && !path.length))) session.finish(roundActive(id));
      };
      session.finish = active => {
        clearTimeout(timer);
        pendingDelays.delete(timer);
        session.resume = null;
        resolve(active);
      };
      pendingDelays.set(timer, session.finish);
    });
  }
  function setBusy(value) {
    busy = value;
    $('restart-button').disabled = value;
    boardElement.setAttribute('aria-busy', String(value));
  }
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
  function followFallingPath() {
    cancelAnimationFrame(pathAnimation);
    drawPath();
    pathAnimation = path.length && tiles.querySelector('.falling')
      ? requestAnimationFrame(followFallingPath) : null;
  }
  function canSelect() {
    return canInteract() && !chainSession?.manual && (!busy || (!!chainSession && !chainSession.processingManual));
  }
  function updateSelection() {
    [...tiles.children].forEach((tile, index) => {
      tile.classList.toggle('selected', path.includes(index));
      tile.setAttribute('aria-pressed', String(path.includes(index)));
    });
    const word = path.map(index => board[index]).join('');
    $('word-preview').textContent = word || '';
    $('word-preview').classList.toggle('active', !!word);
    drawPath();
  }
  function render(distances = []) {
    // 選択時の拡大に影響されない実寸。端末ごとの小数ピクセルも保つ。
    const rowPitch = tiles.firstElementChild
      ? parseFloat(getComputedStyle(tiles.firstElementChild).height) + parseFloat(getComputedStyle(tiles).rowGap) : 0;
    const colors = [...tiles.children].map(tile => tile.dataset.color);
    tiles.replaceChildren();
    board.forEach((letter, index) => {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = `tile${'AEIOU'.includes(letter) ? ' vowel' : ''}`;
      tile.textContent = letter;
      tile.dataset.index = index;
      // 新しい文字は文字と位置で色分け。落下中は元の色を保ち、ゲーム用の乱数は使わない。
      const source = index - (distances[index] || 0) * E.COLS;
      tile.dataset.color = distances.length && source >= 0 ? colors[source]
        : (letter.charCodeAt(0) + index * 3) % 7;
      tile.setAttribute('aria-label', `${Math.floor(index / E.COLS) + 1}行${index % E.COLS + 1}列 ${letter}`);
      tile.tabIndex = index === 0 ? 0 : -1;
      if (!tutorialComplete && tutorialPath.includes(index)) {
        tile.classList.add('hint');
        tile.dataset.step = tutorialPath.indexOf(index) + 1;
      }
      if (distances[index]) {
        tile.classList.add('falling');
        tile.style.setProperty('--fall-y', `${-distances[index] * rowPitch}px`);
      }
      tiles.append(tile);
    });
    updateSelection();
    if (distances.length && path.length) followFallingPath();
  }
  function select(index) {
    if (!canSelect() || chainSession?.clearing?.includes(index)) return;
    clearIdleHint();
    hideDiscovery();
    // 落下で選択済みの位置関係が変わっても、最初に決めた方向を保つ。
    const nextPath = path.length >= 2 && selectionStep !== null
      ? index === path.at(-2) ? path.slice(0, -1)
        : path.length < 6 && !path.includes(index) && E.adjacent(path.at(-1), index) && index - path.at(-1) === selectionStep ? [...path, index] : path
      : E.extendPath(path, index);
    if (nextPath.length < 2) selectionStep = null;
    else if (path.length < 2) selectionStep = nextPath[1] - nextPath[0];
    if (nextPath !== path) globalThis.WordPopAudio?.sfx('select');
    path = nextPath;
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
    if ((busy && !chainSession) || chainSession?.manual || pointerId !== null || !path.length || !canInteract()) return;
    clearIdleHint();
    const selected = [...path], word = selected.map(index => board[index]).join('');
    if (!E.isWord(word, dictionary)) {
      message(word.length < 3 ? '3〜6文字の単語をつくってみよう。' : `${word} は単語帳に未登録。別のことばを探そう！`, true);
      path = [];
      updateSelection();
      scheduleIdleHint();
      chainSession?.resume?.();
      return;
    }
    const activeRound = roundId;
    if (chainSession) {
      // 盤面を変更する処理は既存のループだけが行い、二重加算を防ぐ。
      chainSession.manual = {word, path: selected, manual: true};
      const accepting = !busy;
      setBusy(true);
      if (accepting) chainSession.finish(true);
      return;
    }
    const session = chainSession = {manual: null, finish: null};
    setBusy(true);
    if (!tutorialComplete) {
      tutorialComplete = true;
      try { localStorage.setItem(storageKey, 'true'); } catch { /* 保存不可なら次回も案内します。 */ }
    }
    $('tutorial').hidden = true;
    $('chain-banner').hidden = true;
    $('hint-line').setAttribute('points', '');
    $('selected-line').setAttribute('points', '');
    $('shuffle-button').disabled = true;
    let match = {word, path: selected, manual: true}, chain = 1;
    try {
      while (match) {
        if (match.manual) { path = []; selectionStep = null; updateSelection(); }
        session.processingManual = !!match.manual;
        session.clearing = match.path;
        const earned = match.word.length * 10 * chain;
        showMeaning(match.word);
        if (chain > 1) {
          $('chain-banner').dataset.chain = chain;
          $('chain-banner').hidden = false;
          // 同じ表示要素でも連鎖ごとに弾み直す。
          $('chain-banner').classList.remove('chain-bounce');
          void $('chain-banner').offsetWidth;
          $('chain-banner').classList.add('chain-bounce');
          $('chain-banner').textContent = `${chain} CHAIN!`;
          match.path.forEach(index => tiles.children[index].classList.add('chain-ready'));
          message(match.manual ? `${match.word} を発見！ ${chain}連鎖！ +${earned} pt` : `落下で ${match.word} がそろった！ ${chain}連鎖！`);
          if (!match.manual && !await delay(300, activeRound)) return;
        } else {
          message(`${match.word}！ +${earned} pt`);
        }
        globalThis.WordPopCharacter?.react(chain);
        globalThis.WordPopAudio?.sfx(chain >= 3 ? 'chain3' : chain === 2 ? 'chain2' : 'correct');
        globalThis.WordPopMotion?.burst(match.path, chain);
        match.path.forEach((index, order) => {
          const tile = tiles.children[index];
          tile.style.setProperty('--pop-delay', `${order * 12}ms`);
          tile.classList.add('popping');
        });
        if (!await delay(240, activeRound)) return;
        const before = [...board];
        const result = E.refillLongWords(E.collapse(board, match.path), longWords);
        // 文字ではなく元のブロックを追跡。同じ文字の別ブロックに選択を移さない。
        const destinations = new Map();
        const fresh = new Set(result.fresh);
        result.board.forEach((_, index) => {
          if (!fresh.has(index)) destinations.set(index - result.distances[index] * E.COLS, index);
        });
        path = path.map(index => destinations.get(index));
        if (session.manual) session.manual.path = session.manual.path.map(index => destinations.get(index));
        board = result.board;
        session.clearing = [];
        render(result.distances);
        if (!await delay(380, activeRound)) return;
        [...tiles.children].forEach(tile => tile.classList.remove('falling'));
        drawPath();
        if (!roundActive(activeRound)) return;
        globalThis.WordPopAudio?.sfx('fall');
        maxChain = Math.max(maxChain, chain);
        score += earned;
        found.push(match.word);
        $('score').textContent = score;
        $('found-count').textContent = found.length;
        renderRecentWords();
        showDiscovery(match.word, chain, earned);
        let candidateKey = null, candidate = null;
        const automatic = () => {
          const key = path.join(',');
          if (candidateKey !== key) {
            candidateKey = key;
            candidate = E.findCascade(before, result, easyWords, path);
          }
          return candidate;
        };
        cascadePaused = true;
        pauseClock();
        if (!roundActive(activeRound)) return;
        if (!session.manual) {
          const input = waitForChainInput(session, activeRound, automatic);
          setBusy(false);
          message(`${chain}連鎖！ 選択を続けながら、次の単語も連鎖につなげよう！`);
          if (!(await input) || !roundActive(activeRound)) return;
        }
        match = session.manual || automatic();
        session.manual = null;
        if (match) {
          setBusy(true);
          hideDiscovery();
          chain++;
        }
      }
      // 3,000語のどれかではなく、身近な短い語を最低1つ残します。
      const rescued = E.ensurePlayable(board, easyWords);
      if (rescued) render();
      const count = new Set(E.straightWords(board, longWords).map(m => m.word)).size;
      $('available-count').textContent = `5〜6文字の単語 ${count} 個`;
      message(chain > 1 ? `${chain}連鎖！ 次の単語も一直線に探してみよう。` : 'いいね！ 次の単語もまっすぐ探してみよう。');
    } finally {
      if (activeRound !== roundId) return;
      chainSession = null;
      $('chain-banner').hidden = true;
      globalThis.WordPopCharacter?.finish();
      setBusy(false);
      cascadePaused = false;
      updateClock();
      resumeClock();
      [...tiles.children].forEach(tile => tile.classList.remove('falling', 'chain-ready'));
      scheduleIdleHint();
    }
  }

  function start(intro = false) {
    phase = 'reset'; cascadePaused = false; pauseClock(); invalidateRound();
    clearTimeout(resultTimer); resultTimer = null;
    if ($('result-dialog').open) $('result-dialog').close();
    $('timeup-toast').hidden = true;
    phase = intro ? 'intro' : 'playing';
    remainingMs = selectedSeconds * 1000; maxChain = 0; busy = false; updateClock();
    boardElement.setAttribute('aria-disabled', 'false');
    boardElement.setAttribute('aria-busy', 'false');
    for (const id of ['restart-button','shuffle-button','help-button']) $(id).disabled = false;
    clearIdleHint();
    hideDiscovery();
    globalThis.WordPopMotion?.clear();
    releasePointer();
    globalThis.WordPopCharacter?.reset();
    board = E.createBoard();
    lastLongHintLength = 6;
    path = []; score = 0; found = [];
    $('score').textContent = '0';
    $('found-count').textContent = '0';
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'まだ見つかっていない、小さなことばが待っているよ。';
    $('found-words').replaceChildren(empty);
    for (let rank = 0; rank < 3; rank++) {
      const slot = document.createElement('div');
      slot.className = 'empty-slot';
      slot.setAttribute('aria-hidden', 'true');
      slot.textContent = '—';
      $('found-words').append(slot);
    }
    inspectedWord = null;
    $('tutorial').hidden = tutorialComplete;
    message(tutorialComplete ? '3〜6文字の英単語を探してみよう！' : 'まずは C → A → T をなぞってみよう！');
    $('chain-banner').hidden = true;
    $('available-count').textContent = `5〜6文字の単語 ${new Set(E.straightWords(board, longWords).map(m => m.word)).size} 個`;
    render();
    scheduleIdleHint();
    updateClock(); resumeClock();
  }
  boardElement.addEventListener('pointerdown', event => {
    const index = indexAt(event.clientX, event.clientY);
    if (!canSelect() || pointerId !== null || !event.isPrimary || event.button !== 0 || index === null || chainSession?.clearing?.includes(index)) return;
    event.preventDefault();
    clearIdleHint();
    path = []; selectionStep = null;
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
    // 落下だけで指の下の文字が変わった場合、それを追加選択しない。
    if (!lastPoint || event.clientX !== lastPoint.x || event.clientY !== lastPoint.y) moveAlong(event.clientX, event.clientY);
    releasePointer();
    submit();
    chainSession?.resume?.();
  });
  function cancel() {
    if (busy && (!chainSession || chainSession.manual)) return;
    releasePointer(); path = []; updateSelection(); scheduleIdleHint();
    chainSession?.resume?.();
  }
  boardElement.addEventListener('pointercancel', cancel);
  boardElement.addEventListener('lostpointercapture', () => { if (pointerId !== null) cancel(); });
  window.addEventListener('blur', () => { cancel(); clearIdleHint(); });
  boardElement.addEventListener('keydown', event => {
    const tile = event.target.closest('.tile');
    if (!tile || !canSelect()) return;
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
  $('restart-button').addEventListener('click', () => {
    if (busy || !canInteract()) return;
    pauseClock();
    if (confirm('得点・盤面・記録・残り時間をリセットして、もう一度あそびますか？')) start();
    else resumeClock();
  });
  let helpPage = 0;
  const helpPages = [...$('help-dialog').querySelectorAll('.help-page')];
  function renderHelpPage() {
    helpPages.forEach((page, i) => { page.hidden = i !== helpPage; });
    $('help-progress').textContent = `${helpPage + 1} / ${helpPages.length}`;
    $('help-back').disabled = helpPage === 0;
    $('help-next').hidden = helpPage === helpPages.length - 1;
    $('help-play').hidden = helpPage !== helpPages.length - 1;
    $('help-dialog').querySelector('.help-pages').scrollTop = 0;
  }
  function openHelp() {
    if (!['intro','playing'].includes(phase)) return;
    pauseClock();
    if (!['intro','playing'].includes(phase)) return;
    cancel(); clearIdleHint(); helpPage = 0; renderHelpPage();
    for (const details of $('help-dialog').querySelectorAll('details')) details.open = false;
    $('help-dialog').showModal(); updateClock();
  }
  $('help-button').addEventListener('click', openHelp);
  $('help-next').addEventListener('click', () => { helpPage = Math.min(helpPages.length - 1, helpPage + 1); renderHelpPage(); });
  $('help-back').addEventListener('click', () => { helpPage = Math.max(0, helpPage - 1); renderHelpPage(); });
  for (const id of ['close-help','help-play']) $(id).addEventListener('click', () => $('help-dialog').close());
  $('help-dialog').addEventListener('close', () => {
    if (phase === 'intro') phase = 'playing';
    resumeClock(); updateClock(); scheduleIdleHint();
  });
  function openAudioSettings() {
    if (!['intro','playing','result'].includes(phase)) return;
    pauseClock(); cancel(); clearIdleHint();
    $('audio-dialog').showModal(); updateClock();
  }
  $('audio-button').addEventListener('click', openAudioSettings);
  for (const button of document.querySelectorAll('[data-open-audio]')) button.addEventListener('click', openAudioSettings);
  $('close-audio').addEventListener('click', () => $('audio-dialog').close());
  $('audio-dialog').addEventListener('close', () => { resumeClock(); updateClock(); scheduleIdleHint(); });
  $('retry-button').addEventListener('click', () => start());
  $('result-dialog').addEventListener('cancel', event => event.preventDefault());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseClock(); else resumeClock();
    scheduleIdleHint();
  });
  window.addEventListener('focus', scheduleIdleHint);
  $('found-words').addEventListener('click', event => {
    const chip = event.target.closest('[data-word]');
    if (!chip) return;
    showMeaning(chip.dataset.word);
    scheduleIdleHint();
  });

  new ResizeObserver(drawPath).observe(boardElement);
  function syncDuration(value) {
    selectedSeconds = [30,60,90].includes(Number(value)) ? Number(value) : ROUND_SECONDS;
    for (const select of document.querySelectorAll('.round-duration')) select.value = selectedSeconds;
    if (phase === 'intro') { remainingMs = selectedSeconds * 1000; updateClock(); }
  }
  for (const select of document.querySelectorAll('.round-duration')) select.addEventListener('change', () => syncDuration(select.value));
  $('shuffle-button').addEventListener('click', () => {
    if (busy || chainSession || !canInteract()) return;
    if (score < 100) { message('シャッフルには100点必要だよ。', true); return; }
    const shuffled = E.shuffleBoard(board, longWords, easyWords);
    if (!shuffled) { message('今はシャッフルできないよ。', true); return; }
    clearIdleHint(); hideDiscovery(); globalThis.WordPopMotion?.clear();
    releasePointer(); path = []; board = shuffled; score -= 100;
    $('score').textContent = score;
    render();
    $('available-count').textContent = `5〜6文字の単語 ${new Set(E.straightWords(board, longWords).map(m=>m.word)).size} 個`;
    message('シャッフル！ −100 pt。新しい単語を探してみよう。', true);
    updateClock(); scheduleIdleHint();
  });
  syncDuration(ROUND_SECONDS);
  start(true);
  openHelp();
})();
