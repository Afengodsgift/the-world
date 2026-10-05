// Link: two-player primitives. These exist because the world is for exactly two people; each one
// forces the pair to coordinate, not just "happen to both be there".
//   Link.both({zones:[{x,z,r,y?},...], holdMs, when?, onProgress?(p,occ,dt), onDone})
//        every zone must be occupied at the same moment by DIFFERENT players, held for holdMs.
//        Position-derived on both clients (partner avatar position), so it needs no network traffic.
//   Link.sync({id, windowMs, onPress?(who), onDone})  + Link.press(id)
//        both players must press within windowMs of each other ("on three!"). Uses Net 'ls'.
// Link owns no state and no visuals; the caller persists the outcome (WorldState) and draws it.
// Later primitives (same file): hold (one holds while the other acts), tether (max distance), split (per-client info).
const Link=(()=>{
  const groups=[],syncs=new Map(),taps=new Map();let on=false;
  const now=()=>performance.now();
  const partnerPos=()=>{const o=typeof others!=='undefined'&&others.size?others.values().next().value:null;return o&&o.group?o.group.position:null};
  const partnerHere=()=>typeof others!=='undefined'&&others.size>0;   // these are TWO-player primitives: nothing may complete without a connected partner
  const inZone=(p,z)=>!!p&&Math.hypot(p.x-z.x,p.z-z.z)<z.r&&(z.y===undefined||Math.abs(p.y-z.y)<3);
  function boot(){if(on)return;on=true;Systems.add('link',tick);Net.on('ls',d=>{if(d&&d.id)remote(d.id)})}

  function both(def){boot();const g=Object.assign({t:0,occ:[],done:false,holdMs:1500},def);groups.push(g);return g}
  function tick(dt){
    const pp=partnerPos();
    for(const g of groups){
      if(g.done)continue;
      if(g.when&&!g.when()){g.t=0;continue}
      const me={x:S.x,y:S.y,z:S.z};
      g.occ=g.zones.map(z=>inZone(me,z)?'me':inZone(pp,z)?'them':null);
      const all=!!pp&&g.occ.every(Boolean)&&new Set(g.occ).size===g.zones.length; // a partner must be connected, and distinct people must be on distinct zones
      g.t=all?g.t+dt:Math.max(0,g.t-dt*2);                                  // letting go loses progress twice as fast as it gains
      const p=Math.min(1,g.t/(g.holdMs/1000));
      if(g.onProgress)g.onProgress(p,g.occ,dt);
      if(p>=1){g.done=true;if(g.onDone)g.onDone(g)}
    }
  }

  function sync(def){boot();syncs.set(def.id,Object.assign({windowMs:1500,done:false},def))}
  function evalSync(id){
    const d=syncs.get(id),e=taps.get(id);
    if(!d||d.done||!e||e.me===undefined||e.them===undefined||!partnerHere())return false;
    if(Math.abs(e.me-e.them)<=d.windowMs){d.done=true;taps.delete(id);if(d.onDone)d.onDone();return true}
    return false;
  }
  function press(id){ // local player pressed; returns {done}
    const d=syncs.get(id);if(!d||d.done)return {done:false};
    const e=taps.get(id)||{};e.me=now();taps.set(id,e);Net.emit('ls',{id});
    if(d.onPress)d.onPress('me');
    return {done:evalSync(id)};
  }
  function remote(id){const d=syncs.get(id);if(!d||d.done)return;const e=taps.get(id)||{};e.them=now();taps.set(id,e);if(d.onPress)d.onPress('them');evalSync(id)}
  function rearm(id){const d=syncs.get(id);if(d){d.done=false;taps.delete(id)}}   // used when a completion was refused (no partner)
  return {both,sync,press,rearm,_tick:tick,_groups:groups,_syncs:syncs};
})();
