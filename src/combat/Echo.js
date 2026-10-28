// WARDEN: Hollow Echo - pure numbers + layout for Ganfaul's set piece (no THREE / DOM).
// The Hollow Knight vanishes and the arena fills with copies of him. ONE is real. The real one grounds a dark pool under his feet; the echoes float without one (and, when the time runs out, they lunge
// at empty air while the real one lunges at YOU). Strike the real one and he reels; strike an echo and it shatters and bites you back a little. Everything is derived from one seed, so in co-op both
// clients build the identical arena and each player judges only their own hits (see PlayerCombat.js: startEcho / echoTick).
const Echo=(()=>{
  const THRESH=[.7,.35],       // boss health fractions that trigger the 1st / 2nd echo
    REVEAL=1.3,                // seconds the copies take to appear (nobody can be hurt yet)
    BACKLASH=.06,              // fraction of YOUR max health a false echo costs you (never lethal)
    STRIKE_WAIT=1.8;           // seconds from the lunge command until the set piece is over
  const stage=frac=>frac<=THRESH[1]?2:frac<=THRESH[0]?1:0;
  const count=(st,co)=>(st>=2?4:3)+(co?1:0);                 // bodies in the room, the real one included (<= 5: bounded for phones)
  const searchTime=(st,co)=>(st>=2?7:9)+(co?1.5:0);          // seconds you have to find him
  function rng(seed){let a=seed|0;return()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
  // the copies stand on a ring around (cx,cz); the players stand near the centre, so nobody ever spawns on a player. `roles` says whose side each copy is on (h = host, g = guest) for the final lunge.
  function layout(seed,n,ring,cx,cz,co){
    const r=rng(seed),a0=r()*Math.PI*2,pos=[];
    for(let i=0;i<n;i++){const a=a0+i/n*Math.PI*2+(r()-.5)*.25,rr=ring*(.92+.16*r());pos.push({x:cx+Math.sin(a)*rr,z:cz+Math.cos(a)*rr,a})}
    const real=Math.floor(r()*n);
    return{a0,pos,real,roles:pos.map((_,i)=>co&&i%2?'g':'h')}}
  return{THRESH,REVEAL,BACKLASH,STRIKE_WAIT,stage,count,searchTime,rng,layout}})();
if(typeof module!=='undefined')module.exports=Echo;
