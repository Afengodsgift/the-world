// WARDEN: The Warden Isles builder (M1b: island + arena shell only; combat arrives in later milestones). Everything here is skipped unless WRD.on (?warden=1).
// Globals used: THREE, scene, H, K, WRD, WARDEN, WardenSolids, solids, LOCS, TERRAIN_MATS, StaticBatch, S, banner.
// Terrain height comes from the WARDEN block appended to H() (so every system that samples H() - walking, flying, shadows - sees the same ground); this file only builds meshes and registers solids.
const WardenIsles=(()=>{
  let built=false,G=null,fire=[],inside=false,added=[],far=[],farT=-1e9,farOn=false,farN=0,hiddenN=0;
  const T={arena:{x:0,z:0,R:35}};
  const mat=(c,o)=>new THREE.MeshStandardMaterial(Object.assign({color:c,roughness:.95,flatShading:true},o||{}));
  function colour(h,x,z,sl,c){   // dark-fantasy palette: ash grass, wet stone, pale shore, cobbled courtyard
    const wx=x-WRD.x,wz=z-WRD.z,d=Math.hypot(wx,wz),n=(Math.sin(x*.21)*Math.cos(z*.17)+Math.sin(x*.07+z*.05))*.25+.5;
    if(d<WARDEN.wallR-2){const ring=Math.floor(d/4.2),cell=(Math.floor(Math.atan2(wx,wz)*d/3.2)+ring*7)&3;c.setRGB(.19+cell*.012+n*.05,.19+cell*.012+n*.05,.22+cell*.012+n*.05);return}
    const m2=Math.sin(x*.045+1.3)*Math.cos(z*.052)+Math.sin((x+z)*.11)*.4;
    c.setRGB(.1+n*.07,.19+n*.1,.07+n*.04);                                // deep moss
    if(m2>.35)c.lerp(new THREE.Color(.24,.15,.09),Math.min(1,(m2-.35)*2.2));   // bare red earth patches
    else if(m2<-.55)c.lerp(new THREE.Color(.05,.11,.07),Math.min(1,(-.55-m2)*2));  // dark thicket floor
    if(sl>.45||h>7)c.setRGB(.2,.19,.21);                                  // crag rock
    if(h<1.1)c.lerpColors(c.clone(),new THREE.Color(.3,.27,.21),Math.min(1,(1.1-h)/1.1));   // pale shore
    if(h<-.6)c.lerp(new THREE.Color('#14587a'),Math.min(1,(-.6-h)/2.6));  // seabed fades to deep water
  }
  function terrainMesh(){
    const size=(WRD.reach+8)*2,seg=110,geo=new THREE.PlaneGeometry(size,size,seg,seg);geo.rotateX(-Math.PI/2);
    const pos=geo.attributes.position,cols=new Float32Array(pos.count*3),c=new THREE.Color();
    for(let i=0;i<pos.count;i++){const x=pos.getX(i)+WRD.x,z=pos.getZ(i)+WRD.z,h=H(x,z);pos.setY(i,h);
      const sl=Math.hypot(H(x+2,z)-H(x-2,z),H(x,z+2)-H(x,z-2))/4;colour(h,x,z,sl,c);cols.set([c.r,c.g,c.b],i*3)}
    geo.setAttribute('color',new THREE.BufferAttribute(cols,3));geo.computeVertexNormals();
    const tm=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1});if(typeof TERRAIN_MATS!=='undefined')TERRAIN_MATS.push(tm);
    const m=new THREE.Mesh(geo,tm);m.position.set(WRD.x,0,WRD.z);m.receiveShadow=true;G.add(m);}
  function wall(list){
    const W=WARDEN,geo=new THREE.BoxGeometry(3.7,1,3.2),im=new THREE.InstancedMesh(geo,mat('#3b3a43'),list.length),D=new THREE.Object3D();
    list.forEach((s,i)=>{const a=Math.atan2(s.x-WRD.x,s.z-WRD.z),hh=5.2+((i*37)%7)*.45,y=H(s.x,s.z);D.position.set(s.x,y+hh/2-.4,s.z);D.rotation.set(0,a,0);D.scale.set(1,hh,1);D.updateMatrix();im.setMatrixAt(i,D.matrix)});
    im.castShadow=im.receiveShadow=true;im.frustumCulled=false;G.add(im);
    // gate: two taller towers flanking the opening, with braziers
    const gx=WRD.x+Math.sin(W.gateAng)*W.wallR,gz=WRD.z+Math.cos(W.gateAng)*W.wallR,tm=mat('#2f2e36');
    for(const sgn of[-1,1]){const ox=Math.cos(W.gateAng)*sgn*8,oz=-Math.sin(W.gateAng)*sgn*8,x=gx+ox,z=gz+oz,y=H(x,z);
      const t=new THREE.Mesh(new THREE.CylinderGeometry(2.2,2.8,10,8),tm);t.position.set(x,y+4.6,z);t.castShadow=t.receiveShadow=true;G.add(t);brazier(x,y+9.8,z)}}
  function brazier(x,y,z){const b=new THREE.Mesh(new THREE.SphereGeometry(.55,8,6),new THREE.MeshBasicMaterial({color:'#ff8a3d'}));b.position.set(x,y,z);G.add(b);fire.push(b)}
  function pillars(){const m=mat('#4a4852');for(const p of WARDEN.pillars){const x=WRD.x+Math.sin(p.a)*p.d,z=WRD.z+Math.cos(p.a)*p.d,y=H(x,z);
      const c=new THREE.Mesh(new THREE.CylinderGeometry(p.r*.85,p.r*1.15,6.5,7),m);c.position.set(x,y+3.2,z);c.castShadow=c.receiveShadow=true;G.add(c);
      const cap=new THREE.Mesh(new THREE.BoxGeometry(p.r*2.6,.5,p.r*2.6),m);cap.position.set(x,y+6.6,z);cap.rotation.y=p.a;G.add(cap);brazier(x,y+7.2,z)}}
  // DRESSING: the kit pieces from assets/warden/props.glb placed by WardenProps() (data/warden.js), merged per 90 m cell into a handful of static meshes (a few draw calls, no per-frame work). Scenery only - not solid.
  let propsMesh=[],propTris=0;
  function dress(){
    if(typeof WardenProps==='undefined'||!THREE.GLTFLoader)return;
    new THREE.GLTFLoader().load('assets/warden/props.glb',gl=>{
      const geo={};gl.scene.traverse(o=>{if(o.isMesh)geo[o.name]=o.geometry});
      const cells={},M=new THREE.Matrix4(),N=new THREE.Matrix3(),q=new THREE.Quaternion(),e=new THREE.Euler(),v=new THREE.Vector3(),sc=new THREE.Vector3(),p=new THREE.Vector3();
      for(const it of WardenProps()){const g=geo[it.p];if(!g)continue;const k=Math.floor((it.x-WRD.x)/90)+','+Math.floor((it.z-WRD.z)/90),c=cells[k]||(cells[k]={pos:[],nor:[],col:[]});
        e.set(it.tx,it.ry,it.tz,'YXZ');q.setFromEuler(e);sc.setScalar(it.s);p.set(it.x,it.y,it.z);M.compose(p,q,sc);N.getNormalMatrix(M);
        const P=g.attributes.position,Nn=g.attributes.normal,C=g.attributes.color;
        for(let i=0;i<P.count;i++){v.fromBufferAttribute(P,i).applyMatrix4(M);c.pos.push(v.x,v.y,v.z);v.fromBufferAttribute(Nn,i).applyMatrix3(N).normalize();c.nor.push(v.x,v.y,v.z);c.col.push(C.getX(i),C.getY(i),C.getZ(i))}}
      const mat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,metalness:0});if(typeof TERRAIN_MATS!=='undefined')TERRAIN_MATS.push(mat);
      for(const k in cells){const c=cells[k],bg=new THREE.BufferGeometry();bg.setAttribute('position',new THREE.Float32BufferAttribute(c.pos,3));bg.setAttribute('normal',new THREE.Float32BufferAttribute(c.nor,3));bg.setAttribute('color',new THREE.Float32BufferAttribute(c.col,3));bg.computeBoundingSphere();
        const m=new THREE.Mesh(bg,mat);m.name='WardenProps';m.matrixAutoUpdate=false;m.castShadow=false;m.receiveShadow=false;G.add(m);propsMesh.push(m);propTris+=c.pos.length/9}
    },undefined,()=>{})}
  // FOG GATES: an open translucent cylinder around every boss site. idle = faint (you can see where the bosses are from afar), sealed = bright (a fight is on), gone = felled.
  const fogs={};
  function fogBuild(){
    const m=new THREE.MeshBasicMaterial({color:'#a9b8ff',transparent:true,opacity:.16,side:THREE.FrontSide,depthWrite:false,fog:false});
    for(const s of WARDEN.sites){if(!s.fog)continue;const g=new THREE.Mesh(new THREE.CylinderGeometry(s.R,s.R,9,36,1,true),m.clone());g.position.set(WRD.x+s.x,s.y+4.5,WRD.z+s.z);g.frustumCulled=false;G.add(g);fogs[s.id]={m:g,st:'idle'}}}
  function fog(id,st){const f=fogs[id];if(!f)return;f.st=st;f.m.visible=st!=='gone';f.m.material.opacity=st==='sealed'?.42:.16}
  // camp markers: a brazier at the heart of each soldier camp so you can spot them
  function campMarks(){for(const s of WARDEN.sites)if(!s.fog&&!s.wall)brazier(WRD.x+s.x,s.y+1.1,WRD.z+s.z)}
  function build(){
    if(!WRD.on||built)return;built=true;
    G=new THREE.Group();G.name='WardenIsles';scene.add(G);
    terrainMesh();dress();fogBuild();campMarks();
    const sol=WardenSolids();wall(sol.filter(s=>s.wall));pillars();
    for(const s of sol){solids.push(s);added.push(s)}
    T.arena={x:WRD.x,z:WRD.z,R:WARDEN.arenaR};
    const L=WARDEN.landing;LOCS.push({n:'The Warden Isles',x:WRD.x+L.x,z:WRD.z+L.z,r:L.r+30});
  }
  // FAR CULL: while you are on the isle, anything wholly beyond the fog is invisible but would still be drawn (the main island alone is ~85% of the triangles seen from the arena).
  // Hides only plain, fog-affected meshes whose whole bounding sphere is past the fog's far plane; restores them when you leave. Never touches Warden meshes, the sky, the sea,
  // instanced/skinned/sprite/point objects (vegetation has its own vegCull) or anything with fog:false. Rebuilt every few seconds so late-added objects are covered.
  const _b=new THREE.Box3(),_s=new THREE.Sphere();
  function farList(){far=[];scene.updateMatrixWorld();scene.traverse(o=>{
      if(!o.isMesh||o.isInstancedMesh||o.isSkinnedMesh||o.isSprite||!o.geometry)return;for(let p=o;p;p=p.parent)if(p===G)return;
      const ms=Array.isArray(o.material)?o.material:[o.material];if(!ms.every(m=>m&&m.fog!==false))return;
      _b.setFromObject(o);if(_b.isEmpty())return;_b.getBoundingSphere(_s);if(_s.radius>1500)return;far.push({o,x:_s.center.x,z:_s.center.z,r:_s.radius})})}
  function farCull(on,t){
    if(!on){if(farOn){if(typeof Env!=='undefined'&&Env.state.cloudLod===CLOUD_LOD)Env.state.cloudLod=1;for(const f of far)if(f.o.userData._wh){f.o.userData._wh=false;f.o.visible=true}farOn=false;hiddenN=0}return}
    if(t-farT>30000||!farOn){for(const f of far)if(f.o.userData._wh){f.o.userData._wh=false;f.o.visible=true}farList();farT=t}
    if(typeof Env!=='undefined')Env.state.cloudLod=CLOUD_LOD;   // the cloud deck is ~217k triangles (3 big instanced meshes, never culled): fewer clouds here, using Environment's own quality knob
    farOn=true;const cx=camera.position.x,cz=camera.position.z,lim=(scene.fog?scene.fog.far:1700)*.97;hiddenN=0;
    for(const f of far){const hide=Math.hypot(f.x-cx,f.z-cz)-f.r>lim,o=f.o;
      if(hide){if(o.visible||o.userData._wh){o.visible=false;o.userData._wh=true;hiddenN++}}
      else if(o.userData._wh){o.userData._wh=false;o.visible=true}}}
  // Inside the walled courtyard you cannot see the sea, but SeaLife keeps up to 3x400 instanced fish (~217k triangles, never culled) alive. Hide them while inside; restore on leaving.
  let fishHid=false;
  function fishVis(show){if(typeof fishInst==='undefined'||!fishInst)return;if(show&&!fishHid)return;if(!show&&fishHid)return;
    for(const k in fishInst){const im=fishInst[k]&&fishInst[k].im;if(im)im.visible=show}fishHid=!show}
  const CLOUD_LOD=.3;let fc=-1e9;
  function tick(dt,t){
    if(!built)return;                                   // flag off => nothing runs
    const d=Math.hypot(S.x-WRD.x,S.z-WRD.z);
    if(d>WRD.reach+200){PlayerCombat.leave();if(farOn)farCull(false,t);fishVis(true);return}
    if(t-fc>300||!farOn){fc=t;farCull(true,t)}
    inside=d<WARDEN.arenaR;fishVis(!inside);PlayerCombat.tick(dt,t);
    const k=.75+.25*Math.sin(t/110)+.1*Math.sin(t/37);for(let i=0;i<fire.length;i++)fire[i].scale.setScalar(.9+.18*Math.sin(t/130+i*1.7)*k);
  }
  return{build,tick,fog,inArena:()=>inside,hidden:()=>hiddenN,arena:()=>T.arena,props:()=>({meshes:propsMesh.length,tris:propTris}),_t:()=>({built,added,fire,G})}})();
