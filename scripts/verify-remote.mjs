import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const context=vm.createContext({window:{}});
vm.runInContext(await readFile('public/config.js','utf8'),context);
const {supabaseUrl,publishableKey}=context.window.EVENT_CONFIG;
const headers={apikey:publishableKey,'Content-Type':'application/json'};
const collect=await fetch(`${supabaseUrl}/rest/v1/rpc/pnu_collect`,{method:'POST',headers,body:JSON.stringify({batch:[]})});
assert.ok(collect.ok,`collector ${collect.status}: ${await collect.text()}`);
for(const table of ['pnu_events','pnu_purchases']){
  const res=await fetch(`${supabaseUrl}/rest/v1/${table}?select=*&limit=1`,{headers});
  assert.ok([401,403].includes(res.status),`${table} must deny public reads, got ${res.status}`);
}
const dashboard=await fetch(`${supabaseUrl}/rest/v1/rpc/pnu_dashboard`,{method:'POST',headers,body:JSON.stringify({date_from:new Date().toISOString(),date_to:new Date().toISOString()})});
assert.ok([401,403].includes(dashboard.status),`dashboard must deny anonymous access: ${dashboard.status}`);
console.log('Supabase live API passed: collector reachable; raw data and dashboard denied to public. No test events written.');
