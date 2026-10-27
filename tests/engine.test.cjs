const test = require('node:test');
const assert = require('node:assert/strict');
require('../vocabulary.js');
require('../words.js');
require('../engine.js');
const E = globalThis.WordPopEngine, words = globalThis.WordPopWords;

test('初期盤面は56文字、CAT・DOG・SUN・縦のBOOKを保証する', () => {
  for (let run = 0; run < 100; run++) {
    const board = E.createBoard();
    assert.equal(board.length, 56);
    assert.ok(board.every(letter => /^[A-Z]$/.test(letter)));
    for (const [path, word] of [[[16,17,18],'CAT'],[[35,36,37],'DOG'],[[48,47,46],'SUN'],[[34,40,46],'SUN'],[[0,7,14,21],'BOOK']]) {
      assert.equal(path.map(i => board[i]).join(''), word);
      assert.ok(path.slice(1).every((i,n) => E.adjacent(path[n],i)));
    }
  }
});
test('8方向の隣接、境界、重複、1文字戻し、6文字上限', () => {
  for (const next of [0,1,2,7,9,14,15,16]) assert.ok(E.adjacent(8,next));
  assert.equal(E.adjacent(6,7),false);
  assert.equal(E.adjacent(0,0),false);
  assert.deepEqual(E.extendPath([0,1,8],0),[0,1,8]);
  assert.deepEqual(E.extendPath([0,1,8],1),[0,1]);
  assert.deepEqual(E.extendPath([0],55),[0]);
  assert.deepEqual(E.extendPath([0,1,2,3,4,5],6),[0,1,2,3,4,5]);
  assert.deepEqual(E.extendPath([], -1),[]);
});
test('登録済み3〜6文字だけ正解。大小文字は区別しない', () => {
  assert.ok(E.isWord('cat',words));
  assert.ok(E.isWord('BANANA',words));
  for (const word of ['CA','ZZZ','ORANGES']) assert.equal(E.isWord(word,words),false);
  assert.ok([...words].every(word => word.length >= 3 && word.length <= 6));
});
test('複数列・複数行を消した際、残る文字の順番と落下距離が正しい', () => {
  const board = Array.from({length:56},(_,i)=>String(i));
  const removed = [14,35,36,50,55];
  const {board: next,distances} = E.collapse(board,removed,()=>0);
  assert.equal(next.length,56);
  for(let col=0;col<7;col++) {
    const originalColumn = board.filter((_,i)=>i%7===col && !removed.includes(i));
    const newColumn = next.filter((_,i)=>i%7===col);
    assert.deepEqual(newColumn.slice(8-originalColumn.length),originalColumn);
    assert.ok(newColumn.slice(0,8-originalColumn.length).every(letter => letter==='A'));
  }
  assert.equal(next[21],'7');
  assert.equal(distances[21],2);
  assert.equal(next[49],'49');
  assert.equal(distances[49],0);
});
test('全列を消しても56文字補充される', () => {
  const {board} = E.collapse(E.createBoard(),Array.from({length:56},(_,i)=>i),()=>0);
  assert.deepEqual(board,Array(56).fill('A'));
});
test('固定乱数で母音率約40%、Q/X/Zは少ない', () => {
  let seed=12345;
  const random=()=>((seed=(1664525*seed+1013904223)>>>0)/2**32);
  const counts={};
  for(let i=0;i<50000;i++) { const letter=E.randomLetter(random); counts[letter]=(counts[letter]||0)+1; }
  const rate=[...'AEIOU'].reduce((sum,l)=>sum+counts[l],0)/50000;
  assert.ok(rate>.38 && rate<.42);
  assert.ok(counts.E>counts.U && counts.A>counts.U);
  assert.ok(counts.T>counts.Q && counts.R>counts.X && counts.N>counts.Z);
});
test('経路探索は非隣接や重複を使わず、単語のない盤面は有限処理で救済', () => {
  const board=Array(56).fill('Z');
  assert.equal(E.findWord(board,words),null);
  assert.equal(E.ensurePlayable(board,words),true);
  const path=E.findWord(board,words);
  assert.equal(path.map(i=>board[i]).join(''),'CAT');
  assert.equal(E.ensurePlayable(board,words),false);
});
