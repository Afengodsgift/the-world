// AvatarOutfits: the four outfit sets (Casual, Knight, Samurai, Pirate) for both avatars, built at run time - no extra downloads.
//   * cloth "shells": the body's own triangles for a region (torso, sleeves, trousers, boots...) pushed out along the welded vertex normals and skinned to the SAME skeleton,
//     so they deform with every animation. The shell geometry is cached per body + region (shared by every player); materials are per instance.
//   * rigid pieces (armour plates, helmets, hats, sashes, belts): small primitive meshes sized from the live bind-pose bone positions, attached to bones.
// build(asset, sm, a) -> {shells:[SkinnedMesh], parts:[[boneName, Mesh]], otint:[[material, factor]]}; AvatarKit owns attaching / teardown / tinting.
const AvatarOutfits=(()=>{
  const T=()=>THREE,G={},geo=(k,f)=>G[k]||(G[k]=f());
  const TEX={};
  function tex(kind){
    if(TEX[kind])return TEX[kind];
    const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');
    x.fillStyle='#fff';x.fillRect(0,0,64,64);
    let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
    if(kind==='cloth'){for(let i=0;i<64;i+=2){x.fillStyle='rgba(0,0,0,.07)';x.fillRect(i,0,1,64);x.fillRect(0,i,64,1)}for(let i=0;i<260;i++){x.fillStyle='rgba(0,0,0,'+(rnd()*.07)+')';x.fillRect(rnd()*64,rnd()*64,1,1)}}
    else if(kind==='mail'){x.strokeStyle='rgba(0,0,0,.45)';x.lineWidth=1.3;for(let j=0;j<8;j++)for(let i=0;i<8;i++){x.beginPath();x.arc(i*8+(j%2?4:0),j*8+2,3.4,0,Math.PI*2);x.stroke()}}
    else if(kind==='denim'){for(let i=0;i<64;i+=1){x.fillStyle='rgba(0,0,0,'+(i%2?.08:.0)+')';x.fillRect(i,0,1,64)}for(let i=0;i<200;i++){x.fillStyle='rgba(255,255,255,'+(rnd()*.1)+')';x.fillRect(rnd()*64,rnd()*64,1,2)}}
    const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.encoding=THREE.sRGBEncoding;t.anisotropy=2;return TEX[kind]=t}
  // ---------------------------------------------------------------- cloth shells
  const REG={
    torso:['Spine','Chest','UpperChest','LeftShoulder','RightShoulder'],
    chest:['Chest','UpperChest','LeftShoulder','RightShoulder'],
    armS:['LeftArm','RightArm'],
    armL:['LeftArm','RightArm','LeftForeArm','RightForeArm'],
    pants:['Hips','LeftUpLeg','RightUpLeg','LeftLeg','RightLeg'],
    hips:['Hips'],legs:['LeftUpLeg','RightUpLeg','LeftLeg','RightLeg'],
    shorts:['Hips','LeftUpLeg','RightUpLeg'],
    shin:['LeftLeg','RightLeg'],
    feet:['LeftFoot','RightFoot','LeftToes','RightToes']};
  function prep(asset){
    if(asset.wn)return;
    let sm;asset.proto.traverse(o=>{if(!sm&&o.isSkinnedMesh)sm=o});
    const g=sm.geometry,P=g.attributes.position,N=g.attributes.normal,SI=g.attributes.skinIndex,SW=g.attributes.skinWeight,n=P.count;
    const dom=new Uint16Array(n),acc=new Map();
    for(let i=0;i<n;i++){const w=[SW.getX(i),SW.getY(i),SW.getZ(i),SW.getW(i)],ix=[SI.getX(i),SI.getY(i),SI.getZ(i),SI.getW(i)];let b=0;for(let k=1;k<4;k++)if(w[k]>w[b])b=k;dom[i]=ix[b];
      const key=Math.round(P.getX(i)*400)+','+Math.round(P.getY(i)*400)+','+Math.round(P.getZ(i)*400);let e=acc.get(key);if(!e)acc.set(key,e=[0,0,0]);e[0]+=N.getX(i);e[1]+=N.getY(i);e[2]+=N.getZ(i)}   // weld: seam-split vertices share one averaged normal, so a shell never cracks open
    const wn=new Float32Array(n*3);
    for(let i=0;i<n;i++){const e=acc.get(Math.round(P.getX(i)*400)+','+Math.round(P.getY(i)*400)+','+Math.round(P.getZ(i)*400)),l=Math.hypot(e[0],e[1],e[2])||1;wn[i*3]=e[0]/l;wn[i*3+1]=e[1]/l;wn[i*3+2]=e[2]/l}
    asset.sm=sm;asset.dom=dom;asset.wn=wn;asset.bn=sm.skeleton.bones.map(b=>b.name);asset.shells={}}
  function shellGeo(asset,region,off){
    prep(asset);const key=region+'@'+off,C=asset.shells;if(C[key])return C[key];
    const sm=asset.sm,g=sm.geometry,P=g.attributes.position,SI=g.attributes.skinIndex,SW=g.attributes.skinWeight,I=g.index.array,wn=asset.wn,dom=asset.dom;
    const want=new Set(REG[region]);const ok=new Uint8Array(asset.bn.length);asset.bn.forEach((nm,i)=>{if(want.has(nm))ok[i]=1});
    const map=new Int32Array(P.count).fill(-1),keep=[];const idx=[];
    for(let t=0;t<I.length;t+=3){const a=I[t],b=I[t+1],c=I[t+2];if(ok[dom[a]]&&ok[dom[b]]&&ok[dom[c]]){for(const v of [a,b,c]){if(map[v]<0){map[v]=keep.length;keep.push(v)}idx.push(map[v])}}}
    const n=keep.length,pos=new Float32Array(n*3),nor=new Float32Array(n*3),uv=new Float32Array(n*2),si=new SI.array.constructor(n*4),sw=new SW.array.constructor(n*4);
    for(let j=0;j<n;j++){const v=keep[j],nx=wn[v*3],ny=wn[v*3+1],nz=wn[v*3+2];
      const x=P.getX(v)+nx*off,y=P.getY(v)+ny*off,z=P.getZ(v)+nz*off;pos[j*3]=x;pos[j*3+1]=y;pos[j*3+2]=z;nor[j*3]=nx;nor[j*3+1]=ny;nor[j*3+2]=nz;
      const ax=Math.abs(nx),ay=Math.abs(ny),az=Math.abs(nz);   // triplanar-ish mapping: stays upright on sleeves, trunks and trousers
      if(ax>=ay&&ax>=az){uv[j*2]=z*3;uv[j*2+1]=y*3}else if(az>=ay){uv[j*2]=x*3;uv[j*2+1]=y*3}else{uv[j*2]=x*3;uv[j*2+1]=z*3}
      si[j*4]=SI.getX(v);si[j*4+1]=SI.getY(v);si[j*4+2]=SI.getZ(v);si[j*4+3]=SI.getW(v);sw[j*4]=SW.getX(v);sw[j*4+1]=SW.getY(v);sw[j*4+2]=SW.getZ(v);sw[j*4+3]=SW.getW(v)}
    const o=new THREE.BufferGeometry();
    o.setAttribute('position',new THREE.BufferAttribute(pos,3));o.setAttribute('normal',new THREE.BufferAttribute(nor,3));o.setAttribute('uv',new THREE.BufferAttribute(uv,2));
    o.setAttribute('skinIndex',new THREE.BufferAttribute(si,4));o.setAttribute('skinWeight',new THREE.BufferAttribute(sw,4));
    o.setIndex(new THREE.BufferAttribute(n>65535?new Uint32Array(idx):new Uint16Array(idx),1));
    return C[key]=o}
  // ---------------------------------------------------------------- the sets
  function build(asset,sm,a){
    prep(asset);
    const out={shells:[],parts:[],otint:[]},info=asset.info||{},male=asset.id==='m';
    const s=(info.rigHeight||3.932)/3.932,W=male?1:.8;                       // s = height scale, W = torso width scale
    const sk=sm.skeleton,pos={};sk.bones.forEach((b,i)=>{pos[b.name]=new THREE.Vector3().setFromMatrixPosition(sk.boneInverses[i].clone().invert())});
    const V=(x,y,z)=>new THREE.Vector3(x,y,z);
    const stdM=(o)=>new THREE.MeshStandardMaterial(Object.assign({roughness:.85,metalness:0},o));
    const mat=(color,o,tint)=>{const m=stdM(Object.assign({color},o||{}));if(tint!=null)out.otint.push([m,tint]);return m};
    const tm=(kind,color,o,tint)=>{const m=mat(color,Object.assign({map:tex(kind)},o||{}),tint);return m};
    const shell=(region,off,m)=>{const sh=new THREE.SkinnedMesh(shellGeo(asset,region,off*s),m);sh.bind(sk,sm.bindMatrix);sh.position.copy(sm.position);sh.quaternion.copy(sm.quaternion);sh.scale.copy(sm.scale);sh.frustumCulled=false;sh.castShadow=true;sh.userData.avShell=1;out.shells.push(sh);return sh};
    const part=(bone,g,m,p,rot,scl)=>{const me=new THREE.Mesh(g,m);me.position.copy(p);if(rot)me.rotation.set(rot[0],rot[1],rot[2]);if(scl)me.scale.set(scl[0],scl[1],scl[2]);me.userData.avAcc=1;me.castShadow=true;me.userData.bone=bone;out.parts.push([bone,me]);return me};
    // a cylinder from bone A towards bone B (t0..t1 of the way), radius r (before height scaling)
    const seg=(bone,A,B,t0,t1,r,m,o)=>{const pa=pos[A],pb=pos[B];if(!pa||!pb)return;o=o||{};const d=pb.clone().sub(pa),L=d.length(),p0=pa.clone().addScaledVector(d,t0),p1=pa.clone().addScaledVector(d,t1),c=p0.clone().add(p1).multiplyScalar(.5);
      const me=part(bone,geo('cyl'+(o.cap?'c':'o'),()=>new THREE.CylinderGeometry(1,1,1,18,1,!o.cap)),m,c,null,[r*s*(o.sx||1),L*(t1-t0),r*s*(o.sz||1)]);
      me.quaternion.setFromUnitVectors(V(0,1,0),d.normalize());if(m.side!==THREE.DoubleSide)m.side=THREE.DoubleSide;return me};
    const ring=(bone,at,rx,rz,tube,m,tilt)=>{const me=part(bone,geo('ring',()=>new THREE.TorusGeometry(1,.12,8,26)),m,at,[Math.PI/2+(tilt||0),0,0],[rx*s,rz*s,tube*s/.12]);return me};   // torus: tube thickness given as z scale
    const mid=(A,B,t)=>pos[A].clone().lerp(pos[B],t==null?.5:t);
    const sph=(bone,at,rx,ry,rz,m,o)=>{o=o||{};const me=part(bone,geo('sph'+(o.k||''),()=>o.g?o.g():new THREE.SphereGeometry(1,16,12)),m,at,o.rot,[rx*s,ry*s,rz*s]);m.side=THREE.DoubleSide;return me};
    const box=(bone,at,w,h,d,m,rot)=>{const me=part(bone,geo('box',()=>new THREE.BoxGeometry(1,1,1)),m,at,rot,[w*s,h*s,d*s]);return me};
    const hd=info.head||{min:[-.2,3.4,-.25],max:[.2,3.9,.26]},hx=(hd.min[0]+hd.max[0])/2,hw=(hd.max[0]-hd.min[0])/2,hz=(hd.min[2]+hd.max[2])/2,hdp=(hd.max[2]-hd.min[2])/2,top=hd.max[1],hh=hd.max[1]-hd.min[1];
    const metal=(c,t)=>mat(c,{roughness:.32,metalness:.75},t);
    const pants=(m,off)=>{shell('legs',off,m);shell('hips',off+(male?.004:.06),m.clone())};   // the hip band sits a little proud on the female body (her own belt + holsters)
    const both=f=>{f('Left');f('Right')};
    const waist=pos.Spine?pos.Spine.clone():V(0,2.3,0);
    const belt=(c,w,tube,y)=>{const at=waist.clone();at.y+=(y||0)*s;at.z=pos.Hips.z*.4+waist.z*.6;return ring('Spine',at,.4*W+(w||0),.31*W+(w||0),tube||.045,mat(c,{roughness:.6}))};
    const dome=(bone,m,k)=>sph(bone,V(hx,top-hh*.34,hz),hw*1.14,hh*.62,hdp*1.12,m,{g:()=>new THREE.SphereGeometry(1,20,12,0,Math.PI*2,0,Math.PI*.5),k:'dome'+(k||'')});
    switch(a.w){
    case 1:{ // ---- Casual: t-shirt (outfit colour), jeans, trainers, belt
      shell('torso',.03,tm('cloth',0xffffff,{roughness:.9},1));shell('armS',.026,tm('cloth',0xffffff,{roughness:.9},1));
      pants(tm('denim',0x35476b,{roughness:.8}),.026);shell('feet',.024,tm('cloth',0xf1f1f1,{roughness:.6}));
      belt(0x2a2220,0,.03,-.02);
      both(sd=>{const f=pos[sd+'Foot'],t=pos[sd+'Toes'];if(f&&t)box(sd+'Foot',V(f.x,f.y*.5+.02,(f.z+t.z)/2+.03),.24,.07,.36,mat(0x30343c,{roughness:.9}))});   // sole stripe
      break}
    case 2:{ // ---- Knight: mail under plate, tabard, helm, pauldrons, vambraces, greaves, belt
      shell('torso',.03,tm('mail',0x8c929c,{metalness:.65,roughness:.5}));shell('armL',.028,tm('mail',0x8c929c,{metalness:.65,roughness:.5}));
      pants(tm('cloth',0x3b3e46,{roughness:.9}),.026);shell('feet',.03,metal(0x6c717b));
      const cp=mid('Chest','UpperChest',.55);
      sph('UpperChest',V(cp.x,cp.y-.02*s,cp.z+.02*s),.43*W,.4,.31*W,metal(0xb9bec6),{g:()=>new THREE.SphereGeometry(1,20,14,0,Math.PI,.2,Math.PI*.62),k:'bp',rot:[0,0,0]});   // breastplate (front half)
      sph('UpperChest',V(cp.x,cp.y-.02*s,cp.z-.02*s),.42*W,.38,.3*W,metal(0xa7acb4),{g:()=>new THREE.SphereGeometry(1,20,14,Math.PI,Math.PI,.2,Math.PI*.62),k:'bk'});   // backplate
      box('Chest',V(cp.x,cp.y-.42*s,cp.z+.33*W*s),.34*W,.5,.03,mat(0xffffff,{map:tex('cloth'),roughness:.9},1));   // tabard panel
      belt(0x3a2a1c,0,.05,-.05);
      both(sd=>{const sh=pos[sd+'Arm'],e=pos[sd+'ForeArm'];if(!sh)return;
        sph(sd+'Shoulder',V(sh.x+(sd==='Left'?.04:-.04)*s,sh.y+.05*s,sh.z),.24,.14,.22,metal(0xb9bec6),{k:'pd'});
        seg(sd+'ForeArm',sd+'ForeArm',sd+'Hand',.08,.85,.15,metal(0xa7acb4));   // vambrace
        seg(sd+'Leg',sd+'Leg',sd+'Foot',.12,.9,.17,metal(0xa7acb4));                // greave
        sph(sd+'Leg',pos[sd+'Leg'].clone().add(V(0,0,.1*s)),.2,.16,.17,metal(0xb9bec6),{k:'kn'});   // knee cop
        if(pos[sd+'UpLeg'])seg(sd+'UpLeg',sd+'UpLeg',sd+'Leg',.04,.5,.215,metal(0x8d929b));   // tasset
      });
      // great helm with an open face: dome + back/side skirt + nose bar
      dome('Head',metal(0xb2b7bf),'k');
      const sk2=part('Head',geo('hskirt',()=>new THREE.CylinderGeometry(1,1,1,20,1,true,Math.PI*.35,Math.PI*1.3)),metal(0xa4a9b1),V(hx,top-hh*.66,hz),null,[hw*1.14,hh*.42,hdp*1.12]);sk2.material.side=THREE.DoubleSide;
      box('Head',V(hx,top-hh*.58,hd.max[2]+.01*s),.035,hh*.42/s,.03,metal(0xb2b7bf));
      const cr=box('Head',V(hx,top+.02*s,hz),.04,.1,hdp*1.9/s,mat(0xc0392b,{roughness:.8},1));void cr;break}
    case 3:{ // ---- Samurai: kimono + hakama, do (cuirass) with lacing, sode, kote, obi, kabuto
      shell('torso',.05,tm('cloth',0xffffff,{roughness:.85},1));shell('armL',.065,tm('cloth',0xffffff,{roughness:.85},1));
      pants(tm('cloth',0x232a4f,{roughness:.85}),.07);shell('feet',.024,tm('cloth',0x1d1d22,{roughness:.8}));
      const cp=mid('Chest','UpperChest',.45);
      sph('Chest',V(cp.x,cp.y-.02*s,cp.z+.01*s),.4*W,.42,.31*W,mat(0x1d1f26,{roughness:.35,metalness:.5}),{g:()=>new THREE.CylinderGeometry(1,1,1,20,1,true),k:'do'}).scale.set(.47*W*s,.42*s,.36*W*s);
      for(let i=0;i<5;i++)ring('Chest',V(cp.x,cp.y-(.15-i*.075)*s,cp.z+.01*s),.475*W,.365*W,.014,mat(0xb3202a,{roughness:.7}));   // red lacing bands
      ring('Spine',V(waist.x,waist.y+.05*s,waist.z+.02*s),.4*W,.3*W,.07,mat(0x2a2a30,{roughness:.8}),0);
      ring('Spine',V(waist.x,waist.y-.07*s,waist.z+.02*s),.41*W,.31*W,.06,mat(0xe9e2d0,{roughness:.8}),0);   // obi sash
      both(sd=>{const sh=pos[sd+'Arm'];if(!sh)return;
        box(sd+'Arm',V(sh.x+(sd==='Left'?.12:-.12)*s,sh.y+.02*s,sh.z),.34,.05,.42,mat(0x1d1f26,{roughness:.4,metalness:.4}),[0,0,sd==='Left'?-.15:.15]);   // sode shoulder plate
        box(sd+'Arm',V(sh.x+(sd==='Left'?.12:-.12)*s,sh.y-.05*s,sh.z),.34,.04,.42,mat(0xb3202a),[0,0,sd==='Left'?-.15:.15]);
        seg(sd+'ForeArm',sd+'ForeArm',sd+'Hand',.05,.8,.15,mat(0x1d1f26,{roughness:.4,metalness:.4}));   // kote
      });
      both(sd=>{const hk=tm('cloth',0x232a4f,{roughness:.85});seg(sd+'UpLeg',sd+'UpLeg',sd+'Leg',-.05,1.02,.3,hk,{sx:1,sz:1.05});seg(sd+'Leg',sd+'Leg',sd+'Foot',-.02,.9,.25,hk)});   // wide hakama legs
      const kb=mat(0x1d1f26,{roughness:.35,metalness:.55});
      sph('Head',V(hx,top-hh*.3,hz),hw*1.12,hh*.6,hdp*1.1,kb,{g:()=>new THREE.SphereGeometry(1,20,12,0,Math.PI*2,0,Math.PI*.5),k:'kab'});
      const sk3=part('Head',geo('shikoro',()=>new THREE.CylinderGeometry(1,1.55,1,20,1,true,Math.PI*.3,Math.PI*1.4)),kb,V(hx,top-hh*.58,hz),null,[hw*1.12,hh*.34,hdp*1.1]);sk3.material.side=THREE.DoubleSide;
      const gold=mat(0xd9a937,{roughness:.3,metalness:.8});
      for(const sx of [-1,1])box('Head',V(hx+sx*hw*.2,top+hh*.1,hd.max[2]-hdp*.1),.03,.3,.04,gold,[0,0,-sx*.45]);   // maedate crest
      ring('Head',V(hx,top-hh*.42,hz),hw*1.12,hdp*1.1,.03,mat(0xb3202a,{roughness:.7}));break}
    case 4:{ // ---- Pirate: shirt, waistcoat, sash, breeches, boots, tricorn, eyepatch
      shell('torso',.03,tm('cloth',0xe9dfc4,{roughness:.95}));shell('armL',.034,tm('cloth',0xe9dfc4,{roughness:.95}));
      shell('chest',.058,tm('cloth',0xffffff,{roughness:.8},.62));                                           // waistcoat (outfit colour, darker)
      pants(tm('cloth',0x4c3b2b,{roughness:.9}),.026);shell('feet',.03,mat(0x2a1d14,{roughness:.7}));
      both(sd=>{ // boots: shin sleeve + folded cuff
        seg(sd+'Leg',sd+'Leg',sd+'Foot',.28,.97,.165,mat(0x2a1d14,{roughness:.7}));
        seg(sd+'Leg',sd+'Leg',sd+'Foot',.2,.42,.205,mat(0x3d2a1c,{roughness:.75}),{});});
      ring('Spine',V(waist.x,waist.y-.06*s,waist.z+.01*s),.42*W,.33*W,.1,mat(0xa8201c,{roughness:.85},1));   // sash
      box('Spine',V(waist.x,waist.y-.06*s,waist.z+.31*W*s),.1,.09,.04,mat(0xd9a937,{roughness:.3,metalness:.8}));
      belt(0x2a1d14,0,.035,.08);
      const hat=mat(0x1b1b20,{roughness:.8});
      sph('Head',V(hx,top-hh*.27,hz),hw*1.12,hh*.5,hdp*1.12,hat,{g:()=>new THREE.CylinderGeometry(.82,1,1,20,1,false),k:'crown'}).position.y-=hh*.02;
      const br=part('Head',geo('brimdisk',()=>new THREE.CylinderGeometry(1,1,.04,22)),hat,V(hx,top-hh*.43,hz),[.05,0,0],[hw*1.85,1,hdp*1.75]);void br;
      for(const k of [-1,0,1]){const ang=k*Math.PI*.66+Math.PI/2*0;void ang}
      box('Head',V(hx,top-hh*.43,hd.max[2]+hdp*.55),hw*1.15/s,.06,hdp*.7/s,hat,[-.35,0,0]);          // raised front corner
      ring('Head',V(hx,top-hh*.4,hz),hw*1.14,hdp*1.14,.025,mat(0xd9a937,{roughness:.4,metalness:.7}));
      sph('Head',V(hx-hw*.4,top-hh*.31,hd.max[2]+.004),.11,.085,.02,mat(0x111114,{roughness:.6}),{k:'ep'});   // eyepatch
      ring('Head',V(hx,top-hh*.31,hz),hw*1.03,hdp*1.03,.012,mat(0x111114,{roughness:.6}),.35);
      break}}
    return out}
  return {build,REG,_prep:prep};
})();
