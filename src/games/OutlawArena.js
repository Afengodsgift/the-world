// OutlawArena: turns the whole of Outlaw Isle into a battlefield instead of one 46 m town square. Built by Outlaw.build() (once, after the town).
//  - Zones: Old Mine on the east mesa, Lookout Ridge (watchtower) in the west, Dry Gulch Ranch (barn, corral, windmill) in the south, a railroad along the north
//    with a train that shuttles back and forth (its cars are MOVING cover and a hazard if you stand on the tracks), cacti and tumbleweeds in between.
//  - Breakable cover: crates, hay bales and barrels have HP (hit them with bullets/rockets/dynamite) and disappear; red barrels explode and chain. They are real cover
//    entries (bullets/line of sight/NPC cover logic), and grow back at the start of every wave.
//  - Fronts: each wave the raiders come from 1-3 of five spawn points around the island (see pickFronts), snipers prefer the ridge.
// Determinism/net: the layout comes from a fixed seed (identical on every client, so breakable ids match with no networking). Only meaningful events are sent over
// the existing 'og' channel via X.send: {k:'cv',i,d} client damage -> host, {k:'cb',i} break (host -> all), {k:'fr',f} wave fronts, {k:'rs'} regrow. The train follows the
// wall clock on each client and is re-synced to the host's phase in the 10 Hz snapshot (trainQ/trainSync), so it is in the same place for both players.
// Globals: THREE, H, mulberry, LOCS, S, banner. Context X from Outlaw: {C,cover,solids,scene,send,isHost,boom,sfx,spark,hurtMe,dropAt,aoeNpc}.
const OutlawArena=(()=>{
  let X=null,built=false,G=null,fronts=[],curFronts=[],fi=0,blades=null,weeds=[];
  const brk=[],timers=[];
  const R=mulberry(7041);
  const mat=(c,o)=>new THREE.MeshStandardMaterial(Object.assign({color:c,roughness:.95},o||{}));
  const M={crate:mat('#a9803f'),barrel:mat('#7a4a22'),xbarrel:mat('#b0261c',{emissive:'#4a0a06',emissiveIntensity:.5}),stripe:mat('#f2e6c8'),hay:mat('#d8b45a'),
    rock:mat('#8d7a66'),rock2:mat('#a08a70'),wood:mat('#6b4a2a'),dark:mat('#1d1610'),metal:mat('#4a4a52'),train:mat('#3b3f48'),red:mat('#8a2a22'),cargo:mat('#7a5a34'),
    roof:mat('#5a3a1e'),barn:mat('#8c3a2a'),white:mat('#e9e2d0'),ore:mat('#3d3a3a'),rail:mat('#6a6a72'),tie:mat('#4a3520'),cactus:mat('#4f7f3a')};
  const KIND={crate:{hp:45,r:.95,drop:.22},barrel:{hp:35,r:.7,drop:.1},xbarrel:{hp:28,r:.75,drop:0},hay:{hp:90,r:1.5,drop:.12}};
  const gy=(x,z)=>H(x,z);
  const add=m=>{m.castShadow=m.receiveShadow=true;G.add(m);return m};
  const box=(w,h,d,m,x,y,z,ry)=>{const o=add(new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m));o.position.set(x,y,z);if(ry)o.rotation.y=ry;return o};
  const cyl=(r0,r1,h,m,x,y,z,seg)=>{const o=add(new THREE.Mesh(new THREE.CylinderGeometry(r0,r1,h,seg||10),m));o.position.set(x,y,z);return o};
  const cov=(x,z,r)=>{const c={x,z,r};X.solids.push(c);X.cover.push(c);return c};
  const rm=(arr,c)=>{const i=arr.indexOf(c);if(i>=0)arr.splice(i,1)};
  const land=(x,z,min)=>gy(x,z)>(min===undefined?.8:min);

  // ---------- breakable cover ----------
  function addBrk(kind,x,z){
    const K=KIND[kind],y=gy(x,z),id=brk.length;let m;
    if(kind==='crate'){m=box(1.4,1.3,1.4,M.crate,x,y+.65,z,R()*3)}
    else if(kind==='hay'){m=cyl(1.3,1.3,1.7,M.hay,x,y+.85,z,12);const t=add(new THREE.Mesh(new THREE.ConeGeometry(1.2,.7,12),M.hay));t.position.y=1.2;m.add(t);m.rotation.y=R()*3}
    else{m=cyl(.55,.55,1.2,kind==='xbarrel'?M.xbarrel:M.barrel,x,y+.6,z,10);if(kind==='xbarrel'){const s=add(new THREE.Mesh(new THREE.CylinderGeometry(.57,.57,.22,10),M.stripe));s.position.y=.1;m.add(s)}}
    const c=cov(x,z,K.r),b={id,kind,hp:K.hp,max:K.hp,m,c,x,z,dead:false};c.brk=id;brk.push(b);return b}
  function damageBrk(id,d){
    const b=brk[id];if(!b||b.dead)return;b.hp-=d;b.m.scale.setScalar(.94+.06*Math.max(0,b.hp/b.max));
    if(b.hp<=0){X.send({k:'cb',i:id});applyBreak(b)}}
  function applyBreak(b){
    if(!b||b.dead)return;b.dead=true;G.remove(b.m);rm(X.cover,b.c);rm(X.solids,b.c);
    const col=b.kind==='hay'?'#d8b45a':b.kind==='crate'?'#a9803f':'#7a4a22';
    for(let i=0;i<3;i++)X.spark(b.x,gy(b.x,b.z)+.7,b.z,col);X.sfx(b.kind==='xbarrel'?'boom':'hit');
    if(b.kind==='xbarrel')explode(b);
    else if(X.isHost()&&Math.random()<KIND[b.kind].drop)X.dropAt(b.x,b.z)}
  function explode(b){
    X.boom(b.x,b.z,6);const dd=Math.hypot(S.x-b.x,S.z-b.z);if(dd<7)X.hurtMe(Math.max(4,Math.round(38*(1-dd/7.5))),b.x,b.z);
    if(!X.isHost())return;
    X.aoeNpc(b.x,b.z,6,75);
    for(const o of brk)if(!o.dead&&o!==b&&Math.hypot(o.x-b.x,o.z-b.z)<6.5)timers.push({t:.12+Math.random()*.12,f:()=>damageBrk(o.id,70)})}
  // called from Outlaw when a bullet's nearest hit is a cover entry; d = damage of that pellet
  function hitCover(c,d){if(!c||c.brk===undefined)return;if(X.isHost())damageBrk(c.brk,d);else X.send({k:'cv',i:c.brk,d})}
  function blast(x,z,rad,dmg){for(const b of brk){if(b.dead)continue;const d=Math.hypot(b.x-x,b.z-z);if(d<rad+1)hitCover(b.c,Math.max(8,dmg*(1-d/(rad+1))))}}
  function reset(){for(const b of brk){b.hp=b.max;b.m.scale.setScalar(1);if(b.dead){b.dead=false;G.add(b.m);X.cover.push(b.c);X.solids.push(b.c)}}}

  // ---------- decor helpers ----------
  function boulder(x,z,r){const m=add(new THREE.Mesh(new THREE.DodecahedronGeometry(r,0),R()<.5?M.rock:M.rock2));m.scale.set(1,.7+R()*.3,1);m.position.set(x,gy(x,z)+r*.4,z);m.rotation.set(R()*3,R()*3,R()*3);cov(x,z,r*.9)}
  function ring(cx,cz,rad,n,rmin,rmax,a0){for(let i=0;i<n;i++){const a=(a0||0)+i/n*6.283+R()*.3,rr=rad+R()*4-2,x=cx+Math.cos(a)*rr,z=cz+Math.sin(a)*rr;if(land(x,z,.3))boulder(x,z,rmin+R()*(rmax-rmin))}}
  function scatterBrk(cx,cz,list,rmin,rmax){for(const k of list){for(let i=0;i<30;i++){const a=R()*6.283,rr=rmin+R()*(rmax-rmin),x=cx+Math.cos(a)*rr,z=cz+Math.sin(a)*rr;if(land(x,z,.8)){addBrk(k,x,z);break}}}}
  function railStub(ox,oz,yaw,len){ // a short straight rail line (mine tracks), local +z along the line
    const cs=Math.cos(yaw),sn=Math.sin(yaw);for(let s=0;s<=len;s+=1.6){const x=ox+sn*s,z=oz+cs*s,y=gy(x,z)+.08;box(2.2,.08,.3,M.tie,x,y,z,yaw);
      for(const side of [-.7,.7]){box(.1,.12,1.7,M.rail,x+cs*side,y+.08,z-sn*side,yaw)}}}

  // ---------- zones ----------
  function mine(){
    const C=X.C,cx=C.x+125,cz=C.z+15,ex=cx-21,ez=cz,yaw=-Math.PI/2,y=gy(ex,ez);
    const g=new THREE.Group();g.position.set(ex,y,ez);g.rotation.y=yaw;G.add(g);
    const part=(w,h,d,m,x,yy,z)=>{const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(x,yy,z);o.castShadow=o.receiveShadow=true;g.add(o)};
    part(.55,4.2,.55,M.wood,-2.4,2.1,0);part(.55,4.2,.55,M.wood,2.4,2.1,0);part(5.8,.6,.7,M.wood,0,4.4,0);part(4.4,3.9,.3,M.dark,0,1.95,-.3);part(.4,1.2,.4,M.wood,-1.7,3.6,.2,0);
    cov(ex-2.6*Math.sin(-yaw)*0,ez+2.6,.9);cov(ex,ez-2.6,.9);  // the two door posts block movement
    railStub(ex,ez,yaw,16);
    for(let i=0;i<3;i++){const s=4+i*4,x=ex+Math.sin(yaw)*s,z=ez+Math.cos(yaw)*s;box(1.5,.8,1.1,M.metal,x,gy(x,z)+.75,z,yaw);cyl(.6,.1,.5,M.ore,x,gy(x,z)+1.3,z,6);cov(x,z,.95)}
    for(const [dx,dz] of [[-8,8],[6,-10],[-2,15],[10,6]]){const x=cx+dx,z=cz+dz,o=add(new THREE.Mesh(new THREE.ConeGeometry(1.5,1.7,7),M.ore));o.position.set(x,gy(x,z)+.8,z);cov(x,z,1.3)}
    ring(cx,cz,23,9,1.6,2.6,.4);ring(cx,cz,10,4,1.3,1.9,1.1);
    scatterBrk(cx-14,cz,['crate','crate','crate','xbarrel','xbarrel','xbarrel'],3,9);scatterBrk(cx,cz,['crate','crate','crate','xbarrel','barrel','barrel'],4,16);
    LOCS.push({n:'The Old Mine',x:cx,z:cz,r:26})}
  function ridge(){
    const C=X.C,cx=C.x-125,cz=C.z+35,y=gy(cx,cz);
    for(const [dx,dz] of [[-2.3,-2.3],[2.3,-2.3],[-2.3,2.3],[2.3,2.3]])box(.5,7,.5,M.wood,cx+dx,y+3.2,cz+dz);
    box(5.6,.4,5.6,M.wood,cx,y+6.9,cz);
    for(const [dx,dz,w,d] of [[0,-2.7,5.6,.2],[0,2.7,5.6,.2],[-2.7,0,.2,5.6],[2.7,0,.2,5.6]])box(w,.9,d,M.wood,cx+dx,y+7.5,cz+dz);
    const rf=add(new THREE.Mesh(new THREE.ConeGeometry(4.4,2,4),M.roof));rf.position.set(cx,y+9.8,cz);rf.rotation.y=Math.PI/4;
    for(const [dx,dz] of [[-2.3,-2.3],[2.3,-2.3]])box(.18,9.5,.18,M.wood,cx+dx*.95,y+8.6,cz+dz*.95);
    cov(cx,cz,2.9);
    ring(cx,cz,14,7,1.5,2.5,.2);ring(cx,cz,24,6,1.8,2.8,.9);
    scatterBrk(cx,cz,['crate','crate','crate','crate','crate','xbarrel','xbarrel','xbarrel','hay','hay'],5,20);
    LOCS.push({n:'Lookout Ridge',x:cx,z:cz,r:26})}
  function ranch(){
    const C=X.C,cx=C.x+10,cz=C.z+118,y=gy(cx,cz);
    box(13,6.4,9,M.barn,cx,y+3.2,cz);
    for(const s of [-1,1]){const r=box(8.4,.4,10,M.roof,cx+s*3.2,y+7.2,cz);r.rotation.z=-s*.55}
    box(3.2,4.4,.2,M.dark,cx,y+2.2,cz-4.6);
    for(const dx of [-4.5,0,4.5])cov(cx+dx,cz,3.6);
    const kx=cx-32,kz=cz-6,n=16;
    for(let i=0;i<n;i++){const a=i/n*6.283,x=kx+Math.cos(a)*11,z=kz+Math.sin(a)*11;if(i===3||i===4)continue;cyl(.13,.13,1.5,M.wood,x,gy(x,z)+.75,z,5)
      const b=(i+1)/n*6.283,x2=kx+Math.cos(b)*11,z2=kz+Math.sin(b)*11;if(i===2||i===3)continue;
      for(const h of [.55,1.1]){const o=box(Math.hypot(x2-x,z2-z),.1,.1,M.wood,(x+x2)/2,gy((x+x2)/2,(z+z2)/2)+h,(z+z2)/2);o.rotation.y=-Math.atan2(z2-z,x2-x)}}
    for(const [dx,dz] of [[-35,8],[-27,10]]){box(3,.5,.9,M.wood,cx+dx,gy(cx+dx,cz+dz)+.45,cz+dz);cov(cx+dx,cz+dz,1.3)}
    const wx=cx+30,wz=cz-14,wy=gy(wx,wz);cyl(.45,1.1,10,M.wood,wx,wy+5,wz,6);
    blades=new THREE.Group();blades.position.set(wx,wy+10.2,wz+.9);G.add(blades);
    for(let i=0;i<4;i++){const bl=new THREE.Mesh(new THREE.BoxGeometry(.5,4.6,.1),M.white);bl.position.y=2.4;const p=new THREE.Group();p.rotation.z=i*Math.PI/2;p.add(bl);blades.add(p)}
    cov(wx,wz,1.4);
    ring(cx,cz,26,4,1.4,2,2);
    scatterBrk(cx-20,cz-4,['hay','hay','hay','hay','hay','hay','hay','hay'],4,16);scatterBrk(cx,cz+8,['crate','crate','crate','crate','crate','crate','xbarrel','xbarrel'],7,22);
    LOCS.push({n:'Dry Gulch Ranch',x:cx,z:cz,r:30})}

  // ---------- the railroad + train ----------
  const T={V:9,pause:6,len:0,pts:[],units:[],off:0,N:5,gap:8.5,span:0,range:0,moving:false,hitCd:0,wasMoving:false};
  function buildPath(){
    const C=X.C,P0=[C.x-155,C.z-55],P1=[C.x,C.z-175],P2=[C.x+155,C.z-55];let L=0,px=P0[0],pz=P0[1];T.pts=[];
    for(let i=0;i<=240;i++){const t=i/240,u=1-t,x=u*u*P0[0]+2*u*t*P1[0]+t*t*P2[0],z=u*u*P0[1]+2*u*t*P1[1]+t*t*P2[1];if(i)L+=Math.hypot(x-px,z-pz);T.pts.push([x,z,L]);px=x;pz=z}
    T.len=L;T.span=(T.N-1)*T.gap;T.range=L-T.span-2}
  function pathAt(s){
    s=Math.max(0,Math.min(T.len,s));let lo=0,hi=T.pts.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(T.pts[m][2]<=s)lo=m;else hi=m}
    const a=T.pts[lo],b=T.pts[hi],k=(s-a[2])/Math.max(1e-6,b[2]-a[2]);return {x:a[0]+(b[0]-a[0])*k,z:a[1]+(b[1]-a[1])*k,yaw:Math.atan2(b[0]-a[0],b[1]-a[1])}}
  function phase(){const pw=T.V*T.pause,total=2*(T.range+pw);return {pw,total,q:(((Date.now()/1000)*T.V+T.off)%total+total)%total}}
  function trainState(){ // {a,dir,moving}: a = position of the back end along the path
    const {pw,q}=phase(),r=T.range;
    if(q<r)return {a:q,dir:1,moving:true};if(q<r+pw)return {a:r,dir:1,moving:false};
    if(q<2*r+pw)return {a:r-(q-r-pw),dir:-1,moving:true};return {a:0,dir:-1,moving:false}}
  const trainQ=()=>Math.round(phase().q*10)/10;
  function trainSync(hq){if(!isFinite(hq)||!T.len)return;const {q,total}=phase();let d=hq-q;d=((d+total/2)%total+total)%total-total/2;T.off+=d*.25}
  function buildTrain(){
    buildPath();const n=Math.floor(T.len/2.2)+1,tie=new THREE.InstancedMesh(new THREE.BoxGeometry(2.4,.1,.4),M.tie,n),rl=new THREE.InstancedMesh(new THREE.BoxGeometry(.12,.14,2.3),M.rail,n*2),d=new THREE.Object3D();
    for(let i=0;i<n;i++){const s=i*2.2,p=pathAt(s),y=gy(p.x,p.z)+.1,cs=Math.cos(p.yaw),sn=Math.sin(p.yaw);
      d.position.set(p.x,y,p.z);d.rotation.set(0,p.yaw,0);d.updateMatrix();tie.setMatrixAt(i,d.matrix);
      for(let k=0;k<2;k++){const o=k?.75:-.75;d.position.set(p.x+cs*o,y+.1,p.z-sn*o);d.updateMatrix();rl.setMatrixAt(i*2+k,d.matrix)}}
    tie.receiveShadow=rl.receiveShadow=true;G.add(tie,rl);
    for(let k=0;k<T.N;k++){
      const g=new THREE.Group(),loco=k===0,body=loco?M.train:(k%2?M.red:M.cargo),h=loco?3.2:2.6;
      const part=(w,hh,dd,m,x,y,z)=>{const o=new THREE.Mesh(new THREE.BoxGeometry(w,hh,dd),m);o.position.set(x,y,z);o.castShadow=o.receiveShadow=true;g.add(o)};
      part(3,h,loco?7.6:7,body,0,.9+h/2,0);part(3.3,.3,loco?7.8:7.2,M.dark,0,.9+h+.15,0);part(2.6,.5,loco?7:6.5,M.metal,0,.5,0);
      if(loco){const ch=new THREE.Mesh(new THREE.CylinderGeometry(.45,.6,1.6,8),M.metal);ch.position.set(0,.9+h+1,2.4);g.add(ch);part(2.6,1.4,1.4,M.red,0,1.3,4.3)}
      G.add(g);
      const c1=cov(0,0,2),c2=cov(0,0,2);T.units.push({g,c1,c2,x:0,z:0})}
    updateTrain(0)}
  function updateTrain(dt){
    if(!T.units.length)return;const st=trainState(),front=st.dir>0?st.a+T.span:st.a;T.moving=st.moving;
    T.units.forEach((u,k)=>{const s=front-st.dir*k*T.gap,p=pathAt(s),cs=Math.sin(p.yaw),sn=Math.cos(p.yaw);u.x=p.x;u.z=p.z;
      u.g.position.set(p.x,gy(p.x,p.z)+.12,p.z);u.g.rotation.y=p.yaw+(st.dir>0?0:Math.PI);
      u.c1.x=p.x+cs*1.9;u.c1.z=p.z+sn*1.9;u.c2.x=p.x-cs*1.9;u.c2.z=p.z-sn*1.9});
    T.hitCd-=dt;
    if(T.moving&&!T.wasMoving&&Math.hypot(S.x-X.C.x,S.z-X.C.z)<260)X.sfx('horn');T.wasMoving=T.moving;
    if(T.moving&&T.hitCd<=0&&S.y-gy(S.x,S.z)<2.2)for(const u of T.units)if(Math.hypot(S.x-u.x,S.z-u.z)<3.1){T.hitCd=1.2;X.hurtMe(18,u.x,u.z);break}}

  // ---------- fronts (where raiders come from) ----------
  function buildFronts(){const C=X.C;fronts=[{id:'mine',n:'the old mine',x:C.x+138,z:C.z+32},{id:'ridge',n:'Lookout Ridge',x:C.x-138,z:C.z+55},{id:'ranch',n:'the ranch',x:C.x+22,z:C.z+138},
    {id:'railw',n:'the west railroad',x:C.x-150,z:C.z-50},{id:'raile',n:'the east railroad',x:C.x+150,z:C.z-50}];curFronts=fronts.map(f=>f.id)}
  const byId=id=>fronts.find(f=>f.id===id);
  function pickFronts(wave){const k=wave<3?1:wave<6?2:3,ids=fronts.map(f=>f.id);for(let i=ids.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[ids[i],ids[j]]=[ids[j],ids[i]]}return ids.slice(0,k)}
  function setFronts(ids,say){curFronts=ids.filter(byId);if(!curFronts.length)curFronts=[fronts[0].id];fi=0;if(say)setTimeout(()=>banner('Raiders coming from '+curFronts.map(i=>byId(i).n).join(' and ')+'!','SHOWDOWN'),1900)}
  function front(type){ // spawn position for an enemy of this type
    let f=type===2&&curFronts.includes('ridge')?byId('ridge'):byId(curFronts[fi++%curFronts.length]);
    for(let i=0;i<12;i++){const x=f.x+(Math.random()-.5)*14,z=f.z+(Math.random()-.5)*14;if(land(x,z,.8))return [x,z]}
    return [f.x,f.z]}

  // ---------- ambience: cacti + tumbleweeds ----------
  function desert(){
    const C=X.C,pts=[];
    for(let i=0;i<400&&pts.length<40;i++){const a=R()*6.283,r=60+R()*105,x=C.x+Math.cos(a)*r,z=C.z+Math.sin(a)*r;if(!land(x,z,1))continue;
      if(Math.hypot(x-(C.x+125),z-(C.z+15))<30||Math.hypot(x-(C.x-125),z-(C.z+35))<30||Math.hypot(x-(C.x+10),z-(C.z+118))<45)continue;
      let near=false;for(let k=0;k<T.pts.length;k+=6)if(Math.hypot(x-T.pts[k][0],z-T.pts[k][1])<9){near=true;break}if(!near)pts.push([x,z,1.6+R()*1.4])}
    const tr=new THREE.InstancedMesh(new THREE.CylinderGeometry(.22,.3,1,6),M.cactus,pts.length),ar=new THREE.InstancedMesh(new THREE.BoxGeometry(.8,.2,.2),M.cactus,pts.length),d=new THREE.Object3D();
    pts.forEach(([x,z,h],i)=>{const y=gy(x,z);d.rotation.set(0,0,0);d.scale.set(1,h,1);d.position.set(x,y+h/2,z);d.updateMatrix();tr.setMatrixAt(i,d.matrix);
      d.scale.set(1,1,1);d.rotation.y=R()*6;d.position.set(x,y+h*.6,z);d.updateMatrix();ar.setMatrixAt(i,d.matrix)});
    tr.castShadow=true;G.add(tr,ar);
    for(let i=0;i<5;i++){const m=new THREE.Mesh(new THREE.IcosahedronGeometry(.55,0),new THREE.MeshBasicMaterial({color:'#8a6a3a',wireframe:true}));m.userData={x:C.x+(R()-.5)*300,z:C.z+(R()-.5)*300,v:3.5+R()*3,ph:R()*6};G.add(m);weeds.push(m)}}

  function build(ctx){
    if(built)return;built=true;X=ctx;G=new THREE.Group();X.scene.add(G);
    buildFronts();mine();ridge();ranch();buildTrain();desert();
  }
  function tick(dt){
    if(!built)return;
    for(let i=timers.length-1;i>=0;i--){timers[i].t-=dt;if(timers[i].t<=0){const f=timers[i].f;timers.splice(i,1);f()}}
    updateTrain(dt);
    if(blades)blades.rotation.z+=dt*(.8+.5*Math.sin(Date.now()/4000));
    const C=X.C;for(const m of weeds){const u=m.userData;u.x+=u.v*dt;u.z+=u.v*.35*dt;if(Math.hypot(u.x-C.x,u.z-C.z)>175){const a=R()*6.283;u.x=C.x-Math.cos(a)*170;u.z=C.z-Math.sin(a)*170}
      m.position.set(u.x,gy(u.x,u.z)+.5+Math.abs(Math.sin(Date.now()/260+u.ph))*.45,u.z);m.rotation.x+=dt*u.v;m.rotation.z+=dt*u.v*.6}}
  function onMsg(p){
    switch(p.k){
      case 'cv':if(X.isHost())damageBrk(p.i,p.d);break;
      case 'cb':applyBreak(brk[p.i]);break;
      case 'fr':setFronts(p.f,true);break;
      case 'rs':reset();break}}
  return {build,tick,onMsg,hitCover,blast,reset,pickFronts,setFronts,front,trainQ,trainSync,
    _t:()=>({brk,T,fronts,pathAt,trainState,get G(){return G},damageBrk,applyBreak,timers})};
})();
