// The floating island, up in the clouds: a cosy meadow island with a moss-roofed cottage, vegetable beds, trees, flowers, a lamp post, a waterfall,
// a chunky rocky underside with hanging stalactites and drifting rocks, and a rope-and-plank bridge to a small satellite island.
// Everything is built from primitives (no extra assets) except trees/bushes/lanterns, which use the existing kit.
// Exposes: SKYH(dx,dz) (surface height, relative to SKY centre; used for placing things), SKYG(dx,dz) (walkable ground or -Infinity), buildSkyIsland(), skyTick(t).
// Globals read: SKY (src/data/islands.js: x,z,R,base), THREE, scene, solids, orbs, scatter, place, sstep, mulberry, Env (optional).
const SKYI={HX:34,HZ:-20,ab:.5,satGap:80,satR:30};
const skyRim=a=>SKY.R*(1+.07*Math.sin(3*a+.5)+.045*Math.sin(5*a+2));
const skyRim2=a=>SKYI.satR*(1+.08*Math.sin(4*a+1));
const satCentre=()=>{const R=skyRim(SKYI.ab)+SKYI.satGap;return {x:Math.cos(SKYI.ab)*R,z:Math.sin(SKYI.ab)*R}};
function skyTop(dx,dz){
  const a=Math.atan2(dz,dx),d=Math.hypot(dx,dz),R=skyRim(a),dh=Math.hypot(dx-SKYI.HX,dz-SKYI.HZ),plat=1-sstep(16,36,dh);
  let h=SKY.base+(Math.sin(dx*.07)*Math.cos(dz*.06)*.7+Math.sin(dx*.13+dz*.09)*.35)*(1-.85*plat);
  h+=4.2*plat;h-=sstep(R-9,R,d)*1.0;return h}
function skyTop2(dx,dz){const d=Math.hypot(dx,dz),R=skyRim2(Math.atan2(dz,dx));return SKY.base+(Math.sin(dx*.11)*Math.cos(dz*.1)*.35)-sstep(R-7,R,d)*.9}
function SKYH(dx,dz){const d=Math.hypot(dx,dz);return d<=skyRim(Math.atan2(dz,dx))?skyTop(dx,dz):SKY.base-4}
function SKYG(dx,dz){ // ground you can stand on: the main island, the satellite, or nothing (step off the edge and you fall)
  const d=Math.hypot(dx,dz);if(d<=skyRim(Math.atan2(dz,dx))-.2)return skyTop(dx,dz);
  const c=satCentre(),ex=dx-c.x,ez=dz-c.z;if(Math.hypot(ex,ez)<=skyRim2(Math.atan2(ez,ex))-.2)return skyTop2(ex,ez);return -Infinity}
let skyAnim={floaters:[],smoke:[],glow:[],flames:[],water:null};
function _hash3(x,y,z){const s=Math.sin(x*127.1+y*311.7+z*74.7)*43758.5453;return s-Math.floor(s)}
function _noise3(x,y,z){const xi=Math.floor(x),yi=Math.floor(y),zi=Math.floor(z),xf=x-xi,yf=y-yi,zf=z-zi,u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf),w=zf*zf*(3-2*zf),L=(a,b,t)=>a+(b-a)*t;
  return L(L(L(_hash3(xi,yi,zi),_hash3(xi+1,yi,zi),u),L(_hash3(xi,yi+1,zi),_hash3(xi+1,yi+1,zi),u),v),L(L(_hash3(xi,yi,zi+1),_hash3(xi+1,yi,zi+1),u),L(_hash3(xi,yi+1,zi+1),_hash3(xi+1,yi+1,zi+1),u),v),w)}
// ---- grass top: a polar grid following the island's irregular outline, with a rolled lip that tucks under into the rock ----
function _polarTop(cx,cz,rimFn,topFn,colorFn){
  const SEG=96,RING=34,LIP=[[1.012,-.7],[1.0,-1.7],[.94,-2.8]],pos=[],col=[],idx=[],c=new THREE.Color();
  const rows=RING+1+LIP.length;
  for(let i=0;i<rows;i++)for(let j=0;j<SEG;j++){const a=j/SEG*Math.PI*2,R=rimFn(a);let u,y,lip=false;
    if(i<=RING){u=i/RING;const rr=u*R;y=topFn(Math.cos(a)*rr,Math.sin(a)*rr)}else{const L=LIP[i-RING-1];u=L[0];y=topFn(Math.cos(a)*R,Math.sin(a)*R)+L[1];lip=true}
    const x=Math.cos(a)*R*u,z=Math.sin(a)*R*u;pos.push(cx+x,y,cz+z);colorFn(c,x,z,lip,i>RING?(i-RING)/LIP.length:0);col.push(c.r,c.g,c.b)}
  for(let i=0;i<rows-1;i++)for(let j=0;j<SEG;j++){const a=i*SEG+j,b=i*SEG+(j+1)%SEG,d=(i+1)*SEG+j,e=(i+1)*SEG+(j+1)%SEG;idx.push(a,d,b,b,d,e)}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.setIndex(idx);g.computeVertexNormals();return g}
// ---- rocky underside: an inverted, jagged, flat-shaded cone from the lip down to a point ----
function _rockMass(cx,cz,rimFn,topFn,depth,seed){
  const SEG=64,ROWS=18,pos=[],col=[],idx=[],c=new THREE.Color(),moss=new THREE.Color('#6d8f3f'),stone=new THREE.Color('#a39d92'),dark=new THREE.Color('#5c5f6b'),deep=new THREE.Color('#44475a');
  for(let i=0;i<=ROWS;i++)for(let j=0;j<SEG;j++){const a=j/SEG*Math.PI*2,R=rimFn(a),v=i/ROWS,rimY=topFn(Math.cos(a)*R,Math.sin(a)*R)-2.8;
    const lump=(_noise3(Math.cos(a)*2.2+seed,Math.sin(a)*2.2,v*4.5)-.5)*.34,rr=R*.94*Math.pow(1-v,.8)*(1+lump)*(i===ROWS?0:1);
    const y=rimY-depth*Math.pow(v,.95)+(_noise3(a*3+seed,v*6,3.3)-.5)*5*(v>0?1:0);
    pos.push(cx+Math.cos(a)*rr,y,cz+Math.sin(a)*rr);
    c.copy(moss).lerp(stone,sstep(.0,.2,v)).lerp(dark,sstep(.3,.7,v)).lerp(deep,sstep(.65,1,v));const n=(_noise3(a*5,v*9,seed)-.5)*.16;c.r+=n;c.g+=n;c.b+=n;col.push(c.r,c.g,c.b)}
  for(let i=0;i<ROWS;i++)for(let j=0;j<SEG;j++){const a=i*SEG+j,b=i*SEG+(j+1)%SEG,d=(i+1)*SEG+j,e=(i+1)*SEG+(j+1)%SEG;idx.push(a,b,d,b,e,d)}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.setIndex(idx);g.computeVertexNormals();return g}
function buildSkyIsland(){
  const r=mulberry(20261004),R=SKY.R,base=SKY.base,HX=SKYI.HX,HZ=SKYI.HZ,TAU=Math.PI*2;
  const S2=satCentre(),ab=SKYI.ab,dir={x:Math.cos(ab),z:Math.sin(ab)};
  const stdM=(c,o)=>new THREE.MeshStandardMaterial(Object.assign({color:c,roughness:.9,flatShading:true},o||{}));
  const rockMat=new THREE.MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:1});
  // winding path from the cottage door to the bridge (sampled as a polyline for colouring and for keeping trees off it)
  const P0={x:dir.x*(skyRim(ab)-4),z:dir.z*(skyRim(ab)-4)},door={x:HX,z:HZ+5.5},ctrl={x:HX+8,z:HZ+36},path=[];
  for(let i=0;i<=40;i++){const t=i/40,u=1-t;path.push({x:u*u*door.x+2*u*t*ctrl.x+t*t*P0.x,z:u*u*door.z+2*u*t*ctrl.z+t*t*P0.z})}
  const pathDist=(x,z)=>{let m=1e9;for(const p of path)m=Math.min(m,Math.hypot(x-p.x,z-p.z));return m};
  // ---------------- main island: grass top, rock underside ----------------
  const g1=new THREE.Color('#78bd45'),g2=new THREE.Color('#9ad65c'),g3=new THREE.Color('#62a63a'),soil=new THREE.Color('#7a5a38'),sand=new THREE.Color('#dcc78f');
  const topGeo=_polarTop(SKY.x,SKY.z,skyRim,skyTop,(c,x,z,lip,lt)=>{
    const n=_noise3(x*.05,0,z*.05),m=_noise3(x*.2+9,3,z*.2);c.copy(g1).lerp(g2,n).lerp(g3,m*.35);
    const pd=pathDist(x,z);if(pd<2.6)c.lerp(sand,1-sstep(1.3,2.6,pd));
    if(lip)c.lerp(soil,.25+lt*.7);const d=Math.hypot(x,z),ar=Math.atan2(z,x);c.multiplyScalar(1-.14*sstep(skyRim(ar)-14,skyRim(ar),d))});
  const top=new THREE.Mesh(topGeo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}));top.receiveShadow=true;scene.add(top);
  const rock=new THREE.Mesh(_rockMass(SKY.x,SKY.z,skyRim,skyTop,R*.95,3.7),rockMat);rock.castShadow=true;scene.add(rock);
  // hanging stalactites + tiny drifting rocks
  const rockC=stdM('#8a867f');
  for(let i=0;i<9;i++){const a=r()*TAU,rr=R*(.2+r()*.45),len=22+r()*40,rad=3+r()*5,m=new THREE.Mesh(new THREE.ConeGeometry(rad,len,6),rockC);
    m.rotation.set(Math.PI+(r()-.5)*.3,r()*TAU,(r()-.5)*.3);m.position.set(SKY.x+Math.cos(a)*rr,base-30-r()*25-len*.35,SKY.z+Math.sin(a)*rr);m.castShadow=true;scene.add(m)}
  for(let i=0;i<16;i++){const a=r()*TAU,rr=R*(1.05+r()*.4),s=1.5+r()*6,m=new THREE.Mesh(new THREE.IcosahedronGeometry(s,0),i%3?rockC:stdM('#74798a'));
    const y0=base-35+r()*55;m.position.set(SKY.x+Math.cos(a)*rr,y0,SKY.z+Math.sin(a)*rr);m.rotation.set(r()*3,r()*3,r()*3);m.scale.set(1,.7+r()*.5,1);m.castShadow=true;scene.add(m);skyAnim.floaters.push({m,y0,ph:r()*TAU,sp:.25+r()*.35,amp:.8+r()*1.6,rs:(r()-.5)*.25})}
  // ---------------- waterfall into the clouds, with a little pond feeding it ----------------
  {const aw=2.35,Rw=skyRim(aw),ex=SKY.x+Math.cos(aw)*(Rw-.5),ez=SKY.z+Math.sin(aw)*(Rw-.5),ty=skyTop(Math.cos(aw)*(Rw-.5),Math.sin(aw)*(Rw-.5));
    const wf=new THREE.Mesh(new THREE.PlaneGeometry(9,80),new THREE.MeshBasicMaterial({color:'#d6efff',transparent:true,opacity:.72,side:THREE.DoubleSide,depthWrite:false}));
    wf.position.set(ex+Math.cos(aw)*2.2,ty-40-1.6,ez+Math.sin(aw)*2.2);wf.rotation.y=-aw+Math.PI/2;scene.add(wf);skyAnim.water=wf;
    const pond=new THREE.Mesh(new THREE.CircleGeometry(7,28),new THREE.MeshStandardMaterial({color:'#5fb9ea',roughness:.15,metalness:.1,transparent:true,opacity:.9,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
    const px=Math.cos(aw)*(Rw-12),pz=Math.sin(aw)*(Rw-12);pond.rotation.x=-Math.PI/2;pond.position.set(SKY.x+px,skyTop(px,pz)+.08,SKY.z+pz);scene.add(pond)}
  // ---------------- cottage ----------------
  const y0=skyTop(HX,HZ),cot=new THREE.Group();cot.position.set(SKY.x+HX,y0,SKY.z+HZ);scene.add(cot);
  {const wall=stdM('#f3e4b9'),timber=stdM('#7c4a25'),stone=stdM('#9d948b'),mossR=stdM('#79a63f'),door=stdM('#4e8f3c'),potM=stdM('#b4663a'),
      glass=new THREE.MeshStandardMaterial({color:'#9fd2f2',emissive:'#ffcf70',emissiveIntensity:0,roughness:.2});skyAnim.glow.push({mat:glass,k:1.5});
    const box=(w,h,d,x,y,z,mat,par)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;(par||cot).add(m);return m};
    const Wf=8,Dp=11,WH=3.4,PL=.7,A=.62,run=Wf/2+.7,rise=run*Math.tan(A),sl=run/Math.cos(A),by=PL+WH; // front width, depth, wall height, plinth, roof pitch...
    box(Wf+.6,PL,Dp+.6,0,PL/2,0,stone);box(Wf,WH,Dp,0,PL+WH/2,0,wall);
    // timber frame on all four faces
    for(const zf of [Dp/2+.05,-Dp/2-.05]){for(const x of [-Wf/2,0,Wf/2])box(.28,WH,.14,x,PL+WH/2,zf,timber);box(Wf+.3,.26,.14,0,PL+WH*.55,zf,timber);box(Wf+.3,.3,.14,0,by,zf,timber)}
    for(const xf of [Wf/2+.05,-Wf/2-.05]){for(const z of [-Dp/2,-Dp/6,Dp/6,Dp/2])box(.14,WH,.28,xf,PL+WH/2,z,timber);box(.14,.26,Dp+.3,xf,PL+WH*.55,0,timber);box(.14,.3,Dp+.3,xf,by,0,timber)}
    // gable triangles, front and back (wall colour) + timber trim
    const tri=new THREE.Shape();tri.moveTo(-Wf/2,0);tri.lineTo(Wf/2,0);tri.lineTo(0,Wf/2*Math.tan(A));
    for(const s of [1,-1]){const gm=new THREE.Mesh(new THREE.ExtrudeGeometry(tri,{depth:.3,bevelEnabled:false}),wall);gm.position.set(0,by,s>0?Dp/2-.3:-Dp/2);gm.castShadow=true;cot.add(gm);
      const t1=box(Wf/Math.cos(A)*.5+.2,.18,.12,0,0,0,timber),t2=box(Wf/Math.cos(A)*.5+.2,.18,.12,0,0,0,timber);
      t1.position.set(-Wf/4,by+Wf/4*Math.tan(A),s*(Dp/2+.06));t1.rotation.z=A;t2.position.set(Wf/4,by+Wf/4*Math.tan(A),s*(Dp/2+.06));t2.rotation.z=-A}
    // roof: two moss-covered planes, fascia boards, ridge, and a scatter of moss/grass lumps
    for(const s of [1,-1]){const pl=box(sl+.2,.34,Dp+1.6,s*run/2,by+rise/2+.12,0,mossR);pl.rotation.z=-s*A;
      box(.12,.34,Dp+1.6,s*(run+.05),by-.02,0,timber);}
    box(.5,.3,Dp+1.7,0,by+rise+.2,0,stone);
    const lumpMats=[stdM('#6c9a38'),stdM('#86b447'),stdM('#5c8a30'),stdM('#9cc654')];
    for(let i=0;i<46;i++){const s=r()<.5?1:-1,t=.08+r()*.88,x=s*(run-t*run),y=by+t*rise+.3,z=(r()-.5)*(Dp+1.2),m=new THREE.Mesh(new THREE.IcosahedronGeometry(.45+r()*.55,0),lumpMats[i%4]);
      m.position.set(x,y,z);m.scale.set(1,.45,1);cot.add(m)}
    // chimney with smoke
    const chx=-run*.45,chz=-Dp*.22,top_y=by+rise+1.4,ch=box(1.2,top_y-(by-.4),1.2,chx,(top_y+by-.4)/2,chz,stone);box(1.5,.25,1.5,chx,top_y+.1,chz,stone);
    const smokeM=new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.5,depthWrite:false});
    for(let i=0;i<7;i++){const m=new THREE.Mesh(new THREE.IcosahedronGeometry(.55,0),smokeM.clone());m.position.set(chx,top_y+.4,chz);cot.add(m);skyAnim.smoke.push({m,age:i*.7,x:chx,y:top_y+.3,z:chz})}
    // front door (round top), step, windows, round gable window, flower boxes, pots
    const dz=Dp/2+.1;box(2.0,2.8,.18,-1.2,PL+1.4,dz,timber);box(1.5,1.9,.2,-1.2,PL+.95,dz+.02,door);
    const arch=new THREE.Mesh(new THREE.CylinderGeometry(.75,.75,.2,16),door);arch.rotation.x=Math.PI/2;arch.position.set(-1.2,PL+1.9,dz+.02);arch.castShadow=true;cot.add(arch);
    box(.14,.14,.14,-.65,PL+1.2,dz+.14,stdM('#d8b24a'));box(2.8,.28,1.3,-1.2,.14,Dp/2+.85,stone);
    for(const [wx,wz,ry] of [[2.3,Dp/2+.1,0],[-2.8,-Dp/2-.1,0],[Wf/2+.1,-2.2,Math.PI/2],[Wf/2+.1,2.4,Math.PI/2],[-Wf/2-.1,-1.4,Math.PI/2],[-Wf/2-.1,2.4,Math.PI/2]]){
      const wg=new THREE.Group();wg.position.set(wx,PL+1.95,wz);wg.rotation.y=ry;cot.add(wg);box(1.9,1.5,.16,0,0,0,timber,wg);box(1.5,1.1,.2,0,0,.02,glass,wg);box(.1,1.1,.22,0,0,.02,timber,wg);box(1.5,.1,.22,0,0,.02,timber,wg)}
    {const fb=new THREE.Group();fb.position.set(2.3,PL+1.0,Dp/2+.42);cot.add(fb);box(2.0,.36,.5,0,0,0,potM,fb);
      const fc=['#ff6f91','#ffd23f','#ffffff','#ff9a3d','#c77dff'];for(let i=0;i<7;i++){const m=new THREE.Mesh(new THREE.IcosahedronGeometry(.17,0),stdM(fc[i%5]));m.position.set(-.85+i*.28,.3+r()*.1,(r()-.5)*.2);fb.add(m);const lf=new THREE.Mesh(new THREE.IcosahedronGeometry(.2,0),stdM('#4f9a3a'));lf.position.set(-.85+i*.28,.2,.15);fb.add(lf)}}
    const rw=new THREE.Mesh(new THREE.TorusGeometry(.62,.1,6,20),timber);rw.position.set(0,by+1.1,Dp/2+.18);cot.add(rw);
    const rg=new THREE.Mesh(new THREE.CircleGeometry(.55,20),glass);rg.position.set(0,by+1.1,Dp/2+.1);cot.add(rg);
    for(const s of [-1,1]){const sh=box(.5,1.2,.1,s*1.1,by+1.1,Dp/2+.16,door);sh.rotation.z=s*.12}
    for(const px of [-3.4,.4]){const pot=new THREE.Mesh(new THREE.CylinderGeometry(.4,.3,.6,8),potM);pot.position.set(px,.3,Dp/2+1.1);cot.add(pot);const pl2=new THREE.Mesh(new THREE.IcosahedronGeometry(.5,0),stdM('#4f9a3a'));pl2.position.set(px,.85,Dp/2+1.1);cot.add(pl2)}
    solids.push({x:SKY.x+HX-2.3,z:SKY.z+HZ,r:4.9},{x:SKY.x+HX+2.3,z:SKY.z+HZ,r:4.9},{x:SKY.x+HX,z:SKY.z+HZ+3.5,r:4.6},{x:SKY.x+HX,z:SKY.z+HZ-3.5,r:4.6})}
  // ---------------- vegetable beds (instanced crops) ----------------
  {const soilM=stdM('#5b3b22'),frameM=stdM('#8a5a2e'),beds=[[HX-6.6,HZ+9.4,0],[HX+4.2,HZ+9.4,0],[HX+13.2,HZ+1.5,Math.PI/2]],W=6.2,D=3.0,leaf=[],pump=[],tom=[],roots=[];
    for(const [bx,bz,ry] of beds){const g=new THREE.Group(),by0=skyTop(bx,bz);g.position.set(SKY.x+bx,by0,SKY.z+bz);g.rotation.y=-ry;scene.add(g);
      const sb=new THREE.Mesh(new THREE.BoxGeometry(W,.45,D),soilM);sb.position.y=.2;sb.receiveShadow=true;g.add(sb);
      for(const [fx,fz,fw,fd] of [[0,D/2,W+.3,.2],[0,-D/2,W+.3,.2],[W/2,0,.2,D],[-W/2,0,.2,D]]){const f=new THREE.Mesh(new THREE.BoxGeometry(fw,.6,fd),frameM);f.position.set(fx,.3,fz);f.castShadow=true;g.add(f)}
      const rows=4,per=7;for(let rI=0;rI<rows;rI++){const kind=(rI+Math.floor(bx))%4;for(let k=0;k<per;k++){const lx=-W/2+.6+k*(W-1.2)/(per-1),lz=-D/2+.45+rI*(D-.9)/(rows-1),cs=Math.cos(-ry),sn=Math.sin(-ry);
        // local (lx,lz) -> world offset for the instanced crops
        const wx=SKY.x+bx+lx*Math.cos(ry)+lz*Math.sin(ry),wz=SKY.z+bz-lx*Math.sin(ry)+lz*Math.cos(ry);
        const e={x:wx,y:by0+.45,z:wz,s:.8+r()*.5,r:r()*TAU};(kind===0||kind===1?leaf:kind===2?pump:tom).push(e)}}
      solids.push({x:SKY.x+bx,z:SKY.z+bz,r:2.4});}
    const mkInst=(geo,mat,list,lift,colors)=>{if(!list.length)return;const im=new THREE.InstancedMesh(geo,mat,list.length),m4=new THREE.Matrix4(),q=new THREE.Quaternion(),p=new THREE.Vector3(),sc=new THREE.Vector3(),c=new THREE.Color();
      list.forEach((e,i)=>{p.set(e.x,e.y+lift*e.s,e.z);q.setFromAxisAngle(new THREE.Vector3(0,1,0),e.r);sc.set(e.s,e.s*(lift>.2?1:.7),e.s);m4.compose(p,q,sc);im.setMatrixAt(i,m4);im.setColorAt(i,c.set(colors[i%colors.length]))});im.castShadow=true;scene.add(im)};
    mkInst(new THREE.IcosahedronGeometry(.36,0),new THREE.MeshStandardMaterial({roughness:.9,flatShading:true}),leaf,.3,['#4fa83a','#6cc045','#a9d86e','#3f9a3a','#8fcf5a']);
    mkInst(new THREE.IcosahedronGeometry(.34,0),new THREE.MeshStandardMaterial({roughness:.8,flatShading:true}),pump,.3,['#ff8c1a','#f07a10','#ffa032']);
    mkInst(new THREE.IcosahedronGeometry(.3,0),new THREE.MeshStandardMaterial({roughness:.7,flatShading:true}),tom,.55,['#e8402a','#d9331f','#4fa83a','#e8402a']);
    for(const e of tom){const st=new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,1.2,5),frameM);st.position.set(e.x,e.y+.6,e.z);scene.add(st)}}
  // ---------------- lamp posts (kit lantern), bench, fence posts ----------------
  for(const [lx,lz] of [[HX+4.6,HZ+13.4],[P0.x-1.6,P0.z-1.6],[HX-9,HZ+4]]){const y=skyTop(lx,lz);place(scene,'lantern',SKY.x+lx,y,SKY.z+lz,0,2.5);solids.push({x:SKY.x+lx,z:SKY.z+lz,r:.35})}
  // ---------------- trees, bushes, rocks, flowers (placed away from the cottage, beds, path and bridge) ----------------
  const free=(x,z,minCot,minPath)=>Math.hypot(x-HX,z-HZ)>minCot&&pathDist(x,z)>minPath&&Math.hypot(x-P0.x,z-P0.z)>12;
  const kinds=['tree_oak','tree_oak','tree_fat','tree_pineRoundA','tree_oak'],TH={tree_oak:10,tree_fat:8.5,tree_pineRoundA:10,plant_bushLarge:1.4,stone_largeA:2.2,rock_tallB:2.6},P={};
  const add=(nm,x,z,s)=>{(P[nm]=P[nm]||[]).push({x:SKY.x+x,y:skyTop(x,z),z:SKY.z+z,ry:r()*TAU,s})};
  for(let k=0,n=0;k<400&&n<26;k++){const a=r()*TAU,rr=R*(.25+r()*.65),x=Math.cos(a)*rr,z=Math.sin(a)*rr;if(rr>skyRim(a)-7||!free(x,z,24,5))continue;if(P.tree_oak&&[].concat(...Object.values(P)).some(p=>Math.hypot(p.x-SKY.x-x,p.z-SKY.z-z)<7))continue;add(kinds[n%5],x,z,.95+r()*.6);n++}
  for(let k=0,n=0;k<400&&n<22;k++){const a=r()*TAU,rr=R*(.15+r()*.8),x=Math.cos(a)*rr,z=Math.sin(a)*rr;if(rr>skyRim(a)-5||!free(x,z,20,3))continue;add('plant_bushLarge',x,z,.9+r()*.8);n++}
  for(let k=0,n=0;k<300&&n<7;k++){const a=r()*TAU,rr=R*(.3+r()*.65),x=Math.cos(a)*rr,z=Math.sin(a)*rr;if(rr>skyRim(a)-5||!free(x,z,22,4))continue;add(r()<.5?'stone_largeA':'rock_tallB',x,z,.5+r()*.9);n++}
  for(const nm in P){const f=scatter(nm,TH[nm],P[nm]);if(!f)continue;for(const p of P[nm]){if(nm.startsWith('tree_'))solids.push({x:p.x,z:p.z,r:.35*p.s});else if(!nm.startsWith('plant_'))solids.push({x:p.x,z:p.z,r:f.w*.35*p.s,h:p.y+2*p.s})}}
  {const fl=[],fc=['#ff6f91','#ffd23f','#ffffff','#ff9a3d','#c77dff','#7dd3fc'];for(let k=0;k<900&&fl.length<320;k++){const a=r()*TAU,rr=R*r(),x=Math.cos(a)*rr,z=Math.sin(a)*rr;if(rr>skyRim(a)-3||Math.hypot(x-HX,z-HZ)<8||pathDist(x,z)<2.2)continue;fl.push({x:SKY.x+x,y:skyTop(x,z)+.12,z:SKY.z+z,c:fc[fl.length%6]})}
    const im=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.2,0),new THREE.MeshStandardMaterial({roughness:.8,flatShading:true}),fl.length),m4=new THREE.Matrix4(),cc=new THREE.Color();fl.forEach((f,i)=>{m4.makeTranslation(f.x,f.y,f.z);im.setMatrixAt(i,m4);im.setColorAt(i,cc.set(f.c))});scene.add(im)}
  // ---------------- satellite island + rope bridge ----------------
  const g4=new THREE.Color('#82c64c');
  {const cx=SKY.x+S2.x,cz=SKY.z+S2.z,top2=(x,z)=>skyTop2(x,z),rim2=skyRim2;
    const tg=_polarTop(cx,cz,rim2,top2,(c,x,z,lip,lt)=>{const n=_noise3(x*.08+4,0,z*.08);c.copy(g4).lerp(g2,n*.8).lerp(g3,.2);if(lip)c.lerp(soil,.25+lt*.7)});
    const tm=new THREE.Mesh(tg,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}));tm.receiveShadow=true;scene.add(tm);
    const rm=new THREE.Mesh(_rockMass(cx,cz,rim2,top2,SKYI.satR*1.5,9.1),rockMat);rm.castShadow=true;scene.add(rm);
    const P2={};const add2=(nm,x,z,s)=>{(P2[nm]=P2[nm]||[]).push({x:cx+x,y:skyTop2(x,z),z:cz+z,ry:r()*TAU,s})};
    for(const [x,z,s] of [[-9,-7,1.3],[8,-9,1.1],[10,7,1.2],[-8,9,1.0]])add2('tree_oak',x,z,s);for(const [x,z] of [[-14,0],[0,13],[13,-1],[-4,-12],[5,5]])add2('plant_bushLarge',x,z,1.1);
    for(const nm in P2){const f=scatter(nm,TH[nm],P2[nm]);if(!f)continue;for(const p of P2[nm])if(nm.startsWith('tree_'))solids.push({x:p.x,z:p.z,r:.35*p.s})}
    // bench, lantern, little campfire
    const bench=new THREE.Group();bench.position.set(cx+3.5,skyTop2(3.5,2)+0,cz+2);bench.rotation.y=.6;scene.add(bench);
    const bm=stdM('#8a5a2e');for(const [w,h,d,x,y,z] of [[2.4,.12,.6,0,.55,0],[2.4,.5,.1,0,.9,-.28],[.12,.55,.5,-1,.28,0],[.12,.55,.5,1,.28,0]]){const b=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),bm);b.position.set(x,y,z);b.castShadow=true;bench.add(b)}
    solids.push({x:cx+3.5,z:cz+2,r:1.4});place(scene,'lantern',cx-2,skyTop2(-2,2),cz+2,0,2.5);solids.push({x:cx-2,z:cz+2,r:.35});
    const fy=skyTop2(0,-1);for(let i=0;i<6;i++){const a=i/6*TAU,s=new THREE.Mesh(new THREE.IcosahedronGeometry(.28,0),stdM('#8d8a85'));s.position.set(cx+Math.cos(a)*.7,fy+.15,cz-1+Math.sin(a)*.7);scene.add(s)}
    const fm=new THREE.Mesh(new THREE.ConeGeometry(.42,1.1,6),new THREE.MeshBasicMaterial({color:'#ffb030',transparent:true,opacity:.9}));fm.position.set(cx,fy+.6,cz-1);scene.add(fm);skyAnim.flames.push({m:fm});
    const logM=stdM('#6a4426');for(let i=0;i<3;i++){const l=new THREE.Mesh(new THREE.CylinderGeometry(.09,.09,.9,6),logM);l.position.set(cx,fy+.12,cz-1);l.rotation.set(1.45,i*1.05,0);scene.add(l)}
    solids.push({x:cx,z:cz-1,r:.9});
    // the bridge: planks + two rope rails, walkable via a chain of low circular solids with a top height
    const a0={x:SKY.x+dir.x*(skyRim(ab)-3.5),z:SKY.z+dir.z*(skyRim(ab)-3.5)},a1={x:cx-dir.x*(rim2(ab+Math.PI)-3.5),z:cz-dir.z*(rim2(ab+Math.PI)-3.5)};
    const L=Math.hypot(a1.x-a0.x,a1.z-a0.z),tx=(a1.x-a0.x)/L,tz=(a1.z-a0.z)/L,nx=-tz,nz=tx,y0b=skyTop(a0.x-SKY.x,a0.z-SKY.z)-.07,y1b=skyTop2(a1.x-cx,a1.z-cz)-.07,sag=1.6; // plank top (= centre + .07) starts flush with the ground at both ends so you can just walk on
    const deck=u=>y0b+(y1b-y0b)*u-sag*4*u*(1-u),pts=(u)=>({x:a0.x+tx*L*u,z:a0.z+tz*L*u,y:deck(u)});
    const NP=Math.floor(L/.62),planks=new THREE.InstancedMesh(new THREE.BoxGeometry(.5,.14,1.9),new THREE.MeshStandardMaterial({roughness:.9,flatShading:true}),NP),m4=new THREE.Matrix4(),q=new THREE.Quaternion(),sc=new THREE.Vector3(1,1,1),pc=new THREE.Color(),brown=['#8b5a2b','#a06a35','#7a4d24','#946034'];
    for(let i=0;i<NP;i++){const u=(i+.5)/NP,p=pts(u),ahead=pts(Math.min(1,u+.01)),behind=pts(Math.max(0,u-.01));q.setFromEuler(new THREE.Euler(0,-Math.atan2(tz,tx),Math.atan2(ahead.y-behind.y,L*.02),'YZX'));
      m4.compose(new THREE.Vector3(p.x,p.y,p.z),q,sc);planks.setMatrixAt(i,m4);planks.setColorAt(i,pc.set(brown[i%4]))}
    planks.castShadow=true;planks.receiveShadow=true;scene.add(planks);
    const ropeM=new THREE.MeshStandardMaterial({color:'#d8c8a0',roughness:1}),postM=stdM('#6a4426');
    for(const side of [-1,1]){const pts3=[];for(let i=0;i<=40;i++){const u=i/40,p=pts(u);pts3.push(new THREE.Vector3(p.x+nx*.95*side,p.y+1.05,p.z+nz*.95*side))}
      scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts3),60,.06,5),ropeM));
      const mid=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts3.map(v=>new THREE.Vector3(v.x,v.y-.55,v.z))),60,.04,5),ropeM);scene.add(mid);
      for(let i=0;i<=8;i++){const u=i/8,p=pts(u),po=new THREE.Mesh(new THREE.CylinderGeometry(.08,.1,1.25,6),postM);po.position.set(p.x+nx*.95*side,p.y+.6,p.z+nz*.95*side);po.castShadow=true;scene.add(po)}}
    for(let i=0;i<=Math.floor(L/.7);i++){const u=i*.7/L,p=pts(Math.min(1,u));solids.push({x:p.x,z:p.z,r:.6,h:p.y+.07})}}
  // ---------------- star shards ----------------
  {const shard=new THREE.MeshStandardMaterial({color:'#ffe08a',emissive:'#ffb020',emissiveIntensity:.9});
    const spots=[];for(let k=0;k<200&&spots.length<6;k++){const a=r()*TAU,rr=R*(.3+r()*.6),x=Math.cos(a)*rr,z=Math.sin(a)*rr;if(rr>skyRim(a)-6||!free(x,z,18,3))continue;spots.push([SKY.x+x,SKY.z+z,skyTop(x,z)+1.4])}
    for(const [dx,dz] of [[-6,3],[7,-4]])spots.push([SKY.x+S2.x+dx,SKY.z+S2.z+dz,skyTop2(dx,dz)+1.4]);
    for(const [x,z,y] of spots){const m=new THREE.Mesh(new THREE.OctahedronGeometry(.5),shard);m.position.set(x,y,z);scene.add(m);orbs.push({m,x,z,y,on:true})}}
}
function skyTick(t){
  const s=t/1000,night=(typeof Env!=='undefined'&&Env.state)?1-Env.state.dayF:0;
  for(const f of skyAnim.floaters){f.m.position.y=f.y0+Math.sin(s*f.sp+f.ph)*f.amp;f.m.rotation.y+=f.rs*.016}
  for(const g of skyAnim.glow)g.mat.emissiveIntensity=night*g.k;
  for(const p of skyAnim.smoke){p.age=(p.age+.016)%5;const u=p.age/5;p.m.position.set(p.x+u*3.2+Math.sin(s+p.age)*.25,p.y+u*9,p.z+Math.cos(s*.7+p.age)*.2);p.m.scale.setScalar(.5+u*2.2);p.m.material.opacity=.5*(1-u)*(1-u)}
  for(const f of skyAnim.flames){f.m.scale.set(1+Math.sin(s*14)*.1,1+Math.sin(s*11+1)*.2,1+Math.cos(s*13)*.1);f.m.material.opacity=.75+Math.sin(s*17)*.15}
  if(skyAnim.water)skyAnim.water.material.opacity=.62+Math.sin(s*3)*.08}
