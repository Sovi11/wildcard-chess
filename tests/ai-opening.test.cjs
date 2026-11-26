const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Game}=require('../js/engine.js');
const AI=require('../js/ai.js');

// a bot that would blunder every single move, to make the phasing visible
const SLOPPY={depth:1,K:4,movetime:200,jitter:400,blunder:1};

test('a weak bot does not blunder in the first two moves each',()=>{
  for(let seed=1;seed<=40;seed++){
    const g=new Game();
    const res=AI.chooseMoveFor(AI.Pos.fromGame(g),SLOPPY,seed);
    assert.equal(res.blundered,false);
  }
});
test('later in the game it blunders again, with a piece move',()=>{
  const g=new Game();
  g.moveCount.white=12;g.moveCount.black=12;       // same pieces, but move 13
  let blunders=0;
  for(let seed=1;seed<=40;seed++){
    const res=AI.chooseMoveFor(AI.Pos.fromGame(g),SLOPPY,seed);
    if(res.blundered){blunders++;assert.equal(res.move.kind,'m');}
  }
  assert.equal(blunders,40);
});
test('the numbered difficulty levels phase in the same way',()=>{
  const g=new Game();
  for(let seed=1;seed<=40;seed++) assert.equal(AI.chooseMove(AI.Pos.fromGame(g),1,seed).blundered,false);
});
