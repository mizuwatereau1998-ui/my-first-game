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
test('補充は単語の埋め込みをせず、1文字ずつ抽選して既存文字を保持する',()=>{
  const b=E.createBoard(rng(82));
  // 乱数が常に0なら、母音プールのAだけになる。単語へ書き換えない。
  const result=E.collapse(b,[16,17,18],()=>0);
  assert.deepEqual(result.fresh.sort((a,b)=>a-b),[2,3,4]);
  for(const i of result.fresh)assert.equal(result.board[i],'A');
  assert.equal(result.board[16],b[9]);
  assert.equal(result.board[17],b[10]);
  assert.equal(result.board[18],b[11]);
});
test('中央で既存の文字がずれてできた単語も連鎖する',()=>{
  const before=Array(56).fill('Z');
  before[16]='C'; before[24]='A'; before[25]='T'; before.splice(21,3,'D','O','G');
  const result=E.collapse(before,[21,22,23],()=>0);
  assert.deepEqual(E.findCascade(before,result,easy),{word:'CAT',path:[23,24,25]});
});
test('偶然そろえば補充文字だけでも、既存文字との混合でも連鎖する',()=>{
  const before=Array(56).fill('Z'), after=[...before];after.splice(0,3,'C','A','T');
  const distances=Array(56).fill(0);distances[0]=distances[1]=distances[2]=1;
  assert.deepEqual(E.findCascade(before,{board:after,distances,fresh:[0,1,2]},easy),{word:'CAT',path:[0,1,2]});
  // 補充文字と既存文字が混ざれば、新しく横にそろった単語は連鎖できる。
  const middle=[...before];middle.splice(23,3,'C','A','T');const moved=Array(56).fill(0);moved[23]=1;
  assert.deepEqual(E.findCascade(before,{board:middle,distances:moved,fresh:[24]},easy),{word:'CAT',path:[23,24,25]});
});
test('静止している単語と、全体が同じ距離だけ落ちた単語は連鎖しない',()=>{
  const before=Array(56).fill('Z');before.splice(16,3,'C','A','T');
  assert.equal(E.findCascade(before,{board:before,distances:Array(56).fill(0),fresh:[]},easy),null);
  const after=Array(56).fill('Z');after.splice(23,3,'C','A','T');
  const distances=Array(56).fill(0);distances[23]=distances[24]=distances[25]=1;
  assert.equal(E.findCascade(before,{board:after,distances,fresh:[2,3,4]},easy),null);
});
test('斜めでも、既存の文字のずれによる成立なら連鎖する',()=>{
  const before=Array(56).fill('Z'),after=[...before];after[16]='C';after[24]='A';after[32]='T';
  const distances=Array(56).fill(0);distances[16]=1;
  assert.deepEqual(E.findCascade(before,{board:after,distances,fresh:[]},easy),{word:'CAT',path:[16,24,32]});
});
test('固定乱数の80手プレイで連鎖が有限に終わり、次の簡単な語が残る',()=>{
  const random=rng(74);let b=E.createBoard(random);const counts=[],chains=[];
  for(let turn=0;turn<80;turn++){
    const options=E.straightWords(b,easy);assert.ok(options.length);
    let match=options[Math.floor(random()*options.length)],chain=1;
    while(match){
      const before=b,result=E.collapse(b,match.path,random);b=result.board;
      match=chain<=E.MAX_CASCADES?E.findCascade(before,result,easy):null;
      if(match)chain++;
    }
    assert.ok(chain<=4);E.ensurePlayable(b,easy);
    const count=new Set(E.straightWords(b,easy).map(m=>m.word)).size;
    assert.ok(count>=1);counts.push(count);chains.push(chain);
  }
  assert.ok(counts.every(n=>n>=1));
  assert.ok(chains.some(n=>n>1));
});
