// RallyCombatFx: the visuals of combat racing (browser only). Everything is pooled and capped for low-end phones: the 30-ish item boxes are ONE instanced
// draw call; projectiles (14), mines (8), explosions (6) and shields (one per racer) are created once and reused; nothing is allocated per frame and no model is
// loaded per weapon. update() reads the simulation state (Items) each frame; event() reacts to one-off events (impact, hit, burst...). THREE r147 globals.
const RallyCombatFx=(()=>{
  const BOLT=0x6fe3ff,ROCKET=0xff8a3a;
  function build(scene,T){
    const root=new THREE.Group();root.name='rally-combat';scene.add(root);
    const dummy=new THREE.Object3D(),col=new THREE.Color();
    // ---- item boxes: one InstancedMesh (gold = road, cyan = sky) + a counter-rotating inner cube ----
    const n=Math.max(1,T.itemBoxes.length);
    const boxes=new THREE.InstancedMesh(new THREE.BoxGeometry(2.2,2.2,2.2),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.72,depthWrite:false}),n);
    const inner=new THREE.InstancedMesh(new THREE.BoxGeometry(1.1,1.1,1.1),new THREE.MeshBasicMaterial({color:0xffffff}),n);
    boxes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);inner.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    T.itemBoxes.forEach((b,i)=>{col.set(b.air?0x6fe3ff:0xffd24a);boxes.setColorAt(i,col)});if(boxes.instanceColor)boxes.instanceColor.needsUpdate=true;
    boxes.frustumCulled=false;inner.frustumCulled=false;root.add(boxes);root.add(inner);
    // ---- projectiles ----
    const pg=new THREE.SphereGeometry(.5,8,6),pm={blaster:new THREE.MeshBasicMaterial({color:BOLT,blending:THREE.AdditiveBlending,depthWrite:false}),rocket:new THREE.MeshBasicMaterial({color:ROCKET,blending:THREE.AdditiveBlending,depthWrite:false})};
    const proj=[];for(let i=0;i<14;i++){const m=new THREE.Mesh(pg,pm.blaster);m.visible=false;m.frustumCulled=false;root.add(m);proj.push(m)}
    // ---- mines ----
    const mg=new THREE.CylinderGeometry(1.3,1.5,.4,14),mm=new THREE.MeshLambertMaterial({color:0x8a1d1d}),lg=new THREE.SphereGeometry(.38,8,6),lm=new THREE.MeshBasicMaterial({color:0xff3b30});
    const mines=[];for(let i=0;i<8;i++){const g=new THREE.Group(),b=new THREE.Mesh(mg,mm),l=new THREE.Mesh(lg,lm);l.position.y=.35;g.add(b);g.add(l);g.visible=false;root.add(g);mines.push(g)}
    // ---- explosions: expanding translucent shells ----
    const eg=new THREE.SphereGeometry(1,14,10),shells=[];for(let i=0;i<6;i++){const m=new THREE.Mesh(eg,new THREE.MeshBasicMaterial({color:0xffb050,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}));m.visible=false;m.userData={t:9,dur:.4,r:4};root.add(m);shells.push(m)}
    let si=0;
    const shield=new Map();
    const sg=new THREE.SphereGeometry(3,16,12),sm=()=>new THREE.MeshBasicMaterial({color:0x7fd0ff,transparent:true,opacity:.26,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
    function boom(x,y,z,r,color,dur){const m=shells[si++%shells.length];m.position.set(x,y,z);m.material.color.setHex(color||0xffb050);m.userData={t:0,dur:dur||.4,r};m.visible=true}
    return {
      root,
      // t = wall seconds (spin / blink), I = Items state, racers = the race's racers
      update(I,racers,t,dt){
        for(let i=0;i<T.itemBoxes.length;i++){const b=I.boxes[i],s=b&&b.on?1:0;
          dummy.position.set(T.itemBoxes[i].x,T.itemBoxes[i].y+Math.sin(t*2+i)*.25,T.itemBoxes[i].z);dummy.rotation.set(0,t*1.4+i,0);dummy.scale.setScalar(s||.0001);dummy.updateMatrix();boxes.setMatrixAt(i,dummy.matrix);
          dummy.rotation.set(t*1.1,-t*1.9,t*.7);dummy.updateMatrix();inner.setMatrixAt(i,dummy.matrix)}
        boxes.instanceMatrix.needsUpdate=true;inner.instanceMatrix.needsUpdate=true;
        for(let i=0;i<proj.length;i++){const p=I.proj[i],m=proj[i];
          if(!p||!p.on){m.visible=false;continue}
          m.visible=true;m.material=pm[p.kind];m.position.set(p.x,p.y,p.z);
          const sp=Math.hypot(p.vx,p.vy,p.vz)||1;m.lookAt(p.x+p.vx/sp,p.y+p.vy/sp,p.z+p.vz/sp);m.scale.set(p.kind==='rocket'?1:.8,p.kind==='rocket'?1:.8,p.kind==='rocket'?3.2:2.2)}
        for(let i=0;i<mines.length;i++){const mi=I.mines[i],g=mines[i];
          if(!mi){g.visible=false;continue}
          g.visible=true;g.position.set(mi.x,mi.y,mi.z);const armed=mi.age>=RALLY.items.mine.arm;g.children[1].visible=armed?Math.sin(t*10)>-.2:true;g.children[1].scale.setScalar(armed?1:.6)}
        for(const r of racers){let s=shield.get(r.key);
          if(r.c.shieldT>0){if(!s){s=new THREE.Mesh(sg,sm());s.frustumCulled=false;root.add(s);shield.set(r.key,s)}
            s.visible=r.c.shieldT>1.2||Math.sin(t*28)>0;s.position.set(r.c.x,r.c.y+1,r.c.z);s.scale.set(1,.75,1.25);s.rotation.y=r.c.h}
          else if(s)s.visible=false}
        for(const m of shells){if(!m.visible)continue;const u=m.userData;u.t+=dt;const k=u.t/u.dur;if(k>=1){m.visible=false;continue}m.scale.setScalar(.5+u.r*k);m.material.opacity=(1-k)*.6}
      },
      event(e){
        if(e.k==='impact'||e.k==='expire')boom(e.x,e.y,e.z,e.kind==='rocket'?6:3,e.kind==='rocket'?0xffa040:0x6fe3ff,.3);
        else if(e.k==='hit')boom(e.x,e.y+1,e.z,e.kind==='rocket'?8:e.kind==='mine'?7:4.5,e.kind==='blaster'?0x6fe3ff:0xff7a30,.4);
        else if(e.k==='burst')boom(e.x,e.y+1,e.z,RALLY.items.burst.r,0xff6a3a,.45);
        else if(e.k==='shield')boom(e.x,e.y+1,e.z,6,0x7fd0ff,.35);
        else if(e.k==='mine-gone'&&e.boom)boom(e.x,e.y,e.z,4,0xff7a30,.3);
        try{if(typeof Fx!=='undefined'&&(e.k==='hit'||e.k==='burst'||e.k==='impact'))Fx.burst(e.x,e.y+.5,e.z,e.kind==='blaster'?'#6fe3ff':'#ff9a40',e.k==='burst'?16:8)}catch(_){}
      },
      reset(){for(const m of proj)m.visible=false;for(const g of mines)g.visible=false;for(const m of shells)m.visible=false;for(const s of shield.values())s.visible=false},
      dispose(){scene.remove(root);root.traverse(o=>{if(o.geometry&&o.geometry.dispose&&o.geometry!==pg)o.geometry.dispose()})},
    };
  }
  return {build};
})();
