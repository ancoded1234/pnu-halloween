import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
const source=(await readFile(new URL('../public/analytics.js',import.meta.url),'utf8')).replaceAll('export ','');
function harness(){
  const local=new Map(),sess=new Map(),calls=[];
  const storage=map=>({getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)});
  const context=vm.createContext({window:{EVENT_CONFIG:{supabaseUrl:'https://example.test',publishableKey:'public',campaign:'pnu-halloween-2026'}},localStorage:storage(local),sessionStorage:storage(sess),crypto:{randomUUID},location:{search:'?utm_source=instagram&email=private@example.com'},URLSearchParams,Date,Set,JSON,setInterval(){},addEventListener(){},document:{addEventListener(){}},fetch:async(url,options)=>{calls.push(JSON.parse(options.body));return{ok:true};}});
  vm.runInContext(source,context);return{context,calls,local,run:s=>vm.runInContext(s,context)};
}
test('no requests or visitor identifier before opt-in; refusal clears pending events',async()=>{const h=harness();h.run("track('page_view',null,true)");assert.equal(h.calls.length,0);h.run("setConsent('yes');track('page_view',null,true)");await h.run('flush()');assert.equal(h.calls.length,1);assert.equal(h.calls[0].batch[0].utm_source,'instagram');assert.equal(JSON.stringify(h.calls).includes('private@example.com'),false);h.run("setConsent('no');track('button_click','hero_ticket')");assert.equal(h.calls.length,1);assert.equal(h.local.has('pnu-queue-v1'),false);});
test('funnel events deduplicate per session while repeated button clicks remain distinct',async()=>{const h=harness();h.run("setConsent('yes');track('page_view',null,true)");await h.run('flush()');h.run("track('page_view',null,true);track('button_click','hero_ticket');track('button_click','hero_ticket')");await new Promise(r=>setImmediate(r));await h.run('flush()');const events=h.calls.flatMap(c=>c.batch);assert.equal(events.filter(e=>e.event_name==='page_view').length,1);assert.equal(events.filter(e=>e.event_name==='button_click').length,2);assert.equal(new Set(events.map(e=>e.id)).size,3);});
test('failed requests retry unchanged IDs for server idempotency',async()=>{const h=harness();const failed=[];h.context.fetch=async(url,options)=>{failed.push(JSON.parse(options.body));return{ok:false,status:503};};h.run("setConsent('yes');track('page_view',null,true)");await new Promise(r=>setImmediate(r));await h.run('flush()');assert.equal(failed.length,2);assert.equal(failed[0].batch[0].id,failed[1].batch[0].id);assert.equal(JSON.parse(h.local.get('pnu-queue-v1')).length,1);});
