// WARDEN: CineCam - short scripted camera shots for boss moments (intro on waking, death). Pure camera + two letterbox bars + an input lock; it never touches the sim except that PlayerCombat may freeze the
// sim while a shot plays (frozen()), so nobody gets hurt during a cutscene. States: idle -> playing -> blending_out (0.5 s ease back to the normal rig camera) -> idle. Any tap / key skips. A boss intro you
// have already seen (this browser) is skipped. Shots are keyframed RELATIVE to the subject (its position, the direction from it toward the player, its height), so they work wherever the boss stands.
// Globals used: THREE, camera, H, keys, stickV. Host calls CineCam.apply(dt) right AFTER CameraRig.update(dt) every frame.
const CineCam=(()=>{
  let st='idle',t=0,pre=null,sub=null,bar=null,hint=null,blend=1,onEnd=null;const seen={};
  const TMP=new THREE.Vector3(),LA=new THREE.Vector3(),Q0=new THREE.Quaternion(),Q1=new THREE.Quaternion(),M=new THREE.Matrix4(),UP=new THREE.Vector3(0,1,0),RIG={p:new THREE.Vector3(),q:new THREE.Quaternion(),f:65};
  const ease=u=>u*u*(3-2*u),mix=(a,b,u)=>a+(b-a)*u,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  try{const j=JSON.parse(localStorage.getItem('wcine')||'{}');for(const k in j)seen[k]=1}catch(e){}
  // preset = {dur, lock, shots:[{t0,t1, a0,a1 (orbit angle from the subject->player direction), d0,d1 (distance m), h0,h1 (camera height as a fraction of subject height), f0,f1 (fov), l0,l1 (look height fraction)}]}
  const PRE={
    intro:{dur:2.9,freeze:true,shots:[
      {t0:0,t1:1.6,a0:1.15,a1:.55,d0:8,d1:5.6,h0:.2,h1:.45,f0:58,f1:50,l0:.55,l1:.7},
      {t0:1.6,t1:2.9,a0:.18,a1:-.1,d0:3.4,d1:2.7,h0:.85,h1:.92,f0:42,f1:36,l0:.9,l1:.92}]},
    death:{dur:2.6,freeze:false,shots:[
      {t0:0,t1:2.6,a0:-.4,a1:.9,d0:6,d1:8,h0:.35,h1:.8,f0:48,f1:56,l0:.35,l1:.25}]}};
  function dom(){
    if(bar)return;bar=document.createElement('div');bar.id='cineBars';
    bar.style.cssText='position:fixed;inset:0;z-index:45;pointer-events:none;display:none';
    bar.innerHTML='<div style="position:absolute;left:0;right:0;top:0;height:0;background:#000;transition:height .35s"></div><div style="position:absolute;left:0;right:0;bottom:0;height:0;background:#000;transition:height .35s"></div><div id="cineHint" style="position:absolute;right:14px;bottom:10px;color:#fff9;font:600 11px system-ui,sans-serif;letter-spacing:.1em;opacity:0">TAP TO SKIP</div>';
    document.body.appendChild(bar);hint=bar.querySelector('#cineHint');
    const skip=e=>{if(st==='playing'){e.stopPropagation&&e.stopPropagation();end()}};
    addEventListener('pointerdown',skip,true);addEventListener('keydown',e=>{if(st==='playing'&&(e.code==='Space'||e.code==='Enter'||e.code==='Escape'))end()},true)}
  function bars(on){dom();bar.style.display=on||st!=='idle'?'block':'none';const h=on?Math.round(innerHeight*.11)+'px':'0';bar.children[0].style.height=h;bar.children[1].style.height=h;hint.style.opacity=on?1:0}
  function play(kind,subject,o){
    o=o||{};const p=PRE[kind];if(!p||st!=='idle')return false;
    const key=kind+':'+(o.id||'');if(kind==='intro'&&o.id&&seen[key]&&!o.force)return false;   // seen it: no repeat
    if(o.id){seen[key]=1;try{localStorage.setItem('wcine',JSON.stringify(seen))}catch(e){}}
    sub=subject;pre=p;t=0;st='playing';onEnd=o.done||null;blend=1;bars(true);return true}
  function end(){if(st!=='playing')return;st='blending_out';blend=1;bars(false);const f=onEnd;onEnd=null;if(f)try{f()}catch(e){}}
  function shot(){for(const s of pre.shots)if(t>=s.t0&&t<=s.t1)return s;return pre.shots[pre.shots.length-1]}
  function apply(dt){
    if(st==='idle')return;
    if(st==='playing'){t+=dt;if(t>=pre.dur){end()}
      if(typeof stickV!=='undefined'){stickV.x=0;stickV.y=0}if(typeof keys!=='undefined')for(const k of['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'])keys[k]=false}
    else{blend-=dt/.5;if(blend<=0){st='idle';blend=0;bar.style.display='none';sub=null;return}}
    // the rig's own pose for this frame (to blend back into)
    RIG.p.copy(camera.position);RIG.q.copy(camera.quaternion);RIG.f=camera.fov;
    const s=shot(),u=ease(clamp((Math.min(t,pre.dur)-s.t0)/Math.max(.01,s.t1-s.t0),0,1));
    const sx=typeof sub.x==='function'?sub.x():sub.x,sz=typeof sub.z==='function'?sub.z():sub.z,sh=sub.h||2,gy=H(sx,sz);
    const px=typeof S!=='undefined'?S.x:sx,pz=typeof S!=='undefined'?S.z:sz,base=Math.atan2(px-sx,pz-sz),a=base+mix(s.a0,s.a1,u),d=mix(s.d0,s.d1,u)*(sub.sc||1);
    TMP.set(sx+Math.sin(a)*d,gy+sh*mix(s.h0,s.h1,u),sz+Math.cos(a)*d);
    const cg=H(TMP.x,TMP.z)+.6;if(TMP.y<cg)TMP.y=cg;
    LA.set(sx,gy+sh*mix(s.l0,s.l1,u),sz);M.lookAt(TMP,LA,UP);Q1.setFromRotationMatrix(M);
    const w=st==='playing'?1:ease(clamp(blend,0,1));
    camera.position.lerpVectors(RIG.p,TMP,w);camera.quaternion.slerpQuaternions(RIG.q,Q1,w);
    const f=mix(RIG.f,mix(s.f0,s.f1,u),w);if(Math.abs(camera.fov-f)>.05){camera.fov=f;camera.updateProjectionMatrix()}}
  return{play,apply,skip:end,isActive:()=>st==='playing',busy:()=>st!=='idle',frozen:()=>st==='playing'&&!!pre.freeze,PRESETS:PRE,_seen:seen}})();
if(typeof module!=='undefined')module.exports=CineCam;
