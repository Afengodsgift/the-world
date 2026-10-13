// EnemyAI: the pure decision helpers behind the raiders' "brain" (tests/enemyai.sim.js). Outlaw.js owns the state machine; these are the rules it asks about.
//  - waves are sized for the people actually playing (two players -> ~1.75x raiders, a real first wave, more spawn fronts, a higher live cap);
//  - roles: grunts, riflemen (hold a band, cover, peek, relocate), suppressors (pin you under fire), flankers (one coordinated side route, only while the squad is engaged), aggressors (push when you reload / are low / partner down), shotgunners rush cover to cover, marksmen perch on high ground; the Heavy is a tactical threat (see heavyArmor);
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
  // bandits: 20% flankers, 25% riflemen, 17% suppressors, 18% aggressors, 20% grunts; shotgunners are rushers (bound cover to cover into close range); snipers are marksmen
  function role(type,r){if(type===0)return r<.2?'flanker':r<.45?'rifle':r<.62?'suppress':r<.8?'aggr':'grunt';if(type===5)return 'rusher';if(type===2)return 'sniper';return 'grunt'}
  // preferred firing band [near, far] in metres per role
  const BAND={rifle:[20,30],suppress:[24,32],grunt:[13,22],flanker:[10,18],rusher:[7,13],aggr:[8,14],sniper:[34,60],bomber:[18,30]};
  const bandOf=role=>BAND[role]||BAND.grunt;
  // THE HEAVY: damage multiplier from where the shot comes from. fy = its facing yaw, (sx,sz) = vector from the heavy to the shooter. Strong frontal plating, weak rear, extra damage while it vents.
  function heavyArmor(fy,sx,sz,venting){const l=Math.hypot(sx,sz)||1,dot=(Math.sin(fy)*sx+Math.cos(fy)*sz)/l;let m=dot>.5?.35:dot<-.5?1.5:1;if(venting)m*=1.6;return m}
  // a route point to one side of where the raider believes you are (+-55..80 deg off the line back to it), on land; no circling: it is chosen once
  function flankPoint(anchor,self,side,dist,isLand){
    const ax=self.x-anchor.x,az=self.z-anchor.z,l=Math.hypot(ax,az)||1,bx=ax/l,bz=az/l;
    for(const ang of [1.25,1.1,.95,1.4]){const a=side*ang,c=Math.cos(a),s=Math.sin(a),x=anchor.x+(bx*c-bz*s)*dist,z=anchor.z+(bx*s+bz*c)*dist;if(isLand(x,z))return {x,z}}
    return null}
  // aggressors push when you are vulnerable: reloading, your partner is down, you are low on health (or the squad has been stalemated)
  const shouldPush=o=>!!(o.reloading||o.partnerDown||o.lowHp||o.stalemate);
  // relocate when it keeps getting hit where it stands (>22% of its health recently) or you got too close for its role
  const relocateNeeded=(recent,maxHp,dist,near)=>recent>maxHp*.22||dist<near*.55;
  const meleeReach=(d,dyFeet,range)=>d<range&&Math.abs(dyFeet)<MELEE_DY;
  // can a raider at (ex,gy,ez) (stance 'stand'|'crouch') see a player standing at (tx,tfeetY,tz)? -> the height of the part it can see (head/chest), or 0
  function sees(cover,ex,gy,ez,stance,tx,tfeetY,tz){
    const o={x:ex,y:gy+EYE[stance||'stand'],z:ez};
    for(const hy of [HEADY,CHESTY]){const dx=tx-o.x,dz=tz-o.z,dy=tfeetY+hy-o.y,L=Math.hypot(dx,dy,dz)||1,d={x:dx/L,y:dy/L,z:dz/L};
      if(HitZones.coverT(o,d,L-.05,cover).c===null)return hy}
    return 0}
  return {waveSize,liveCap,frontsFor,wavePool,role,bandOf,heavyArmor,flankPoint,shouldPush,relocateNeeded,meleeReach,sees,EYE,MELEE_DY};
})();
