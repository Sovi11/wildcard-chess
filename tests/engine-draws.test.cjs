const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Game}=require('../js/engine.js');
function noTerrain() {const g=new Game();g.rules={cadence:1,budget:0};g.reset();return g;}
test('the initial position counts toward threefold repetition',()=>{
  const g=noTerrain(), cycle=[[6,0,5,2],[6,7,5,5],[5,2,6,0],[5,5,6,7]];
  for(let i=0;i<8;i++) {assert.equal(g.makeMove(...cycle[i%4]),true);if(i<7) assert.equal(g.isOver(),false);}
  assert.equal(g.status,'repetition');
});
test('a 50-move draw freezes the board and history',()=>{
  const g=new Game();g.halfmoveClock=99;assert.equal(g.makeMove(6,0,5,2),true);assert.equal(g.status,'fifty');
  const before=JSON.stringify([...g.board]), count=g.history.length;
  assert.equal(g.makeMove(6,7,5,5),false);assert.deepEqual(g.legalMoves(6,7),[]);
  assert.equal(g.canWildcard(),false);assert.equal(g.wildcardMoveCell(0,2,-1,2),false);
  assert.equal(JSON.stringify([...g.board]),before);assert.equal(g.history.length,count);
});
test('a repetition draw cannot be resumed through a board action',()=>{
  const g=new Game();g.makeMove(4,1,4,3);assert.equal(g.canWildcard(),true);g.status='repetition';
  const cells=[...g.cells];assert.equal(g.canWildcard(),false);assert.equal(g.wildcardMoveCell(0,2,-1,2),false);
  assert.deepEqual([...g.cells],cells);
});
test('kings and knights have distinct position identities',()=>{
  const g=new Game(), before=g._posKey();
  [g.board.get('4,0').type,g.board.get('6,0').type]=[g.board.get('6,0').type,g.board.get('4,0').type];
  assert.notEqual(g._posKey(),before);
});
test('castling rights distinguish otherwise identical boards',()=>{
  for(const square of ['4,0','0,0','7,0']) {const g=new Game(),before=g._posKey();g.board.get(square).hasMoved=true;assert.notEqual(g._posKey(),before);}
});
test('knights returning home keep the same position identity',()=>{
  const g=new Game(),before=g._posKey();g.board.get('6,0').hasMoved=true;assert.equal(g._posKey(),before);
});
test('pawn first-move rights and finite terrain budgets affect identity',()=>{
  const g=new Game(),before=g._posKey();g.board.get('0,1').hasMoved=true;assert.notEqual(g._posKey(),before);
  const a=new Game();a.rules.budget=3;const first=a._posKey();a.wildUsed.white=1;assert.notEqual(a._posKey(),first);
});
test('en passant matters only if the side to move can legally use it',()=>{
  const g=new Game();g.makeMove(4,1,4,3);const a=g._posKey();g.epTarget=null;assert.equal(g._posKey(),a);
  const h=new Game();for(const m of [[4,1,4,3],[0,6,0,5],[4,3,4,4],[3,6,3,4]]) assert.equal(h.makeMove(...m),true);
  const b=h._posKey();h.epTarget=null;assert.notEqual(h._posKey(),b);
});
test('a king without castling rights does not regain rights by repeating',()=>{
  const g=new Game();g.board.get('4,0').hasMoved=true;const before=g._posKey();g.board.get('0,0').hasMoved=true;assert.equal(g._posKey(),before);
});
test('repetition respects the default staggered board-turn phase',()=>{
  const g=new Game(), cycle=[[6,0,5,2],[6,7,5,5],[5,2,6,0],[5,5,6,7]];
  for(let i=0;i<24;i++) {assert.equal(g.makeMove(...cycle[i%4]),true);if(i<23) assert.equal(g.isOver(),false);}
  assert.equal(g.status,'repetition');
});
test('castling and en-passant still apply their complete moves',()=>{
  const g=new Game();g.board.clear();g._put(4,0,'king','white');g._put(7,0,'rook','white');g._put(4,7,'king','black');g._evaluate();
  assert.equal(g.makeMove(4,0,6,0),true);assert.equal(g.get(6,0).type,'king');assert.equal(g.get(5,0).type,'rook');assert.equal(g.get(7,0),undefined);
  const h=new Game();for(const m of [[4,1,4,3],[0,6,0,5],[4,3,4,4],[3,6,3,4],[4,4,3,5]]) assert.equal(h.makeMove(...m),true);
  assert.equal(h.get(3,4),undefined);assert.equal(h.get(3,5).color,'white');
});
