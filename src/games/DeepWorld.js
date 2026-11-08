// THE DEEP world (browser only, THREE r147 global): draws the trench from a DeepCore run: the seabed bowl, three wrecks, the sunken temple, hydrothermal vents, a whale
// graveyard, kelp and glow-worms, marine snow, fish schools, jellyfish, anglerfish, the Kraken, harpoons, your sub and other divers' subs. Everything is generated (no
// model files): `DeepWorld.models.sub` may return a Group (+z forward, ~6 m long) to replace the built-in sub later.
// The whole thing lives in ONE group placed far below the sea (root.position), built lazily on the first dive and removed from the scene when you surface, so it costs
// nothing at the surface. Cheap by design: shared materials, flat colours, InstancedMeshes for the crowds, no shadows, ONE real light (the sub's lamp, added only while diving).
// Globals read: THREE, DeepCore.
const DeepWorld=(()=>{
  const models={sub:null};
  const D=typeof DeepCore!=='undefined'?DeepCore:null;
  const rg=(a,b,x)=>a+(b-a)*x;
  // fog + light colour by depth (the Environment hook reads this through Deep.fog())
  function fogAt(y,lamp){
    const d=Math.max(0,Math.min(1,(-y)/360)),c=[.04,.45,.55],m=[.01,.10,.16],e=[.0,.02,.04],k=d<.35?d/.35:(d-.35)/.65,A=d<.35?c:m,B=d<.35?m:e;
    return{r:rg(A[0],B[0],k),g:rg(A[1],B[1],k),b:rg(A[2],B[2],k),near:1,far:rg(120,52,Math.min(1,d*1.4))+(lamp?10:0)}}
  function build(scene){
    const root=new THREE.Group();root.visible=false;scene.add(root);
    const dot=(()=>{const c=document.createElement('canvas');c.width=c.height=32;const x=c.getContext('2d'),g=x.createRadialGradient(16,16,0,16,16,16);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.5,'rgba(255,255,255,.55)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,32,32);return new THREE.CanvasTexture(c)})();
    const M={
      wood:new THREE.MeshLambertMaterial({color:'#4b3a2a'}),rope:new THREE.MeshLambertMaterial({color:'#6a5a44'}),stone:new THREE.MeshLambertMaterial({color:'#6d7a78'}),
      iron:new THREE.MeshLambertMaterial({color:'#3a4448'}),rock:new THREE.MeshLambertMaterial({color:'#2d3438'}),
      gold:new THREE.MeshBasicMaterial({color:'#ffcf4a'}),relic:new THREE.MeshBasicMaterial({color:'#6af7ff'}),pearl:new THREE.MeshBasicMaterial({color:'#f6f0ff'}),
      lava:new THREE.MeshBasicMaterial({color:'#ff7a2a'}),crys:new THREE.MeshBasicMaterial({color:'#ff6ad0'}),
      jelly:new THREE.MeshBasicMaterial({color:'#7ab6ff',transparent:true,opacity:.62,depthWrite:false}),worm:new THREE.MeshBasicMaterial({color:'#4dffcf'}),
      fish:new THREE.MeshBasicMaterial({color:'#b9e6ff'}),kelp:new THREE.MeshLambertMaterial({color:'#2f6a3c'}),
      ang:new THREE.MeshLambertMaterial({color:'#2b2430'}),teeth:new THREE.MeshBasicMaterial({color:'#e8e4d6'}),lure:new THREE.MeshBasicMaterial({color:'#9dffea'}),
      kr:new THREE.MeshLambertMaterial({color:'#5b1f3a'}),krEye:new THREE.MeshBasicMaterial({color:'#ffd24a'}),
      sub:new THREE.MeshLambertMaterial({color:'#f2c230'}),subD:new THREE.MeshLambertMaterial({color:'#37424a'}),glass:new THREE.MeshPhongMaterial({color:'#9fdcff',transparent:true,opacity:.34,shininess:80}),
      lens:new THREE.MeshBasicMaterial({color:'#fff6b0'}),harp:new THREE.MeshBasicMaterial({color:'#ffe9a0'}),ring:new THREE.MeshBasicMaterial({color:'#aef3ff',transparent:true,opacity:.7,depthWrite:false,side:THREE.DoubleSide}),
      ink:new THREE.PointsMaterial({color:'#080810',map:dot,alphaTest:.02,size:7,transparent:true,opacity:.8,depthWrite:false}),snow:new THREE.PointsMaterial({color:'#bfeaf0',map:dot,size:.3,transparent:true,opacity:.7,depthWrite:false}),
      plume:new THREE.PointsMaterial({color:'#ffb27a',map:dot,size:1.6,transparent:true,opacity:.5,depthWrite:false})
    };
    const add=(p,g,m,x,y,z)=>{const o=new THREE.Mesh(g,m);o.position.set(x||0,y||0,z||0);p.add(o);return o};
    // ---- seabed
    const SZ=2*D.R+60,SEG=104,sg=new THREE.PlaneGeometry(SZ,SZ,SEG,SEG);sg.rotateX(-Math.PI/2);
    {const p=sg.attributes.position,col=new Float32Array(p.count*3),c1=new THREE.Color('#a4936a'),c2=new THREE.Color('#4a5348'),c3=new THREE.Color('#1c2a30'),t=new THREE.Color();
      for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i),y=D.floorY(x,z);p.setY(i,y);const k=Math.max(0,Math.min(1,(-y-70)/300)),n=.88+.12*Math.sin(x*.31)*Math.cos(z*.27);
        t.copy(k<.45?c1:c2).lerp(k<.45?c2:c3,k<.45?k/.45:(k-.45)/.55).multiplyScalar(n);col[i*3]=t.r;col[i*3+1]=t.g;col[i*3+2]=t.b}
      sg.setAttribute('color',new THREE.BufferAttribute(col,3));sg.computeVertexNormals()}
    root.add(new THREE.Mesh(sg,new THREE.MeshLambertMaterial({vertexColors:true})));
    // a few big rocks on the floor (one InstancedMesh)
    const rocks=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1,0),M.rock,70);
    {const q=D.rng(4242),m=new THREE.Matrix4(),qq=new THREE.Quaternion(),e=new THREE.Euler(),sc=new THREE.Vector3(),ps=new THREE.Vector3();
      for(let i=0;i<70;i++){const a=q()*6.28,r=10+q()*(D.R-8),x=Math.cos(a)*r,z=Math.sin(a)*r,s=1.5+q()*5;ps.set(x,D.floorY(x,z)+s*.3,z);e.set(q()*3,q()*6,q()*3);qq.setFromEuler(e);sc.set(s*(1+q()*.6),s*(.6+q()*.5),s);m.compose(ps,qq,sc);rocks.setMatrixAt(i,m)}rocks.instanceMatrix.needsUpdate=true}
    root.add(rocks);
    // kelp (shallow floor) and glow-worms (deep floor): two InstancedMeshes
    const kelp=new THREE.InstancedMesh(new THREE.ConeGeometry(.35,1,5,1).translate(0,.5,0),M.kelp,160),worms=new THREE.InstancedMesh(new THREE.CylinderGeometry(.06,.14,1,5).translate(0,.5,0),M.worm,150);
    {const q=D.rng(777),m=new THREE.Matrix4(),qq=new THREE.Quaternion(),sc=new THREE.Vector3(),ps=new THREE.Vector3();let a=0,b=0;
      for(let i=0;i<900&&(a<160||b<150);i++){const ang=q()*6.28,r=6+q()*(D.R-6),x=Math.cos(ang)*r,z=Math.sin(ang)*r,y=D.floorY(x,z);
        if(y>-190&&a<160){const h=5+q()*9;sc.set(1+q(),h,1+q());ps.set(x,y-.4,z);qq.setFromAxisAngle(new THREE.Vector3(1,0,0),(q()-.5)*.3);m.compose(ps,qq,sc);kelp.setMatrixAt(a++,m)}
        else if(y<=-190&&b<150){const h=.6+q()*1.4;sc.set(.7,h,.7);ps.set(x,y-.2,z);qq.identity();m.compose(ps,qq,sc);worms.setMatrixAt(b++,m)}}
      kelp.count=a;worms.count=b;kelp.instanceMatrix.needsUpdate=worms.instanceMatrix.needsUpdate=true}
    root.add(kelp,worms);
    // ---- seed-specific parts (wrecks, temple, vents, bones, loot beacons): rebuilt when the seed changes
    let sg2=null,seedBuilt=null,vents=[],beacons=[],relicM=null,pearlM=null,plumeP=null,plumeBase=null;
    function wreck(w){
      const g=new THREE.Group();g.position.set(w.x,w.y-.6,w.z);g.rotation.set(.12,w.h,(w.kind-1)*.18);
      const hull=add(g,new THREE.BoxGeometry(7,3.2,22),M.wood,0,1.6,0);hull.scale.set(1,1,1);
      for(let i=-4;i<=4;i++){const rib=add(g,new THREE.BoxGeometry(.4,4.4,.5),M.wood,0,2.4,i*2.2);rib.position.x=3.5;const r2=rib.clone();r2.position.x=-3.5;g.add(r2)}
      const bow=add(g,new THREE.BoxGeometry(5,2.6,6),M.wood,0,1.4,12.5);bow.rotation.x=-.25;
      const mast=add(g,new THREE.CylinderGeometry(.28,.38,14,6),M.wood,.8,8,-2);mast.rotation.z=.5+w.kind*.15;
      const spar=add(g,new THREE.CylinderGeometry(.18,.18,9,5),M.wood,-3,10,-2);spar.rotation.z=1.3;
      add(g,new THREE.BoxGeometry(2.4,.4,2.4),M.iron,1,3.4,-6);
      const cr=add(g,new THREE.BoxGeometry(1.5,1.1,1.1),M.wood,0,3.7,5);add(cr,new THREE.BoxGeometry(1.52,.2,1.12),M.gold,0,.35,0);
      root.add(g);return g}
    function clearSeed(){if(!sg2)return;root.remove(sg2);sg2.traverse(o=>{if(o.geometry&&!o.userData.shared)o.geometry.dispose()});sg2=null;vents=[];beacons=[];relicM=null;pearlM=null}
    function setup(run){
      if(seedBuilt===run.seed&&sg2)return;clearSeed();seedBuilt=run.seed;sg2=new THREE.Group();root.add(sg2);const L=run.L,oldRoot=root;
      const mk=(x)=>x;for(const w of L.wrecks){const g=wreck(w);root.remove(g);sg2.add(g)}
      // temple: columns, lintel, floor, relic
      {const t=new THREE.Group(),r=L.relic;t.position.set(r.x,r.y-2.4,r.z);t.rotation.y=r.h;add(t,new THREE.BoxGeometry(16,.8,16),M.stone,0,.4,0);
        for(const [cx,cz] of [[-6,-6],[6,-6],[-6,6],[6,6],[0,-6],[0,6]]){const h=6+((cx+cz)&3)*.8,c=add(t,new THREE.CylinderGeometry(.7,.85,h,8),M.stone,cx,.8+h/2,cz);if(cx===-6&&cz===6){c.rotation.z=.9;c.position.y=2.6}}
        add(t,new THREE.BoxGeometry(14,.8,1.6),M.stone,0,7.4,-6);relicM=add(t,new THREE.OctahedronGeometry(1.1,0),M.relic,0,2.4+2.4,0);sg2.add(t)}
      // vents: a chimney, a lava core and a crystal cluster each; one shared plume Points
      {const pc=L.vents.length*40,pa=new Float32Array(pc*3);plumeBase=new Float32Array(pc*4);
        L.vents.forEach((v,i)=>{const c=add(sg2,new THREE.ConeGeometry(2.6,7,7,1,true),M.rock,v.x,v.y+3,v.z);add(sg2,new THREE.CircleGeometry(1.6,8).rotateX(-Math.PI/2),M.lava,v.x,v.y+6.6,v.z);
          const k=add(sg2,new THREE.OctahedronGeometry(.9,0),M.crys,v.x+3.4,v.y+1.2,v.z);k.scale.set(.8,1.5,.8);k.userData={crystal:'c'+i};vents.push({x:v.x,y:v.y,z:v.z,k});
          for(let j=0;j<40;j++){const o=(i*40+j)*4;plumeBase[o]=Math.random()*6.28;plumeBase[o+1]=Math.random();plumeBase[o+2]=Math.random()*2.2;plumeBase[o+3]=.6+Math.random()*.8}});
        const pg=new THREE.BufferGeometry();pg.setAttribute('position',new THREE.BufferAttribute(pa,3));plumeP=new THREE.Points(pg,M.plume);plumeP.frustumCulled=false;sg2.add(plumeP)}
      // whale graveyard
      {const b=L.bones,g=new THREE.Group();g.position.set(b.x,b.y,b.z);g.rotation.y=b.h;for(let i=0;i<9;i++){const rib=add(g,new THREE.TorusGeometry(5.2-Math.abs(i-4)*.5,.32,5,12,Math.PI),M.stone,0,0,(i-4)*2.2);rib.rotation.y=Math.PI/2;rib.rotation.z=0;rib.rotation.x=0;rib.rotation.set(0,Math.PI/2,0);rib.rotation.order='YXZ';rib.rotation.x=0}
        add(g,new THREE.CylinderGeometry(.5,.5,21,6),M.stone,0,.2,0).rotation.x=Math.PI/2;add(g,new THREE.SphereGeometry(3.2,8,6),M.stone,0,1.2,12).scale.set(1,.7,1.3);sg2.add(g)}
      // loot beacons: a slow golden pulse over every wreck chest, the relic and the coins (a pooled set of small meshes)
      for(const p of run.pickups){const m=new THREE.Mesh(p.k==='coin'?new THREE.OctahedronGeometry(.45,0):new THREE.OctahedronGeometry(.9,0),p.k==='relic'?M.relic:p.k==='crystal'?M.crys:M.gold);m.position.set(p.x,p.y+(p.k==='coin'?0:3),p.z);m.userData={id:p.id,k:p.k};if(p.k==='crystal')m.visible=false;sg2.add(m);beacons.push(m)}
    }
    // ---- crowds: jellyfish (instanced), anglers, fish school
    const jg=new THREE.SphereGeometry(1,10,6,0,6.283,0,1.45),jgm=jg.clone();jgm.scale(1,.8,1);
    const jelly=new THREE.InstancedMesh(jgm,M.jelly,26),jt=new THREE.InstancedMesh(new THREE.CylinderGeometry(.05,.02,2.6,4).translate(0,-1.4,0),M.jelly,26*3);jelly.frustumCulled=jt.frustumCulled=false;root.add(jelly,jt);
    const fishG=new THREE.ConeGeometry(.22,.9,4).rotateX(Math.PI/2),fish=new THREE.InstancedMesh(fishG,M.fish,70);fish.frustumCulled=false;root.add(fish);
    const anglers=[];for(let i=0;i<7;i++){const g=new THREE.Group(),b=add(g,new THREE.SphereGeometry(1.5,10,8),M.ang);b.scale.set(1,.9,1.35);const jaw=add(g,new THREE.ConeGeometry(1.2,1.6,8),M.ang,0,-.5,1.5);jaw.rotation.x=Math.PI/2+.4;
      for(let k=-2;k<=2;k++)add(g,new THREE.ConeGeometry(.12,.55,4),M.teeth,k*.34,-.35,2.1).rotation.x=Math.PI;
      const stalk=add(g,new THREE.CylinderGeometry(.05,.05,2.8,4),M.ang,0,1.9,.7);stalk.rotation.x=.9;g.userData.lure=add(g,new THREE.SphereGeometry(.34,8,6),M.lure,0,3.2,2.1);add(g,new THREE.SphereGeometry(.17,6,5),M.krEye,.55,.5,1.9);add(g,new THREE.SphereGeometry(.17,6,5),M.krEye,-.55,.5,1.9);g.visible=false;root.add(g);anglers.push(g)}
    // ---- the Kraken
    const kr=new THREE.Group();kr.visible=false;root.add(kr);
    const mantle=add(kr,new THREE.SphereGeometry(1,14,10),M.kr,0,1.5,-6);mantle.scale.set(4.2,4.4,8.5);const head=add(kr,new THREE.SphereGeometry(3.6,12,10),M.kr,0,0,.4);
    const eyeL=add(kr,new THREE.SphereGeometry(.85,8,6),M.krEye,2.7,.9,2.7),eyeR=add(kr,new THREE.SphereGeometry(.85,8,6),M.krEye,-2.7,.9,2.7);const tent=[];
    for(let i=0;i<8;i++){const a=i/8*6.283,root0=new THREE.Group();root0.position.set(Math.cos(a)*2.2,Math.sin(a)*2.2-.4,2.6);root0.rotation.y=Math.cos(a)*.5;root0.rotation.x=-Math.sin(a)*.3;kr.add(root0);let p=root0;const segs=[];
      for(let s=0;s<6;s++){const len=4.4-s*.4,m=new THREE.Mesh(new THREE.CylinderGeometry(.55-s*.07,.7-s*.07,len,6).translate(0,0,len/2).rotateX(Math.PI/2),M.kr);m.position.z=s?4.4-(s-1)*.4:0;p.add(m);segs.push(m);p=m}tent.push({g:root0,segs,a})}
    const inkP=(()=>{const n=60,pos=new Float32Array(n*3),g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));const p=new THREE.Points(g,M.ink);p.visible=false;p.frustumCulled=false;root.add(p);return{p,pos,n}})();
    // ---- subs
    function makeSub(){
      if(models.sub){const m=models.sub(THREE);if(m)return m}
      const g=new THREE.Group(),b=add(g,new THREE.CapsuleGeometry(1.05,2.7,4,12).rotateX(Math.PI/2),M.sub);add(g,new THREE.SphereGeometry(.9,12,8,0,6.283,0,1.6),M.glass,0,.55,.95);
      add(g,new THREE.BoxGeometry(2.8,.1,.8),M.subD,0,0,-1.9);add(g,new THREE.BoxGeometry(.1,1.4,.8),M.subD,0,.5,-1.95);add(g,new THREE.CylinderGeometry(.18,.18,.8,6).rotateX(Math.PI/2),M.subD,0,0,-2.5);
      const prop=new THREE.Group();prop.position.set(0,0,-2.95);for(let i=0;i<3;i++){const bl=add(prop,new THREE.BoxGeometry(.12,1.1,.05),M.subD,0,0,0);bl.rotation.z=i*2.094;bl.position.set(0,0,0)}g.add(prop);g.userData.prop=prop;
      g.userData.lens=add(g,new THREE.SphereGeometry(.3,8,6),M.lens,0,.05,2.2);add(g,new THREE.BoxGeometry(.5,.12,.9),M.subD,.95,-.55,.3);add(g,new THREE.BoxGeometry(.5,.12,.9),M.subD,-.95,-.55,.3);return g}
    const sub=makeSub();sub.visible=false;root.add(sub);let lamp=null;
    const buddies=[];for(let i=0;i<3;i++){const b=makeSub();b.visible=false;b.traverse(o=>{if(o.isMesh&&o.material===M.sub)o.material=M.sub.clone()});root.add(b);buddies.push(b)}
    // harpoons
    const harps=new THREE.InstancedMesh(new THREE.CylinderGeometry(.07,.07,2.2,4).rotateX(Math.PI/2),M.harp,10);harps.frustumCulled=false;root.add(harps);
    // hit rings
    const rings=[];for(let i=0;i<10;i++){const m=new THREE.Mesh(new THREE.RingGeometry(.7,1,20),M.ring);m.visible=false;m.userData={t:9,s:1};root.add(m);rings.push(m)}
    let ri=0;function ring(x,y,z,s,col){const m=rings[ri++%rings.length];m.position.set(x,y,z);m.userData.t=0;m.userData.s=s||1;m.visible=true;m.material.color.set(col||'#aef3ff')}
    // marine snow around the camera
    const SN=320,sn=(()=>{const pos=new Float32Array(SN*3);for(let i=0;i<SN*3;i++)pos[i]=(Math.random()-.5)*60;const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));const p=new THREE.Points(g,M.snow);p.frustumCulled=false;root.add(p);return{p,pos}})();
    const tmpM=new THREE.Matrix4(),tmpQ=new THREE.Quaternion(),tmpE=new THREE.Euler(),tmpS=new THREE.Vector3(),tmpP=new THREE.Vector3(),UP=new THREE.Vector3(0,1,0),FW=new THREE.Vector3(0,0,1);
    let kLunge=0,kTele=0,t0=0;
    // ---- per frame: draw the run (cam = camera position in LOCAL coordinates)
    function sync(run,dt,cam){
      t0+=dt;const t=run.t;
      sub.visible=true;sub.position.set(run.x,run.y,run.z);sub.rotation.set(-run.p,run.h,0,'YXZ');sub.userData.prop.rotation.z+=dt*(6+Math.abs(run.v)*2.4);
      sub.userData.lens.visible=run.lamp;if(lamp){lamp.intensity=run.lamp?2.6:0;lamp.position.set(0,.1,1.8)}
      // the sub blinks red when hit
      M.sub.color.setHex(run.inv>0&&((t*14)|0)%2?0xff6a4a:0xf2c230);
      // the world
      if(relicM){relicM.rotation.y+=dt*.8;relicM.position.y=4.8+Math.sin(t*1.4)*.35}
      for(const b of beacons){const got=run.got[b.userData.id];if(b.userData.k==='crystal'){b.visible=false;continue}b.visible=!got;if(!got){b.rotation.y+=dt*1.6;b.position.y+=Math.sin(t*2+b.position.x)*.004}}
      for(const v of vents){v.k.visible=!run.got[v.k.userData.crystal]}
      if(plumeP){const pa=plumeP.geometry.attributes.position.array,n=vents.length*40;for(let i=0;i<n;i++){const o=i*4,v=vents[(i/40)|0];plumeBase[o+1]=(plumeBase[o+1]+dt*.16*plumeBase[o+3])%1;const h=plumeBase[o+1]*26,sp=plumeBase[o+2]*(.4+plumeBase[o+1]);pa[i*3]=v.x+Math.cos(plumeBase[o]+t*.3)*sp;pa[i*3+1]=v.y+6.5+h;pa[i*3+2]=v.z+Math.sin(plumeBase[o]+t*.3)*sp}plumeP.geometry.attributes.position.needsUpdate=true}
      // jellyfish
      let n=0;for(let i=0;i<run.jelly.length;i++){const j=run.jelly[i];if(j.dead){tmpS.set(0,0,0);tmpM.compose(tmpP.set(0,-9999,0),tmpQ.identity(),tmpS);jelly.setMatrixAt(i,tmpM);for(let k=0;k<3;k++)jt.setMatrixAt(i*3+k,tmpM);continue}
        const pul=1+Math.sin(t*2.4+i)*.14;tmpS.set(1.6*pul,1.6/pul,1.6*pul);tmpQ.identity();tmpM.compose(tmpP.set(j.x,j.y,j.z),tmpQ,tmpS);jelly.setMatrixAt(i,tmpM);
        for(let k=0;k<3;k++){tmpE.set(Math.sin(t*1.3+i+k)*.15,k*2.1,Math.cos(t*1.1+i*2+k)*.15);tmpQ.setFromEuler(tmpE);tmpS.set(1,1,1);tmpM.compose(tmpP.set(j.x+Math.cos(k*2.1)*.5,j.y-.3,j.z+Math.sin(k*2.1)*.5),tmpQ,tmpS);jt.setMatrixAt(i*3+k,tmpM)}}
      jelly.instanceMatrix.needsUpdate=jt.instanceMatrix.needsUpdate=true;
      // anglers
      for(let i=0;i<anglers.length;i++){const a=run.angler[i],g=anglers[i];g.visible=!a.dead;if(a.dead)continue;g.position.set(a.x,a.y,a.z);const hd=a.st==='idle'?Math.sin(t*.3+i)*2:a.st==='retreat'?a.h+3.14:a.h;g.rotation.y=hd;g.userData.lure.material===M.lure&&(g.userData.lure.scale.setScalar(1+.25*Math.sin(t*5+i)+(a.st==='charge'?.5:0)))}
      // school of fish: 70 instances on slow ellipses over the basin
      for(let i=0;i<70;i++){const s=(i/70)*6.283,gr=i%7,cx=Math.cos(gr*.9)*(30+gr*9),cz=Math.sin(gr*.9)*(30+gr*9),a=t*(.28+.03*gr)+s*.2+gr,r=9+(i%5)*1.4;
        const x=cx+Math.cos(a)*r,z=cz+Math.sin(a)*r,y=-26-gr*20+Math.sin(a*2+i)*2;tmpE.set(0,Math.atan2(-Math.sin(a),Math.cos(a)),0);tmpQ.setFromEuler(tmpE);tmpS.set(1,1,1);tmpM.compose(tmpP.set(x,y,z),tmpQ,tmpS);fish.setMatrixAt(i,tmpM)}
      fish.instanceMatrix.needsUpdate=true;
      // Kraken
      const k=run.kraken;kr.visible=!k.dead&&(k.seen||Math.hypot(k.x-run.x,k.y-run.y,k.z-run.z)<110);
      if(kr.visible){kr.position.set(k.x,k.y,k.z);const tl=k.st==='teleS'||k.st==='teleC',want=tl?1:0;kTele+=(want-kTele)*Math.min(1,dt*8);kLunge=Math.max(0,kLunge-dt);
        kr.rotation.set(k.st==='charge'?.2:0,k.h,0,'YXZ');kr.scale.setScalar(1+(tl?-.05:0)+.03*Math.sin(t*1.7));M.krEye.color.setRGB(1,.82-.6*kTele,.29-.2*kTele);M.kr.color.setRGB(.36+.35*kTele,.12,.23);
        for(const q of tent){const ph=t*(1.1+q.a*.1)+q.a*2;let tuck=k.st==='charge'?1.1:tl?-.7:0;if(kLunge>0)tuck=-1.2*kLunge;q.segs.forEach((m,s)=>{m.rotation.x=Math.sin(ph-s*.7)*.28+tuck*.12;m.rotation.y=Math.cos(ph*.8-s*.6)*.3+(s===0?0:0)})}}
      // ink cloud
      inkP.p.visible=run.ink>0;if(inkP.p.visible){inkP.p.position.set(run.x,run.y,run.z);const o=inkP.pos;for(let i=0;i<inkP.n;i++){const a=i*2.4+t*.4,r=3+(i%7)*2.2*(1-Math.min(1,run.ink/4.2)*.0);o[i*3]=Math.cos(a)*r;o[i*3+1]=Math.sin(a*1.3)*r*.7;o[i*3+2]=Math.sin(a)*r}inkP.p.geometry.attributes.position.needsUpdate=true;M.ink.opacity=Math.min(.85,run.ink*.5)}
      // harpoons
      harps.count=run.proj.length;for(let i=0;i<run.proj.length;i++){const s=run.proj[i];tmpP.set(s.x,s.y,s.z);tmpQ.setFromUnitVectors(FW,tmpS.set(s.dx,s.dy,s.dz).normalize());tmpS.set(1,1,1);tmpM.compose(tmpP,tmpQ,tmpS);harps.setMatrixAt(i,tmpM)}harps.instanceMatrix.needsUpdate=true;
      // rings
      for(const m of rings){if(!m.visible)continue;m.userData.t+=dt;const u=m.userData.t/.5;if(u>=1){m.visible=false;continue}m.scale.setScalar(m.userData.s*(1+u*4));m.material.opacity=.7*(1-u);m.lookAt(cam.x,cam.y,cam.z)}
      // marine snow follows the camera
      {const a=sn.pos;for(let i=0;i<SN;i++){a[i*3+1]-=dt*.35;for(let c=0;c<3;c++){const o=i*3+c,m=c===0?cam.x:c===1?cam.y:cam.z;if(a[o]<m-30)a[o]+=60;else if(a[o]>m+30)a[o]-=60}}sn.p.geometry.attributes.position.needsUpdate=true}
    }
    // other divers' subs: list of {x,y,z,h}
    function others(list){for(let i=0;i<buddies.length;i++){const o=list[i],b=buddies[i];b.visible=!!o;if(o){b.position.set(o.x,o.y,o.z);b.rotation.set(0,o.h,0);b.userData.prop.rotation.z+=.3}}}
    function fx(e){
      if(e.k==='hit')ring(e.x,e.y,e.z,e.boss?3:1.2,e.boss?'#ff9a6a':'#aef3ff');
      else if(e.k==='kill'){ring(e.x,e.y,e.z,e.kind==='kraken'?9:2.6,'#ffe27a');if(e.kind==='kraken')ring(e.x,e.y,e.z,15,'#ffffff')}
      else if(e.k==='bite'||e.k==='hurt')ring(sub.position.x,sub.position.y,sub.position.z,2.4,'#ff6a4a');
      else if(e.k==='krakenSwipe'){kLunge=.45;}
    }
    function show(){root.visible=true;if(!lamp){lamp=new THREE.SpotLight(0xdff6ff,2.6,95,.52,.55,1);lamp.position.set(0,.1,1.8);const tg=new THREE.Object3D();tg.position.set(0,0,16);sub.add(tg);lamp.target=tg;sub.add(lamp)}}
    function hide(){root.visible=false;sub.visible=false;if(lamp){sub.remove(lamp);if(lamp.target)sub.remove(lamp.target);lamp=null}for(const b of buddies)b.visible=false}
    return{root,setup,sync,others,fx,show,hide,place(x,y,z){root.position.set(x,y,z)},get sub(){return sub}};
  }
  const API={build,fogAt,models};
  if(typeof module!=='undefined')module.exports=API;
  return API;
})();
