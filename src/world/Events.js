// Events: the Event Director. The world "just does things" - but never as a random notification.
//   event = f(roomSeed, timeSlot): both phones compute the SAME schedule from the room seed and the
//   clock, so scheduling needs zero network traffic. Only what players DO (collect, talk, finish)
//   is written to WorldState and shared. A new event type is one file in src/world/events/ that calls
//   Events.define(type, {spawn, tick, end, aftermath?, pos}).
// Telegraphing is physical (beams, streaks, lanterns). When one of you gets close you "notice" it:
//   one banner, a map pin, and your partner is told over Net ('evn').
// Evidence persists: types with aftermath() get rebuilt (e.g. craters) from past slots on load.
// Clock caveat: uses each device's clock (NTP keeps phones within seconds; events just start a few
//   seconds apart). Events._setClock() lets tests/dev override it.
// Dev: open the game with ?ev=meteor | visitor | rings to force one next to you.
// Globals: S, me, others, scene, H, ISL, roomCode, banner, chime, Net, WS, Systems, Fx, Sites, EVENTS, hashSeed, mulberry.
const Events=(()=>{
  const CFG=EVENTS,types={},sched=new Map(),inst=new Map(),pending=new Set(); // pending: ids noticed by partner before we spawned
  let clock=()=>Date.now(),started=false,forced=null,perm=null;
  const safe=f=>{try{return f()}catch(e){return false}};

  function define(type,impl){types[type]=impl}

  // ---- schedule: pure function of (room, slot) ---------------------------------------------
  function schedule(slot){
    const r=mulberry(hashSeed(roomCode+':ev:'+slot));
    if(r()>CFG.chance)return null;
    const names=Object.keys(CFG.types).filter(k=>types[k]),tot=names.reduce((s,k)=>s+CFG.types[k].w,0);
    if(!names.length)return null;
    let t=r()*tot,type=names[0];for(const k of names){t-=CFG.types[k].w;if(t<=0){type=k;break}}
    const C=CFG.types[type],start=slot*CFG.slotMs+Math.floor(r()*CFG.startMaxMs),life=Math.floor((C.life[0]+r()*(C.life[1]-C.life[0]))*60000);
    return {id:'ev:'+slot,slot,type,start,end:start+life,seed:hashSeed(roomCode+':evs:'+slot)};
  }
  const slotOf=ms=>Math.floor(ms/CFG.slotMs);
  const current=slot=>{let e=sched.get(slot);if(e===undefined){e=schedule(slot);sched.set(slot,e)}return e};

  // ---- helpers for event types --------------------------------------------------------------
  const rng=(ev,salt)=>mulberry(hashSeed(ev.id+':'+salt));
  function site(ev,o){ // deterministic spot: 40% main island, else a random outer island (never Outlaw); falls back so an event is never silently lost
    if(ev.dev&&ev.at)return Object.assign({},ev.at,{name:'here'});
    const r=rng(ev,'site'),isl=ISL.filter(i=>!i.ded),main={n:'the main island',x:0,z:0,R:190};
    const first=(ev.dev||r()<.4)?main:isl[Math.floor(r()*isl.length)];
    const order=[first,main,...isl].filter((b,i,a)=>a.indexOf(b)===i);   // chosen island, then main, then the rest: same order on both phones
    for(let i=0;i<order.length;i++){
      const b=order[i];
      const st=Sites.find({tag:'ev',key:ev.id+':'+i,temp:true,name:b.n,cx:b.x,cz:b.z,rmin:o.rmin||0,rmax:Math.min(o.rmax||170,b.R*.7),clear:o.clear||8,sep:12});
      if(st)return Object.assign(st,{name:b.n});
    }
    return null;
  }
  function permanent(){if(!perm){perm=new THREE.Group();scene.add(perm)}return perm} // evidence that outlives an event (craters)

  // ---- lifecycle ---------------------------------------------------------------------------
  function spawn(ev){
    const def=types[ev.type];if(!def)return;
    if(def.needs==='both'&&!(others&&others.size))return;           // wait for your partner
    const st=safe(()=>def.spawn(ev));
    inst.set(ev.id,{ev,def,st:st||null,noticed:pending.has(ev.id),dead:!st});
  }
  function endEvent(I){if(!I.dead)safe(()=>I.def.end&&I.def.end(I.ev,I.st));inst.delete(I.ev.id)}
  function posOf(I){return I.st&&I.def.pos?I.def.pos(I.ev,I.st):null}

  function frame(dt,t){
    if(!started||!S||!me)return;
    const now=clock(),ev=current(slotOf(now));
    const live=[];if(ev&&now>=ev.start&&now<ev.end)live.push(ev);if(forced&&now<forced.end)live.push(forced);
    for(const e of live)if(!inst.has(e.id))spawn(e);
    for(const I of [...inst.values()]){
      if(now>=I.ev.end){endEvent(I);continue}
      if(I.dead)continue;
      try{I.def.tick(I.ev,I.st,dt,t,now)}catch(err){if(!I.err){I.err=1;console.error('[Events] '+I.ev.type+' tick failed',err)}}
      const p=posOf(I);
      if(p&&!I.noticed&&Math.hypot(S.x-p.x,S.z-p.z)<CFG.noticeR){
        I.noticed=true;const C=CFG.types[I.ev.type];banner(C.notice,C.icon+' '+C.name.toUpperCase());Net.emit('evn',{id:I.ev.id});
      }
    }
  }

  function start(){
    if(started)return;started=true;
    Systems.add('events',frame);
    Net.on('evn',d=>{if(!d||!d.id)return;pending.add(d.id);const I=inst.get(d.id);if(I)I.noticed=true});
    const slot=slotOf(clock()),n0=clock();             // rebuild evidence of events that already ended (this slot included); live ones spawn normally
    for(let k=0;k<=CFG.aftermathSlots;k++){const e=schedule(slot-k),d=e&&types[e.type];if(d&&d.aftermath&&e.end<=n0)safe(()=>d.aftermath(e))}
    safe(()=>{const q=new URLSearchParams(location.search).get('ev');if(q)setTimeout(()=>force(q),2500)});
  }
  function force(type){ // dev/testing: an event next to the player, local to this device (shared outcomes still sync)
    if(!types[type]||!S)return false;
    const a=S.rot||0,x=S.x+Math.sin(a)*35,z=S.z+Math.cos(a)*35,n=clock();
    forced={id:'dev:'+type+':'+n,slot:-1,type,start:n,end:n+5*60000,seed:hashSeed('dev'+n),dev:true,at:{x,z,y:H(x,z),ry:0}};
    return forced.id;
  }
  const places=()=>[...inst.values()].filter(I=>I.noticed&&!I.dead&&posOf(I)).map(I=>{const p=posOf(I),C=CFG.types[I.ev.type];return {n:C.name,x:p.x,z:p.z,y:p.y,r:12,icon:C.icon}});
  const status=()=>{const n=clock(),e=current(slotOf(n));return {now:n,slot:slotOf(n),event:e,live:[...inst.keys()],next:e&&n<e.start?e:current(slotOf(n)+1)}};
  return {define,start,force,places,status,schedule,site,rng,permanent,
    now:()=>clock(),types:()=>types,instances:()=>inst,_frame:frame,_setClock:f=>{clock=f;sched.clear()}};
})();
