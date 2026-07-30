import{init as initDash,go}from'./dashboard.js';
import{init as initSys}from'./system.js';
import{init as initChat}from'./chat.js';
import{init as initVoice}from'./voice.js';
import{init as initAgents}from'./agents.js';
import{updUI,getTasks,addTask,toggleTask,delTask}from'./memory.js';
import{$}from'./utils.js';

if('serviceWorker'in navigator){window.addEventListener('load',()=>{navigator.serviceWorker.register('sw.js').then(r=>console.log('[SW]',r.scope)).catch(e=>console.log('[SW]',e))})}

function updGreet(){const h=new Date().getHours();const el=$('#greetingLine');if(!el)return;if(h<5)el.textContent='Still up,';else if(h<12)el.textContent='Good morning,';else if(h<17)el.textContent='Good afternoon,';else if(h<21)el.textContent='Good evening,';else el.textContent='Good night,'}

function initSearch(){$('#searchForm')?.addEventListener('submit',e=>{e.preventDefault();const v=$('#askInput')?.value.trim();if(!v)return;go('chat');setTimeout(()=>{const i=$('#chatInput');if(i){i.value=v;$('#chatForm')?.dispatchEvent(new Event('submit'))}},300)})}

function initVision(){const v=$('#visionVideo'),p=$('#visionPreview'),ph=$('#visionPlaceholder');if(!v||!p)return;let s=null;async function start(){try{s=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});v.srcObject=s;p.classList.add('active')}catch(e){console.warn(e)}}$$('.v-action').forEach(b=>b.addEventListener('click',()=>{$$('.v-action').forEach(x=>x.classList.remove('active'));b.classList.add('active');if(b.dataset.vision==='camera')start()}));start()}

function initTasks(){const f=$('#taskForm'),l=$('#taskList');if(!f||!l)return;function ren(){import('./memory.js').then(m=>{const t=m.getTasks();l.innerHTML=t.map(x=>`<div class="task-item" data-tid="${x.id}"><div class="task-check ${x.done?'checked':''}"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></div><div class="task-text ${x.done?'done':''}">${x.text}</div><button class="task-delete" data-del="${x.id}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>`).join('');updUI()})}f.addEventListener('submit',e=>{e.preventDefault();const i=$('#taskInput'),t=i?.value.trim();if(!t)return;addTask(t);i.value='';ren()});l.addEventListener('click',e=>{const c=e.target.closest('.task-check');const d=e.target.closest('[data-del]');if(c){const id=c.closest('[data-tid]')?.dataset.tid;if(id){toggleTask(id);ren()}}if(d){const id=d.dataset.del;if(id){delTask(id);ren()}}});ren()}

function initSysInfo(){const p=$('#systemInfoPanel');if(!p)return;function ren(){const s=window.__nx_sys||{},n=window.__nx_net||{},st=window.__nx_store||{},h=window.__nx_heap||{},b=window.__nx_sys?.battery;const rows=[['Time',window.__nx_time||'--'],['Date',window.__nx_date||'--'],['Browser',s.browser||'Unavailable'],['Platform',s.platform||'Unavailable'],['Status',s.online||'Unavailable'],['Resolution',s.resolution||'Unavailable'],['Language',s.language||'Unavailable'],['CPU Cores',s.cores||'Unavailable'],['Connection',n.type?`${n.type} (${n.downlink} Mbps)`:'Unavailable'],['Device Memory',navigator.deviceMemory?`~${navigator.deviceMemory} GB`:'Unavailable'],['Storage Used',st.used?`${st.used} / ${st.total}`:'Unavailable'],['JS Heap',h.used||'Unavailable'],['Battery',b?`${b.level}%${b.charging?' (Charging)':''}`:'Unavailable']];p.innerHTML=rows.map(([l,v])=>`<div class="sys-row"><span class="sys-label">${l}</span><span class="sys-value">${v}</span></div>`).join('')}setInterval(ren,2000);ren()}

document.addEventListener('DOMContentLoaded',()=>{updGreet();setInterval(updGreet,60000);initDash();initSys();initChat();initVoice();initAgents();initSearch();initVision();initTasks();initSysInfo();updUI();setInterval(updUI,5000);console.log('[Noctryx] Initialized')});
