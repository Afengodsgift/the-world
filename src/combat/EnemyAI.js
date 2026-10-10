// EnemyAI: the pure decision helpers behind the raiders' "brain" (tests/enemyai.sim.js). Outlaw.js owns the state machine; these are the rules it asks about.
//  - waves are sized for the people actually playing (two players -> ~1.75x raiders, a real first wave, more spawn fronts, a higher live cap);
//  - roles: bandits are grunts, flankers (circle round to a side) or riflemen (hold a medium distance); shotgunners rush; snipers perch on high ground;
//  - vision is HEIGHT-AWARE and symmetric with the player's: a raider sees you if its eye has a clear line (over low cover) to your head or chest, so a crate
//    protects you from a crouched raider but not from a standing one whose head clears it; crouching behind cover hides a raider the same way;
//  - melee needs real contact: a brute cannot hit a player flying above it (vertical reach 2.6 m).
const EnemyAI=(()=>{
  const EYE={stand:1.3,crouch:.8},HEADY=1.55,CHESTY=1.0,MELEE_DY=2.6;
  const FLOOR=[0,6,8,9];   // opening waves are never thin: 6, 8, 9 raiders solo (x1.75 for two players)
  const waveSize=(wave,np,cnt)=>Math.round(Math.max(FLOOR[wave]||0,Math.min(2+wave*1.9,22))*cnt*(np>1?1.75:1));
  const liveCap=(diff,np)=>8+diff*3+(np>1?5:0);
  const frontsFor=(wave,np)=>wave+(np>1?2:0);
  const wavePool=(wave,np)=>{const p=np>1?[0,0,0,5]:[0,0,0];if(wave>=2)p.push(1,5);if(wave>=3)p.push(0,5);if(wave>=4)p.push(2,4);if(wave>=5)p.push(4,1,6);if(wave>=7)p.push(2,5,6);return p};
  function role(type,r){if(type===0)return r<.35?'flanker':r<.65?'rifle':'grunt';if(type===5)return 'rusher';if(type===2)return 'sniper';return 'grunt'}
  const meleeReach=(d,dyFeet,range)=>d<range&&Math.abs(dyFeet)<MELEE_DY;
  // can a raider at (ex,gy,ez) (stance 'stand'|'crouch') see a player standing at (tx,tfeetY,tz)? -> the height of the part it can see (head/chest), or 0
  function sees(cover,ex,gy,ez,stance,tx,tfeetY,tz){
    const o={x:ex,y:gy+EYE[stance||'stand'],z:ez};
    for(const hy of [HEADY,CHESTY]){const dx=tx-o.x,dz=tz-o.z,dy=tfeetY+hy-o.y,L=Math.hypot(dx,dy,dz)||1,d={x:dx/L,y:dy/L,z:dz/L};
      if(HitZones.coverT(o,d,L-.05,cover).c===null)return hy}
    return 0}
  return {waveSize,liveCap,frontsFor,wavePool,role,meleeReach,sees,EYE,MELEE_DY};
})();
