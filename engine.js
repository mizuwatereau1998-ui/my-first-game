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
    // 初期単語の経路を保ちつつ、各段に見つけやすい身近な単語を配置。
    [[16, 'C'], [17, 'A'], [18, 'T'], [35, 'D'], [36, 'O'], [37, 'G'],
      [0, 'B'], [7, 'O'], [14, 'O'], [21, 'K'], [48, 'S'], [47, 'U'], [46, 'N'], [34, 'S'], [40, 'U']]
      .forEach(([index, letter]) => { board[index] = letter; });
    for (const [start, word] of [[1,'APPLE'],[8,'BEE'],[11,'DOG'],[22,'FISH'],
      [28,'STAR'],[32,'BUS'],[38,'BLUE'],[42,'MILK'],[49,'CAT'],[52,'BOOK']]) {
      [...word].forEach((letter, offset) => { board[start + offset] = letter; });
    }
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
    // 最初の2マスで方向を決定。以降は同じ向きに一直線だけ。
    if (path.length >= 2 && index - path.at(-1) !== path[1] - path[0]) return path;
    return [...path, index];
  }
  function collapse(board, removed, random = Math.random) {
    const next = [...board], distances = Array(COLS * ROWS).fill(0), deleted = new Set(removed), fresh = [];
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
        fresh.push(row * COLS + col);
        distances[row * COLS + col] = missing;
      }
    }
    return { board: next, distances, fresh };
  }
  function isWord(word, dictionary) {
    const normalized = word.toUpperCase();
    return normalized.length >= 3 && normalized.length <= 6 && dictionary.has(normalized);
  }
  // 判定ルールと同じ、8方向の一直線だけを探索します。
  function findWord(board, dictionary) {
    for (const length of [3,4,5,6]) {
      for (const path of straightPaths(length)) {
        if (dictionary.has(path.map(index => board[index]).join(''))) return path;
      }
    }
    return null;
  }
  // 再抽選ループを使わず、解がなければ下端に CAT を置く安全策。
  function ensurePlayable(board, dictionary) {
    if (findWord(board, dictionary)) return false;
    board.splice(49, 3, 'C', 'A', 'T');
    return true;
  }
  const MAX_CASCADES = 3;
  function straightPaths(length) {
    const paths = [];
    for (let start = 0; start < COLS * ROWS; start++) {
      for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]]) {
        const row = Math.floor(start / COLS), col = start % COLS;
        const endRow = row + dr * (length - 1), endCol = col + dc * (length - 1);
        if (endRow < 0 || endRow >= ROWS || endCol < 0 || endCol >= COLS) continue;
        paths.push(Array.from({length}, (_, n) => (row + dr * n) * COLS + col + dc * n));
      }
    }
    return paths;
  }
  const shortPaths = [...straightPaths(3), ...straightPaths(4)];
  function straightWords(board, easyWords) {
    const matches = [];
    for (const path of shortPaths) {
      const word = path.map(index => board[index]).join('');
      if (easyWords.has(word)) matches.push({word, path});
    }
    return matches;
  }
  const matchKey = match => `${match.word}:${match.path.join(',')}`;
  function findCascade(before, result, easyWords) {
    const previous = new Set(straightWords(before, easyWords).map(matchKey));
    const fresh = new Set(result.fresh);
    const candidates = straightWords(result.board, easyWords).filter(match => {
      if (previous.has(matchKey(match))) return false;
      const shifts = match.path.map(index => result.distances[index]);
      // 偶然の補充でそろった単語も連鎖可。既存単語全体の平行移動だけは除外。
      return shifts.some(distance => distance > 0) &&
        (match.path.some(index => fresh.has(index)) || new Set(shifts).size > 1);
    });
    // 複数同時にできたら、盤面中央に近い経路を優先する。
    const centrality = match => match.path.reduce((sum, index) =>
      sum + Math.abs(Math.floor(index / COLS) - (ROWS - 1) / 2) +
      Math.abs(index % COLS - (COLS - 1) / 2), 0) / match.path.length;
    return candidates.sort((a,b) => centrality(a) - centrality(b))[0] || null;
  }

  globalThis.WordPopEngine = { COLS, ROWS, randomLetter, createBoard, adjacent, extendPath, collapse, isWord, findWord, ensurePlayable, straightWords, findCascade, MAX_CASCADES };
})();
