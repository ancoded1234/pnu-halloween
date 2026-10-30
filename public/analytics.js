const cfg = window.EVENT_CONFIG;
const KEY = 'pnu-consent-v1';
const SESSION = 'pnu-session-v1';
const QUEUE = 'pnu-queue-v1';
let queue = [];
let busy = false;
let session;
let lastActivity=0;
let seen = new Set();
const storage = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k,v) { try { localStorage.setItem(k,v); } catch {} }, remove(k) { try { localStorage.removeItem(k); } catch {} } };
export function consent() { return storage.get(KEY); }
function sessionId() {
  if (session && Date.now()-lastActivity<30*60*1000) return session;
  session=null;seen.clear();
  try {
    const old = JSON.parse(sessionStorage.getItem(SESSION) || 'null');
    if (old && Date.now()-old.last < 30*60*1000) { session = old.id; seen = new Set(old.seen || []); }
  } catch {}
  session ||= crypto.randomUUID();
  saveSession(); return session;
}
function saveSession() { lastActivity=Date.now();try { sessionStorage.setItem(SESSION,JSON.stringify({ id:session,last:lastActivity,seen:[...seen] })); } catch {} }
function saveQueue() { storage.set(QUEUE,JSON.stringify(queue.slice(-100))); }
export function setConsent(value) {
  storage.set(KEY,value);
  if (value !== 'yes') { queue=[]; session=null; seen.clear(); storage.remove(QUEUE); try { sessionStorage.removeItem(SESSION); } catch {} }
}
export function track(name,button=null,once=false) {
  if(consent() !== 'yes') return;
  const id=sessionId();
  if(name!=='page_view'&&!seen.has('page_view'))track('page_view',null,true);
  if(once && seen.has(name)) return;
  if(once) seen.add(name);
  saveSession();
  const params = new URLSearchParams(location.search);
  const clean = key => (params.get(key)||'').replace(/[^a-zA-Z0-9_ .-]/g,'').slice(0,80);
  queue.push({id:crypto.randomUUID(),session_id:id,event_name:name,button_id:button,campaign:cfg.campaign,utm_source:clean('utm_source'),utm_medium:clean('utm_medium'),utm_campaign:clean('utm_campaign')});
  saveQueue(); void flush();
}
export async function flush() {
  if(busy || !queue.length || consent() !== 'yes' || !cfg.supabaseUrl || !cfg.publishableKey) return;
  busy=true; const batch=queue.slice(0,30);
  try {
    const response=await fetch(`${cfg.supabaseUrl}/rest/v1/rpc/pnu_collect`,{method:'POST',headers:{apikey:cfg.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({batch}),keepalive:true});
    if(!response.ok) throw new Error(`collection ${response.status}`);
    const sent=new Set(batch.map(e=>e.id)); queue=queue.filter(e=>!sent.has(e.id)); saveQueue();
  } catch { /* The same event IDs are retried, so reconnects cannot duplicate counts. */ }
  finally { busy=false; }
}
if(consent()==='yes') { try { queue=JSON.parse(storage.get(QUEUE)||'[]').slice(-100); } catch { queue=[]; } }
setInterval(flush,10000);
addEventListener('online',flush);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden') void flush();});
