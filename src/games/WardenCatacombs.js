// WARDEN: The Ashen Catacombs builder (3D side of data/dungeon.js). Walls, columns, torches and floors are merged per room / corridor into a few static meshes (distance-culled);
// doors, chests and the exit lever are small animated objects. Wall circles go into the game's `solids`, door circles only while a door is shut. Rooms are ordinary Warden fight sites (see PlayerCombat),
// so this file never starts a fight; it shows the place, opens doors when a room is cleared, and runs the two interactions (open a chest, pull the exit lever).
// Globals used: THREE, scene, H, WRD, WARDEN, DUNGEON, solids, S, WardenDungeon, PlayerCombat, Expedition(optional), LOCS.
const WardenCatacombs=(()=>{
  let built=false,G=null,kit=null,chunks=[],doors=[],chests=[],levers=[],glowMat=null,regSolids=[],btn=null,btnAct=null,chipEl=null,insideF=false,loadTry=0,gateBeacon=null,tickN=0;
  const DG=()=>WARDEN.dungeon,D=()=>DUNGEON.D;
  const tmpM=new THREE.Matrix4(),tmpN=new THREE.Matrix3(),tmpV=new THREE.Vector3(),tmpQ=new THREE.Quaternion(),tmpE=new THREE.Euler(),tmpS=new THREE.Vector3(),tmpP=new THREE.Vector3();
  const bucket=()=>({lit:{pos:[],nor:[],col:[]},glow:{pos:[],nor:[],col:[]},floor:{pos:[],nor:[],uv:[]}});
  // ---- kit: name -> [{geo, color}] (one entry per material group) ----
  function extractKit(gl){const k={};gl.traverse(o=>{if(!o.isMesh)return;const g=o.geometry,ms=[].concat(o.material),parts=[];
      const groups=g.groups&&g.groups.length?g.groups:[{start:0,count:g.index?g.index.count:g.attributes.position.count,materialIndex:0}];
      for(const gr of groups){const m=ms[gr.materialIndex]||ms[0],pos=g.attributes.position,nor=g.attributes.normal,idx=g.index,P=[],N=[];
        for(let i=gr.start;i<gr.start+gr.count;i++){const v=idx?idx.getX(i):i;P.push(pos.getX(v),pos.getY(v),pos.getZ(v));N.push(nor?nor.getX(v):0,nor?nor.getY(v):1,nor?nor.getZ(v):0)}
        parts.push({P,N,c:m.color?[m.color.r,m.color.g,m.color.b]:[.5,.5,.5]})}
      k[o.name]=parts});return k}
  function put(B,name,x,y,z,ry,sx,sy,sz,tint){const parts=kit[name];if(!parts)return;tmpE.set(0,ry,0);tmpQ.setFromEuler(tmpE);tmpM.compose(tmpP.set(x,y,z),tmpQ,tmpS.set(sx,sy,sz));tmpN.getNormalMatrix(tmpM);
    for(const pt of parts){const n=pt.P.length/3,t=tint||1;for(let i=0;i<n;i++){tmpV.set(pt.P[i*3],pt.P[i*3+1],pt.P[i*3+2]).applyMatrix4(tmpM);B.pos.push(tmpV.x,tmpV.y,tmpV.z);tmpV.set(pt.N[i*3],pt.N[i*3+1],pt.N[i*3+2]).applyMatrix3(tmpN).normalize();B.nor.push(tmpV.x,tmpV.y,tmpV.z);B.col.push(pt.c[0]*t,pt.c[1]*t,pt.c[2]*t)}}}
  function boxTo(B,x,y,z,ry,w,h,d,col){const hw=w/2,hh=h/2,hd=d/2,V=[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],F=[[0,1,2,3,0,0,-1],[5,4,7,6,0,0,1],[4,0,3,7,-1,0,0],[1,5,6,2,1,0,0],[3,2,6,7,0,1,0],[4,5,1,0,0,-1,0]],c=Math.cos(ry),s=Math.sin(ry);
    for(const f of F){const q=[0,1,2,0,2,3];for(const i of q){const v=V[f[i]];const lx=v[0]*hw,lz=v[2]*hd;B.pos.push(x+lx*c+lz*s,y+v[1]*hh,z-lx*s+lz*c);B.nor.push(f[4]*c+f[6]*s,f[5],-f[4]*s+f[6]*c);B.col.push(col[0],col[1],col[2])}}}
  function coneTo(B,x,y,z,r,h,col){const n=5;for(let i=0;i<n;i++){const a=i/n*Math.PI*2,b=(i+1)/n*Math.PI*2;B.pos.push(x+Math.sin(a)*r,y,z+Math.cos(a)*r,x+Math.sin(b)*r,y,z+Math.cos(b)*r,x,y+h,z);for(let k=0;k<3;k++){B.nor.push(0,1,0);B.col.push(col[0],col[1],col[2])}}}
  function mk(b,mat,name){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(b.nor,3));
    if(b.col)g.setAttribute('color',new THREE.Float32BufferAttribute(b.col,3));if(b.uv)g.setAttribute('uv',new THREE.Float32BufferAttribute(b.uv,2));g.computeBoundingSphere();const m=new THREE.Mesh(g,mat);m.name=name;m.matrixAutoUpdate=false;m.frustumCulled=true;m.castShadow=false;m.receiveShadow=false;return m}
  function floorTex(){const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d');x.fillStyle='#2b2d38';x.fillRect(0,0,128,128);
    let a=12345;const r=()=>{a=(a*1664525+1013904223)>>>0;return a/4294967296};
    for(let i=0;i<2;i++)for(let j=0;j<2;j++){const sh=26+Math.floor(r()*16);x.fillStyle='rgb('+sh+','+(sh+2)+','+(sh+10)+')';x.fillRect(i*64+2,j*64+2,60,60)}
    x.strokeStyle='#17181f';x.lineWidth=3;x.strokeRect(1,1,126,126);x.beginPath();x.moveTo(64,0);x.lineTo(64,128);x.moveTo(0,64);x.lineTo(128,64);x.stroke();
    const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=2;return t}
  function floorTo(B,pts,y){for(const p of pts){B.pos.push(p[0],y,p[1]);B.nor.push(0,1,0);B.uv.push(p[0]/2.4,p[1]/2.4)}}
  function assemble(){
    const dg=DG(),d=D(),Y=d.y,wx=WRD.x,wz=WRD.z,B={};const ck=n=>B[n]||(B[n]=bucket());
    const fire=[.95,.5,.16],stick=[.2,.13,.08];
    for(const w of dg.walls)put(ck(w.chunk).lit,w.p,wx+w.x,Y,wz+w.z,w.ang,w.len/2.11,d.WALLH/3.06,1.4);
    for(const p of dg.props){const sc=p.s;put(ck(p.chunk).lit,p.p,wx+p.x,Y,wz+p.z,p.ang,sc,sc,sc)}
    for(const t of dg.torches){const b=ck(t.chunk),x=wx+t.x,z=wz+t.z;boxTo(b.lit,x,Y+2.05,z,t.ang,.14,.6,.14,stick);boxTo(b.lit,x,Y+1.78,z,t.ang,.3,.07,.3,stick);coneTo(b.glow,x,Y+2.3,z,.2,.55,fire)}
    // the gate: two braziers flanking the arch
    {const g=dg.gate,b=ck('gate');for(const sg of[-1,1]){const x=wx+g.x+sg*3.6,z=wz+g.z;boxTo(b.lit,x,Y+.7,z,0,.5,1.4,.5,stick);coneTo(b.glow,x,Y+1.4,z,.42,1.1,fire)}}
    const tex=floorTex();const flo=new THREE.MeshStandardMaterial({map:tex,roughness:1,metalness:0});
    for(const f of dg.floors.discs){const b=ck(f.chunk).floor,n=26;for(let i=0;i<n;i++){const a=i/n*Math.PI*2,c=(i+1)/n*Math.PI*2;floorTo(b,[[wx+f.x,wz+f.z],[wx+f.x+Math.sin(c)*f.r,wz+f.z+Math.cos(c)*f.r],[wx+f.x+Math.sin(a)*f.r,wz+f.z+Math.cos(a)*f.r]],Y+.05)}}
    for(const f of dg.floors.strips){const b=ck(f.chunk).floor,c=Math.cos(f.ang),s=-Math.sin(f.ang),hl=f.len/2,hw=f.w/2,P=(a,bb)=>[wx+f.x+a*c-bb*s,wz+f.z+a*s+bb*c];floorTo(b,[P(-hl,-hw),P(hl,-hw),P(hl,hw),P(-hl,-hw),P(hl,hw),P(-hl,hw)],Y+.05)}
    const litMat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.95,metalness:0,flatShading:true});glowMat=new THREE.MeshBasicMaterial({vertexColors:true,fog:true});
    if(typeof TERRAIN_MATS!=='undefined'){TERRAIN_MATS.push(litMat,flo)}
    for(const k in B){const b=B[k];const grp=new THREE.Group();grp.name='dg:'+k;let cx=0,cz=0,n=0,rad=0;const meshes=[];
      if(b.lit.pos.length)meshes.push(mk(b.lit,litMat,'lit'));if(b.glow.pos.length)meshes.push(mk(b.glow,glowMat,'glow'));if(b.floor.pos.length)meshes.push(mk(b.floor,flo,'floor'));
      for(const m of meshes){m.geometry.boundingSphere.center.toArray();grp.add(m)}
      const bs=meshes.length?meshes[0].geometry.boundingSphere:null;for(const m of meshes){const s=m.geometry.boundingSphere;if(!bs||s.radius>bs.radius)Object.assign(bs||{},{})}
      const cen=new THREE.Vector3(),box=new THREE.Box3();for(const m of meshes){m.geometry.computeBoundingBox();box.union(m.geometry.boundingBox)}box.getCenter(cen);rad=box.getSize(new THREE.Vector3()).length()/2;
      G.add(grp);chunks.push({k,grp,x:cen.x,z:cen.z,r:rad,vis:true})}}
  // ---- dynamic objects ----
  function single(name,sx,sy,sz){const B={pos:[],nor:[],col:[]};put(B,name,0,0,0,0,sx,sy,sz);const m=mk(B,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.9,flatShading:true}),name);m.matrixAutoUpdate=true;m.frustumCulled=false;return m}
  function dynamics(){
    const dg=DG(),d=D(),wx=WRD.x,wz=WRD.z,Y=d.y;
    for(const dr of dg.doors){const bars=dr.kind==='bars',m=bars?single('bars',dr.w/2.6,1.45,1.6):single('door',dr.w/2.12,4.3/2.85,1.5);m.position.set(wx+dr.x,Y,wz+dr.z);m.rotation.y=dr.ang;G.add(m);
      const o={d:dr,m,h:4.4,open:0,want:WardenDungeon.doorOpen(dr)?1:0,sol:dr.solids.map(s=>({x:wx+s.x,z:wz+s.z,r:s.r,dg:1,door:dr.id})),reg:false};
      doors.push(o);setDoor(o,o.want,true)}
    for(const c of dg.chests){const g=new THREE.Group(),b=single('chest_bottom',1.2,1.2,1.2),t=single('chest_top',1.2,1.2,1.2),gd=single('gold',1.2,1.2,1.2);t.position.y=.42*1.2-.02;gd.position.y=.42*1.2-.1;g.add(b);g.add(t);g.add(gd);
      g.position.set(wx+c.x,Y,wz+c.z);g.rotation.y=c.ang;G.add(g);const o={c,g,top:t,gold:gd};chests.push(o);chestLook(o)}
    for(const l of dg.levers){const g=new THREE.Group(),base=single('lever_base',1.3,1.3,1.3),h=single('lever',1.5,1.5,1.5);h.position.set(0,.2,0);g.add(base);g.add(h);g.position.set(wx+l.x,Y,wz+l.z);g.rotation.y=-Math.PI/2;G.add(g);levers.push({l,g,h,pulled:false})}
    // a pillar of ember-light at the entrance so the way in can be seen across the isle
    const gm=new THREE.Mesh(new THREE.CylinderGeometry(1.6,2.4,46,12,1,true),new THREE.MeshBasicMaterial({color:'#ff8a3d',transparent:true,opacity:.2,depthWrite:false,side:THREE.DoubleSide,fog:false}));
    gm.position.set(wx+dg.gate.x,Y+23,wz+dg.gate.z);gm.frustumCulled=false;G.add(gm);gateBeacon=gm}
  function setDoor(o,open,instant){o.want=open?1:0;if(instant)o.open=o.want;
    if(!open&&!o.reg){for(const s of o.sol)solids.push(s);o.reg=true}else if(open&&o.reg){for(const s of o.sol){const i=solids.indexOf(s);if(i>=0)solids.splice(i,1)}o.reg=false}
    o.m.position.y=D().y-o.open*o.h;o.m.visible=o.open<.999}
  function chestLook(o){const taken=WardenDungeon.chestTaken(o.c);o.top.visible=!taken;o.gold.visible=taken}
  function refresh(){if(!built)return;for(const o of doors)setDoor(o,WardenDungeon.doorOpen(o.d),true);for(const o of chests)chestLook(o);for(const o of levers){o.pulled=false;o.h.rotation.z=0}
    for(const r of DUNGEON.ROOMS)if(!r.safe)try{WardenIsles.fog(r.id,WardenDungeon.isCleared(r.id)?'gone':'idle')}catch(e){}}
  function onClear(id){if(!built)return;for(const o of doors)if(o.d.need===id)setDoor(o,true,false);try{PlayerCombat.toast('A door grinds open',2.4)}catch(e){}}
  // ---- interaction ----
  function bar(){if(btn)return;btn=document.createElement('button');btn.id='wact';document.body.appendChild(btn);btn.addEventListener('pointerdown',e=>e.stopPropagation());btn.addEventListener('click',()=>{if(btnAct)btnAct()})}
  function nearest(){let best=null,bd=1e9;const px=S.x-WRD.x,pz=S.z-WRD.z;
    for(const o of chests){const d=Math.hypot(px-o.c.x,pz-o.c.z);if(d<2.8&&d<bd&&WardenDungeon.chestReady(o.c)){bd=d;best={t:'chest',o,label:'Open the chest'}}}
    for(const o of levers){const d=Math.hypot(px-o.l.x,pz-o.l.z);if(d<2.8&&d<bd&&WardenDungeon.isCleared(o.l.need)){bd=d;best={t:'lever',o,label:o.l.n}}}
    return best}
  function act(a){if(a.t==='chest'){const c=a.o.c;if(!WardenDungeon.take(c))return;const prog=(typeof WardenProg!=='undefined'?WardenProg.S.cycle:1),loot=WardenDungeon.loot(c.kind,prog,Math.random);
      PlayerCombat.dgReward(loot,c.kind==='main'?'The Ash Hoard':'Vault chest');chestLook(a.o)}
    else if(a.t==='lever'){a.o.pulled=true;a.o.h.rotation.z=-1.1;const g=DG().gate;setTimeout(()=>{S.x=WRD.x+g.x;S.z=WRD.z+g.z+9;S.y=H(S.x,S.z)+1;S.vy=0;S.rot=Math.PI;a.o.pulled=false;a.o.h.rotation.z=0;try{PlayerCombat.toast('You leave the catacombs',2.6)}catch(e){}},450)}}
  function ui(){const fighting=PlayerCombat.on();const a=!fighting&&insideF?nearest():null;
    if(a){bar();btn.textContent=a.label;btn.style.display='block';btnAct=()=>act(a)}else if(btn){btn.style.display='none';btnAct=null}
    // progress chip while inside
    if(insideF&&!fighting){if(!chipEl){chipEl=document.createElement('div');chipEl.id='wdgp';document.body.appendChild(chipEl)}const p=WardenDungeon.progress();const t=D().n+' · '+p.n+'/'+p.of+' rooms';if(chipEl.textContent!==t)chipEl.textContent=t;chipEl.style.display='block'}else if(chipEl)chipEl.style.display='none'}
  // is the player inside the catacombs footprint (a room or a corridor)?
  function inside(){if(!built)return false;const px=S.x-WRD.x,pz=S.z-WRD.z;
    for(const r of DUNGEON.ROOMS)if(Math.hypot(px-r.cx,pz-r.cz)<r.Rc+1.5)return true;
    for(const c of DUNGEON.COR){const dx=px-c.p0.x,dz=pz-c.p0.z,t=dx*c.ux+dz*c.uz;if(t>-1&&t<c.L+1&&Math.abs(-dx*c.uz+dz*c.ux)<DUNGEON.D.HW+1.5)return true}return false}
  function tick(dt,t){
    if(!built||!kit)return;tickN++;
    if(tickN%10===1){insideF=inside();const px=S.x,pz=S.z;for(const c of chunks){const v=Math.hypot(px-c.x,pz-c.z)<c.r+170;if(v!==c.vis){c.vis=v;c.grp.visible=v}}if(gateBeacon)gateBeacon.visible=!insideF}
    for(const o of doors){const w=WardenDungeon.doorOpen(o.d)?1:0;if(w!==o.want)setDoor(o,w===1,false);if(o.open!==o.want){o.open+=(o.want-o.open)*Math.min(1,dt*3.2);if(Math.abs(o.open-o.want)<.01)o.open=o.want;o.m.position.y=D().y-o.open*o.h;o.m.visible=o.open<.999}}
    if(glowMat){const k=.85+.15*Math.sin(t/90)+.08*Math.sin(t/37);glowMat.color.setRGB(k,k*.92,k*.8)}
    ui()}
  function build(){
    if(!WRD.on||built||typeof DUNGEON==='undefined'||!WARDEN.dungeon)return;built=true;G=new THREE.Group();G.name='WardenCatacombs';scene.add(G);
    for(const s of DG().solids){const o={x:WRD.x+s.x,z:WRD.z+s.z,r:s.r,dg:1};solids.push(o);regSolids.push(o)}
    try{LOCS.push({n:D().n,x:WRD.x+DG().gate.x,z:WRD.z+DG().gate.z,r:22})}catch(e){}
    const go=n=>new THREE.GLTFLoader().load('assets/warden/dungeon.glb',gl=>{kit=extractKit(gl.scene);assemble();dynamics();refresh()},undefined,()=>{if(n>0)setTimeout(()=>go(n-1),1500*(4-n))});go(3)}
  return{build,tick,refresh,onClear,inside:()=>insideF,isBuilt:()=>built,_t:()=>({built,kit:!!kit,chunks,doors,chests,levers,solids:regSolids.length})}})();
