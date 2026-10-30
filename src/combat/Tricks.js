// WARDEN: boss tricks for the two hunters - pure numbers + layout (no THREE / DOM), shared by both co-op clients.
//   Vael, the Crimson Duelist  - BLINK: he dissolves into red mist, a ring on the ground shows where he will reappear (locked 20 ticks before he does), he appears BEHIND whoever he hunts and cuts at once
//                                (the cut keeps its normal >= 20 tick tell: the ring is the warning, dodging through the cut is the answer). Every hit that lands HEALS him (a share of the damage, capped per fight).
//   Skrag, the Snare-Trapper   - SNARES: he lays glowing traps near you. They arm after a moment and wait. Step on one and it bites (a share of your health, never lethal) and roots you,
//                                which is exactly when his heavy bolt comes. A dodge roll through an armed snare springs it harmlessly.
// Co-op: the host decides (seed + target spot) and tells the guest; both clients build identical traps / spots and each player judges only their own feet.
const Tricks=(()=>{
  const BLINK={WIND:26,LOCK:6,BEHIND:1.8,HIDE:8,CD:[330,220]};              // ticks: windup, the tick the destination locks, ticks before he is hidden, cooldown (phase 1, phase 2)
  const LEECH={k:.6,cap:.4};                                                  // share of damage dealt that heals him, and the most he can drink in one fight (fraction of his max health)
  const SNARE={R:1.1,ARM:1.0,LIFE:16,DMG:.12,STUN:42,MAX:6,CD:[480,330],NEAR:[2.6,5.8],SEP:2}; // radius m, arm time s, life s, share of the victim's max health, root ticks, traps alive at once, cooldown ticks, ring around the target
  function rng(seed){let a=seed|0;return()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
  const heal=(dmg,done,hpMax)=>Math.max(0,Math.min(dmg*LEECH.k,hpMax*LEECH.cap-done));
  // where Vael lands: behind the target (target faces `face`), kept inside the arena
  function blinkSpot(tx,tz,face,arena){let x=tx-Math.sin(face)*BLINK.BEHIND,z=tz-Math.cos(face)*BLINK.BEHIND;
    if(arena){const dx=x-arena.x,dz=z-arena.z,d=Math.hypot(dx,dz),lim=arena.R-1;if(d>lim){x=arena.x+dx/d*lim;z=arena.z+dz/d*lim}}return{x,z}}
  const count=(ph2,co)=>(ph2?4:3)+(co?1:0);
  // traps scatter on a ring around the target (never on top of them), spread apart, inside the arena
  function snareLayout(seed,n,px,pz,arena){const r=rng(seed),out=[],a0=r()*Math.PI*2;
    for(let i=0;i<n;i++){let best=null;
      for(let k=0;k<8&&!best;k++){const a=a0+i/n*Math.PI*2+(r()-.5)*.9,d=SNARE.NEAR[0]+r()*(SNARE.NEAR[1]-SNARE.NEAR[0]);let x=px+Math.sin(a)*d,z=pz+Math.cos(a)*d;
        if(arena){const dx=x-arena.x,dz=z-arena.z,L=Math.hypot(dx,dz),lim=arena.R-1.4;if(L>lim){x=arena.x+dx/L*lim;z=arena.z+dz/L*lim}}
        if(out.every(o=>Math.hypot(o.x-x,o.z-z)>=SNARE.SEP)&&Math.hypot(x-px,z-pz)>=SNARE.NEAR[0]-.4)best={x,z}}
      if(best)out.push(best)}
    return out}
  const armed=(age)=>age>=SNARE.ARM;
  // does a player standing at (x,z) spring this trap? 'dodge' = the player is inside the roll's i-frames (the trap is sprung harmlessly)
  const touch=(t,x,z,dodge,age)=>armed(age)&&Math.hypot(t.x-x,t.z-z)<=SNARE.R?(dodge?'rolled':'bite'):null;
  const bite=hpMax=>hpMax*SNARE.DMG;
  // THE THREE OATHS: only one boss may START a signature attack at a time. A foe is 'busy' while it is inside a signature move and for GAP ticks after it ends; everyone else is locked out meanwhile.
  const SIG={verdict:1,groundbreaker:1,requiem:1,consecrate:1,procession:1},GAP=50;
  const sigBusy=(list,selfId)=>{for(const o of list)if(o.id!==selfId&&o.alive&&(o.gap>0||o.act==='attack'&&o.mv&&SIG[o.mv]))return true;return false};
  return{BLINK,LEECH,SNARE,SIG,GAP,sigBusy,rng,heal,blinkSpot,count,snareLayout,armed,touch,bite}})();
if(typeof module!=='undefined')module.exports=Tricks;
