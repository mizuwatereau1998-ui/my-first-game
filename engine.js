// DOM に依存しない盤面ルール。ブラウザと Node の検証で同じ処理を使います。
(() => {
  const COLS = 7, ROWS = 8;
  const vowels = 'AAAAEEEEIIIOOOU';
  const consonants = 'BBCCDDDFFGGHHJKLLLMMMNNNNPPQRRRRSSSSTTTTTVWXYZ';
  function randomLetter(random = Math.random) {
    const pool = random() < 0.4 ? vowels : consonants;
    return pool[Math.floor(random() * pool.length)];
  }
  function createBoard(random = Math.random) {
    const board = Array.from({ length: COLS * ROWS }, () => randomLetter(random));
    // 初期配置だけに単語を埋め込みます。補充時は重み付き抽選のみです。
    [[16, 'C'], [17, 'A'], [18, 'T'], [35, 'D'], [36, 'O'], [37, 'G'],
      [0, 'B'], [7, 'O'], [14, 'O'], [21, 'K'], [48, 'S'], [47, 'U'], [46, 'N'], [34, 'S'], [40, 'U']]
      .forEach(([index, letter]) => { board[index] = letter; });
    return board;
  }
  function adjacent(a, b) {
    return a !== b && Math.abs(a % COLS - b % COLS) <= 1 &&
      Math.abs(Math.floor(a / COLS) - Math.floor(b / COLS)) <= 1;
  }
  function extendPath(path, index) {
    if (!Number.isInteger(index) || index < 0 || index >= COLS * ROWS) return path;
    if (path.length >= 2 && path[path.length - 2] === index) return path.slice(0, -1);
    if (path.length >= 6 || path.includes(index) || (path.length && !adjacent(path.at(-1), index))) return path;
    return [...path, index];
  }
  function collapse(board, removed, random = Math.random) {
    const next = [...board], distances = Array(COLS * ROWS).fill(0), deleted = new Set(removed);
    for (let col = 0; col < COLS; col++) {
      let targetRow = ROWS - 1;
      for (let row = ROWS - 1; row >= 0; row--) {
        const source = row * COLS + col;
        if (!deleted.has(source)) {
          const target = targetRow * COLS + col;
          next[target] = board[source];
          distances[target] = targetRow - row;
          targetRow--;
        }
      }
      const missing = targetRow + 1;
      for (let row = targetRow; row >= 0; row--) {
        next[row * COLS + col] = randomLetter(random);
        distances[row * COLS + col] = missing;
      }
    }
    return { board: next, distances };
  }
  function isWord(word, dictionary) {
    const normalized = word.toUpperCase();
    return normalized.length >= 3 && normalized.length <= 6 && dictionary.has(normalized);
  }
  function findWord(board, dictionary) {
    const prefixes = new Set();
    for (const word of dictionary) {
      for (let n = 1; n <= word.length; n++) prefixes.add(word.slice(0, n));
    }
    function visit(path, text) {
      if (isWord(text, dictionary)) return path;
      if (text.length >= 6) return null;
      for (let next = 0; next < board.length; next++) {
        if (path.includes(next) || !adjacent(path.at(-1), next)) continue;
        const extended = text + board[next];
        if (!prefixes.has(extended)) continue;
        const result = visit([...path, next], extended);
        if (result) return result;
      }
      return null;
    }
    for (let index = 0; index < board.length; index++) {
      if (!prefixes.has(board[index])) continue;
      const result = visit([index], board[index]);
      if (result) return result;
    }
    return null;
  }
  // 再抽選ループを使わず、解がなければ下端に CAT を置く安全策。
  function ensurePlayable(board, dictionary) {
    if (findWord(board, dictionary)) return false;
    board.splice(49, 3, 'C', 'A', 'T');
    return true;
  }
  globalThis.WordPopEngine = { COLS, ROWS, randomLetter, createBoard, adjacent, extendPath, collapse, isWord, findWord, ensurePlayable };
})();
