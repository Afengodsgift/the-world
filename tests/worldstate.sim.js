const fs=require('fs'),vm=require('vm');
const net=fs.readFileSync('/home/claude/the-world/src/core/Net.js','utf8'),wsrc=fs.readFileSync('/home/claude/the-world/src/core/WorldState.js','utf8');
// fake supabase with real-ish semantics (select/eq/in/order, upsert w/ onConflict + ignoreDuplicates)
const DB={world_state:[],world_log:[]};let dbDown=false;
function table(n){return {
  select(){const q={f:[],o:null};const api={eq(c,v){q.f.push(r=>r[c]===v);return api},in(c,vs){q.f.push(r=>vs.includes(r[c]));return api},order(c){q.o=c;return api},
    then(res){ if(dbDown)return res({data:null,error:{message:'down'}}); let r=DB[n].filter(x=>q.f.every(f=>f(x)));if(q.o)r=r.slice().sort((a,b)=>a[q.o]<b[q.o]?-1:1);res({data:JSON.parse(JSON.stringify(r)),error:null})}};return api},
  upsert(rows,opt){return Promise.resolve().then(()=>{ if(dbDown)return {error:{message:'down'}};
    const cols=opt.onConflict.split(',');for(const r of rows){const i=DB[n].findIndex(x=>cols.every(c=>x[c]===r[c]));if(i<0)DB[n].push(JSON.parse(JSON.stringify(r)));else if(!opt.ignoreDuplicates)DB[n][i]=Object.assign(DB[n][i],JSON.parse(JSON.stringify(r)))}return {error:null}})}
}}
const bus=[];
function client(id,name){
  const store={};const ls={getItem:k=>store[k]??null,setItem:(k,v)=>store[k]=v};
  const ctx={console,setTimeout,clearTimeout,JSON,Date,Promise,localStorage:ls,myId:id,sb:{from:table}};
  const chan={handlers:{},on(t,o,f){this.handlers[o.event]=f},send(m){bus.forEach(c=>{if(c!==chan&&online.get(c))c.handlers[m.event]&&c.handlers[m.event]({payload:JSON.parse(JSON.stringify(m.payload))})})}};
  online.set(chan,true);bus.push(chan);
  vm.createContext(ctx);vm.runInContext(net+'\n'+wsrc+'\nthis.Net=Net;this.WS=WS;',ctx);ctx.Net.attach(chan);ctx.chan=chan;ctx.store=store;return ctx}
const online=new Map();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let fails=0;
const ok=(c,m)=>{if(!c){fails++;console.log('FAIL',m)}else console.log('ok  ',m)};
(async()=>{
  const A=client('a','Alex'),B=client('b','Bee');
  await A.WS.init('ROOM-1111','Alex');await B.WS.init('ROOM-1111','Bee');
  // live propagation
  A.WS.addToSet('disc','Cave');await sleep(20);
  ok(B.WS.getSet('disc').includes('Cave'),'live: B sees A discovery over Net');
  let got=null;B.WS.onChange((k,v,r)=>{if(k==='disc')got=r});A.WS.addToSet('disc','Shell Beach');await sleep(20);
  ok(got===true,'live: B onChange fired with remote=true');
  // idempotent / no ping-pong
  ok(A.WS.addToSet('disc','Cave')===false,'addToSet duplicate returns false');
  // max
  A.WS.max('treas',3);B.WS.max('treas',2);await sleep(20);
  ok(A.WS.get('treas')===3&&B.WS.get('treas')===3,'num merges by max both ways');
  // journal
  ok(A.WS.log('place','Cave',{})===true,'log new entry');ok(A.WS.log('place','Cave',{})===false,'log duplicate ignored');
  await sleep(20);ok(B.WS.entries().some(e=>e.key==='Cave'&&e.by==='Alex'),'log replicated live with author');
  // flush to db
  await A.WS.flush();await B.WS.flush();
  ok(DB.world_state.find(r=>r.key==='disc').value.sort().join()==='Cave,Shell Beach','DB holds union of discoveries');
  ok(DB.world_log.length===1,'DB log deduped (1 row)');
  // OFFLINE partner: B offline, A progresses, B later joins fresh device
  online.set(B.chan,false);A.WS.addToSet('disc','Frost Isle');A.WS.addToSet('orbs',7);A.WS.log('treasure','hunt:1',{});await A.WS.flush();
  ok(!B.WS.getSet('disc').includes('Frost Isle'),'offline B did not get live op');
  const B2=client('b2','Bee');online.set(B2.chan,true);await B2.WS.init('ROOM-1111','Bee');
  ok(B2.WS.getSet('disc').includes('Frost Isle')&&B2.WS.getSet('orbs').includes(7),'new session pulls missed progress from DB');
  ok(B2.WS.entries().length===2,'journal catch-up from DB');
  // both progress while DB is down, then converge
  dbDown=true;const C=client('c','Cy'),D=client('d','Di');online.set(C.chan,false);online.set(D.chan,false);
  await C.WS.init('ROOM-2222','Cy');await D.WS.init('ROOM-2222','Di');
  C.WS.addToSet('disc','X');D.WS.addToSet('disc','Y');C.WS.log('place','X',{});D.WS.log('place','Y',{});await C.WS.flush();
  ok(C.WS.getSet('disc').join()==='X','offline: still works locally, no crash');
  dbDown=false;online.set(C.chan,true);online.set(D.chan,true);
  const C2=client('c2','Cy');const D2=client('d2','Di');
  await C.WS.flush();await D.WS.flush();await sleep(5);
  // fresh inits pull merged truth; C and D write via flush read-merge-write
  await C2.WS.init('ROOM-2222','Cy');await D2.WS.init('ROOM-2222','Di');
  ok(C2.WS.getSet('disc').sort().join()==='X,Y'&&D2.WS.getSet('disc').sort().join()==='X,Y','DB recovers; both devices converge to union X,Y');
  ok(C2.WS.entries().length===2,'journal converged after outage');
  // room isolation
  ok(DB.world_state.every(r=>['ROOM-1111','ROOM-2222'].includes(r.room)),'rows scoped by room');
  // local persistence across reload
  const store=A.store;const A2=client('a2','Alex');Object.assign(A2.store,store);await A2.WS.init('ROOM-1111','Alex');
  ok(A2.WS.getSet('disc').includes('Frost Isle'),'localStorage persistence survives reload');
  // writes before init are ignored, not crashing
  const Z=client('z','Zed');ok(Z.WS.addToSet('disc','Q')===false&&Z.WS.log('place','Q')===false,'pre-init writes are no-ops');
  console.log(fails?('\n'+fails+' FAILED'):'\nALL PASSED');process.exit(fails?1:0);
})();
