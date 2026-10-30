import {consent,setConsent,track} from './analytics.js';
const $=s=>document.querySelector(s);
const banner=$('#consent');
banner.hidden=consent()!==null;
const sections=new Set();
function startVisit(){
  track('page_view',null,true);
  for(const section of sections) track(section,null,true);
}
$('#accept').onclick=()=>{setConsent('yes');banner.hidden=true;startVisit();};
$('#decline').onclick=()=>{setConsent('no');banner.hidden=true;};
$('#privacy').onclick=()=>{banner.hidden=false;};
document.addEventListener('click',event=>{const target=event.target.closest('[data-track]');if(target)track('button_click',target.dataset.track);});
const observer=new IntersectionObserver(entries=>{for(const entry of entries) if(entry.isIntersecting){const name=entry.target.dataset.section;sections.add(name);track(name,null,true);}},{threshold:.35});
document.querySelectorAll('[data-section]').forEach(el=>observer.observe(el));
$('#start').onclick=()=>{
  track('ticket_view',null,true);
  track('checkout_start',null,true);
  $('#result').textContent='';$('#order').hidden=false;$('#order').reset();$('#checkout').showModal();
};
$('#close').onclick=()=>$('#checkout').close();
$('#order').onsubmit=event=>{
  event.preventDefault();
  track('demo_complete',null,true);
  $('#order').hidden=true;
  $('#result').textContent='체험 신청이 완료됐어요! 실제 예약이나 결제는 발생하지 않습니다.';
};
startVisit();
