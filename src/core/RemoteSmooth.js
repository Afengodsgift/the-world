// RemoteSmooth: makes other players move smoothly from 10 Hz position snapshots.
// Before: the avatar chased the LAST snapshot with an exponential lerp, so it always lagged ~80 ms behind and advanced in 10 Hz steps.
// Now: each snapshot also updates a velocity estimate (blended to damp network jitter) and the chase target is dead-reckoned forward by up to
// 0.18 s (incl. a 30 ms lead that cancels typical network latency), so the avatar keeps moving between packets at the right speed. Big jumps (travel / teleport) snap; airborne states extrapolate y but never below ground.
const RemoteSmooth=(()=>{
  const MAXEX=.18,LEAD=.03,MAXV=100,cl=(v,k)=>{const m=MAXV*(k||1);return v>m?m:v<-m?-m:v};
  function snap(o,p,now){
    if(o.sT!==undefined){const dt=(now-o.sT)/1000,k=typeof SpaceFlight!=='undefined'?(SpaceFlight.moveMulRaw||SpaceFlight.moveMul)(p.y,Math.hypot(p.x,p.z)):1;   // up high everything moves k times faster
      if(Math.hypot(p.x-o.sx,p.z-o.sz)>40*k||Math.abs(p.y-o.sy)>40*k){o.vx=o.vy=o.vz=0;if(o.group)o.group.position.set(p.x,p.y,p.z)}   // travel / teleport: snap
      else if(dt>.02&&dt<.8){o.vx=(o.vx||0)*.5+cl((p.x-o.sx)/dt,k)*.5;o.vy=(o.vy||0)*.5+cl((p.y-o.sy)/dt,k)*.5;o.vz=(o.vz||0)*.5+cl((p.z-o.sz)/dt,k)*.5}
      else if(dt>=.8){o.vx=o.vy=o.vz=0}}                                                                                          // very late packet: don't trust old velocity
    o.sx=p.x;o.sy=p.y;o.sz=p.z;o.sT=now;o.tx=p.x;o.ty=p.y;o.tz=p.z;o.tr=p.r;
  }
  // call every frame before moving the avatar toward o.tx/ty/tz
  function target(o,now,H){
    if(o.sT===undefined)return;
    const ex=Math.min(MAXEX,Math.max(0,(now-o.sT)/1000)+LEAD),air=o.st==='fly'||o.st==='jump'||o.st==='fall';
    o.tx=o.sx+(o.vx||0)*ex;o.tz=o.sz+(o.vz||0)*ex;
    o.ty=air?Math.max(H(o.tx,o.tz),o.sy+(o.vy||0)*ex):o.sy;
  }
  return {snap,target};
})();
