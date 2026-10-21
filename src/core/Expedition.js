// EXPEDITION MODE: activity-scoped suspension of world systems that cannot matter while you are inside a Warden Isles fight site (you are on land, thousands of metres from the sea, the other islands and their mini-games).
// NOT a global pause: the sim, rendering, weather/sky/ambience, networking (presence, co-op, duels), other players and the Warden Isles themselves keep running. Only systems on the SUSP list are skipped, and only while a hold exists.
//   Expedition.update(holding)  once per frame: holding = the player is in a Warden fight site (PlayerCombat.on()). Other scopes (a future dungeon) use hold(key)/release(key).
//   Expedition.skip(name)       true = skip that system's tick THIS frame (counts it). No catch-up on resume: every suspended tick is dt-driven with capped dt, so resuming never double-fires a timer.
//   ?expedition=0 turns the whole thing off (the A/B switch used for measuring).
// Audited suspendable systems (see docs in the PR): 'sea' (SeaLife.seaTick: ~2000 fish / sharks / sea animals; the profile's biggest per-frame cost at sea) and 'outlaw' (Outlaw.tick while no Outlaw match is active).
const Expedition=(()=>{
  const SUSP={sea:1,outlaw:1},holds=new Set(),st={on:false,frames:0,onFrames:0,resumes:0,sinceMs:0,skipped:{}},hooks=[];
  let enabled=true;try{enabled=!/[?&]expedition=0(&|$)/.test(location.search)}catch(e){}
  const active=()=>enabled&&(st.fight||holds.size>0);
  function update(fight,now){st.fight=!!fight;const on=active();st.frames++;
    if(on&&!st.on){st.on=true;st.sinceMs=now||0}
    else if(!on&&st.on){st.on=false;st.resumes++;for(const h of hooks.slice()){try{h()}catch(e){}}}   // resume exactly once per leave
    if(st.on)st.onFrames++;return st.on}
  function skip(name){if(!st.on||!SUSP[name])return false;st.skipped[name]=(st.skipped[name]||0)+1;return true}
  const hold=k=>{holds.add(k)},release=k=>{holds.delete(k)};
  const onResume=f=>{hooks.push(f)};
  const setEnabled=v=>{enabled=!!v};
  return{update,skip,hold,release,onResume,setEnabled,on:()=>st.on,SUSP:Object.keys(SUSP),stats:()=>({on:st.on,frames:st.frames,onFrames:st.onFrames,resumes:st.resumes,skipped:Object.assign({},st.skipped),enabled})}})();
if(typeof module!=='undefined')module.exports=Expedition;
