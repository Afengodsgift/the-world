// KitNPC: enemy bodies that are NOT the town avatar: KayKit Adventurers / Skeletons (CC0, assets/kit/*.glb) with their own rig and one shared animation set (assets/kit/anims.glb).
// Meshes are mesh-only (weapons removed); every character plays the same clips (same bone names), so a new enemy = one small .glb.
//   KitNPC.make(name,{h})  -> inst {root, mixer, gunSlot, h}  (async; root is ready to add to a Group)
//   KitNPC.update(inst,dt,st,u)  drive the animation from the NPC's state string ('run' 'idle' 'aim' 'crouch' 'vent' 'cloak') and its userData flags (recoil, hitReq, atkReq)
//   KitNPC.die(inst,fromBack)    play the fall and hold it
//   KitNPC.attach(inst,gunMesh)  put a gun pivot into the right hand
// Pure state->clip mapping (clipFor) is exported for tests/kit.sim.js.
const KitNPC=(()=>{
  const RUN={Barbarian:'Running_B',Knight:'Running_A',Mage:'Running_A',Rogue:'Running_B',Rogue_Hooded:'Running_B',Skeleton_Warrior:'Running_A',Skeleton_Rogue:'Running_B',Skeleton_Mage:'Running_A',Skeleton_Minion:'Running_A'};
  const cache={};let animsP=null,clips=null;
  function url(f){return 'assets/kit/'+f+'.glb'}
  function loadGLB(f){return cache[f]||(cache[f]=new Promise((res,rej)=>new THREE.GLTFLoader().load(url(f),g=>res(g),undefined,rej)))}
  function loadClips(){return animsP||(animsP=loadGLB('anims').then(g=>{clips={};for(const c of g.animations)clips[c.name]=c;return clips}))}
  // state -> clip name (pure)
  function clipFor(name,st,pose){
    if(st==='run'||st==='cloak')return RUN[name]||'Running_A';
    if(st==='aim')return pose==='2H'?'2H_Ranged_Aiming':'1H_Ranged_Aiming';
    if(st==='vent')return 'Hit_B';
    if(st==='crouch')return pose==='2H'?'2H_Ranged_Aiming':'1H_Ranged_Aiming';
    return 'Idle'}
  function shootClip(pose){return pose==='2H'?'2H_Ranged_Shoot':'1H_Ranged_Shoot'}
  async function make(name,opt){
    opt=opt||{};const [g,cl]=await Promise.all([loadGLB(name),loadClips()]);
    const root=THREE.SkeletonUtils.clone(g.scene);root.traverse(o=>{if(o.isMesh||o.isSkinnedMesh){o.frustumCulled=false;o.castShadow=true;if(o.material){o.material=o.material.clone();o.material.roughness=.9;o.material.metalness=0}}});
    const box=new THREE.Box3().setFromObject(root),h=box.max.y-box.min.y||2,k=(opt.h||1.8)/h;root.scale.setScalar(k);root.position.y=-box.min.y*k;
    let slot=null;root.traverse(o=>{if(!slot&&/^handslotr$|^handslot\.r$/.test(o.name))slot=o});
    const mixer=new THREE.AnimationMixer(root);
    return {name,root,mixer,gunSlot:slot,pose:opt.pose||'1H',acts:{},cur:null,once:null,dead:false,t:0,cl}}
  function act(i,n){const a=i.acts[n];if(a)return a;const c=i.cl[n]||i.cl.Idle;if(!c)return null;return i.acts[n]=i.mixer.clipAction(c)}
  function loop(i,n,fade,ts){const a=act(i,n);if(!a)return;if(i.cur===n){a.setEffectiveTimeScale(ts||1);return}
    const prev=i.cur&&i.acts[i.cur];a.reset();a.setLoop(THREE.LoopRepeat,Infinity);a.setEffectiveTimeScale(ts||1);a.setEffectiveWeight(1);a.fadeIn(fade).play();if(prev)prev.fadeOut(fade);i.cur=n}
  function oneShot(i,n,ts,w){const a=act(i,n);if(!a)return;a.reset();a.setLoop(THREE.LoopOnce,1);a.clampWhenFinished=false;a.setEffectiveTimeScale(ts||1);a.setEffectiveWeight(w||1);a.fadeIn(.05).play();i.once={a,left:a.getClip().duration/(ts||1)};}
  function update(i,dt,st,u){
    if(!i||i.dead){if(i&&i.mixer)i.mixer.update(dt);return}
    u=u||{};i.t+=dt;if(api.force)st=api.force;   // (test hook: pins every kit body to one state)
    if(u.hitReq){u.hitReq=0;if(!i.once||i.once.left<.1)oneShot(i,(i.hitAlt=!i.hitAlt)?'Hit_A':'Hit_B',1.3,.9)}
    if(u.recoil>0){u.recoil=0;if(st!=='run'&&(!i.once||i.once.left<.1))oneShot(i,shootClip(i.pose),1.6,.55)}
    if(u.atkReq){const c=u.atkReq;u.atkReq=null;oneShot(i,c,1.4,1)}
    if(i.once){i.once.left-=dt;if(i.once.left<=.04){i.once.a.fadeOut(.1);i.once=null}}
    loop(i,clipFor(i.name,st,i.pose),.14,st==='cloak'?1.25:1);
    // crouching behind cover: body sinks (the aim clip stays up so it can still be shot at)
    const want=st==='crouch'?.72:1;i.sy=(i.sy||1)+(want-(i.sy||1))*Math.min(1,dt*10);i.root.scale.y=i.root.scale.x*i.sy;
    i.mixer.update(dt)}
  function die(i,back){if(!i||i.dead)return;i.dead=true;i.root.scale.y=i.root.scale.x;i.mixer.stopAllAction();const a=act(i,back?'Death_B':'Death_A');if(a){a.reset();a.setLoop(THREE.LoopOnce,1);a.clampWhenFinished=true;a.setEffectiveWeight(1);a.setEffectiveTimeScale(1);a.play()}}
  function attach(i,piv){if(i.gunSlot&&piv){i.gunSlot.add(piv);return true}return false}
  const api={make,update,die,attach,clipFor,shootClip,loadClips,force:null,get clips(){return clips}};return api;
})();
