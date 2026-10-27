const test = require('node:test');
const assert = require('node:assert/strict');
require('../vocabulary.js');
require('../words.js');
require('../engine.js');
const words = globalThis.WordPopWords;
test('3,000語を重複なく同梱し、全語が3〜6文字', () => {
  assert.equal(words.size,3000);
  assert.equal(globalThis.WordPopVocabulary.length,words.size);
  assert.ok([...words].every(w=>/^[A-Z]{3,6}$/.test(w)));
});
test('易しい語と入試学習にも使う抽象語の基本形を認める', () => {
  for(const word of ['CAT','DOG','BOOK','APPLE','ACCEPT','AFFORD','AFFECT','EFFECT','EFFORT','DECIDE','CREATE','NATURE','NOTICE','RATHER','UNLESS']) assert.ok(words.has(word),word);
});
test('規則・不規則の複数形、時制・分詞、比較級を認めない', () => {
  for(const word of ['CATS','DOGS','BOOKS','APPLES','MEN','WOMEN','MICE','FEET','TEETH','PEOPLE','WENT','RAN','ATE','EATEN','SEEN','DID','DONE','HAS','HAD','WAS','WERE','BEEN','MADE','GAVE','GIVEN','BOUGHT','TAUGHT','RIDDEN','TRIES','TRIED','TRYING','WALKS','WALKED','WALKING','PLAYED','PLAYING','HOPED','HOPING','BIGGER','BETTER','BEST','WORSE','WORST']) assert.equal(words.has(word),false,word);
});
test('語尾が似ていても基本形なら認める。意味のない訳を捏造しない', () => {
  for(const word of ['BUS','GAS','GLASS','GRASS','CLASS','DRESS','SPRING','KING','RED','SEED','ROSE']) assert.ok(words.has(word),word);
  assert.equal(globalThis.WordPopDictionary.ROSE,'バラ');
  assert.equal(globalThis.WordPopDictionary.AFFORD,undefined);
  assert.ok([...globalThis.WordPopEasyWords].every(w=>words.has(w)&&w.length<=4));
});
