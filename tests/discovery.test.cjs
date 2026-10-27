const test=require('node:test');
const assert=require('node:assert/strict');
require('../vocabulary');require('../words');require('../engine');
const E=WordPopEngine,easy=WordPopEasyWords;
const rng=initial=>{let seed=initial;return ()=>((seed=(seed*1664525+1013904223)>>>0)/2**32);};
test('縦横斜めの一直線だけ。L字・途中の折り返しは不可、1文字戻しは可',()=>{
  assert.deepEqual(E.extendPath([0,1],8),[0,1]);
  assert.deepEqual(E.extendPath([0,8],9),[0,8]);
  assert.deepEqual(E.extendPath([0,8],16),[0,8,16]);
  assert.deepEqual(E.extendPath([0,7],14),[0,7,14]);
  assert.deepEqual(E.extendPath([2,1],0),[2,1,0]);
  assert.deepEqual(E.extendPath([0,1,2],1),[0,1]);
  const b=Array(56).fill('Z');b[0]='C';b[1]='A';b[8]='T';
  assert.equal(E.findWord(b,new Set(['CAT'])),null);
});
test('初期盤面には少なくとも10種類の簡単な一直線単語がある',()=>{
  for(let seed=0;seed<30;seed++)assert.ok(new Set(E.straightWords(E.createBoard(rng(seed)),easy).map(m=>m.word)).size>=10);
});
test('やさしい補充は新規マスだけを書き換え、落下した既存文字の位置を守る',()=>{
  const random=rng(82),b=E.createBoard(random);
  const fallen=E.collapse(b,[16,17,18],random);
  const next=E.friendlyRefill(fallen,easy,random);
  for(let i=0;i<56;i++)if(!fallen.fresh.includes(i))assert.equal(next.board[i],fallen.board[i]);
  assert.equal(next.board.length,56);
});
test('連鎖は落下で新しくできた一直線のみ。静止した初期単語を消さない',()=>{
  const before=Array(56).fill('Z');before.splice(21,3,'C','A','T');
  assert.equal(E.findCascade(before,before,Array(56).fill(0),easy),null);
  const after=[...before];after.splice(0,3,'D','O','G');const distances=Array(56).fill(0);distances[0]=1;
  assert.deepEqual(E.findCascade(before,after,distances,easy),{word:'DOG',path:[0,1,2]});
  assert.equal(E.findCascade(before,after,Array(56).fill(0),easy),null);
  const diagonal=Array(56).fill('Z');diagonal[0]='C';diagonal[8]='A';diagonal[16]='T';
  assert.deepEqual(E.findCascade(Array(56).fill('Z'),diagonal,Array(56).fill(1),easy),{word:'CAT',path:[0,8,16]});
});
test('固定乱数の80手プレイで連鎖が有限に終わり、次の簡単な語が残る',()=>{
  const random=rng(74);let b=E.createBoard(random);const counts=[],chains=[];
  for(let turn=0;turn<80;turn++){
    const options=E.straightWords(b,easy);assert.ok(options.length);
    let match=options[Math.floor(random()*options.length)],chain=1;
    while(match){
      const before=b,result=E.friendlyRefill(E.collapse(b,match.path,random),easy,random);b=result.board;
      match=chain<=E.MAX_CASCADES?E.findCascade(before,b,result.distances,easy):null;
      if(match)chain++;
    }
    assert.ok(chain<=4);E.ensurePlayable(b,easy);
    const count=new Set(E.straightWords(b,easy).map(m=>m.word)).size;
    assert.ok(count>=1);counts.push(count);chains.push(chain);
  }
  assert.ok(counts.reduce((a,b)=>a+b)/counts.length>=6);
  assert.ok(chains.some(n=>n>1));
});
