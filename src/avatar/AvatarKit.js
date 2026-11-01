// AvatarKit: the player's full-human avatars (Crypto = 'm', Madea = 'f') and their wardrobe. Globals at runtime: THREE (+ SkeletonUtils), AURL, dressRig (index.html).
//
// Layers (nothing here touches movement, health, combat or networking state):
//   identity / gameplay  - the avatar group `g` and its userData, owned by the game
//   appearance config    - a tiny plain object {v,b,h,hc,o,oc,a}; normalize() makes ANY input safe; encode()/decode() give the compact string sent over presence (<= 24 chars)
//   model + rig          - assets/avatars/<name>.glb: the game rig's bone names on a full-human proportioned mesh; one cached prototype, SkeletonUtils.clone() per player
//   animation controller - assets/avatars/<name>/*.json: this avatar's own clip sets (retargeted for human proportions); looked up through q.av by emoAct / GunLoco / CombatAnims / WardenAnim
//   equipment            - hand-held props (pan, rod, sword, gun, shield) live on bones BY NAME and are re-parented when the model is swapped; accessories (goggles, cap...) are owned by this module
// NPCs (crew, raiders, foes, deckhands) never go through here: they keep the chibi dress() path and the stock clip tables.
const AvatarKit=(()=>{
  const VER=1,ASSET_V='?v=5';   // ASSET_V: bump when an avatar glb / clip set is re-baked (the service worker serves assets stale-while-revalidate, a new URL makes the model and its clips arrive together)
  // ---------------------------------------------------------------- catalog
  const CAT={
    m:{id:'m',scale:.56,bulk:.05,name:'Crypto',label:'Male',glb:'avatars/crypto.glb',mask:'avatars/crypto.mask.png',dir:'avatars/crypto/',legacySkin:0,ref:.0211,headLabel:'Mask & hood',height:1.88},
    f:{id:'f',scale:.56,bulk:.04,name:'Madea',label:'Female',glb:'avatars/madea.glb',mask:'avatars/madea.mask.png',dir:'avatars/madea/',legacySkin:1,ref:.0115,headLabel:'Hair',height:1.70},
    s:{id:'s',scale:.56,bulk:0,fixed:true,name:'Ronin',label:'Samurai',glb:'avatars/samurai.glb',mask:'avatars/samurai.mask.png',dir:'avatars/samurai/',legacySkin:2,ref:.02,headLabel:'Hat',height:2.0}
  };
  const DEFAULT_BASE='m';
  // clothing colours (sRGB hex) - the same palette for every look, filtered per look below
  const PAL=[['Ember',0xc8452f],['Amber',0xd89a2b],['Olive',0x7a8a3a],['Forest',0x2f7a52],['Teal',0x2a8f93],['Azure',0x3b6fc4],['Violet',0x7a4fb8],['Rose',0xc44f86],['Charcoal',0x464b57],['Bone',0xcfc6ae]];
  const HAIR=[['Natural',null],['Jet',0x1c1716],['Chestnut',0x5e3a24],['Auburn',0x8f3d1d],['Blonde',0xdcb85e],['Silver',0xbfc2ca],['Rose',0xd05d90],['Azure',0x3a6fd0]];
  // outfit looks: how the baked outfit is treated. `pal` = the clothing colours that suit it (compatibility), k = recolour strength, dark = brightness scale
  const LOOKS=[
    {id:0,name:'Signature',pal:[],k:0,dark:1},
    {id:1,name:'Dyed',pal:[0,1,2,3,4,5,6,7,8,9],k:.78,dark:1},
    {id:2,name:'Two-tone',pal:[0,1,3,4,5,6,7],k:.78,dark:1,two:true},
    {id:3,name:'Shadow',pal:[3,5,6,8,9],k:.85,dark:.55}
  ];
  // outfit sets: whole wardrobes built at run time on top of the body (cloth shells skinned to the same skeleton + rigid armour / hat pieces). 0 = the body as modelled (+ the recolour looks above)
  const OUTFITS=[{id:0,name:'Signature'},{id:1,name:'Casual'},{id:2,name:'Knight'},{id:3,name:'Samurai'},{id:4,name:'Pirate'}];
  const HEADGEAR_SETS=[0,0,1,1,1];                       // sets that come with their own hat / helmet (cap + headband are dropped)
  const ACC=[{bit:1,name:'Goggles'},{bit:2,name:'Headband'},{bit:4,name:'Cap'},{bit:8,name:'Scarf'},{bit:16,name:'Backpack'}];
  const ACC_ALL=31,ACC_EXCL=[[4,2]];                    // headband and cap are mutually exclusive (cap wins)
  const SKIN_OK={0:1,1:1};
  // ---------------------------------------------------------------- appearance config
  const defaults=b=>({v:VER,b:CAT[b]?b:DEFAULT_BASE,h:0,hc:0,o:0,oc:0,a:0,w:0});
  const int=(x,lo,hi,d)=>{x=typeof x==='string'?parseInt(x,10):x;return Number.isFinite(x)&&x>=lo&&x<=hi?x|0:d};
  function normalize(raw){
    if(typeof raw==='string')raw=decode(raw);
    const r=raw&&typeof raw==='object'?raw:{},a=defaults(CAT[r.b]?r.b:DEFAULT_BASE);   // unknown base -> the default avatar
    if(CAT[a.b].fixed)return a;                                // a fixed-look character (the Samurai keeps the look it was modelled with)
    a.h=0;                                                    // hair styles: only the modelled one so far (reserved field)
    a.hc=int(r.hc,0,HAIR.length-1,0);a.w=int(r.w,0,OUTFITS.length-1,0);a.o=a.w?0:int(r.o,0,LOOKS.length-1,0);   // an outfit set replaces the recolour looks
    a.oc=int(r.oc,0,PAL.length-1,0);
    if(!a.w){const pal=LOOKS[a.o].pal;if(pal.length&&pal.indexOf(a.oc)<0)a.oc=pal[0];if(!pal.length)a.oc=0}   // colour must be compatible with the look
    a.a=int(r.a,0,ACC_ALL,0)&ACC_ALL;if(HEADGEAR_SETS[a.w])a.a&=~6;for(const [keep,drop] of ACC_EXCL)if((a.a&keep)&&(a.a&drop))a.a&=~drop;
    return a}
  const encode=a=>{a=normalize(a);return a.v+'.'+a.b+'.'+a.h+'.'+a.hc+'.'+a.o+'.'+a.oc+'.'+a.a+(a.w?'.'+a.w:'')};
  function decode(s){
    if(typeof s!=='string'||s.length>40)return defaults(DEFAULT_BASE);
    const p=s.split('.');if(p.length<7)return defaults(DEFAULT_BASE);
    return {v:int(p[0],0,99,VER),b:p[1],h:p[2],hc:p[3],o:p[4],oc:p[5],a:p[6],w:p[7]}}   // a newer version with the same layout still decodes; normalize() clamps the rest
  const same=(a,b)=>encode(a)===encode(b);
  const has=app=>!!app&&typeof app==='object'&&!!CAT[normalize(app).b];
  // persistence (per device; a private window may refuse storage)
  const KEY='tw_avatar_v1';
  function save(a){try{localStorage.setItem(KEY,encode(a))}catch(e){}}
  function restore(){try{const s=localStorage.getItem(KEY);if(s)return normalize(s)}catch(e){}return null}
  // ---------------------------------------------------------------- assets (cached; instances never share mutable state)
  const assets={};   // id -> Promise<{id,proto,mask,set,info}>
  const SETS={};     // id -> clip set  {anims,emo,combat,gun,gunMeta,warden,ratio}
  const clipsOf=(arr)=>{const o={};for(const c of arr){const ac=THREE.AnimationClip.parse(c);ac.name=c.name;o[c.name]=ac}return o};
  const getJson=url=>fetch(url+ASSET_V).then(r=>{if(!r.ok)throw new Error(url+' '+r.status);return r.json()});
  function loadSet(id){
    const d=AURL+CAT[id].dir;
    return Promise.all([getJson(d+'anims.json'),getJson(d+'emotes.json'),getJson(d+'verb_anims.json'),getJson(d+'combat_anims.json'),getJson(d+'meta.json').catch(()=>({}))]).then(([an,em,vb,cb,meta])=>{
      const emo=clipsOf(em.clips);for(const c of vb.clips)if(!emo[c.name]){const ac=THREE.AnimationClip.parse(c);ac.name=c.name;emo[c.name]=ac}
      const K=(CAT[id].scale||.5)/.5,g=meta.gait||{},gc=meta.gaitChibi||g,w=(g.walk&&g.walk.ratio||1)*K,j=(g.jog&&g.jog.ratio||1)*K;   // K: the avatar is drawn larger than the chibi (model scale), so the same clip covers K times more ground
      const S={id,anims:clipsOf(an),emo,emoMenu:em.menu.concat(vb.menu||[]),combat:clipsOf(cb),gun:null,gunMeta:null,warden:null,ratio:{walk:w,jog:j,sprint:(g.sprint&&g.sprint.ratio||(g.jog&&g.jog.ratio)||1)*K},gunRatio:(gc.jog&&gc.jog.ratio||1)*K,mxK:K,hipK:meta.hipK||1,_p:{}};
      SETS[id]=S;return S})}
  // gun / warden sets are only fetched when the armed or sword code asks (they are the two big ones)
  function more(id,what){
    const S=SETS[id];if(!S)return Promise.resolve(null);if(S._p[what])return S._p[what];
    const d=AURL+CAT[id].dir;
    S._p[what]=what==='gun'?getJson(d+'gun_anims.json').then(j=>{S.gunMeta={};for(const n in j.meta)S.gunMeta[n]=Object.assign({},j.meta[n],{spd:j.meta[n].spd*S.gunRatio});S.gun=clipsOf(j.clips);return S}).catch(e=>{S._p.gun=null;throw e})
      :getJson(d+'warden_anims.json').then(j=>{S.warden=clipsOf(j);return S}).catch(e=>{S._p.warden=null;throw e});
    return S._p[what]}
  function loadAsset(id){
    if(assets[id])return assets[id];
    const C=CAT[id];
    assets[id]=Promise.all([
      fetch(AURL+C.glb+ASSET_V).then(r=>{if(!r.ok)throw new Error(C.glb+' '+r.status);return r.arrayBuffer()}).then(buf=>new Promise((res,rej)=>new THREE.GLTFLoader().parse(buf,AURL,res,rej))),
      new Promise((res,rej)=>new THREE.TextureLoader().load(AURL+C.mask+ASSET_V,t=>{t.flipY=false;t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;res(t)},undefined,rej)),
      loadSet(id),getJson(AURL+C.glb.replace(/\.glb$/,'.json')).catch(()=>null)
    ]).then(([gltf,mask,set,info])=>{
      gltf.scene.traverse(o=>{if(o.isSkinnedMesh){o.frustumCulled=false;if(o.material&&o.material.map)o.material.map.anisotropy=2}});
      const A={id,proto:gltf.scene,mask,set,info};AvatarOutfits.bulk(A,C.bulk||0);return A}).catch(e=>{delete assets[id];throw e});
    return assets[id]}
  const preload=id=>loadAsset(CAT[id]?id:DEFAULT_BASE);
  // ---------------------------------------------------------------- recolour material (one program for every instance; per-instance uniforms)
  const lin=hex=>{const c=new THREE.Color(hex);if(c.convertSRGBToLinear)c.convertSRGBToLinear();return c};
  function recolorMaterial(src,asset){
    const m=src.clone(),C=CAT[asset.id];
    const U={uMask:{value:asset.mask},uRef:{value:C.ref},uK:{value:new THREE.Vector3(0,0,0)},uTint:{value:[new THREE.Vector3(1,1,1),new THREE.Vector3(1,1,1),new THREE.Vector3(1,1,1)]}};
    m.userData.avU=U;
    m.onBeforeCompile=sh=>{
      Object.assign(sh.uniforms,U);
      sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nattribute float _zone;varying float vZone;').replace('#include <begin_vertex>','#include <begin_vertex>\nvZone=_zone;');
      sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D uMask;uniform float uRef;uniform vec3 uK;uniform vec3 uTint[3];varying float vZone;')
        .replace('#include <map_fragment>',`#include <map_fragment>
#ifdef USE_MAP
{ float zi=vZone<1.5?0.:(vZone<2.5?1.:2.);
  float k=(zi<.5?uK.x:(zi<1.5?uK.y:uK.z))*(1.-texture2D(uMask,vUv).r);
  if(k>.001){ vec3 t=zi<.5?uTint[0]:(zi<1.5?uTint[1]:uTint[2]);
    float rel=clamp(dot(diffuseColor.rgb,vec3(.2126,.7152,.0722))/uRef,0.,3.);
    diffuseColor.rgb=mix(diffuseColor.rgb,t*(rel*.62),k); } }
#endif`)};
    m.customProgramCacheKey=()=>'avkit1';
    return m}
  function paint(u,a){
    const mats=u.avMats;if(!mats)return;
    const L=LOOKS[a.o],hex=HAIR[a.hc][1],top=PAL[a.oc][1];
    for(const m of mats){const U=m.userData.avU,t=U.uTint.value;
      U.uK.value.set(hex==null?0:.82,L.k,L.k);
      if(hex!=null)t[0].set(...lin(hex).toArray());
      const c=lin(top).multiplyScalar(L.dark);t[1].set(c.r,c.g,c.b);
      const b=L.two?lin(top).lerp(lin(0x23252c),.55):c;t[2].set(b.r,b.g,b.b)}
    restyleAcc(u,a)}
  // ---------------------------------------------------------------- accessories (procedural, tiny, shared geometry, per-instance material)
  const GEO={};const geo=(k,f)=>GEO[k]||(GEO[k]=f());
  function accGroup(a,info){
    const g=new THREE.Group(),h=(info&&info.head)||{min:[-.2,3.4,-.25],max:[.2,3.9,.26]},cx=(h.min[0]+h.max[0])/2,hw=(h.max[0]-h.min[0])/2,hd=(h.max[2]-h.min[2])/2,cz=(h.min[2]+h.max[2])/2,top=h.max[1],hh=h.max[1]-h.min[1];
    const lm=(info&&info.landmarks)||{},neck=lm.Neck||[0,3.3,-.11],uc=lm.UpperChest||[0,2.94,-.08];
    const mat=(c,r)=>new THREE.MeshStandardMaterial({color:c,roughness:r==null?.7:r,metalness:r===.3?.4:0});
    const add=(p,mesh)=>{mesh.userData.avAcc=1;mesh.castShadow=true;p.add(mesh);return mesh};
    const out={head:new THREE.Group(),neck:new THREE.Group(),back:new THREE.Group(),tint:[]};
    const tm=(c,r)=>{const m=mat(c,r);out.tint.push(m);return m};
    if(a&1){ // goggles: strap round the head + two lenses on the brow
      const y=top-hh*.36,s=add(out.head,new THREE.Mesh(geo('gg_s',()=>new THREE.TorusGeometry(1,.035,6,24)),tm(0x2b2e36,.8)));s.rotation.x=Math.PI/2;s.scale.set(hw*1.04,hd*1.02,1);s.position.set(cx,y,cz);
      for(const sx of [-1,1]){const l=add(out.head,new THREE.Mesh(geo('gg_l',()=>new THREE.CylinderGeometry(.052,.052,.04,14)),new THREE.MeshStandardMaterial({color:0x7fd7ff,roughness:.15,metalness:.5,emissive:0x1a5a7a,emissiveIntensity:.6})));l.rotation.x=Math.PI/2;l.position.set(cx+sx*hw*.38,y,h.max[2]+.005)}}
    if(a&2){const b=add(out.head,new THREE.Mesh(geo('hb',()=>new THREE.TorusGeometry(1,.05,6,28)),tm(0xc8452f)));b.rotation.x=Math.PI/2;b.scale.set(hw*1.02,hd*1.0,1);b.position.set(cx,top-hh*.2,cz)}
    if(a&4){const c=add(out.head,new THREE.Mesh(geo('cap',()=>new THREE.SphereGeometry(1,20,12,0,Math.PI*2,0,Math.PI*.52)),tm(0xc8452f)));c.scale.set(hw*1.1,hh*.48,hd*1.08);c.position.set(cx,top-hh*.36,cz);
      const br=add(out.head,new THREE.Mesh(geo('brim',()=>new THREE.CylinderGeometry(1,1,.03,20,1,false,-Math.PI*.5,Math.PI)),tm(0xc8452f)));br.scale.set(hw*1.05,1,hd*.95);br.position.set(cx,top-hh*.3,h.max[2]-hd*.15);br.rotation.x=-.08}
    if(a&8){const s=add(out.neck,new THREE.Mesh(geo('sc',()=>new THREE.TorusGeometry(1,.3,8,22)),tm(0xd89a2b)));s.rotation.x=Math.PI/2;s.scale.set(.17,.17,.2);s.position.set(neck[0],neck[1]-.03,neck[2]);
      const t=add(out.neck,new THREE.Mesh(geo('sct',()=>new THREE.BoxGeometry(.13,.42,.035)),tm(0xd89a2b)));t.position.set(neck[0]+.07,neck[1]-.25,neck[2]-.17);t.rotation.set(.12,0,.06)}
    if(a&16){const b=add(out.back,new THREE.Mesh(geo('bp',()=>new THREE.BoxGeometry(.4,.5,.17)),tm(0x6b4a2f,.8)));b.position.set(uc[0],uc[1]-.12,uc[2]-.28);
      const f=add(out.back,new THREE.Mesh(geo('bpf',()=>new THREE.BoxGeometry(.3,.2,.06)),tm(0x4d3622,.8)));f.position.set(uc[0],uc[1]-.28,uc[2]-.4)}
    return out}
  const ACC_COL={1:null,2:0xc8452f,4:0xc8452f,8:0xd89a2b,16:null};
  function restyleAcc(u,a){
    if(!u.avAccs)return;const L=LOOKS[a.o];
    for(const m of u.avAccs.tint){if(L.k>0){m.color.set(PAL[a.oc][1]);if(m.color.convertSRGBToLinear)m.color.convertSRGBToLinear()}}
    for(const [m,f] of u.avAccs.otint||[]){m.color.set(PAL[a.oc][1]);if(m.color.convertSRGBToLinear)m.color.convertSRGBToLinear();m.color.multiplyScalar(f)}}
  function buildAcc(u,asset,a){
    teardownAcc(u);u.avAccKey=a.a+':'+a.w;
    if(!a.a&&!a.w)return;
    const A=a.a?accGroup(a.a,asset.info):{head:new THREE.Group(),neck:new THREE.Group(),back:new THREE.Group(),tint:[]},B=u.bones;let sm=null;u.model.traverse(o=>{if(!sm&&o.isSkinnedMesh&&!o.userData.avShell)sm=o});
    if(!sm)return;
    A.otint=[];A.shells=[];
    if(a.w){const O=AvatarOutfits.build(asset,sm,a);A.otint=O.otint;A.shells=O.shells;for(const sh of O.shells)sm.parent.add(sh);   // cloth shells share the body's skeleton
      var parts=O.parts}
    // accessories are modelled in the mesh's own rest space (same space as the landmarks in the sidecar); boneInverse * bindMatrix maps that space into a bone's local space,
    // so this is right at ANY pose (a restyle in the middle of an animation included)
    const hook=(grp,bone)=>{if(!bone)return;const i=sm.skeleton.bones.indexOf(bone);if(i<0)return;const M=sm.skeleton.boneInverses[i].clone().multiply(sm.bindMatrix);
      for(const k of [...grp.children]){k.updateMatrix();k.matrix.premultiply(M);k.matrix.decompose(k.position,k.quaternion,k.scale);grp.remove(k);bone.add(k)}};
    hook(A.head,B.Head);hook(A.neck,B.Neck||B.UpperChest);hook(A.back,B.UpperChest||B.Chest);
    if(parts)for(const [bn,me] of parts){const bone=B[bn]||B.Spine;if(!bone)continue;const i=sm.skeleton.bones.indexOf(bone);if(i<0)continue;const M=sm.skeleton.boneInverses[i].clone().multiply(sm.bindMatrix);
      me.updateMatrix();me.matrix.premultiply(M);me.matrix.decompose(me.position,me.quaternion,me.scale);bone.add(me)}
    u.avAccs=A}
  function teardownAcc(u){
    const A=u.avAccs;
    if(A&&A.shells)for(const sh of A.shells){if(sh.parent)sh.parent.remove(sh);if(sh.material)sh.material.dispose()}   // shell geometry is cached per body + region
    if(!A)return;
    const dead=[];u.model&&u.model.traverse(o=>{if(o.userData&&o.userData.avAcc)dead.push(o)});
    for(const o of dead){if(o.parent)o.parent.remove(o);if(o.material&&o.material.dispose)o.material.dispose()}   // (rigid outfit pieces too)   // geometries are shared (GEO cache)
    u.avAccs=null;u.avAccKey=''}
  // ---------------------------------------------------------------- dress / swap
  const hooks=[];                                              // onSwap listeners (systems that hold actions on the old mixer)
  const onSwap=f=>hooks.push(f);
  function disposeModel(u){
    const old=u.model;if(!old)return;
    teardownAcc(u);
    if(u.mixer){u.mixer.stopAllAction();u.mixer.uncacheRoot(old)}   // drops cached actions/bindings of the old mixer
    old.traverse(o=>{if(o.isSkinnedMesh){if(o.skeleton)o.skeleton.dispose();const ms=Array.isArray(o.material)?o.material:[o.material];for(const m of ms)if(m&&m.dispose)m.dispose()}});   // per-instance materials only; geometry + textures are shared with the cache
    if(old.parent)old.parent.remove(old);
    u.avMats=null}
  // re-home everything that hangs off the old rig's bones (props are attached by bone NAME) onto the new rig
  function moveProps(oldBones,newBones){
    for(const n in oldBones){const ob=oldBones[n],nb=newBones[n];if(!nb)continue;
      for(const c of [...ob.children]){if(c.isBone||(c.userData&&c.userData.avAcc))continue;ob.remove(c);nb.add(c)}}
    for(const n of ['Head_end'])void n}
  function apply(g,raw,opts){
    const u=g.userData,a=normalize(raw),key=encode(a);
    if(u.avKey===key&&u.model)return Promise.resolve(false);           // nothing to do (no duplicate models / mixers)
    u.avWant=key;
    return loadAsset(a.b).then(asset=>{
      if(u.avWant!==key)return false;                                  // a newer request superseded this one
      if(u.av===a.b&&u.model){u.avApp=a;u.avKey=key;paint(u,a);if(u.avAccKey!==a.a+':'+a.w)buildAcc(u,asset,a);paint(u,a);return true}   // same body: just restyle
      const oldBones=u.bones,had=!!u.model;
      if(had)disposeModel(u);
      const m=THREE.SkeletonUtils.clone(asset.proto),bones={};m.scale.setScalar(CAT[a.b].scale||.5);u.ms=CAT[a.b].scale||.5;
      u.avMats=[];
      m.traverse(o=>{if(o.isSkinnedMesh){o.skeleton.bones.forEach(b=>bones[b.name]=b);o.frustumCulled=false;o.castShadow=true;if(CAT[a.b].fixed){o.material=o.material.clone()}else{const rm=recolorMaterial(o.material,asset);o.material=rm;u.avMats.push(rm)}}});
      u.av=a.b;u.avApp=a;u.avKey=key;
      dressRig(g,m,bones,{},asset.set.anims);
      if(had&&oldBones)moveProps(oldBones,bones);
      if(u.rod)u.rodHand=bones.RightHand;
      buildAcc(u,asset,a);paint(u,a);
      for(const f of hooks)try{f(g,a.b)}catch(e){console.warn('avatar swap hook',e)}
      setTimeout(()=>more(a.b,'gun').catch(()=>{}),1200);   // the armed-locomotion set (~1 MB) streams in right after the body so a gun is never waiting on a download
      return true}).catch(e=>{console.warn('avatar load failed, keeping the current model',e);return false})}
  function dispose(g){const u=g.userData;u.avWant=null;disposeModel(u);u.model=null}
  // lookups used by the animation systems (q = avatar userData; q.av unset = a stock chibi / NPC)
  const set=id=>id?SETS[id]||null:null;
  const setOf=q=>q&&q.av?SETS[q.av]||null:null;
  const gait=q=>{const S=setOf(q);return S?S.ratio:null};
  return {VER,ASSET_V,CAT,PAL,HAIR,LOOKS,OUTFITS,ACC,DEFAULT_BASE,defaults,normalize,encode,decode,same,has,save,restore,preload,apply,dispose,more,set,setOf,gait,onSwap,
    emoTable:q=>{const S=setOf(q);return S?S.emo:null},
    palFor:o=>LOOKS[int(o,0,LOOKS.length-1,0)].pal,
    legacySkin:b=>(CAT[b]||CAT[DEFAULT_BASE]).legacySkin,
    _debug:{assets:()=>assets,sets:()=>SETS}};
})();
