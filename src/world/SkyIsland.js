// The floating island up in the clouds (v2): a big meadow island with a little village (two plaster cottages, plaza + fountain, market stalls, garden), a forest ring,
// ponds, streams and three waterfalls into the clouds, a chunky mossy rock underside, a rope-and-plank bridge to a satellite island with its own cottage + campfire,
// and small floating islets. Built from the Quaternius nature + village kits (assets/nature.glb, assets/village.glb: loadPacks() in AssetLoader.js) plus a few primitives.
// Exposes: SKYH(dx,dz) surface height (relative to SKY centre), SKYG(dx,dz) walkable ground or -Infinity, SKYI (layout), buildSkyIsland(), skyTick(t).
// Globals read: SKY (src/data/islands.js), THREE, scene, solids, orbs, scatter, place, sstep, mulberry, AM, Env (optional).
const SKYI={HX:46,HZ:-18,ab:.5,satGap:96,satR:56,pad:{dx:-78,dz:46,r:13},wf:[2.5,3.95,5.3],spots:[]}; // spots: fishing spots at the pier ends (filled by buildSkyIsland, used by Fishing.js)
const skyRim=a=>SKY.R*(1+.07*Math.sin(3*a+.5)+.045*Math.sin(5*a+2));
const skyRim2=a=>SKYI.satR*(1+.08*Math.sin(4*a+1));
const satCentre=()=>{const R=skyRim(SKYI.ab)+SKYI.satGap;return {x:Math.cos(SKYI.ab)*R,z:Math.sin(SKYI.ab)*R}};
function skyTop(dx,dz){
  const a=Math.atan2(dz,dx),d=Math.hypot(dx,dz),R=skyRim(a),dh=Math.hypot(dx-SKYI.HX,dz-(SKYI.HZ+16)),plat=1-sstep(26,48,dh);
  let h=SKY.base+(Math.sin(dx*.045)*Math.cos(dz*.04)*1.1+Math.sin(dx*.09+dz*.07)*.5+Math.sin(dz*.021+1)*.8)*(1-.9*plat);
  const hill=(x,z,hx,hz,amp,sg)=>amp*Math.exp(-((x-hx)*(x-hx)+(z-hz)*(z-hz))/(2*sg*sg));
  h+=(hill(dx,dz,-58,-46,9,26)+hill(dx,dz,64,58,6,21)+hill(dx,dz,-18,80,4.5,17)+hill(dx,dz,18,-84,7,22))*(1-plat);
  h+=1.6*plat;h-=sstep(R-12,R,d)*1.2;return h}
function skyTop2(dx,dz){const d=Math.hypot(dx,dz),R=skyRim2(Math.atan2(dz,dx));return SKY.base+Math.sin(dx*.08)*Math.cos(dz*.07)*.5-sstep(R-9,R,d)*1.1}
function SKYH(dx,dz){const d=Math.hypot(dx,dz);return d<=skyRim(Math.atan2(dz,dx))?skyTop(dx,dz):SKY.base-4}
function SKYG(dx,dz){ // ground you can stand on: the main island, the satellite, or nothing (step off the edge and you fall)
  const d=Math.hypot(dx,dz);if(d<=skyRim(Math.atan2(dz,dx))-.2)return skyTop(dx,dz);
  const c=satCentre(),ex=dx-c.x,ez=dz-c.z;if(Math.hypot(ex,ez)<=skyRim2(Math.atan2(ez,ex))-.2)return skyTop2(ex,ez);return -Infinity}
const skyAnim={roofs:[],floaters:[],smoke:[],glow:[],flames:[],falls:[],bob:[],recv:[],tier:0,slow:0,fast:0,lastT:0,mul:1};
function _hash3(x,y,z){const s=Math.sin(x*127.1+y*311.7+z*74.7)*43758.5453;return s-Math.floor(s)}
function _noise3(x,y,z){const xi=Math.floor(x),yi=Math.floor(y),zi=Math.floor(z),xf=x-xi,yf=y-yi,zf=z-zi,u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf),w=zf*zf*(3-2*zf),L=(a,b,t)=>a+(b-a)*t;
  return L(L(L(_hash3(xi,yi,zi),_hash3(xi+1,yi,zi),u),L(_hash3(xi,yi+1,zi),_hash3(xi+1,yi+1,zi),u),v),L(L(_hash3(xi,yi,zi+1),_hash3(xi+1,yi,zi+1),u),L(_hash3(xi,yi+1,zi+1),_hash3(xi+1,yi+1,zi+1),u),v),w)}
// ---- grass top: a polar grid following the irregular outline, with a rolled lip that tucks under into the rock. Winding is counter-clockwise seen from above (normals up). ----
function _polarTop(cx,cz,rimFn,topFn,colorFn){
  const SEG=112,RING=44,LIP=[[1.012,-.8],[1.0,-1.9],[.95,-3.1]],pos=[],col=[],idx=[],c=new THREE.Color(),rows=RING+1+LIP.length;
  for(let i=0;i<rows;i++)for(let j=0;j<SEG;j++){const a=j/SEG*Math.PI*2,R=rimFn(a);let u,y,lip=false;
    if(i<=RING){u=i/RING;y=topFn(Math.cos(a)*R*u,Math.sin(a)*R*u)}else{const L=LIP[i-RING-1];u=L[0];y=topFn(Math.cos(a)*R,Math.sin(a)*R)+L[1];lip=true}
    const x=Math.cos(a)*R*u,z=Math.sin(a)*R*u;pos.push(cx+x,y,cz+z);colorFn(c,x,z,lip,i>RING?(i-RING)/LIP.length:0);col.push(c.r,c.g,c.b)}
  for(let i=0;i<rows-1;i++)for(let j=0;j<SEG;j++){const a=i*SEG+j,b=i*SEG+(j+1)%SEG,d=(i+1)*SEG+j,e=(i+1)*SEG+(j+1)%SEG;idx.push(a,b,d,b,e,d)}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.setIndex(idx);g.computeVertexNormals();return g}
// ---- rocky underside: an inverted, jagged, flat-shaded cone from the lip down to a point ----
function _rockMass(cx,cz,rimFn,topFn,depth,seed){
  const SEG=72,ROWS=22,pos=[],col=[],idx=[],c=new THREE.Color(),moss=new THREE.Color('#5f8f35'),stone=new THREE.Color('#a39d92'),mid=new THREE.Color('#847f78'),dark=new THREE.Color('#5c5f6b'),deep=new THREE.Color('#44475a');
  for(let i=0;i<=ROWS;i++)for(let j=0;j<SEG;j++){const a=j/SEG*Math.PI*2,R=rimFn(a),v=i/ROWS,rimY=topFn(Math.cos(a)*R,Math.sin(a)*R)-3.1;
    const lump=(_noise3(Math.cos(a)*2.4+seed,Math.sin(a)*2.4,v*5)-.5)*.4,ledge=Math.sin(v*9+_noise3(a*2,seed,v*3)*5)*.05,rr=R*.95*Math.pow(1-v,.78)*(1+lump+ledge)*(i===ROWS?0:1);
    const y=rimY-depth*Math.pow(v,.95)+(_noise3(a*3+seed,v*6,3.3)-.5)*6*(v>0?1:0);
    pos.push(cx+Math.cos(a)*rr,y,cz+Math.sin(a)*rr);
    c.copy(moss).lerp(stone,sstep(.0,.14,v)).lerp(mid,sstep(.1,.4,v)).lerp(dark,sstep(.35,.75,v)).lerp(deep,sstep(.7,1,v));const n=(_noise3(a*5,v*9,seed)-.5)*.2;c.r+=n;c.g+=n;c.b+=n;col.push(c.r,c.g,c.b)}
  for(let i=0;i<ROWS;i++)for(let j=0;j<SEG;j++){const a=i*SEG+j,b=i*SEG+(j+1)%SEG,d=(i+1)*SEG+j,e=(i+1)*SEG+(j+1)%SEG;idx.push(a,b,d,b,e,d)}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.setIndex(idx);g.computeVertexNormals();return g}
function _waterTex(){ // vertical white streaks on transparent blue, scrolled by skyTick
  const cv=document.createElement('canvas');cv.width=64;cv.height=256;const c=cv.getContext('2d');
  c.fillStyle='rgba(120,190,240,0.55)';c.fillRect(0,0,64,256);
  for(let i=0;i<46;i++){const x=Math.random()*64,w=1+Math.random()*3,y=Math.random()*256,h=40+Math.random()*120;c.fillStyle='rgba(255,255,255,'+(0.35+Math.random()*.5)+')';c.fillRect(x,y,w,h);c.fillRect(x,y-256,w,h)}
  const t=new THREE.CanvasTexture(cv);t.wrapS=t.wrapT=THREE.RepeatWrapping;return t}
// Performance (phones): instanced kit pieces are split into ~56 m chunks that are shown/hidden every frame by distance + view cone (small plants only close by,
// trees far), they cast no shadows, and the cottages/plaza props are baked into a few merged meshes per building instead of ~100 separate meshes each.
const SKY_LIM={grass:55,flower:85,bush:115,rock:170,tree:260,prop:200,tile:220};
const _lamCache=new Map();
function _lam(m){let l=_lamCache.get(m);if(l)return l; // kit pieces ship as PBR materials; lit the cheap (Lambert) way they cost far less per pixel and look the same for this flat-shaded style
  l=new THREE.MeshLambertMaterial({color:m.color?m.color.clone():0xffffff,map:m.map||null,vertexColors:!!m.vertexColors,transparent:m.transparent,opacity:m.opacity,alphaTest:m.alphaTest||0,side:m.side,flatShading:!!m.flatShading});l.name=m.name;_lamCache.set(m,l);return l}
const _chunks=[];
function _cscatter(name,th,pl,cls){
  const m=AM[name];if(!m||!pl.length)return null;m.updateMatrixWorld(true);
  const bx=new THREE.Box3().setFromObject(m),k=th/(bx.max.y-bx.min.y),V=new THREE.Vector3(),Q=new THREE.Quaternion(),Sc=new THREE.Vector3(),P=new THREE.Matrix4(),M=new THREE.Matrix4(),Yv=new THREE.Vector3(0,1,0),tc=new THREE.Color(),cells=new Map(),CELL=60;
  pl.forEach(p=>{const key=Math.floor(p.x/CELL)+','+Math.floor(p.z/CELL);if(!cells.has(key))cells.set(key,[]);cells.get(key).push(p)});
  cells.forEach(list=>{let sx=0,sy=0,sz=0,ms=0;list.forEach(p=>{sx+=p.x;sy+=p.y;sz+=p.z;ms=Math.max(ms,p.s)});const cx=sx/list.length,cz=sz/list.length;let rad=0;list.forEach(p=>{rad=Math.max(rad,Math.hypot(p.x-cx,p.z-cz))});rad+=th*ms*.7+3;
    m.traverse(o=>{if(!o.isMesh)return;const im=new THREE.InstancedMesh(o.geometry,_lam(o.material),list.length);
      list.forEach((p,i)=>{V.set(p.x,p.y-bx.min.y*k*p.s,p.z);Q.setFromAxisAngle(Yv,p.ry);Sc.setScalar(k*p.s);P.compose(V,Q,Sc);M.multiplyMatrices(P,o.matrixWorld);im.setMatrixAt(i,M);im.setColorAt(i,tc.setScalar(.78+((p.x*12.9898+p.z*78.233)%1+1)%1*.4))});
      im.frustumCulled=false;im.castShadow=false;im.receiveShadow=false;im.visible=false;scene.add(im);_chunks.push({im,x:cx,y:sy/list.length+th*.5,z:cz,r:rad,lim:SKY_LIM[cls]||200})})});
  return {w:Math.max(bx.max.x-bx.min.x,bx.max.z-bx.min.z)*k}}
const _clsOf=nm=>/Tree|Pine/.test(nm)?'tree':/Bush/.test(nm)?'bush':/Rock/.test(nm)?'rock':/Flower|Mushroom/.test(nm)?'flower':'grass';
function _bake(g){ // merge every mesh under g (world-space) into one mesh per material, then drop g; returns the merged meshes
  g.updateMatrixWorld(true);const made=[];const by=new Map(),nm=new THREE.Matrix3(),v=new THREE.Vector3();
  g.traverse(o=>{if(o.isMesh&&!o.isInstancedMesh&&o.geometry){const k=o.material.isMeshStandardMaterial?_lam(o.material):o.material;if(!by.has(k))by.set(k,[]);by.get(k).push(o)}});
  by.forEach((meshes,mat)=>{let nv=0,ni=0;for(const m of meshes){nv+=m.geometry.attributes.position.count;ni+=m.geometry.index?m.geometry.index.count:m.geometry.attributes.position.count}
    const pos=new Float32Array(nv*3),nor=new Float32Array(nv*3),uv=new Float32Array(nv*2),colA=meshes.some(m=>m.geometry.attributes.color)?new Float32Array(nv*3).fill(1):null,idx=nv>65535?new Uint32Array(ni):new Uint16Array(ni);let vo=0,io=0;
    for(const m of meshes){const G=m.geometry,P=G.attributes.position,N=G.attributes.normal,U=G.attributes.uv,C=G.attributes.color;nm.getNormalMatrix(m.matrixWorld);
      for(let i=0;i<P.count;i++){const o=(vo+i)*3;v.set(P.getX(i),P.getY(i),P.getZ(i)).applyMatrix4(m.matrixWorld);pos[o]=v.x;pos[o+1]=v.y;pos[o+2]=v.z;
        if(N){v.set(N.getX(i),N.getY(i),N.getZ(i)).applyMatrix3(nm).normalize();nor[o]=v.x;nor[o+1]=v.y;nor[o+2]=v.z}
        if(U){uv[(vo+i)*2]=U.getX(i);uv[(vo+i)*2+1]=U.getY(i)}if(C&&colA){colA[o]=C.getX(i);colA[o+1]=C.getY(i);colA[o+2]=C.getZ(i)}}
      if(G.index)for(let i=0;i<G.index.count;i++)idx[io++]=G.index.getX(i)+vo;else for(let i=0;i<P.count;i++)idx[io++]=vo+i;vo+=P.count}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setAttribute('normal',new THREE.BufferAttribute(nor,3));geo.setAttribute('uv',new THREE.BufferAttribute(uv,2));if(colA)geo.setAttribute('color',new THREE.BufferAttribute(colA,3));
    geo.setIndex(new THREE.BufferAttribute(idx,1));geo.computeBoundingSphere();const mesh=new THREE.Mesh(geo,mat);mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);made.push(mesh)});
  if(g.parent)g.parent.remove(g);return made}
function _updateChunks(){ // called every frame while the island is within range
  if(typeof camera==='undefined')return;const cp=camera.position,f=_cdir||(_cdir=new THREE.Vector3());camera.getWorldDirection(f);
  const half=Math.atan(Math.tan(camera.fov*Math.PI/360)*Math.max(1,camera.aspect||1))+.12,cs=Math.cos(Math.min(half,2.2)); // widest half-angle of the view (portrait phones: the vertical one) + a margin
  const mul=skyAnim.mul,tier=skyAnim.tier;
  for(const c of _chunks){const dx=c.x-cp.x,dy=c.y-cp.y,dz=c.z-cp.z,d=Math.hypot(dx,dy,dz);c.im.visible=!(tier>=2&&c.lim<=90)&&d<c.lim*mul+c.r&&(d<c.r+25||(dx*f.x+dy*f.y+dz*f.z)/d>cs-c.r/d*1.1)}}
let _cdir=null;
function buildSkyIsland(){
  const n0=scene.children.length;
  const r=mulberry(20261004),R=SKY.R,base=SKY.base,TAU=Math.PI*2,HX=SKYI.HX,HZ=SKYI.HZ,S2=satCentre(),ab=SKYI.ab,dir={x:Math.cos(ab),z:Math.sin(ab)},pad=SKYI.pad;
  const stdM=c=>new THREE.MeshLambertMaterial({color:c,flatShading:true});
  const rockMat=new THREE.MeshLambertMaterial({vertexColors:true,flatShading:true});
  const Y=new THREE.Vector3(0,1,0);
  // ---- layout: village hub, paths ----
  const plazaC={x:HX,z:HZ+17},P0={x:dir.x*(skyRim(ab)-5),z:dir.z*(skyRim(ab)-5)};
  const bez=(a,c,b,n)=>{const o=[];for(let i=0;i<=n;i++){const t=i/n,u=1-t;o.push({x:u*u*a.x+2*u*t*c.x+t*t*b.x,z:u*u*a.z+2*u*t*c.z+t*t*b.z})}return o};
  const path=bez({x:plazaC.x+4,z:plazaC.z+7},{x:plazaC.x+40,z:plazaC.z+50},P0,60).concat(bez({x:plazaC.x-5,z:plazaC.z+4},{x:plazaC.x-40,z:plazaC.z+14},{x:pad.dx+10,z:pad.dz-6},30));
  const pathDist=(x,z)=>{let m=1e9;for(const p of path)m=Math.min(m,Math.hypot(x-p.x,z-p.z));return m};
  const hubD=(x,z)=>Math.hypot(x-HX,z-(HZ+8));
  const wfAt=SKYI.wf.map(a=>({a,x:Math.cos(a)*(skyRim(a)-34),z:Math.sin(a)*(skyRim(a)-34)}));
  const free=(x,z,o)=>{o=o||{};if(hubD(x,z)<(o.hub||34))return false;if(pathDist(x,z)<(o.path||5))return false;if(Math.hypot(x-pad.dx,z-pad.dz)<pad.r+(o.pad||6))return false;
    for(const w of wfAt)if(Math.hypot(x-w.x,z-w.z)<(o.wf||17))return false;if(Math.hypot(x-P0.x,z-P0.z)<14)return false;return true};
  const noRim=(x,z,m)=>Math.hypot(x,z)<skyRim(Math.atan2(z,x))-m;
  // ---- grass top + rock underside ----
  const g1=new THREE.Color('#79bd46'),g2=new THREE.Color('#9fd860'),g3=new THREE.Color('#5ea23a'),g4=new THREE.Color('#3f8a35'),soil=new THREE.Color('#7a5a38'),sand=new THREE.Color('#d9c48c');
  const topGeo=_polarTop(SKY.x,SKY.z,skyRim,skyTop,(c,x,z,lip,lt)=>{
    const n=_noise3(x*.04,0,z*.04),m=_noise3(x*.17+9,3,z*.17);c.copy(g1).lerp(g2,n).lerp(g3,m*.4);
    const fo=1-sstep(.62,.9,Math.hypot(x,z)/skyRim(Math.atan2(z,x)));c.lerp(g4,(1-fo)*.5*_noise3(x*.05+3,1,z*.05));
    const pd=pathDist(x,z);if(pd<3.2)c.lerp(sand,1-sstep(1.6,3.2,pd));
    if(lip)c.lerp(soil,.2+lt*.75);const ar=Math.atan2(z,x);c.multiplyScalar(1-.12*sstep(skyRim(ar)-16,skyRim(ar),Math.hypot(x,z)))});
  const top=new THREE.Mesh(topGeo,new THREE.MeshLambertMaterial({vertexColors:true}));top.receiveShadow=true;scene.add(top);skyAnim.recv.push(top);
  const rock=new THREE.Mesh(_rockMass(SKY.x,SKY.z,skyRim,skyTop,R*1.05,3.7),rockMat);rock.castShadow=true;scene.add(rock);
  const rockC=stdM('#8a867f');
  for(let i=0;i<8;i++){const a=r()*TAU,rr=R*(.2+r()*.5),len=26+r()*52,rad=3.5+r()*6,m=new THREE.Mesh(new THREE.ConeGeometry(rad,len,6),rockC);
    m.rotation.set(Math.PI+(r()-.5)*.3,r()*TAU,(r()-.5)*.3);m.position.set(SKY.x+Math.cos(a)*rr,base-40-r()*40-len*.35,SKY.z+Math.sin(a)*rr);m.castShadow=true;scene.add(m)}
  for(let i=0;i<14;i++){const a=r()*TAU,rr=R*(1.05+r()*.5),s=1.6+r()*7,m=new THREE.Mesh(new THREE.IcosahedronGeometry(s,0),i%3?rockC:stdM('#74798a'));
    const y0=base-55+r()*85;m.position.set(SKY.x+Math.cos(a)*rr,y0,SKY.z+Math.sin(a)*rr);m.rotation.set(r()*3,r()*3,r()*3);m.scale.set(1,.7+r()*.5,1);m.castShadow=true;scene.add(m);skyAnim.floaters.push({m,y0,ph:r()*TAU,sp:.25+r()*.35,amp:.8+r()*1.8,rs:(r()-.5)*.25})}
  // ---- cottages from the village kit ----
  const COT_S=1.35,mossRoof=new THREE.MeshLambertMaterial({color:'#6f9d3a',flatShading:true});
  function cottage(par,cx,cz,y,ry,W2,D2,o){ // W2 x D2 wall modules (2 m each, drawn at COT_S x); front (door) faces +z locally
    const g=new THREE.Group();g.position.set(cx,y,cz);g.rotation.y=ry;par.add(g);const rg=new THREE.Group();rg.position.copy(g.position);rg.rotation.y=ry;par.add(rg);const hw=W2,hd=D2,WH=3.12;
    const P=(n,x,yy,z,rot,s)=>place(g,n,x*COT_S,yy*COT_S,z*COT_S,rot,(s||1)*COT_S),PR=(n,x,yy,z,rot,s)=>place(rg,n,x*COT_S,yy*COT_S,z*COT_S,rot,(s||1)*COT_S);
    for(let i=0;i<W2;i++){const x=-hw+1+2*i;P(i===(W2>>1)?'Wall_Plaster_Door_Round':'Wall_Plaster_Window_Wide_Round',x,0,hd,0);P(i===(W2>>1)?'Wall_Plaster_Window_Thin_Round':'Wall_Plaster_Straight',x,0,-hd,Math.PI)}
    for(let j=0;j<D2;j++){const z=-hd+1+2*j;P(j===1?'Wall_Plaster_Window_Thin_Round':'Wall_Plaster_Straight',hw,0,z,Math.PI/2);P(j===D2-2?'Wall_Plaster_Window_Wide_Round':'Wall_Plaster_Straight',-hw,0,z,-Math.PI/2)}
    for(const [x,z] of [[hw,hd],[-hw,hd],[hw,-hd],[-hw,-hd]])P('Corner_Exterior_Wood',x,0,z,0);
    const roof=PR(W2===3?'Roof_RoundTiles_6x8':'Roof_RoundTiles_4x6',0,WH,0,0);if(roof&&o.moss)roof.traverse(c=>{if(c.isMesh)c.material=mossRoof});
    PR(W2===3?'Roof_Front_Brick6':'Roof_Front_Brick4',0,WH,hd,0);PR(W2===3?'Roof_Front_Brick6':'Roof_Front_Brick4',0,WH,-hd,Math.PI);
    PR('Prop_Chimney',-hw*.42,WH+1.7,-hd*.25,0);
    P('Floor_Brick',0,.03,hd+1.4,0);P('Floor_Brick',0,.03,hd+3.4,0);
    if(o.walk){ // a furnished, walk-in interior: wood floor, hearth, bed, table + stools, bookshelf, rug (the roof hides while you are inside)
      for(let i=0;i<W2;i++)for(let j=0;j<D2;j++)P('Floor_WoodDark',-hw+1+2*i,.04,-hd+1+2*j,0);
      const bx=(w,h,d,x,yy,z,col,par2)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),stdM(col));m.position.set(x,yy,z);(par2||g).add(m);return m},cyl=(rt,rb,h,x,yy,z,col,seg)=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,seg||14),stdM(col));m.position.set(x,yy,z);g.add(m);return m};
      const wood='#8a5a2e',dark='#5b3b22',stone='#9d948b';
      // hearth against the west wall
      bx(1.2,1.5,2.4,-3.45,.75,-1.6,stone);bx(1.5,.16,2.7,-3.4,1.58,-1.6,dark);bx(.12,.85,1.2,-2.84,.5,-1.6,'#2a2420');bx(.7,.3,1.2,-2.3,.15,-1.6,'#7d756b');
      // bed in the back-east corner
      bx(2.1,.45,2.75,2.7,.22,-3.9,wood);bx(1.9,.3,2.5,2.7,.6,-3.9,'#f1e6cf');bx(1.9,.12,1.05,2.7,.82,-3.2,'#3f8fa3');for(const px of [2.2,3.2])bx(.8,.2,.55,px,.85,-4.85,'#ffffff');bx(.14,.7,2.75,1.62,.35,-3.9,dark);bx(2.1,1.3,.14,2.7,.65,-5.32,dark); // a bed for two: two pillows at the head, slots at x=2.2 and 3.2
      // bookshelf on the back wall
      bx(3.1,2.4,.5,-.4,1.2,-5.1,wood);for(const yy of [.55,1.15,1.75]){bx(2.8,.06,.46,-.4,yy-.3,-5.05,dark);const cols=['#c0392b','#2e86c1','#27ae60','#d4ac0d','#8e44ad','#ecf0f1','#e67e22'];for(let k=0;k<13;k++){const h=.42+((k*7)%3)*.07,m=bx(.17,h,.34,-1.65+k*.2,yy-.3+h/2+.03,-5.0,cols[(k*5+Math.round(yy*10))%7]);m.rotation.z=(k%5===0?.12:0)}}
      // round table, stools, lamp, bowl
      cyl(.85,.85,.1,-1.2,.86,2.0,wood,20);cyl(.12,.16,.82,-1.2,.42,2.0,dark,8);for(let k=0;k<3;k++){const a=k*2.1+.4;cyl(.3,.3,.5,-1.2+Math.cos(a)*1.45,.25,2.0+Math.sin(a)*1.45,wood,10)}
      cyl(.2,.17,.2,-1.0,.98,1.8,'#c9b98a',10);const lampM=new THREE.MeshLambertMaterial({color:'#fff2c0',emissive:'#ffcf70',emissiveIntensity:.35});skyAnim.glow.push({mat:lampM,k:1.4,base:.35});const lamp=new THREE.Mesh(new THREE.IcosahedronGeometry(.16,0),lampM);lamp.position.set(-1.4,1.05,2.2);g.add(lamp);
      // rug + plants + crates
      cyl(2.0,2.0,.02,.3,.07,.6,'#b5473a',28);cyl(1.4,1.4,.02,.3,.085,.6,'#e8c26b',28);cyl(.5,.5,.02,.3,.1,.6,'#b5473a',16);
      cyl(.38,.28,.55,3.4,.28,4.2,'#b4663a',10);const bush=new THREE.Mesh(new THREE.IcosahedronGeometry(.62,0),stdM('#4fa83a'));bush.position.set(3.4,.95,4.2);g.add(bush);
      place(g,'Prop_Crate',3.45,.55,2.2,.2,1);place(g,'Prop_Crate',3.4,1.65,2.25,.5,.9);
      // collision: perimeter walls (with the door gap), furniture; solids need h so the camera also respects them (it ignores thin / low circles)
      const hwm=hw*COT_S,hdm=hd*COT_S,top=y+9,cs=Math.cos(ry),sn=Math.sin(ry),W=(lx,lz)=>({x:cx+lx*cs+lz*sn,z:cz-lx*sn+lz*cs});
      const wall=(lx,lz)=>{const p=W(lx,lz);solids.push({x:p.x,z:p.z,r:1.2,h:top})};
      for(let x=-hwm;x<=hwm+.01;x+=2.2){wall(x,-hdm);if(Math.abs(x)>2.6)wall(x,hdm)}for(let z=-hdm+2.2;z<hdm-1;z+=2.2){wall(-hwm,z);wall(hwm,z)}
      const fur=(lx,lz,rr,h)=>{const p=W(lx,lz);solids.push({x:p.x,z:p.z,r:rr,h:y+h})};
      fur(-3.2,-1.6,1.1,1.5);fur(-3.2,-.5,.9,1.5);fur(-3.2,-2.7,.9,1.5);fur(-1.2,2.0,.95,.9);fur(-.4,-4.8,1.0,2.3);fur(-1.5,-4.8,.9,2.3);fur(.7,-4.8,.9,2.3);fur(3.4,4.2,.5,1.0);fur(3.4,2.2,.7,2.3);
      // the bed top is walkable (h = mattress top): the Lie down interaction puts you on it
      for(const dz of [-4.7,-3.9,-3.1]){const p=W(2.7,dz);solids.push({x:p.x,z:p.z,r:.8,h:y+.9})}
      const bedP=W(2.7,-3.9),hearthP=W(-2.5,-1.6),fl=new THREE.Mesh(new THREE.ConeGeometry(.28,.8,6),new THREE.MeshBasicMaterial({color:'#ffb030',transparent:true,opacity:.9}));const fp=W(-2.9,-1.6);fl.position.set(fp.x,y+.65,fp.z);scene.add(fl);skyAnim.flames.push({m:fl});
      skyAnim.cozy={bed:bedP,slots:[W(2.2,-4.12),W(3.2,-4.12)],hearth:hearthP,y,cx,cz,hwm,hdm};
    }
    const made=_bake(g),roofs=_bake(rg);if(o.walk)skyAnim.roofs.push({meshes:roofs,cx,cz,hw:hw*COT_S,hd:hd*COT_S,y,inside:false});
    return g}
  const cy=skyTop(HX,HZ);
  cottage(scene,SKY.x+HX,SKY.z+HZ,cy,0,3,4,{moss:true,walk:true});
  {const smokeM=new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.5,depthWrite:false});
   for(let i=0;i<8;i++){const m=new THREE.Mesh(new THREE.IcosahedronGeometry(.6,0),smokeM.clone());scene.add(m);skyAnim.smoke.push({m,age:i*.65,x:SKY.x+HX-3*.42*COT_S,y:cy+(3.12+1.7+3.2)*COT_S+.4,z:SKY.z+HZ-4*.25*COT_S})}}
  for(const [bx,bz,ry,W2,D2,moss] of [[HX-40,HZ+8,.5,2,3,false],[HX+44,HZ+26,-.45,2,3,false],[HX-22,HZ-34,.2,3,3,true]]){const by=skyTop(bx,bz),cs=Math.cos(ry),sn=Math.sin(ry);cottage(scene,SKY.x+bx,SKY.z+bz,by,ry,W2,D2,{moss});for(let k=-1;k<=1;k++)solids.push({x:SKY.x+bx+sn*k*D2*COT_S*.8,z:SKY.z+bz+cs*k*D2*COT_S*.8,r:W2*COT_S*1.15})}
  // ---- plaza: brick tiles, fountain, market stalls, wagon, crates, lanterns ----
  const VG=new THREE.Group();scene.add(VG);
  {const tiles=[],pc=plazaC;for(let gx=-5;gx<=5;gx++)for(let gz=-5;gz<=5;gz++){const x=pc.x+gx*2,z=pc.z+gz*2;if(Math.hypot(gx,gz)<=5.1)tiles.push({x:SKY.x+x,y:skyTop(x,z)+.03,z:SKY.z+z,ry:Math.floor(r()*4)*Math.PI/2,s:1})}
   for(const p of path){if(Math.hypot(p.x-pc.x,p.z-pc.z)<12)continue;if(r()<.55)tiles.push({x:SKY.x+p.x+(r()-.5)*.8,y:skyTop(p.x,p.z)+.04,z:SKY.z+p.z+(r()-.5)*.8,ry:r()*TAU,s:.55+r()*.3})}
   _cscatter('Floor_Brick',.02,tiles,'tile');
   place(VG,'fountain-round',SKY.x+pc.x,skyTop(pc.x,pc.z),SKY.z+pc.z,0,3.6);solids.push({x:SKY.x+pc.x,z:SKY.z+pc.z,r:4});
   for(const [n,x,z,ry] of [['stall-red',pc.x-8,pc.z-2,.9],['stall-green',pc.x+8,pc.z-2,-.9]]){place(VG,n,SKY.x+x,skyTop(x,z),SKY.z+z,ry,3);solids.push({x:SKY.x+x,z:SKY.z+z,r:2.8})}
   place(VG,'cart',SKY.x+pc.x+3,skyTop(pc.x+3,pc.z-9),SKY.z+pc.z-9,.6,2.2);solids.push({x:SKY.x+pc.x+3,z:SKY.z+pc.z-9,r:1.8});
   place(VG,'Prop_Wagon',SKY.x+pc.x-12,skyTop(pc.x-12,pc.z+7),SKY.z+pc.z+7,2.2,1.2);solids.push({x:SKY.x+pc.x-12,z:SKY.z+pc.z+7,r:1.8});
   for(const [dx,dz] of [[-10.5,-3],[-6.6,-3],[-10.4,-4.2],[9.5,-4],[10.8,-3]]){const x=pc.x+dx,z=pc.z+dz;place(VG,'Prop_Crate',SKY.x+x,skyTop(x,z),SKY.z+z,r()*3,.9);solids.push({x:SKY.x+x,z:SKY.z+z,r:.8,h:skyTop(x,z)+1})}
   for(const [lx,lz] of [[pc.x+6,pc.z+6],[pc.x-6,pc.z+6],[pc.x+6,pc.z-6],[pc.x-6,pc.z-6],[HX-9,HZ+9],[HX+10,HZ+9]]){place(VG,'lantern',SKY.x+lx,skyTop(lx,lz),SKY.z+lz,0,2.6);solids.push({x:SKY.x+lx,z:SKY.z+lz,r:.35})}_bake(VG)}
  // ---- fenced garden with vegetable beds beside the cottage ----
  {const GG=new THREE.Group();scene.add(GG);const gx=HX+16,gz=HZ+2,fence=[],soilM=stdM('#5b3b22'),frameM=stdM('#8a5a2e'),crops={leaf:[],pump:[],tom:[]},GW=18,GD=14;
   for(let i=0;i<GW/2;i++)for(const sz of [-1,1]){const fx=gx-GW/2+1+i*2,fz=gz+sz*GD/2;fence.push({x:SKY.x+fx,y:skyTop(fx,fz)+.05,z:SKY.z+fz,ry:0,s:1})}
   for(let i=0;i<GD/2;i++)for(const sx of [-1,1]){const fx=gx+sx*GW/2,fz=gz-GD/2+1+i*2;fence.push({x:SKY.x+fx,y:skyTop(fx,fz)+.05,z:SKY.z+fz,ry:Math.PI/2,s:1})}
   _cscatter('Prop_WoodenFence_Single',.84,fence,'prop');
   for(const bz of [-4.2,.8,5.6])for(const bx of [-4.5,4.5]){const x=gx+bx,z=gz+bz,y=skyTop(x,z),g=new THREE.Group();g.position.set(SKY.x+x,y,SKY.z+z);GG.add(g);
     const sb=new THREE.Mesh(new THREE.BoxGeometry(7,.4,3),soilM);sb.position.y=.18;sb.receiveShadow=true;g.add(sb);
     for(const [fx,fz,fw,fd] of [[0,1.5,7.3,.2],[0,-1.5,7.3,.2],[3.5,0,.2,3],[-3.5,0,.2,3]]){const f=new THREE.Mesh(new THREE.BoxGeometry(fw,.5,fd),frameM);f.position.set(fx,.25,fz);f.castShadow=true;g.add(f)}
     const kind=(Math.round(bx+bz*3)&3);for(let rI=0;rI<4;rI++)for(let k=0;k<8;k++){const e={x:SKY.x+x-3+k*(6/7),y:y+.4,z:SKY.z+z-1.1+rI*(2.2/3),s:.8+r()*.5,r:r()*TAU};(kind<2?crops.leaf:kind===2?crops.pump:crops.tom).push(e)}}
   solids.push({x:SKY.x+gx,z:SKY.z+gz,r:9});_bake(GG);
   const mk=(geo,mat,list,lift,cols)=>{if(!list.length)return;const im=new THREE.InstancedMesh(geo,mat,list.length),m4=new THREE.Matrix4(),q=new THREE.Quaternion(),p=new THREE.Vector3(),sc=new THREE.Vector3(),c=new THREE.Color();
     list.forEach((e,i)=>{p.set(e.x,e.y+lift*e.s,e.z);q.setFromAxisAngle(Y,e.r);sc.set(e.s,e.s*.8,e.s);m4.compose(p,q,sc);im.setMatrixAt(i,m4);im.setColorAt(i,c.set(cols[i%cols.length]))});im.castShadow=true;scene.add(im)};
   mk(new THREE.IcosahedronGeometry(.38,0),new THREE.MeshLambertMaterial({flatShading:true}),crops.leaf,.3,['#4fa83a','#6cc045','#a9d86e','#3f9a3a','#8fcf5a']);
   mk(new THREE.IcosahedronGeometry(.36,0),new THREE.MeshLambertMaterial({flatShading:true}),crops.pump,.3,['#ff8c1a','#f07a10','#ffa032']);
   mk(new THREE.IcosahedronGeometry(.3,0),new THREE.MeshLambertMaterial({flatShading:true}),crops.tom,.6,['#e8402a','#d9331f','#4fa83a','#e8402a'])}
  // ---- water: ponds, streams, waterfalls ----
  const waterM=new THREE.MeshLambertMaterial({color:'#4fb4ea',transparent:true,opacity:.88,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3});
  const fallTex=_waterTex();
  wfAt.forEach((w,wi)=>{
    const a=w.a,Rw=skyRim(a),ex=Math.cos(a)*(Rw-.6),ez=Math.sin(a)*(Rw-.6),ty=skyTop(ex,ez),pr=10+wi*1.5;
    const pond=new THREE.Mesh(new THREE.CircleGeometry(pr,36),waterM);pond.rotation.x=-Math.PI/2;pond.position.set(SKY.x+w.x,skyTop(w.x,w.z)+.12,SKY.z+w.z);scene.add(pond);
    const pts=bez({x:w.x,z:w.z},{x:w.x+Math.sin(a)*14,z:w.z-Math.cos(a)*14},{x:ex,z:ez},26),pos=[],idx=[];
    pts.forEach((p,i)=>{const q=pts[Math.min(i+1,pts.length-1)],q0=pts[Math.max(i-1,0)],tx=q.x-q0.x,tz=q.z-q0.z,l=Math.hypot(tx,tz)||1,nx=-tz/l,nz=tx/l,wd=(5.5-i/26*.8)/2,y=skyTop(p.x,p.z)+.1-i/26*.9;pos.push(SKY.x+p.x+nx*wd,y,SKY.z+p.z+nz*wd,SKY.x+p.x-nx*wd,y,SKY.z+p.z-nz*wd);if(i<pts.length-1)idx.push(i*2,i*2+2,i*2+1,i*2+1,i*2+2,i*2+3)});
    const sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));sg.setIndex(idx);sg.computeVertexNormals();scene.add(new THREE.Mesh(sg,waterM));
    const tex=fallTex.clone();tex.needsUpdate=true;tex.repeat.set(1,2.2);
    const fm=new THREE.MeshBasicMaterial({map:tex,transparent:true,opacity:.85,side:THREE.DoubleSide,depthWrite:false,fog:true});
    const fw=14+wi*2,fh=170,f=new THREE.Mesh(new THREE.PlaneGeometry(fw,fh),fm);f.position.set(SKY.x+ex+Math.cos(a)*1.4,ty-fh/2-2,SKY.z+ez+Math.sin(a)*1.4);f.rotation.y=-a+Math.PI/2;scene.add(f);
    skyAnim.falls.push({tex,m:fm,mesh:f,ph:wi*1.7});
    const foam=new THREE.Mesh(new THREE.CylinderGeometry(fw*.55,fw*.55,1.4,10,1,true,0,Math.PI),new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.7,side:THREE.DoubleSide}));
    foam.rotation.y=-a;foam.position.set(SKY.x+ex+Math.cos(a)*1.4,ty-1,SKY.z+ez+Math.sin(a)*1.4);scene.add(foam);
    const rk=[],fr=[];for(let k=0;k<9;k++){const t=r()*TAU,rr=pr+.8+r()*2.5,x=w.x+Math.cos(t)*rr,z=w.z+Math.sin(t)*rr;rk.push({x:SKY.x+x,y:skyTop(x,z)-.1,z:SKY.z+z,ry:r()*TAU,s:.5+r()*.9})}
    for(let k=0;k<12;k++){const t=r()*TAU,rr=pr+1+r()*5,x=w.x+Math.cos(t)*rr,z=w.z+Math.sin(t)*rr;fr.push({x:SKY.x+x,y:skyTop(x,z),z:SKY.z+z,ry:r()*TAU,s:.7+r()*.6})}
    _cscatter(['Rock_Medium_1','Rock_Medium_2','Rock_Medium_3'][wi%3],1.7,rk,'rock');_cscatter('Fern_1',.8,fr,'grass');
    { // fishing pier from the inland shore out over the water; its end is a fishing spot
      const ul=Math.hypot(w.x,w.z)||1,dx=-w.x/ul,dz=-w.z/ul,nx=-dz,nz=dx,sx=w.x+dx*(pr-.5),sz=w.z+dz*(pr-.5),L=6.6,surf=skyTop(w.x,w.z)+.12,yS=skyTop(sx,sz)+.03,yE=Math.max(yS,surf+.5);
      const NP=Math.floor(L/.55),pl=new THREE.InstancedMesh(new THREE.BoxGeometry(.5,.14,2.4),new THREE.MeshLambertMaterial({flatShading:true}),NP),m4=new THREE.Matrix4(),q=new THREE.Quaternion(),sc1=new THREE.Vector3(1,1,1),pc=new THREE.Color(),vv=new THREE.Vector3();
      q.setFromAxisAngle(Y,-Math.atan2(-dz,-dx));
      for(let i=0;i<NP;i++){const u=(i+.5)/NP;vv.set(SKY.x+sx-dx*L*u,yS+(yE-yS)*u,SKY.z+sz-dz*L*u);m4.compose(vv,q,sc1);pl.setMatrixAt(i,m4);pl.setColorAt(i,pc.set(['#9a6a3a','#8b5a2b','#a8793f','#85552c'][i%4]))}
      scene.add(pl);
      const PG=new THREE.Group();scene.add(PG);const wm=stdM('#5b3b22');
      for(const u of [.06,.38,.7,.97])for(const sd of [-1,1]){const dy=yS+(yE-yS)*u,po=new THREE.Mesh(new THREE.CylinderGeometry(.1,.12,2.1,6),wm);po.position.set(SKY.x+sx-dx*L*u+nx*1.2*sd,dy-.85,SKY.z+sz-dz*L*u+nz*1.2*sd);PG.add(po)}
      _bake(PG);
      for(let d=0;d<=L;d+=.65){const u=d/L;solids.push({x:SKY.x+sx-dx*L*u,z:SKY.z+sz-dz*L*u,r:.85,h:yS+(yE-yS)*u+.07})}
      place(scene,'lantern',SKY.x+sx+nx*2.2,skyTop(sx+nx*2.2,sz+nz*2.2),SKY.z+sz+nz*2.2,0,2.6);solids.push({x:SKY.x+sx+nx*2.2,z:SKY.z+sz+nz*2.2,r:.35});
      SKYI.spots.push({x:SKY.x+sx-dx*L*.93,z:SKY.z+sz-dz*L*.93,y:yE+.07,fx:-dx,fz:-dz,px:SKY.x+w.x,pz:SKY.z+w.z,pr,surf})}
  });
  // ---- trees, bushes, undergrowth, flowers, rocks (kit instances) ----
  const placed=[];const addList=(P,nm,x,z,s)=>{(P[nm]=P[nm]||[]).push({x:SKY.x+x,y:skyTop(x,z),z:SKY.z+z,ry:r()*TAU,s});placed.push({x,z})};
  const apart=(x,z,d)=>!placed.some(p=>Math.hypot(p.x-x,p.z-z)<d),pick=(P,nm,x,z,s)=>{(P[nm]=P[nm]||[]).push({x:SKY.x+x,y:skyTop(x,z),z:SKY.z+z,ry:r()*TAU,s})};
  const P={},TH={CommonTree_3:10,CommonTree_4:10,CommonTree_5:8,Pine_2:8.5,Pine_4:11.5,Pine_5:9.5,Bush_Common:1.6,Bush_Common_Flowers:1.6,Rock_Medium_1:1.9,Rock_Medium_2:1.5,Rock_Medium_3:1.9,Mushroom_Common:.45,Flower_3_Group:1.5,Flower_4_Group:1.9,Grass_Common_Tall:1.5,Grass_Common_Short:.9,Fern_1:.8,Clover_1:.35,Plant_7_Big:1.2};
  const kinds=['Pine_5','CommonTree_5','Pine_5','CommonTree_3','Pine_5','Pine_5','CommonTree_5','Pine_5']; // mostly the 1.6k-triangle pine; the 3-4k oaks only as accents
  for(const [x,z,k,s] of [[HX-13,HZ-8,0,1.25],[HX+14,HZ-14,1,1.3],[HX-5,HZ-20,3,1.3],[HX+22,HZ-22,5,1.1],[HX-26,HZ-14,2,1.2],[-58,-46,0,1.5],[64,58,1,1.4],[18,-84,3,1.4],[-18,80,2,1.2]])addList(P,kinds[k],x,z,s);
  { // craggy rim: boulders along the edge hide the grass lip and give the island a rugged silhouette
    const rr=['Rock_Medium_1','Rock_Medium_2','Rock_Medium_3'];for(let k=0;k<46;k++){const a=k/46*TAU+r()*.05,Rr=skyRim(a)-1.2-r()*2,x=Math.cos(a)*Rr,z=Math.sin(a)*Rr;pick(P,rr[k%3],x,z,1.2+r()*1.6)}}
  { // flower meadows: clusters instead of uniform scatter
    for(let c=0;c<10;c++){const a=r()*TAU,rr=R*(.15+r()*.75),cx=Math.cos(a)*rr,cz=Math.sin(a)*rr;if(!noRim(cx,cz,8)||hubD(cx,cz)<26||pathDist(cx,cz)<4)continue;
      for(let k=0;k<7;k++){const t=r()*TAU,d=r()*7,x=cx+Math.cos(t)*d,z=cz+Math.sin(t)*d;if(!noRim(x,z,5)||pathDist(x,z)<2.5)continue;pick(P,k%6?'Flower_3_Group':'Flower_4_Group',x,z,.9+r()*.7)}}}
  const groves=[];for(let g=0;g<7;g++){const a=r()*TAU;groves.push({a,rr:R*(.62+r()*.2)})}
  for(let k=0,n=0;k<2200&&n<52;k++){const gv=groves[k%7],a=gv.a+(r()-.5)*.85,rr=gv.rr+(r()-.5)*R*.3,x=Math.cos(a)*rr,z=Math.sin(a)*rr;if(!noRim(x,z,9)||!free(x,z)||!apart(x,z,6.2))continue;addList(P,kinds[n%8],x,z,.85+r()*.55);n++}
  for(let k=0,n=0;k<800&&n<9;k++){const a=r()*TAU,rr=R*(.2+r()*.5),x=Math.cos(a)*rr,z=Math.sin(a)*rr;if(!noRim(x,z,12)||!free(x,z,{hub:40,path:8})||!apart(x,z,16))continue;addList(P,kinds[(n*3)%8],x,z,1.15+r()*.3);n++}
  for(let k=0,n=0;k<1600&&n<46;k++){const a=r()*TAU,rr=R*(.25+r()*.72),x=Math.cos(a)*rr,z=Math.sin(a)*rr;if(!noRim(x,z,6)||!free(x,z,{hub:30,path:4,wf:10}))continue;pick(P,r()<.22?'Bush_Common_Flowers':'Bush_Common',x,z,.9+r()*.9);n++}
  for(let k=0,n=0;k<400&&n<16;k++){const a=r()*TAU,rr=R*(.3+r()*.65),x=Math.cos(a)*rr,z=Math.sin(a)*rr;if(!noRim(x,z,6)||!free(x,z,{hub:34,path:6}))continue;pick(P,['Rock_Medium_1','Rock_Medium_2','Rock_Medium_3'][n%3],x,z,.7+r()*1.1);n++}
  const under=['Grass_Common_Short','Grass_Common_Tall','Fern_1','Plant_7_Big','Clover_1','Grass_Common_Short'];
  for(let k=0,n=0;k<1400&&n<150;k++){const a=r()*TAU,rr=R*(.1+r()*.88),x=Math.cos(a)*rr,z=Math.sin(a)*rr;if(!noRim(x,z,4)||!free(x,z,{hub:26,path:2.5,wf:8,pad:1}))continue;pick(P,under[n%6],x,z,.8+r()*.9);n++}
  for(let k=0,n=0;k<400&&n<6;k++){const a=r()*TAU,rr=R*(.5+r()*.45),x=Math.cos(a)*rr,z=Math.sin(a)*rr;if(!noRim(x,z,8)||!free(x,z)||!placed.some(p=>Math.hypot(p.x-x,p.z-z)<9))continue;pick(P,'Mushroom_Common',x,z,.9+r()*.8);n++}
  for(const nm in P){const f=_cscatter(nm,TH[nm]||2,P[nm],_clsOf(nm));if(!f)continue;
    for(const p of P[nm]){if(/Tree|Pine/.test(nm))solids.push({x:p.x,z:p.z,r:.45*p.s});else if(/Rock/.test(nm))solids.push({x:p.x,z:p.z,r:f.w*.38*p.s,h:p.y+1.5*p.s})}}
  // ---- satellite island: cottage, bench, campfire, trees ----
  const cx2=SKY.x+S2.x,cz2=SKY.z+S2.z;
  {const tg=_polarTop(cx2,cz2,skyRim2,skyTop2,(c,x,z,lip,lt)=>{const n=_noise3(x*.07+4,0,z*.07);c.copy(g1).lerp(g2,n*.8).lerp(g3,.25);if(lip)c.lerp(soil,.2+lt*.75);c.multiplyScalar(1-.12*sstep(skyRim2(Math.atan2(z,x))-10,skyRim2(Math.atan2(z,x)),Math.hypot(x,z)))});
   const tm=new THREE.Mesh(tg,new THREE.MeshLambertMaterial({vertexColors:true}));tm.receiveShadow=true;scene.add(tm);
   const rm=new THREE.Mesh(_rockMass(cx2,cz2,skyRim2,skyTop2,SKYI.satR*1.6,9.1),rockMat);rm.castShadow=true;scene.add(rm);
   const sy=skyTop2(8,-6);cottage(scene,cx2+8,cz2-6,sy,-.6,2,3,{moss:true});for(const [dx,dz] of [[-1,-2],[0,0],[1,2]])solids.push({x:cx2+8+dz*Math.sin(-.6)*-0,z:cz2-6+dz,r:3.2});
   const P2={};const add2=(nm,x,z,s)=>{(P2[nm]=P2[nm]||[]).push({x:cx2+x,y:skyTop2(x,z),z:cz2+z,ry:r()*TAU,s})};
   for(const [x,z,s] of [[-24,-10,1.2],[-18,16,1.0],[22,12,1.1],[10,24,.95],[-6,-26,1.1],[24,-14,1.0],[-30,2,.9]])add2(kinds[Math.floor(r()*8)],x,z,s);
   for(let k=0;k<26;k++){const a=r()*TAU,rr=r()*SKYI.satR*.85,x=Math.cos(a)*rr,z=Math.sin(a)*rr;if(Math.hypot(x-8,z+6)<9||Math.hypot(x+4,z-2)<6)continue;add2(k%3?'Bush_Common':'Bush_Common_Flowers',x,z,.9+r()*.7)}
   for(let k=0;k<40;k++){const a=r()*TAU,rr=r()*SKYI.satR*.9,x=Math.cos(a)*rr,z=Math.sin(a)*rr;if(Math.hypot(x-8,z+6)<8)continue;add2(['Grass_Common_Short','Flower_3_Group','Fern_1','Flower_3_Group'][k%4],x,z,.8+r()*.8)}
   for(const nm in P2){const f=_cscatter(nm,TH[nm]||2,P2[nm],_clsOf(nm));if(f&&/Tree|Pine/.test(nm))for(const p of P2[nm])solids.push({x:p.x,z:p.z,r:.45*p.s})}
   const bench=new THREE.Group();bench.position.set(cx2-2,skyTop2(-2,6),cz2+6);bench.rotation.y=.4;scene.add(bench);const bm=stdM('#8a5a2e');
   for(const [w,h,d,x,y,z] of [[2.6,.14,.65,0,.58,0],[2.6,.55,.1,0,.95,-.3],[.14,.58,.55,-1.1,.29,0],[.14,.58,.55,1.1,.29,0]]){const b=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),bm);b.position.set(x,y,z);b.castShadow=true;bench.add(b)}solids.push({x:cx2-2,z:cz2+6,r:1.5});
   const fy=skyTop2(-8,-2);for(let i=0;i<7;i++){const a=i/7*TAU,s=new THREE.Mesh(new THREE.IcosahedronGeometry(.3,0),stdM('#8d8a85'));s.position.set(cx2-8+Math.cos(a)*.8,fy+.16,cz2-2+Math.sin(a)*.8);scene.add(s)}
   const fm=new THREE.Mesh(new THREE.ConeGeometry(.45,1.2,6),new THREE.MeshBasicMaterial({color:'#ffb030',transparent:true,opacity:.9}));fm.position.set(cx2-8,fy+.65,cz2-2);scene.add(fm);skyAnim.flames.push({m:fm});
   const logM=stdM('#6a4426');for(let i=0;i<3;i++){const l=new THREE.Mesh(new THREE.CylinderGeometry(.1,.1,1,6),logM);l.position.set(cx2-8,fy+.13,cz2-2);l.rotation.set(1.45,i*1.05,0);scene.add(l)}solids.push({x:cx2-8,z:cz2-2,r:.9});
   place(scene,'lantern',cx2+1,skyTop2(1,8),cz2+8,0,2.6);solids.push({x:cx2+1,z:cz2+8,r:.35})}
  // ---- bridge: planks + rails, walkable via a chain of low circular solids ----
  {const a0={x:SKY.x+P0.x,z:SKY.z+P0.z},a1={x:cx2-dir.x*(skyRim2(ab+Math.PI)-5),z:cz2-dir.z*(skyRim2(ab+Math.PI)-5)};
   const L=Math.hypot(a1.x-a0.x,a1.z-a0.z),tx=(a1.x-a0.x)/L,tz=(a1.z-a0.z)/L,nx=-tz,nz=tx,y0b=skyTop(P0.x,P0.z)-.07,y1b=skyTop2(a1.x-cx2,a1.z-cz2)-.07,sag=2.2;
   const deck=u=>y0b+(y1b-y0b)*u-sag*4*u*(1-u),pts=u=>({x:a0.x+tx*L*u,z:a0.z+tz*L*u,y:deck(u)});
   const NP=Math.floor(L/.62),planks=new THREE.InstancedMesh(new THREE.BoxGeometry(.5,.14,2.3),new THREE.MeshLambertMaterial({flatShading:true}),NP),m4=new THREE.Matrix4(),q=new THREE.Quaternion(),sc=new THREE.Vector3(1,1,1),pc=new THREE.Color(),brown=['#8b5a2b','#a06a35','#7a4d24','#946034'];
   for(let i=0;i<NP;i++){const u=(i+.5)/NP,p=pts(u),ah=pts(Math.min(1,u+.01)),bh=pts(Math.max(0,u-.01));q.setFromEuler(new THREE.Euler(0,-Math.atan2(tz,tx),Math.atan2(ah.y-bh.y,L*.02),'YZX'));m4.compose(new THREE.Vector3(p.x,p.y,p.z),q,sc);planks.setMatrixAt(i,m4);planks.setColorAt(i,pc.set(brown[i%4]))}
   planks.castShadow=true;planks.receiveShadow=true;scene.add(planks);
   const BG=new THREE.Group();scene.add(BG);const ropeM=new THREE.MeshLambertMaterial({color:'#d8c8a0'}),postM=stdM('#6a4426');
   for(const side of [-1,1]){const rp=[];for(let i=0;i<=50;i++){const u=i/50,p=pts(u);rp.push(new THREE.Vector3(p.x+nx*1.1*side,p.y+1.1,p.z+nz*1.1*side))}
     BG.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rp),70,.07,5),ropeM));
     BG.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rp.map(v=>new THREE.Vector3(v.x,v.y-.6,v.z))),70,.05,5),ropeM));
     for(let i=0;i<=10;i++){const u=i/10,p=pts(u),po=new THREE.Mesh(new THREE.CylinderGeometry(.09,.11,1.35,6),postM);po.position.set(p.x+nx*1.1*side,p.y+.65,p.z+nz*1.1*side);BG.add(po)}}
   _bake(BG);
   for(let i=0;i<=Math.floor(L/.7);i++){const u=Math.min(1,i*.7/L),p=pts(u);solids.push({x:p.x,z:p.z,r:.7,h:p.y+.07})}}
  // ---- floating islets: little decorative chunks with a tree each ----
  for(let i=0;i<5;i++){const a=(i/5+.07)*TAU+.3,rr=R*(1.35+r()*.35),ix=Math.cos(a)*rr,iz=Math.sin(a)*rr,iy=base-30+r()*70,ir=9+r()*8,g=new THREE.Group();g.position.set(SKY.x+ix,iy,SKY.z+iz);scene.add(g);
    const tgeo=_polarTop(0,0,()=>ir,()=>0,(c,x,z,lip,lt)=>{c.copy(g2).lerp(g1,_noise3(x*.2,0,z*.2));if(lip)c.lerp(soil,.2+lt*.75)});g.add(new THREE.Mesh(tgeo,new THREE.MeshLambertMaterial({vertexColors:true})));
    g.add(new THREE.Mesh(_rockMass(0,0,()=>ir,()=>0,ir*1.7,i*3.3+1),rockMat));
    const tn=place(g,kinds[(i*2)%8],0,0,0,r()*TAU,.9);if(tn)tn.scale.setScalar(.8+r()*.3);place(g,'Bush_Common',ir*.4,0,ir*.2,0,.9);
    skyAnim.bob.push({g,y0:iy,ph:r()*TAU,sp:.3+r()*.25,amp:1.5+r()*2})}
  // ---- star shards ----
  {const shard=new THREE.MeshLambertMaterial({color:'#ffe08a',emissive:'#ffb020',emissiveIntensity:.9}),spots=[];
   for(let k=0;k<300&&spots.length<8;k++){const a=r()*TAU,rr=R*(.2+r()*.65),x=Math.cos(a)*rr,z=Math.sin(a)*rr;if(!noRim(x,z,10)||!free(x,z,{hub:26}))continue;spots.push([SKY.x+x,SKY.z+z,skyTop(x,z)+1.5])}
   for(const [dx,dz] of [[-14,6],[12,10]])spots.push([cx2+dx,cz2+dz,skyTop2(dx,dz)+1.5]);
   for(const [x,z,y] of spots){const m=new THREE.Mesh(new THREE.OctahedronGeometry(.55),shard);m.position.set(x,y,z);scene.add(m);orbs.push({m,x,z,y,on:true})}}
  if(typeof Fishing!=='undefined')Fishing.build(SKYI.spots);
  // cosy-cottage interactions: lie on the bed, sit by the fire (uses the emote system)
  if(typeof Interaction!=='undefined'&&skyAnim.cozy){const z=skyAnim.cozy,inside=()=>Math.abs(S.x-z.cx)<z.hwm+1&&Math.abs(S.z-z.cz)<z.hdm+1&&S.y<z.y+6&&S.y>z.y-5,emo=id=>{loadEmotes().then(()=>playEmote(id)).catch(()=>{})};
    Interaction.register('cozy-bed','Lie down',()=>!S.flying&&inside()&&S.y<z.y+.5&&Math.hypot(S.x-z.bed.x,S.z-z.bed.z)<3.8,()=>{
      // two people fit: pick the slot that is free (or the one farthest from the partner)
      const taken=z.slots.map(sl=>{let d=1e9;others.forEach(o=>{const g=o.group.position;if(Math.abs(g.y-(z.y+.9))<.7)d=Math.min(d,Math.hypot(g.x-sl.x,g.z-sl.z))});return d<.8});
      const free=z.slots.map((sl,i)=>i).filter(i=>!taken[i]);if(!free.length){banner('The bed is full','🛏️');return}
      const sl=z.slots[free.length>1?(Math.hypot(S.x-z.slots[0].x,S.z-z.slots[0].z)<=Math.hypot(S.x-z.slots[1].x,S.z-z.slots[1].z)?0:1):free[0]];
      S.x=sl.x;S.z=sl.z;S.y=z.y+.95;S.vy=0;S.kx=0;S.kz=0;S.rot=0; // rot 0: head towards the pillows (-z)
      if(me){me.position.set(S.x,S.y,S.z);me.userData.pp=null;me.userData.v=0} // no speed spike from the teleport (it used to cancel the pose at once)
      skyAnim.pend={id:'lie',t:0}});
    Interaction.register('cozy-fire','Warm up by the fire',()=>!S.flying&&inside()&&S.y<z.y+.5&&Math.hypot(S.x-z.hearth.x,S.z-z.hearth.z)<3.4,()=>{S.rot=-Math.PI/2;emo('sit')})}
  skyAnim.objs=scene.children.slice(n0).filter(o=>!orbs.some(b=>b.m===o)&&!_chunks.some(c=>c.im===o)); // everything except the collectible shards; hidden while you are far away (see skyTick)
}
// Adaptive island quality: if the frame time stays high while you are on/near the island, step down (shorter draw distances, then no grass/flowers, fewer clouds,
// no waterfalls, no shadows on the ground); step back up once it runs smoothly. Uses Perf.state.ema (ms per frame).
function _adapt(t){
  const dt=Math.min(.25,(t-skyAnim.lastT)/1000);skyAnim.lastT=t;if(!(dt>0)||typeof Perf==='undefined')return;const ema=Perf.state.ema,A=skyAnim;
  if(ema>31)A.slow+=dt;else A.slow=Math.max(0,A.slow-dt*2);if(ema<21)A.fast+=dt;else A.fast=0;
  let ch=false;if(A.slow>2.5&&A.tier<3){A.tier++;A.slow=0;ch=true}else if(A.fast>14&&A.tier>0){A.tier--;A.fast=0;ch=true}
  if(ch){A.mul=[1,.72,.52,.36][A.tier];for(const m of A.recv)m.receiveShadow=A.tier<1;for(const f of A.falls)f.mesh.visible=A.tier<3;if(typeof Env!=='undefined')Env.state.cloudLod=A.tier>=2?.4:1}}
function skyTick(t){
  const s=t/1000;
  if(skyAnim.pend&&typeof S!=='undefined'){const p=skyAnim.pend;p.t+=1/60;if(S.grounded&&S.state==='idle'&&p.t>.12){skyAnim.pend=null;loadEmotes().then(()=>playEmote(p.id)).catch(()=>{})}else if(p.t>1.5)skyAnim.pend=null} // start the pose only once you have settled on the bed
  if(skyAnim.objs&&typeof S!=='undefined'){const d=Math.hypot(S.x-SKY.x,S.z-SKY.z)+Math.abs(S.y-SKY.base)*.6,vis=skyAnim.vis?d<1800:d<1500; // ~600k triangles of kit pieces: only draw the island when you are within ~1.5 km of it
    if(vis!==skyAnim.vis){skyAnim.vis=vis;for(const o of skyAnim.objs)o.visible=vis;if(!vis)for(const c of _chunks)c.im.visible=false}
    if(skyAnim.vis){_adapt(t);_updateChunks()}}
  for(const f of skyAnim.floaters){f.m.position.y=f.y0+Math.sin(s*f.sp+f.ph)*f.amp;f.m.rotation.y+=f.rs*.016}
  if(typeof S!=='undefined')for(const rf of skyAnim.roofs){const dx=Math.abs(S.x-rf.cx),dz=Math.abs(S.z-rf.cz),ins=dx<rf.hw+(rf.inside?1.8:.2)&&dz<rf.hd+(rf.inside?1.8:.2)&&S.y<rf.y+8&&S.y>rf.y-6;if(ins!==rf.inside){rf.inside=ins;for(const m of rf.meshes)m.visible=!ins}} // the roof lifts off while you are inside
  { const nt=(typeof Env!=='undefined'&&Env.state)?1-Env.state.dayF:0;for(const g of skyAnim.glow)g.mat.emissiveIntensity=(g.base||0)+nt*g.k }
  for(const b of skyAnim.bob)b.g.position.y=b.y0+Math.sin(s*b.sp+b.ph)*b.amp;
  for(const p of skyAnim.smoke){p.age=(p.age+.016)%5.2;const u=p.age/5.2;p.m.position.set(p.x+u*3.4+Math.sin(s+p.age)*.28,p.y+u*10,p.z+Math.cos(s*.7+p.age)*.22);p.m.scale.setScalar(.5+u*2.4);p.m.material.opacity=.5*(1-u)*(1-u)}
  for(const f of skyAnim.flames){f.m.scale.set(1+Math.sin(s*14)*.1,1+Math.sin(s*11+1)*.2,1+Math.cos(s*13)*.1);f.m.material.opacity=.75+Math.sin(s*17)*.15}
  for(const f of skyAnim.falls){f.tex.offset.y=-s*.9+f.ph;f.m.opacity=.78+Math.sin(s*2.6+f.ph)*.08}}
