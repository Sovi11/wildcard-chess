const { test } = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('../js/postgame-feedback.js');
const fs = require('node:fs');
const vm = require('node:vm');
function el(reaction) {
  return { dataset: { reaction }, attrs: {}, listeners: {}, hidden: false, disabled: false, value: '', textContent: '',
    setAttribute(k,v) { this.attrs[k]=v; }, addEventListener(k,f) { this.listeners[k]=f; },
    click() { return this.listeners.click(); } };
}
function setup(send) {
  const choices=['loved','okay','frustrating'].map(el);
  const elements={ 'textarea': el(), '[data-send]': el(), '[data-dismiss]': el(), '[role="status"]': el(), '[data-fields]': el() };
  const root={ hidden: true, querySelector: s=>elements[s], querySelectorAll: ()=>choices };
  const controller=create(root,send);
  return { root, controller, choices, note:elements.textarea, submit:elements['[data-send]'], dismiss:elements['[data-dismiss]'], message:elements['[role="status"]'], fields:elements['[data-fields]'] };
}
for (const [i,reaction] of ['loved','okay','frustrating'].entries()) test('rating-only feedback: '+reaction, async()=>{
  let row; const s=setup(async e=>{row=e;return {ok:true};}); s.controller.show({plies:23});
  assert.equal(s.submit.disabled,true);s.choices[i].click();await s.submit.click();
  assert.equal(row.context.reaction,reaction);assert.equal(row.context.plies,23);assert.equal(row.context.source,'post_game');
  assert.ok(row.body.length>=4);assert.ok(row.body.length<=1200);assert.equal(s.fields.hidden,true);
  assert.match(s.message.textContent,/Thanks/);await s.submit.click();
});
test('offline retry retains note and blocks duplicate requests',async()=>{
  let complete, calls=0; const s=setup(()=>{calls++;return new Promise(r=>complete=r);});
  s.controller.show({});s.choices[0].click();s.note.value='The board move was confusing';
  const first=s.submit.click();await s.submit.click();assert.equal(calls,1);complete({ok:false});await first;
  assert.equal(s.note.value,'The board move was confusing');assert.equal(s.submit.disabled,false);
  const retry=s.submit.click();assert.equal(calls,2);complete({ok:true});await retry;assert.equal(s.fields.hidden,true);
});
test('old responses cannot change a new game, and dismiss hides survey',async()=>{
  let complete;const s=setup(()=>new Promise(r=>complete=r));s.controller.show({plies:1});s.choices[0].click();
  const first=s.submit.click();s.controller.hide();assert.equal(s.root.hidden,true);s.controller.show({plies:2});
  complete({ok:true});await first;assert.equal(s.fields.hidden,false);assert.equal(s.submit.disabled,true);
  s.dismiss.click();assert.equal(s.root.hidden,true);
});
test('optional comments are trimmed and bounded',async()=>{
  let row;const s=setup(async e=>{row=e;return {ok:true};});s.controller.show({});s.choices[1].click();s.note.value=' '+ 'x'.repeat(2000);await s.submit.click();
  assert.equal(row.body.split('\n')[1].length,900);assert.ok(row.body.length<1200);
});
function cloud(fetch,key='sb_publishable_test') {
  const window={WCCONFIG:{supabaseUrl:'https://test.supabase.co/',supabaseKey:key}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/cloud.js'),'utf8'),{window,fetch,AbortController,setTimeout,clearTimeout,console});
  return window.WCCLOUD;
}
test('feedback sends through public API without relying on signed-in SDK',async()=>{
  let request;const c=cloud(async(url,options)=>{request={url,...options};return {ok:true};});
  assert.equal((await c.sendFeedback({kind:'fun',body:'Great game',context:{source:'post_game'}})).ok,true);
  assert.equal(request.url,'https://test.supabase.co/rest/v1/feedback');assert.equal(request.headers.apikey,'sb_publishable_test');
  assert.equal(request.headers.Authorization,undefined);assert.equal(request.headers.Prefer,'return=minimal');
  assert.equal(JSON.parse(request.body).body,'Great game');
});
test('legacy public JWT works and network/server failures return retryable errors',async()=>{
  let headers;const c=cloud(async(_,o)=>{headers=o.headers;return {ok:false};},'legacy-anon-jwt');
  assert.equal((await c.sendFeedback({body:'Test'})).ok,false);assert.equal(headers.Authorization,'Bearer legacy-anon-jwt');
  assert.equal((await cloud(async()=>{throw Error('offline');}).sendFeedback({body:'Test'})).ok,false);
});
test('auth still fails gracefully if its SDK has not initialized',async()=>{
  const c=cloud(async()=>({ok:true}));
  for(const method of ['signInWithEmail','signInWithPassword','signUpWithPassword','resetPassword']) {
    assert.equal((await c[method]('example@example.com','unused')).ok,false);
  }
});
