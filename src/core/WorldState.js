// WorldState (WS): the world's shared memory for the two players.
//  - local copy in localStorage ('w4ws:<room>') so it works offline / before Supabase answers
//  - durable copy in Supabase (tables world_state + world_log, see supabase/001_world_memory.sql)
//  - live updates to the partner over Net ('ws' op)
// Every write is CONVERGENT, so two phones can never overwrite each other's progress:
//   sets  -> union      (discoveries, collected shards)
//   nums  -> max        (treasure count)
//   log   -> insert once per (kind,key)  (the Journal)
// Anything that fails (offline, table missing) is swallowed: the game keeps working off
// the local copy and retries on the next flush.
const WS=(()=>{
  let room=null,who='Player',ok=false,data={},log=[],logKeys=new Set(),dirty=new Set(),logQ=[],ft=0;
  const listeners=[];
  const LS=()=>'w4ws:'+room;
  const isSet=k=>Array.isArray(data[k]);

  function merge(a,b){ // convergent merge of two values for one key
    if(a===undefined)return b;if(b===undefined)return a;
    if(Array.isArray(a)&&Array.isArray(b)){const s=new Set(a);for(const x of b)s.add(x);return [...s]}
    if(typeof a==='number'&&typeof b==='number')return Math.max(a,b);
    return b;
  }
  function saveLocal(){try{localStorage.setItem(LS(),JSON.stringify({s:data,l:log}))}catch(e){}}
  function loadLocal(){try{const v=JSON.parse(localStorage.getItem(LS())||'{}');data=v.s||{};log=v.l||[];logKeys=new Set(log.map(e=>e.kind+':'+e.key))}catch(e){}}
  function fire(k,fromRemote){for(const f of listeners){try{f(k,data[k],fromRemote)}catch(e){console.error(e)}}}

  function applyRemoteKey(k,v){ // merge a value that came from the partner or the DB
    const m=merge(data[k],v===undefined?v:JSON.parse(JSON.stringify(v))); // copy: never alias another client's object
    const changed=JSON.stringify(m)!==JSON.stringify(data[k]);
    data[k]=m;return changed;
  }
  function addLogEntry(e,notify){
    const id=e.kind+':'+e.key;if(logKeys.has(id))return false;
    logKeys.add(id);log.push(e);log.sort((a,b)=>a.ts-b.ts);if(notify)fire('log:'+e.kind,true);return true;
  }

  // ---- public API -------------------------------------------------------
  function get(k,def){return data[k]===undefined?def:data[k]}
  function getSet(k){return isSet(k)?data[k]:[]}
  function hasInSet(k,x){return isSet(k)&&data[k].includes(x)}
  function touch(k){if(!room)return;dirty.add(k);saveLocal();Net.emit('ws',{k,v:data[k]});schedule()}
  function set(k,v){data[k]=v;touch(k);fire(k,false)}
  function addToSet(k,x){ // true if x was new
    if(!room)return false;
    if(!isSet(k))data[k]=[];if(data[k].includes(x))return false;
    data[k].push(x);touch(k);fire(k,false);return true;
  }
  function max(k,n){if(typeof n!=='number'||(typeof data[k]==='number'&&data[k]>=n))return false;data[k]=n;touch(k);fire(k,false);return true}
  function logEvent(kind,key,d){ // idempotent journal entry; first writer wins
    if(!room)return false;
    const e={ts:Date.now(),kind,key:String(key),by:who,data:d||null};
    if(!addLogEntry(e,false))return false;
    logQ.push(e);saveLocal();Net.emit('ws',{log:e});schedule();fire('log:'+kind,false);return true;
  }
  const entries=()=>log.slice();
  const onChange=f=>listeners.push(f);
  const ready=()=>ok;

  // ---- remote -----------------------------------------------------------
  function schedule(){if(ft)return;ft=setTimeout(flush,1500)}
  async function flush(){
    ft=0;if(typeof sb==='undefined'||!room)return;
    try{
      if(dirty.size){
        const keys=[...dirty],{data:rows,error:e1}=await sb.from('world_state').select('key,value').eq('room',room).in('key',keys);
        if(e1)throw e1;
        for(const r of rows||[])applyRemoteKey(r.key,r.value); // fold in anything the partner wrote meanwhile
        const up=keys.map(k=>({room,key:k,value:data[k],updated_at:new Date().toISOString()}));
        const {error:e2}=await sb.from('world_state').upsert(up,{onConflict:'room,key'});
        if(e2)throw e2;
        for(const k of keys)dirty.delete(k);
        saveLocal();
      }
      if(logQ.length){
        const batch=logQ.slice(),rows=batch.map(e=>({room,ts:new Date(e.ts).toISOString(),kind:e.kind,key:e.key,by_name:e.by,data:e.data}));
        const {error}=await sb.from('world_log').upsert(rows,{onConflict:'room,kind,key',ignoreDuplicates:true});
        if(error)throw error;
        logQ=logQ.filter(e=>!batch.includes(e));
      }
    }catch(e){console.warn('WS flush failed, will retry',e&&e.message||e);if(dirty.size||logQ.length){setTimeout(()=>{ft=0;schedule()},15000)}}
  }
  async function pull(){
    if(typeof sb==='undefined')return;
    const [s,l]=await Promise.all([
      sb.from('world_state').select('key,value').eq('room',room),
      sb.from('world_log').select('ts,kind,key,by_name,data').eq('room',room).order('ts')]);
    if(s.error)throw s.error;if(l.error)throw l.error;
    for(const r of s.data||[])if(applyRemoteKey(r.key,r.value))dirty.add(r.key); // local was behind or ahead: re-upload merged
    for(const r of l.data||[])addLogEntry({ts:Date.parse(r.ts),kind:r.kind,key:r.key,by:r.by_name,data:r.data},false);
    // anything we have that the DB lacks gets uploaded too
    const have=new Set((l.data||[]).map(r=>r.kind+':'+r.key));
    for(const e of log)if(!have.has(e.kind+':'+e.key)&&!logQ.includes(e))logQ.push(e);
  }

  function retryPull(){ // keep trying quietly until the DB answers once; flush() is safe meanwhile (read-merge-write)
    setTimeout(async()=>{try{await pull();saveLocal();fire('*',true);if(dirty.size||logQ.length)schedule()}catch(e){retryPull()}},20000)}
  async function init(roomCode,name){
    room=roomCode;who=name||'Player';loadLocal();ok=true;
    Net.on('ws',(d,from)=>{
      if(!d)return;
      if(d.k!==undefined&&applyRemoteKey(d.k,d.v)){saveLocal();fire(d.k,true)}
      if(d.log&&addLogEntry(d.log,true))saveLocal();
    });
    try{await pull()}catch(e){console.warn('WS: offline, playing from local copy (',e&&e.message||e,')');retryPull()}
    saveLocal();if(dirty.size||logQ.length)schedule();
    return true;
  }
  return {init,get,set,getSet,hasInSet,addToSet,max,log:logEvent,entries,onChange,ready,flush,_merge:merge};
})();
