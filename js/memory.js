import{load,save,genId}from'./utils.js';
const K={tasks:'t',msgs:'m',mc:'mc',rc:'rc',cc:'cc',ghT:'ght',ghU:'ghu'};
export const getTasks=()=>load(K.tasks,[]);
export const addTask=t=>{const x=getTasks();x.push({id:genId(),text:t,done:false,created:Date.now()});save(K.tasks,x);upd();return x};
export const toggleTask=id=>{const x=getTasks().map(t=>t.id===id?{...t,done:!t.done}:t);save(K.tasks,x);upd();return x};
export const delTask=id=>{const x=getTasks().filter(t=>t.id!==id);save(K.tasks,x);upd();return x};
function upd(){save(K.cc,getTasks().filter(t=>t.done).length)}
export const getDone=()=>load(K.cc,0);
export const getMsgs=()=>load(K.msgs,[]);
export const addMsg=(r,c)=>{const x=getMsgs();x.push({id:genId(),role:r,content:c,time:Date.now()});save(K.msgs,x);save(K.mc,(load(K.mc,0)+1));return x};
export const clearMsgs=()=>{save(K.msgs,[]);save(K.mc,0)};
export const getMC=()=>load(K.mc,0);
export const incRC=()=>{const x=load(K.rc,0)+1;save(K.rc,x);return x};
export const getRC=()=>load(K.rc,0);
export const getGH=()=>({token:load(K.ghT,''),username:load(K.ghU,'')});
export const setGH=({token,username})=>{if(token!==undefined)save(K.ghT,token);if(username!==undefined)save(K.ghU,username)};
export function updUI(){const t=$('#taskCount'),m=$('#messageCount'),r=$('#researchCount'),c=$('#completedCount');if(t)t.textContent=getTasks().length;if(m)m.textContent=getMC();if(r)r.textContent=getRC();if(c)c.textContent=getDone()}
