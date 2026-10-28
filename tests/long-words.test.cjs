const test=require('node:test'),assert=require('node:assert/strict');
require('../vocabulary');require('../words');require('../engine');
const E=WordPopEngine,long=WordPopLongWords,easy=WordPopEasyWords;
const rng=n=>()=>((n=(1664525*n+1013904223)>>>0)/2**32);
test('長語プールは訳付き・基本形の5〜6文字。開始時に5文字3語と6文字3語を保証',()=>{
 assert.ok(long.size>=100);for(const word of long){assert.ok(WordPopWords.has(word));assert.ok(WordPopDictionary[word]);assert.match(word,/^[A-Z]{5,6}$/);}
 for(let n=0;n<50;n++){
  const b=E.createBoard(rng(n));
  for(const [start,length] of [[1,5],[8,6],[22,6],[28,5],[42,5],[49,6]])assert.ok(long.has(b.slice(start,start+length).join('')));
  assert.equal(b.slice(16,19).join(''),'CAT');
 }
 assert.notDeepEqual(E.createBoard(rng(1)),E.createBoard(rng(2)));
});
test('5文字消去後は新規マスだけで長い語を補充。既存の落下文字を保ち、部分語による自動消去から守る',()=>{
 const b=Array(56).fill('Z');b.splice(22,5,...'APPLE');
 const raw=E.collapse(b,[22,23,24,25,26],rng(12));
 const r=E.refillLongWords(raw,new Set(['HEART']),rng(7));
 assert.equal(r.protected.map(i=>r.board[i]).join(''),'HEART');
 for(let i=0;i<56;i++)if(!r.fresh.includes(i))assert.equal(r.board[i],raw.board[i]);
 assert.ok(E.findWord(r.board,long));
 assert.equal(E.findCascade(b,r,new Set(['EAR','ART'])),null);
});
test('長語が既に3種類以上あればランダム補充を残し、候補なしの場合も有限に終了',()=>{
 const b=E.createBoard(rng(5));const r={board:b,distances:Array(56).fill(0),fresh:[]};
 assert.equal(E.refillLongWords(r,long,rng(2)),r);
 const empty={board:Array(56).fill('Z'),distances:Array(56).fill(0),fresh:[0]};
 assert.equal(E.refillLongWords(empty,long,rng(8)),empty);
});
test('6文字を30手続けて消しても、次の5〜6文字が残る',()=>{
 const random=rng(42);let b=E.createBoard(random);
 for(let turn=0;turn<30;turn++){
  const options=E.straightWords(b,long).filter(m=>m.word.length===6);assert.ok(options.length);
  const m=options[Math.floor(random()*options.length)],r=E.refillLongWords(E.collapse(b,m.path,random),long,random);b=r.board;
  assert.ok(E.findWord(b,long));assert.equal(b.length,56);
 }
});
