// SpaceEnvironment: what the world looks like from above. Built on top of the existing world, not instead of it.
//  - the sea becomes opaque with height (otherwise each island's square terrain patch shows through it as a pale tile)
//  - the sea disc's outer ring bends gently downward (a shallow dome): the limb of the world curves, without faking a sphere
//  - a faint atmosphere glow follows that rim
//  - when you are far from home the real world fades into the dark (fog) and is replaced by an IMPOSTOR: a flat copy of the world disc, scaled about the
//    camera so it keeps its true angular size and perspective (and kept inside the depth range), plus a soft halo so home is always findable
//  - faint dust streaks around you in space: the only reference that shows you are moving (stars are infinitely far)
//  - a world-fixed cloud deck fades in as the player-following clouds fade out, so from high up you see weather over the world, not one
//    cluster stuck under you. It uses the same cloud shapes and material as Environment, so weather/time-of-day tint it too.
// Everything is driven by Space.f (altitude); nothing here is networked.
const SpaceEnv=(()=>{
  const SEA_R=6000,FLAT_R=3400,DOME_K=3500,N_DECK=130,BOX=5800;
  const sm=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
  const drop=d=>d>FLAT_R?(d-FLAT_R)*(d-FLAT_R)/(2*DOME_K):0;                       // metres the world's surface falls away at distance d from the centre
  let rim=null,deck=[],deckData=[],t0=0,baseOpacity=.7,imp=null,halo=null,dust=null;
  const IMP_FROM=250000,IMP_FULL=500000,IMP_D=700000,IMP_R=7000,DUST_N=220;
  // impostor placement for a camera 'dist' metres from the world's centre: the disc keeps its true angular size (IMP_R/dist), the halo never gets smaller than ~.045 rad
  function impostor(dist){const op=sm(IMP_FROM,IMP_FULL,dist),Dp=Math.min(dist,IMP_D),k=Dp/dist;return {show:dist>IMP_FROM,opacity:op,k,Dp,discR:IMP_R*k,halo:Math.max(IMP_R*k*2.4,Dp*.045)}}
  const _m=new THREE.Matrix4(),_q=new THREE.Quaternion(),_e=new THREE.Euler(),_p=new THREE.Vector3(),_s=new THREE.Vector3();
  function bend(geo,rimIntensity){                                                 // XY ring -> dome (mesh is rotated -90deg about X, so local z becomes world y)
    const pos=geo.attributes.position,col=rimIntensity?new Float32Array(pos.count*3):null;
    for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=pos.getY(i),d=Math.hypot(x,y);pos.setZ(i,-drop(d));
      if(col){const k=rimIntensity(d);col[i*3]=.42*k;col[i*3+1]=.70*k;col[i*3+2]=1*k}}
    if(col)geo.setAttribute('color',new THREE.BufferAttribute(col,3));
    pos.needsUpdate=true;geo.computeVertexNormals()}
  function build(){
    if(typeof seaMesh==='undefined'||!seaMesh)return;
    const old=seaMesh.geometry,g=new THREE.RingGeometry(.01,SEA_R,96,48);bend(g);seaMesh.geometry=g;old.dispose();baseOpacity=seaMesh.material.opacity;
    // atmosphere glow along the rim (additive, brightness in vertex colours)
    const rg=new THREE.RingGeometry(4600,9600,160,26);bend(rg,d=>Math.exp(-Math.pow((d-6050)/380,2))*.55+Math.exp(-Math.pow((d-6050)/1500,2))*.1);
    rim=new THREE.Mesh(rg,new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,depthTest:false,fog:false,side:THREE.DoubleSide,toneMapped:false,opacity:0}));   // no depth test: it hugs the sea surface within the depth buffer's resolution and would z-fight
    rim.rotation.x=-Math.PI/2;rim.position.y=-.2;rim.visible=false;rim.renderOrder=20;scene.add(rim);
    // world impostor + halo (hidden until you are far away)
    {const g=new THREE.CircleGeometry(1,64),pc=g.attributes.position,col=new Float32Array(pc.count*3);
      for(let i=0;i<pc.count;i++){const r=Math.hypot(pc.getX(i),pc.getY(i));col[i*3]=.12+.30*r;col[i*3+1]=.40+.40*r;col[i*3+2]=.74+.26*r}
      g.setAttribute('color',new THREE.BufferAttribute(col,3));
      imp=new THREE.Mesh(g,new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:0,depthWrite:false,depthTest:false,fog:false,toneMapped:false}));imp.rotation.x=-Math.PI/2;imp.visible=false;imp.renderOrder=4;imp.frustumCulled=false;scene.add(imp);
      if(typeof document!=='undefined'){const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d'),gr=x.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.2,'rgba(255,255,255,.9)');gr.addColorStop(.45,'rgba(255,255,255,.35)');gr.addColorStop(.7,'rgba(255,255,255,.08)');gr.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=gr;x.fillRect(0,0,64,64);
        halo=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),color:'#8fd0ff',transparent:true,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending,fog:false,opacity:0,toneMapped:false}));halo.visible=false;halo.renderOrder=5;halo.frustumCulled=false;scene.add(halo)}}
    // space dust: world-fixed motes that streak past at speed
    {const pos=new Float32Array(DUST_N*3),seg=new Float32Array(DUST_N*6);let s=77;const r=()=>(s=s*16807%2147483647)/2147483647;for(let i=0;i<pos.length;i++)pos[i]=(r()-.5)*24000;
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(seg,3).setUsage(THREE.DynamicDrawUsage));
      const m=new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:'#bcd7ff',transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,fog:false,toneMapped:false}));m.frustumCulled=false;m.visible=false;m.renderOrder=3;scene.add(m);
      dust={pos,seg,m,prev:new THREE.Vector3(),has:false}}
    // world-fixed cloud deck: same 3 cloud shapes + shared material as Environment
    if(typeof Env!=='undefined'&&Env.cloudGeo&&Env.cloudMat){
      let sd=4242;const r=()=>(sd=(sd*16807)%2147483647)/2147483647;
      for(let v=0;v<3;v++){const m=new THREE.InstancedMesh(Env.cloudGeo(v),Env.cloudMat,Math.ceil(N_DECK/3));m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);m.frustumCulled=false;m.count=0;m.renderOrder=1;scene.add(m);deck.push(m)}
      for(let i=0;i<N_DECK;i++)deckData.push({bx:(r()-.5)*2*BOX,bz:(r()-.5)*2*BOX,y:360+r()*300,w:110+r()*260,h:60+r()*90,yaw:r()*6.283,th:r()*.8})}
  }
  function update(dt,t){
    const F=Space.f;
    // opaque sea from above: hides the terrain squares, richer colour
    if(seaMesh){const o=baseOpacity+(1-baseOpacity)*F.above;if(Math.abs(seaMesh.material.opacity-o)>.002)seaMesh.material.opacity=o;
      const bs=.35*(1-F.above);if(Math.abs(seaMesh.material.bumpScale-bs)>.005)seaMesh.material.bumpScale=bs}   // the wave bump texture aliases (moire) at distance
    // rim glow
    if(rim){const o=F.above*(.25+.75*F.thin);rim.visible=o>.01;if(rim.visible)rim.material.opacity=o}
    // world impostor: far from home the real world is fogged out and this takes over
    if(imp&&typeof camera!=='undefined'){const cp=camera.position,dist=Math.hypot(cp.x,cp.y,cp.z),I=impostor(dist);imp.visible=I.show;if(halo)halo.visible=I.show;
      if(I.show){const ux=-cp.x/dist,uy=-cp.y/dist,uz=-cp.z/dist;imp.position.set(cp.x+ux*I.Dp,cp.y+uy*I.Dp,cp.z+uz*I.Dp);imp.scale.setScalar(I.discR);imp.material.opacity=I.opacity;
        if(halo){halo.position.copy(imp.position);halo.scale.set(I.halo,I.halo,1);halo.material.opacity=.3+.7*I.opacity}}}
    // dust streaks
    if(dust&&typeof camera!=='undefined'){const cp=camera.position,vis=sm(.05,.4,F.space);
      if(!dust.has){dust.prev.copy(cp);dust.has=true}
      const dx=cp.x-dust.prev.x,dy=cp.y-dust.prev.y,dz=cp.z-dust.prev.z;dust.prev.copy(cp);
      dust.m.visible=vis>.01;
      if(dust.m.visible&&dt>0){const sp=Math.hypot(dx,dy,dz)/dt,L=Math.max(160,Math.min(12000,160+sp*.5)),L2=L*2,ix=sp>1?dx/(sp*dt):0,iy=sp>1?dy/(sp*dt):0,iz=sp>1?dz/(sp*dt):1;
        const len=Math.max(.4,Math.min(500,sp*dt)),p=dust.pos,sg=dust.seg;
        for(let i=0;i<DUST_N;i++){const o=i*3;let x=p[o]-dx,y=p[o+1]-dy,z=p[o+2]-dz;x=((x+L)%L2+L2)%L2-L;y=((y+L)%L2+L2)%L2-L;z=((z+L)%L2+L2)%L2-L;p[o]=x;p[o+1]=y;p[o+2]=z;
          const q=i*6;sg[q]=x;sg[q+1]=y;sg[q+2]=z;sg[q+3]=x+ix*len;sg[q+4]=y+iy*len;sg[q+5]=z+iz*len}
        dust.m.geometry.attributes.position.needsUpdate=true;dust.m.position.copy(cp);dust.m.material.opacity=.6*vis*(.3+.7*Math.min(1,sp/80))}}
    // cloud deck
    if(!deck.length)return;
    const k=F.above;
    if(k<.01){for(const m of deck)m.count=0;return}
    const cover=Env.state.wx.cloud,drift=t*7,cnt=[0,0,0],W=BOX*2;
    for(let i=0;i<deckData.length;i++){const c=deckData[i];
      const x=((c.bx+drift)%W+W*1.5)%W-BOX,z=((c.bz+drift*.4)%W+W*1.5)%W-BOX,d=Math.hypot(x,z);
      let vis=sm(c.th,c.th+.2,cover+.12)*sm(BOX,BOX-900,d);                              // weather decides how much deck there is; it thins out at the world's edge
      if(typeof SKY!=='undefined'&&Math.abs(c.y-SKY.base)<260)vis*=sm(SKY.R+120,SKY.R+320,Math.hypot(x-SKY.x,z-SKY.z)); // keep the floating island's clearing
      const sc=c.w*k*vis,hs=c.h*k*vis*(.7+.6*cover);
      if(sc<2)continue;
      const v=i%3;_p.set(x,c.y+Math.sin(t*.05+i*1.3)*6,z);_e.set(0,c.yaw,0);_q.setFromEuler(_e);_s.set(sc,Math.max(hs,.5),sc*.8);_m.compose(_p,_q,_s);deck[v].setMatrixAt(cnt[v]++,_m)}
    for(let v=0;v<3;v++){deck[v].count=cnt[v];deck[v].instanceMatrix.needsUpdate=true}
  }
  return {build,update,drop,impostor};
})();
if(typeof module!=='undefined')module.exports=SpaceEnv;
