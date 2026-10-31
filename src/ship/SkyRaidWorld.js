// SKY RAID world (browser only, THREE r147 global): draws the airship, the current fortress, drones, enemy shots, tracers, explosions and floating damage
// numbers from a SkyCore run. Everything is generated (no model files), so a real model can replace any part later: set `SkyRaidWorld.models.ship / drone`
// to a function(THREE) returning a Group (+x right, +z forward, y up, ~18 m long for the ship, ~5 m for a drone) and it is used instead of the built-in one.
// Cheap by design: shared materials, flat shading, no shadows, small pools, only ONE fortress is ever built.
const SkyRaidWorld=(()=>{
  const models={ship:null,drone:null},built=[];let droneGeo=null,droneAsked=false;
  // The drone model (assets/sky/drone.glb: your assault drone, baked to ~3.5k vertex-coloured triangles by tools/lowpoly_glb.py) is fetched once and swapped in
  // for the placeholder drones of every built world. Any failure just keeps the placeholder.
  function loadGeo(url,gain,off,done){
    if(typeof fetch==='undefined'||typeof THREE==='undefined'||!THREE.GLTFLoader)return;
    fetch(url).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.arrayBuffer()}).then(buf=>new Promise((res,rej)=>new THREE.GLTFLoader().parse(buf,'',res,rej))).then(g=>{
      let geo=null;g.scene.updateMatrixWorld(true);g.scene.traverse(o=>{if(o.isMesh&&!geo){geo=o.geometry.clone();geo.applyMatrix4(o.matrixWorld)}});if(!geo)throw new Error('no mesh');
      const c=geo.attributes.color,n=geo.attributes.position.count,out=new Float32Array(n*3);
      for(let i=0;i<n;i++){out[i*3]=c?Math.min(1,c.getX(i)*gain+off):.5;out[i*3+1]=c?Math.min(1,c.getY(i)*gain+off):.5;out[i*3+2]=c?Math.min(1,c.getZ(i)*gain+off*1.2):.55}
      geo.setAttribute('color',new THREE.BufferAttribute(out,3));if(geo.attributes.uv)geo.deleteAttribute('uv');geo.userData.own=0;done(geo)
    }).catch(e=>console.warn('SkyRaid: model not loaded, using the placeholder',url,e&&e.message))}
  let shipGeo=null,shipAsked=false;
  function loadDrone(url){if(droneAsked)return;droneAsked=true;loadGeo(url,1.5,.03,geo=>{droneGeo=geo;for(const w of built)try{w.useDrone(geo)}catch(e){console.error('SkyRaid drone model',e)}})}
  function loadShip(url){if(shipAsked)return;shipAsked=true;loadGeo(url,1,0,geo=>{shipGeo=geo;for(const w of built)try{w.useShip(geo)}catch(e){console.error('SkyRaid ship model',e)}})}
  // merges many small coloured primitives into ONE vertex-coloured mesh (one draw call instead of dozens)
  const _m4=new THREE.Matrix4(),_p=new THREE.Vector3(),_qq=new THREE.Quaternion(),_sc=new THREE.Vector3(),_e=new THREE.Euler(),_c=new THREE.Color();
  function merger(){
    const parts=[];
    return {add(geo,color,x,y,z,sx,sy,sz,rx,ry,rz){
      const g=geo.index?geo.toNonIndexed():geo.clone();_m4.compose(_p.set(x||0,y||0,z||0),_qq.setFromEuler(_e.set(rx||0,ry||0,rz||0)),_sc.set(sx==null?1:sx,sy==null?(sx==null?1:sx):sy,sz==null?(sx==null?1:sx):sz));g.applyMatrix4(_m4);
      const n=g.attributes.position.count,col=new Float32Array(n*3);_c.set(color);for(let i=0;i<n;i++){col[i*3]=_c.r;col[i*3+1]=_c.g;col[i*3+2]=_c.b}g.setAttribute('color',new THREE.BufferAttribute(col,3));parts.push(g)},
      geometry(){let n=0;for(const g of parts)n+=g.attributes.position.count;const P=new Float32Array(n*3),N=new Float32Array(n*3),C=new Float32Array(n*3);let o=0;
        for(const g of parts){P.set(g.attributes.position.array,o*3);N.set(g.attributes.normal.array,o*3);C.set(g.attributes.color.array,o*3);o+=g.attributes.position.count;g.dispose()}
        const r=new THREE.BufferGeometry();r.setAttribute('position',new THREE.BufferAttribute(P,3));r.setAttribute('normal',new THREE.BufferAttribute(N,3));r.setAttribute('color',new THREE.BufferAttribute(C,3));r.userData.own=1;return r}}
  }
  const cv=(w,h,fn)=>{const c=document.createElement('canvas');c.width=w;c.height=h;fn(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;return t};
  const L=(c,o)=>new THREE.MeshLambertMaterial(Object.assign({color:c,flatShading:true},o||{}));
  const B=(c,o)=>new THREE.MeshBasicMaterial(Object.assign({color:c},o||{}));
  const mesh=(g,m,x,y,z,p)=>{const o=new THREE.Mesh(g,m);o.position.set(x||0,y||0,z||0);if(p)p.add(o);return o};
  function build(scene){
    loadDrone('assets/sky/drone.glb');loadShip('assets/sky/ship.glb');
    const root=new THREE.Group();root.name='sky-raid';root.visible=false;scene.add(root);
    const M={hull:L(0x7a5130),hullDark:L(0x4a3320),deck:L(0xb08a58),metal:L(0x4b5260),metalDark:L(0x2a2f3a),red:L(0xc43c3c),white:L(0xf2efe6),rock:L(0x6b6458),rockDark:L(0x4a453d),
      glowRed:B(0xff5a3c),glowBlue:B(0x5fe3ff),glowGold:B(0xffd24a),shield:B(0x5fb8ff,{transparent:true,opacity:.18,depthWrite:false,side:THREE.DoubleSide}),
      balloon:new THREE.MeshLambertMaterial({map:cv(256,64,(g,w,h)=>{for(let i=0;i<8;i++){g.fillStyle=i%2?'#f4f0e2':'#c43c3c';g.fillRect(i*w/8,0,w/8,h)}}),flatShading:false}),
      shot:B(0xff7a2a),shotD:B(0xff4a8a),tracer:B(0xfff2a0,{transparent:true,opacity:.9}),boom:B(0xffa030,{transparent:true,opacity:.8,depthWrite:false}),beacon:B(0xffd24a,{transparent:true,opacity:.16,depthWrite:false,side:THREE.DoubleSide})};
    const G={sph:new THREE.SphereGeometry(1,14,10),cyl:new THREE.CylinderGeometry(1,1,1,10),box:new THREE.BoxGeometry(1,1,1),cone:new THREE.ConeGeometry(1,1,10),oct:new THREE.OctahedronGeometry(1,0)};

    // ---------------- the airship: wooden hull, red-and-white balloon, two propellers ----------------
    const ship=new THREE.Group(),props=[],VM=new THREE.MeshLambertMaterial({vertexColors:true,flatShading:true});
    function makeShip(){
      if(models.ship){try{return models.ship(THREE)}catch(e){console.error('SkyRaid ship model',e)}}
      const g=new THREE.Group(),m=merger(),hull=0x7a5130,hullD=0x4a3320,deck=0xb08a58,mD=0x2a2f3a,mt=0x4b5260,red=0xc43c3c;
      m.add(G.box,hull,0,0,0,7,3.2,18);m.add(G.box,deck,0,1.7,-.5,6.2,.4,16.5);m.add(G.cone,hull,0,0,10.5,3.4,5,3.4,Math.PI/2,0,0);m.add(G.box,hullD,0,-1.9,-1,3.2,1.6,13);
      for(const z of [-5,0,5])for(const sx of [-1,1])m.add(G.cyl,mD,sx*2.2,4.3,z,.18,5,.18);
      m.add(G.box,red,0,2.6,-8.8,.4,3.2,3);m.add(G.box,red,0,.6,-9.4,7,.3,2.4);
      for(const sx of [-1,1]){m.add(G.box,mD,sx*4.2,-.2,-3.2,2,.35,.35);m.add(G.sph,mt,sx*5.3,-.2,-3.2,.6,.6,.6)}
      m.add(G.box,mD,0,2.3,3,1.6,1.6,1.6);m.add(G.cyl,mt,0,3.3,3,.45,.45,.45);
      g.add(new THREE.Mesh(m.geometry(),VM));
      const bal=mesh(G.sph,M.balloon,0,8.6,-.5,g);bal.scale.set(5.2,4.6,13);
      for(const sx of [-1,1]){const pr=new THREE.Group();pr.position.set(sx*5.3,-.2,-3.2);g.add(pr);const pm=merger();pm.add(G.box,mt,0,0,0,.2,4.6,.35);pm.add(G.box,mt,0,0,0,.2,.35,4.6);pr.add(new THREE.Mesh(pm.geometry(),VM));props.push(pr)}
      mesh(G.sph,M.glowBlue,0,-.6,-9.8,g).scale.set(1.1,1.1,1.1);                    // engine glow
      return g;
    }
    ship.add(makeShip());root.add(ship);
    // gun barrel that swings with the gunner's aim
    const barrel=new THREE.Group();barrel.position.set(0,3.6,3);ship.add(barrel);{const b=mesh(G.cyl,M.metal,0,0,2,barrel);b.rotation.x=Math.PI/2;b.scale.set(.28,4,.28)}
    const hurtMat=B(0xff3030,{transparent:true,opacity:0,depthWrite:false});const hurtMesh=mesh(G.sph,hurtMat,0,3,0,ship);hurtMesh.scale.set(9,6,15);

    // ---------------- drones ----------------
    const drones=[],DM=new THREE.MeshLambertMaterial({vertexColors:true,flatShading:true});let dGeo=null,modelDrone=false,modelShip=false;
    function procDrone(){const m=merger();m.add(G.sph,0x2a2f3a,0,0,0,1.6,1.1,2.2);for(const sx of [-1,1]){m.add(G.box,0x4b5260,sx*2.2,0,0,2.8,.18,1.3,0,0,sx*.25);m.add(G.cyl,0xff5a3c,sx*3.5,.35,0,.9,.05,.9)}return m.geometry()}
    function makeDrone(){
      if(models.drone){try{return models.drone(THREE)}catch(e){console.error('SkyRaid drone model',e)}}
      const g=new THREE.Group();g.add(new THREE.Mesh(dGeo||(dGeo=procDrone()),DM));mesh(G.sph,M.glowRed,0,.1,1.7,g).scale.set(.55,.55,.55);return g;
    }
    // your ship model (assets/sky/ship.glb: the wing cruiser from the fleet pack, painted navy / orange / gold) replaces the placeholder galleon
    function useShip(geo){if(models.ship)return;const old=ship.children[0];if(old)ship.remove(old);props.length=0;
      const g=new THREE.Group();g.add(new THREE.Mesh(geo,VM));for(const sx of [-1,1])mesh(G.sph,M.glowBlue,sx*4.1,0,-7.9,g).scale.set(.55,.55,1.1);mesh(G.sph,M.glowBlue,0,-.1,-10.2,g).scale.set(.6,.5,1.3);ship.add(g);
      barrel.position.set(0,1.9,1.5);hurtMesh.scale.set(9,4,14);hurtMesh.position.y=0;modelShip=true}
    function useDrone(geo){if(models.drone)return;modelDrone=true;for(const d of drones){while(d.children.length)d.remove(d.children[0]);const m=new THREE.Mesh(geo,DM);m.scale.setScalar(2.5);m.rotation.y=-Math.PI/2;d.add(m);mesh(G.sph,M.glowRed,0,.1,3.0,d).scale.set(.32,.32,.32)}}
    for(let i=0;i<7;i++){const d=makeDrone();d.visible=false;root.add(d);drones.push(d)}
    // ---------------- enemy shots, tracers, explosions, damage numbers ----------------
    const shotsP=[];for(let i=0;i<20;i++){const m=mesh(G.sph,M.shot,0,0,0,root);m.scale.set(1.5,1.5,3.4);m.visible=false;shotsP.push(m)}
    const tracers=[];for(let i=0;i<10;i++){const m=mesh(G.cyl,M.tracer,0,0,0,root);m.visible=false;m.userData.t=0;tracers.push(m)}
    const booms=[];for(let i=0;i<8;i++){const m=mesh(G.sph,M.boom.clone(),0,0,0,root);m.visible=false;m.userData={t:9,dur:.6,r:6};booms.push(m)}
    const popCache=new Map(),pops=[];const popTex=(txt,col)=>cv(128,48,(g,w,h)=>{g.font='800 30px system-ui,sans-serif';g.textAlign='center';g.textBaseline='middle';g.lineWidth=5;g.strokeStyle='rgba(0,0,0,.7)';g.strokeText(txt,w/2,h/2);g.fillStyle=col;g.fillText(txt,w/2,h/2)});
    for(let i=0;i<12;i++){const s=new THREE.Sprite(new THREE.SpriteMaterial({transparent:true,depthWrite:false,fog:false}));s.visible=false;s.userData={t:9};root.add(s);pops.push(s)}
    const mslP=[];for(let i=0;i<9;i++){const g=new THREE.Group(),b=mesh(G.cyl,M.white,0,0,0,g);b.scale.set(.55,4.6,.55);mesh(G.cone,M.glowGold,0,-2.9,0,g).scale.set(.8,2.6,.8);g.visible=false;root.add(g);mslP.push(g)}
    const samP=[];for(let i=0;i<4;i++){const g=new THREE.Group();mesh(G.sph,M.shotD,0,0,0,g).scale.set(1.7,1.7,1.7);mesh(G.cyl,M.glowRed,0,0,-2.6,g).scale.set(.7,4,.7);g.children[1].rotation.x=Math.PI/2;g.visible=false;root.add(g);samP.push(g)}
    let bi=0,ti=0,pi=0;

    // ---------------- the fortress (built when a stage starts) ----------------
    let fort=null,fortK=-1;const beacon=mesh(G.cyl,M.beacon,0,0,0,root);beacon.visible=false;
    function clearFort(){if(fort){root.remove(fort.g);fort.g.traverse(o=>{if(o.geometry&&o.geometry.userData.own)o.geometry.dispose()});fort=null;fortK=-1}}
    function buildFort(run){
      clearFort();const f=run.fort,S=f.site,F=f.F,g=new THREE.Group();g.position.set(S.x,S.y,S.z);root.add(g);fort={g,turrets:[],gens:[],core:null,shield:null,ring:null,k:f.k};fortK=f.k;
      const boss=!!F.boss,R=F.plat;
      // everything static is merged into ONE vertex-coloured mesh: floating rock, steel deck, edge lights, tower, spikes, turret and generator poles
      const mg=merger(),rg=new THREE.ConeGeometry(R*.96,R*.9,9,3),p=rg.attributes.position;let sd=f.k*977+13;const rr=()=>(sd=(sd*16807)%2147483647)/2147483647;
      for(let i=0;i<p.count;i++){const y=p.getY(i);if(y<R*.44){p.setX(i,p.getX(i)*(1+(rr()-.5)*.3));p.setZ(i,p.getZ(i)*(1+(rr()-.5)*.3));p.setY(i,y+(rr()-.5)*R*.1)}}
      rg.computeVertexNormals();mg.add(rg,0x6b6458,0,-R*.45-5,0,1,1,1,Math.PI,0,0);rg.dispose();
      mg.add(G.cyl,0x2a2f3a,0,-3,0,R,6,R);mg.add(G.cyl,0x4b5260,0,-.2,0,R*.93,.6,R*.93);
      for(let i=0;i<10;i++){const a=i/10*6.283;mg.add(G.cyl,0xc43c3c,Math.sin(a)*R*.9,.4,Math.cos(a)*R*.9,1.2,.7,1.2)}   // edge lights
      mg.add(G.cyl,0x2a2f3a,0,9,0,8,18,8);mg.add(G.cone,0x4b5260,0,22,0,9,8,9);                                           // central tower
      if(boss)for(let i=0;i<6;i++){const a=i/6*6.283;mg.add(G.cone,0xc43c3c,Math.sin(a)*R*.7,6,Math.cos(a)*R*.7,2.2,18,2.2)}
      for(const t of f.turrets){const h=t.y-S.y;mg.add(G.cyl,0x2a2f3a,t.x-S.x,h/2,t.z-S.z,.9,h,.9)}
      for(const q of f.gens){const h=q.y-S.y;mg.add(G.cyl,0x2a2f3a,q.x-S.x,h/2,q.z-S.z,1.4,h,1.4)}
      g.add(new THREE.Mesh(mg.geometry(),VM));
      const core=mesh(G.sph,M.glowRed,0,f.core.y-S.y,0,g);core.scale.set(6,6,6);fort.core=core;
      const shield=mesh(G.sph,M.shield,0,f.core.y-S.y,0,g);shield.scale.set(13,13,13);fort.shield=shield;
      if(F.spin>0||boss){const ring=mesh(new THREE.TorusGeometry(1,.06,6,28),M.metal,0,f.core.y-S.y,0,g);ring.geometry.userData.own=1;ring.scale.set(boss?24:18,boss?24:18,boss?24:18);ring.rotation.x=Math.PI/2.3;fort.ring=ring}
      // a turret = one mesh (head + barrel + red eye), shared geometry, swung to face the ship
      const tm=merger();tm.add(G.sph,0x4b5260,0,0,0,2.6,2.2,2.6);tm.add(G.cyl,0x2a2f3a,0,0,2.2,.45,4.4,.45,Math.PI/2,0,0);tm.add(G.sph,0xff5a3c,0,.9,0,.5,.5,.5);const tg=tm.geometry();
      for(const t of f.turrets){const o=new THREE.Group();o.position.set(t.x-S.x,t.y-S.y,t.z-S.z);const br=new THREE.Mesh(tg,VM);o.add(br);g.add(o);fort.turrets.push({o,br})}
      for(const q of f.gens){const o=new THREE.Group();o.position.set(q.x-S.x,q.y-S.y,q.z-S.z);const c=mesh(G.oct,M.glowBlue,0,0,0,o);c.scale.set(4,5.5,4);g.add(o);fort.gens.push({o,c})}
    }
    function setBeacon(m,t){
      if(!m){beacon.visible=false;return}beacon.visible=true;beacon.position.set(m.x,m.y+170,m.z);beacon.scale.set(7+Math.sin(t*3)*1.2,380,7+Math.sin(t*3)*1.2)}

    const _v=new THREE.Vector3(),_q=new THREE.Quaternion(),_up=new THREE.Vector3(0,1,0),_d=new THREE.Vector3();
    // ---------------- per frame ----------------
    // view = the pose to draw the ship at {x,y,z,h,p,roll}; aim = the gunner's relative aim for the barrel
    function sync(run,view,aim,t,dt){
      root.visible=true;
      ship.position.set(view.x,view.y,view.z);ship.rotation.set(-view.p,view.h,(view.roll||0)+(view.spin||0),'YXZ');
      ship.visible=run.ship.hull>0||Math.floor(t*8)%2===0;
      for(const p of props)p.rotation.z+=dt*(run.ship.boost>0?60:30);
      if(aim){barrel.rotation.set(-aim.pit,aim.yaw,0,'YXZ')}
      hurtMat.opacity=Math.max(0,hurtMat.opacity-dt*3);
      const f=run.fort;
      if(f){if(fortK!==f.k||!fort)buildFort(run);
        fort.shield.visible=run.fort.gens.some(q=>q.alive)&&f.core.alive>0;fort.shield.material.opacity=.16+Math.sin(t*3)*.05;
        fort.core.visible=!!f.core.alive;fort.core.scale.setScalar(6+Math.sin(t*5)*.5+(f.ph?1:0));fort.core.material=f.gens.some(q=>q.alive)?M.glowRed:M.glowGold;
        if(fort.ring)fort.ring.rotation.z+=dt*.6;
        for(let i=0;i<f.turrets.length;i++){const q=f.turrets[i],m=fort.turrets[i];m.o.visible=!!q.alive;if(q.alive){const dx=run.ship.x-q.x,dz=run.ship.z-q.z,dy=run.ship.y-q.y;m.br.rotation.set(-Math.atan2(dy,Math.hypot(dx,dz)),Math.atan2(dx,dz),0,'YXZ')}}
        for(let i=0;i<f.gens.length;i++){const q=f.gens[i],m=fort.gens[i];m.o.visible=!!q.alive;m.c.rotation.y+=dt*1.5}
      }else if(fort)clearFort();
      // drones
      for(let i=0;i<drones.length;i++){const d=run.drones[i],m=drones[i];if(!d||!d.alive){m.visible=false;continue}m.visible=true;m.position.set(d.x,d.y,d.z);const sp=Math.hypot(d.vx,d.vz);if(sp>1)m.rotation.set(0,Math.atan2(d.vx,d.vz),Math.sin(t*4+i)*.2,'YXZ')}
      for(let i=0;i<mslP.length;i++){const p=run.msl[i],m=mslP[i];if(!p){m.visible=false;continue}m.visible=true;m.position.set(p.x,p.y,p.z);_d.set(p.vx,p.vy,p.vz).normalize();m.quaternion.setFromUnitVectors(_up,_d)}
      for(let i=0;i<samP.length;i++){const p=run.sams[i],m=samP[i];if(!p){m.visible=false;continue}m.visible=true;m.position.set(p.x,p.y,p.z);m.lookAt(p.x+p.vx,p.y+p.vy,p.z+p.vz);m.children[0].scale.setScalar(1.6+Math.sin(t*20+i)*.25)}
      for(let i=0;i<shotsP.length;i++){const p=run.shots[i],m=shotsP[i];if(!p){m.visible=false;continue}m.visible=true;m.position.set(p.x,p.y,p.z);m.lookAt(p.x+p.vx,p.y+p.vy,p.z+p.vz)}
      // tracers fade; explosions grow; numbers rise
      for(const m of tracers)if(m.visible){m.userData.t-=dt;if(m.userData.t<=0)m.visible=false;else m.material.opacity=Math.min(.9,m.userData.t*9)}
      for(const m of booms)if(m.visible){const u=m.userData;u.t+=dt;if(u.t>=u.dur){m.visible=false;continue}const k=u.t/u.dur;m.scale.setScalar(u.r*(.35+k));m.material.opacity=.85*(1-k)}
      for(const s of pops)if(s.visible){s.userData.t+=dt;s.position.y+=dt*5;if(s.userData.t>1){s.visible=false}else s.material.opacity=1-Math.max(0,s.userData.t-.55)/.45}
      setBeacon(SkyCore.marker(run),t);
    }
    const _a=new THREE.Vector3(),_b=new THREE.Vector3();
    function fx(e,run,t,camPos){
      switch(e.k){
        case 'tracer':{const m=tracers[ti++%tracers.length];_a.set(e.x,e.y,e.z);_b.set(e.tx,e.ty,e.tz);_d.subVectors(_b,_a);const len=_d.length()||1;m.visible=true;m.userData.t=.12;m.material.opacity=.9;
          m.position.copy(_a).addScaledVector(_d,.5);m.scale.set(.5,len,.5);_q.setFromUnitVectors(_up,_d.normalize());m.quaternion.copy(_q);
          if(e.hit&&e.hit!=='shield')boom(e.tx,e.ty,e.tz,2.2,.22);break}
        case 'spark':boom(e.x,e.y,e.z,10,.35,0x7fd0ff);break;
        case 'boom':boom(e.x,e.y,e.z,6+e.s*9,.5+e.s*.25);if(e.s>=1){boom(e.x,e.y+2,e.z,3+e.s*5,.8,0xffe39a)}break;
        case 'dmg':pop(e.x,e.y,e.z,e.kind==='sam'?'INTERCEPT':String(e.n),e.kind==='core'?'#ffd24a':e.kind==='gen'?'#8fe8ff':e.kind==='sam'?'#ff8a5a':'#ffffff');break;
        case 'hurt':hurtMat.opacity=.45;break;
      }
    }
    function boom(x,y,z,r,dur,col){const m=booms[bi++%booms.length];m.position.set(x,y,z);m.userData={t:0,dur:dur||.5,r};m.material.color.setHex(col||0xffa030);m.visible=true;m.scale.setScalar(r*.35)}
    function pop(x,y,z,txt,col){const s=pops[pi++%pops.length];const key=txt+col;s.material.map=popCache.get(key)||(popCache.size<80?(popCache.set(key,popTex(txt,col)),popCache.get(key)):popTex(txt,col));s.material.needsUpdate=true;s.position.set(x,y,z);s.scale.set(11,4.1,1);s.userData.t=0;s.material.opacity=1;s.visible=true}
    function hide(){root.visible=false;clearFort()}
    const api={root,sync,fx,hide,boom,pop,useDrone,useShip,get fortress(){return fort},get droneModel(){return modelDrone},get shipModel(){return modelShip}};built.push(api);if(droneGeo)useDrone(droneGeo);if(shipGeo)useShip(shipGeo);
    return api;
  }
  return {build,models,loadDrone,loadShip};
})();
