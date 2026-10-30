const $=s=>document.querySelector(s),cfg=window.EVENT_CONFIG;
let token=null, rows=[];
const today=new Date();$('#to').value=today.toISOString().slice(0,10);$('#from').value=new Date(today.getTime()-29*86400000).toISOString().slice(0,10);
const demo={sessions:1280,ticket:640,checkout:288,demo:164,purchases:0,revenue:0,clicks:[{button_id:'hero_ticket',clicks:482,sessions:421},{button_id:'ticket_apply',clicks:337,sessions:288},{button_id:'nav_ticket',clicks:198,sessions:176},{button_id:'checkout_demo',clicks:170,sessions:164}],sources:[{source:'instagram',sessions:746,purchases:0},{source:'student_council',sessions:362,purchases:0},{source:'direct',sessions:172,purchases:0}]};
const number=n=>Number(n||0).toLocaleString('ko-KR');
const percent=(n,d)=>d?`${(n/d*100).toFixed(1)}%`:'—';
async function api(path,body,auth=token){
  const response=await fetch(`${cfg.supabaseUrl}${path}`,{method:'POST',headers:{apikey:cfg.publishableKey,'Content-Type':'application/json',...(auth?{Authorization:`Bearer ${auth}`}:{})},body:JSON.stringify(body)});
  const data=await response.json();if(!response.ok)throw new Error(data.message||data.error_description||'데이터를 불러오지 못했습니다.');return data;
}
function table(selector,data,keys){const body=$(selector);body.replaceChildren();if(!data.length){const tr=body.insertRow();const td=tr.insertCell();td.colSpan=keys.length;td.textContent='집계 데이터가 없습니다.';}for(const row of data){const tr=body.insertRow();for(const key of keys){const td=tr.insertCell();td.textContent=typeof row[key]==='number'?number(row[key]):row[key];}}}
function render(data){
  const metrics=[['방문 세션',number(data.sessions)],['신청 시작률',percent(data.checkout,data.sessions)],['실제 구매 전환율',percent(data.buyers||0,data.sessions)],['검증 매출',`₩${number(data.revenue)}`]];
  $('#metrics').replaceChildren();for(const [label,value]of metrics){const card=document.createElement('div');card.className='metric';const text=document.createElement('span');text.textContent=label;const strong=document.createElement('strong');strong.textContent=value;card.append(text,strong);$('#metrics').append(card);}
  const steps=[['페이지 방문',data.sessions],['티켓 확인',data.ticket],['신청 시작',data.checkout],['데모 신청 완료',data.demo]];
  $('#funnel').replaceChildren();rows=[];
  steps.forEach(([label,value],i)=>{const row=document.createElement('div');row.className='bar-row';const labelEl=document.createElement('div');labelEl.className='bar-label';const text=document.createElement('span');text.textContent=`0${i+1} / ${label}`;const count=document.createElement('span');count.textContent=`${number(value)} 세션 · ${percent(value,data.sessions)}${i?` · 이전 단계 이탈 ${percent(steps[i-1][1]-value,steps[i-1][1])}`:''}`;labelEl.append(text,count);const bar=document.createElement('div');bar.className='bar';const fill=document.createElement('span');fill.style.width=`${data.sessions?value/data.sessions*100:0}%`;bar.append(fill);row.append(labelEl,bar);$('#funnel').append(row);rows.push(['funnel',label,value,'']);});
  const purchase=document.createElement('p');purchase.className='muted';purchase.textContent=`별도 지표: 서버 검증 구매 ${number(data.purchases)}건 · 데모 신청은 구매에 포함되지 않습니다.`;$('#funnel').append(purchase);
  table('#clicks',data.clicks,['button_id','clicks','sessions']);table('#sources',data.sources,['source','sessions','purchases']);
  for(const c of data.clicks)rows.push(['button',c.button_id,c.clicks,c.sessions]);for(const s of data.sources)rows.push(['source',s.source,s.sessions,s.purchases]);
}
async function load(){
  rows=[];$('#metrics').replaceChildren();$('#funnel').replaceChildren();$('#clicks').replaceChildren();$('#sources').replaceChildren();
  if($('#mode').value==='demo'){render(demo);$('#status').textContent='DEMO · 화면 설명을 위한 고정 예시입니다. 날짜·유입 필터는 실제 데이터 조회에 적용됩니다.';return;}
  if(!token){$('#status').textContent='실제 데이터를 보려면 운영자로 로그인하세요.';return;}
  const from=$('#from').value,to=$('#to').value;
  if(!from||!to||from>to){$('#status').textContent='조회 날짜를 확인해주세요.';return;}
  $('#status').textContent='실제 데이터를 조회 중입니다…';
  try{const data=await api('/rest/v1/rpc/pnu_dashboard',{date_from:`${from}T00:00:00+09:00`,date_to:`${to}T23:59:59.999+09:00`,source_filter:$('#source').value.trim()||null});render(data);$('#status').textContent='LIVE · Supabase 실제 집계 · 날짜 기준 Asia/Seoul';}catch(e){$('#status').textContent=e.message;}
}
$('#login').onsubmit=async event=>{event.preventDefault();if(!cfg.supabaseUrl){$('#status').textContent='Supabase 연결 설정이 필요합니다.';return;}try{const auth=await api('/auth/v1/token?grant_type=password',{email:$('#email').value,password:$('#password').value},null);token=auth.access_token;$('#password').value='';$('#login-panel').hidden=true;$('#logout').hidden=false;$('#mode').value='live';await load();}catch(e){$('#status').textContent=e.message;}};
$('#logout').onclick=async()=>{try{await api('/auth/v1/logout',{});}catch{}token=null;$('#login-panel').hidden=false;$('#logout').hidden=true;$('#mode').value='demo';load();};
$('#refresh').onclick=load;$('#mode').onchange=load;
$('#export').onclick=()=>{if(!rows.length)return;const quote=v=>'"'+String(v).replaceAll('"','""')+'"';const csv='\uFEFF'+[['type','name','count','sessions_or_purchases'],...rows].map(r=>r.map(quote).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`pnu-${$('#mode').value}-${$('#from').value}-${$('#to').value}.csv`;a.click();URL.revokeObjectURL(url);};
load();
