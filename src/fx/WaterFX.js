// WaterFX: the water's visual feedback, all pooled (no per-frame allocation) and cheap:
//   ripple rings (1 InstancedMesh, additive, fades by colour): entry/exit splashes, swim wake, rain ripples on the sea
//   spray droplets (1 Points): burst when you hit the water
//   bubbles (1 Points): drifting ambient bubbles around the camera when submerged + the ones you exhale while diving
//   ship wakes (Phase C of the living ocean): foam patches (1 InstancedMesh, ride the same wave function as the sea) + bow/side spray (1 Points), driven by WaterFX.vessel() for every hull
// 6 draw calls total. Tuning knobs: counts at the top, lifetimes/radii in splash()/wake()/rain().
const WaterFX=(()=>{
  const SEA=-.3,NR=48,NS=64,NB=44,NG=64,NF=140,NW=110;
  let foam=null,wspray=null,fr=0,wr=0,dens=1,dEma=.016,rings=null,splat=null,gr=0,spray=null,bub=null,floorM=null,rr=0,sr=0,br=0,wakeT=0,exhaleT=2,ready=false,dayK=1;
  const G={x:new Float32Array(NG),y:new Float32Array(NG),z:new Float32Array(NG),age:new Float32Array(NG).fill(9),life:new Float32Array(NG).fill(1),max:new Float32Array(NG),amp:new Float32Array(NG)};
  const R={x:new Float32Array(NR),y:new Float32Array(NR).fill(SEA),z:new Float32Array(NR),age:new Float32Array(NR).fill(9),life:new Float32Array(NR).fill(1),max:new Float32Array(NR),amp:new Float32Array(NR)};
  const SP={vx:new Float32Array(NS),vy:new Float32Array(NS),vz:new Float32Array(NS),life:new Float32Array(NS)};
  const BU={vy:new Float32Array(NB),ph:new Float32Array(NB),on:new Uint8Array(NB)};
  const F={x:new Float32Array(NF),z:new Float32Array(NF),age:new Float32Array(NF).fill(9),life:new Float32Array(NF).fill(1),sz:new Float32Array(NF),grow:new Float32Array(NF),amp:new Float32Array(NF),rot:new Float32Array(NF)};
  const W={vx:new Float32Array(NW),vy:new Float32Array(NW),vz:new Float32Array(NW),life:new Float32Array(NW)};
  const vt=new Map();                                              // per-vessel emit timers
  const _up=new THREE.Vector3(0,1,0),_m=new THREE.Matrix4(),_q=new THREE.Quaternion(),_p=new THREE.Vector3(),_s=new THREE.Vector3(),_c=new THREE.Color();
  function dotTex(){const c=document.createElement('canvas');c.width=c.height=32;const g=c.getContext('2d'),gr=g.createRadialGradient(16,16,1,16,16,15);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.55,'rgba(255,255,255,.85)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,32,32);return new THREE.CanvasTexture(c)}
  function build(){
    if(ready)return;ready=true;
    const rg=new THREE.RingGeometry(.84,1,28);rg.rotateX(-Math.PI/2);
    rings=new THREE.InstancedMesh(rg,new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}),NR);
    rings.frustumCulled=false;rings.renderOrder=3;_s.set(0,0,0);_m.compose(_p.set(0,-999,0),_q.identity(),_s);for(let i=0;i<NR;i++){rings.setMatrixAt(i,_m);rings.setColorAt(i,_c.setScalar(0))}
    scene.add(rings);
    // thicker, bolder rings for rain splashes on the ground (thin rings under half a metre wide vanish at camera distance)
    const sg0=new THREE.RingGeometry(.42,1,14);sg0.rotateX(-Math.PI/2);
    splat=new THREE.InstancedMesh(sg0,new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}),NG);
    splat.frustumCulled=false;splat.renderOrder=3;_s.set(0,0,0);_m.compose(_p.set(0,-999,0),_q.identity(),_s);for(let i=0;i<NG;i++){splat.setMatrixAt(i,_m);splat.setColorAt(i,_c.setScalar(0))}scene.add(splat);
    // ocean floor: the seabed mesh only exists around the islands, so its dark deep-blue edge used to show as a hard 'wave' shape against plain sea.
    // One big disk in the same deep blue under the whole sea makes that edge vanish and gives open-water dives a floor (matches the -12 m clamp in H).
    floorM=new THREE.Mesh(new THREE.CircleGeometry(6000,48),new THREE.MeshLambertMaterial({color:'#17607f'}));floorM.rotation.x=-Math.PI/2;floorM.position.y=-12.06;floorM.renderOrder=-2;scene.add(floorM);
    const tex=dotTex();
    {const fg=new THREE.PlaneGeometry(1,1);fg.rotateX(-Math.PI/2);
     foam=new THREE.InstancedMesh(fg,new THREE.MeshBasicMaterial({map:tex,color:'#ffffff',transparent:true,depthWrite:false,fog:true}),NF);
     foam.frustumCulled=false;foam.renderOrder=3;_s.set(0,0,0);_m.compose(_p.set(0,-999,0),_q.identity(),_s);for(let i=0;i<NF;i++){foam.setMatrixAt(i,_m);foam.setColorAt(i,_c.setScalar(0))}scene.add(foam);
     const wg=new THREE.BufferGeometry();wg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(NW*3).fill(-999),3));
     wspray=new THREE.Points(wg,new THREE.PointsMaterial({map:tex,size:.5,sizeAttenuation:true,transparent:true,opacity:.85,depthWrite:false,color:'#ffffff'}));wspray.frustumCulled=false;wspray.renderOrder=3;scene.add(wspray)}
    const sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(NS*3).fill(-999),3));
    spray=new THREE.Points(sg,new THREE.PointsMaterial({map:tex,size:.34,sizeAttenuation:true,transparent:true,opacity:.9,depthWrite:false,color:'#ffffff'}));spray.frustumCulled=false;spray.renderOrder=3;scene.add(spray);
    const bg=new THREE.BufferGeometry();bg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(NB*3).fill(-999),3));
    bub=new THREE.Points(bg,new THREE.PointsMaterial({map:tex,size:.16,sizeAttenuation:true,transparent:true,opacity:.55,depthWrite:false,color:'#d8fbff'}));bub.frustumCulled=false;bub.renderOrder=3;scene.add(bub);
  }
  function ring(x,z,max,life,amp,delay,y){const i=rr++%NR;R.x[i]=x;R.y[i]=y===undefined?seaY(x,z):y;R.z[i]=z;R.max[i]=max;R.life[i]=life;R.amp[i]=amp;R.age[i]=-(delay||0)}
  function splatAt(x,y,z,max,life,amp){const i=gr++%NG;G.x[i]=x;G.y[i]=y;G.z[i]=z;G.max[i]=max;G.life[i]=life;G.amp[i]=amp;G.age[i]=0}
  // entry / exit splash: 3 staggered rings + a burst of droplets. strength ~0.3 (gentle) .. 1.4 (big fall)
  function splash(x,z,strength){
    if(!ready)return;const k=Math.max(.25,Math.min(1.5,strength));
    ring(x,z,1.5+k*1.6,.95,.9,0);ring(x,z,1+k*1.1,.8,.7,.1);ring(x,z,.7+k*.7,.65,.55,.22);
    const a=spray.geometry.attributes.position.array,n=Math.round(8+k*16);
    for(let j=0;j<n;j++){const i=sr++%NS,ang=Math.random()*6.283,sp=(.8+Math.random()*1.6)*(.6+k*.5);
      a[i*3]=x;a[i*3+1]=seaY(x,z)+.05;a[i*3+2]=z;SP.vx[i]=Math.cos(ang)*sp;SP.vz[i]=Math.sin(ang)*sp;SP.vy[i]=(3+Math.random()*4)*(.55+k*.45);SP.life[i]=.9}
  }
  const seaY=(x,z)=>SEA+(typeof Ocean!=='undefined'?Ocean.height(x,z,Date.now()/1000):0);
  function foamAt(x,z,sz,grow,life,amp){const i=fr++%NF;F.x[i]=x;F.z[i]=z;F.sz[i]=sz;F.grow[i]=grow;F.life[i]=life;F.amp[i]=amp;F.age[i]=0;F.rot[i]=Math.random()*6.283}
  function sprayAt(x,y,z,vx,vy,vz){const i=wr++%NW,a=wspray.geometry.attributes.position.array;a[i*3]=x;a[i*3+1]=y;a[i*3+2]=z;W.vx[i]=vx;W.vy[i]=vy;W.vz[i]=vz;W.life[i]=.55+Math.random()*.45}
  // Every hull (yours, enemies) calls this each frame. v: Vessel {pose,hl,hb,sunk}, speed m/s. Cheap: distance culled, rate scaled by speed and by the quality factor.
  function vessel(v,dt,speed){
    if(!ready||v.sunk>.3)return;const q=v.pose,cx=typeof camera!=='undefined'?camera.position.x:q.x,cz=typeof camera!=='undefined'?camera.position.z:q.z;
    const d2=(q.x-cx)*(q.x-cx)+(q.z-cz)*(q.z-cz);if(d2>260*260)return;
    speed=Math.abs(speed||0);if(speed<1.2)return;
    let t=vt.get(v);if(!t){t={f:0,s:0};vt.set(v,t)}
    const sn=Math.sin(q.h),cs=Math.cos(q.h),hl=v.hl||11,hb=v.hb||5,k=Math.min(1,speed/12),far=d2>120*120?.5:1,D=dens*far;
    const at=(px,pz,o)=>{o.x=q.x+cs*px+sn*pz;o.z=q.z-sn*px+cs*pz;return o},o={x:0,z:0};
    t.f-=dt;
    if(t.f<=0){t.f=(.16-.07*k)/Math.max(.2,D);
      for(const sd of [-1,1]){at(sd*hb*.95,hl*.78,o);foamAt(o.x,o.z,1.4+k*1.2,.9,1.5+k,.55*k+.2);                       // bow wave
        at(sd*hb*1.02,hl*.1,o);foamAt(o.x,o.z,1.6+k*.8,1.1,2.4+k,.4*k+.1);at(sd*hb*1.02,-hl*.5,o);foamAt(o.x,o.z,1.8+k,1.3,3+k*1.2,.35*k+.1)}   // sides
      at((Math.random()-.5)*hb*.6,-hl*.98,o);foamAt(o.x,o.z,hb*.9+k*1.4,2.2+k*1.6,4+k*2.5,.55*k+.15)}                    // stern wake
    t.s-=dt;if(t.s<=0&&speed>4){t.s=.05/Math.max(.2,D);
      for(const sd of [-1,1]){at(sd*hb*.8,hl*.88,o);const y=seaY(o.x,o.z)+.25,sp=1.2+k*2.2;
        sprayAt(o.x,y,o.z,(cs*sd*sp+sn*speed*.15)+Math.random()*.6-.3,2.2+k*2.6+Math.random()*1.5,(-sn*sd*sp+cs*speed*.15)+Math.random()*.6-.3)}}
  }
  // a cannonball / ram hits the hull: a burst of spray and a foam ring right at the waterline
  function hullHit(x,y,z,n){if(!ready)return;const m=Math.round((n||10)*Math.max(.3,dens));for(let j=0;j<m;j++){const a=Math.random()*6.283,sp=1+Math.random()*2.4;sprayAt(x,Math.max(y,seaY(x,z)),z,Math.cos(a)*sp,2.5+Math.random()*3.5,Math.sin(a)*sp)}foamAt(x,z,1.2,3,1.2,.5)}
  function bubbles(x,y,z,n){if(!ready)return;for(let j=0;j<n;j++){const i=br++%NB,a=bub.geometry.attributes.position.array;a[i*3]=x+(Math.random()-.5)*.5;a[i*3+1]=y+Math.random()*.3;a[i*3+2]=z+(Math.random()-.5)*.5;BU.vy[i]=.6+Math.random()*.7;BU.ph[i]=Math.random()*6.28;BU.on[i]=1}}
  // c: {x,y,z,heading(rad, 0 = +z),speed,swim(surface swimming),dv(diving),under(0..1),camX,camY,camZ,dayF,rain,over(fn:(x,z)=>bool over open sea)}
  function update(dt,c){
    if(!ready)return;dayK=.35+.65*(c.dayF===undefined?1:c.dayF);
    floorM.visible=c.y<250;                                          // not needed (and not wanted) from high up / space
    // swim wake: a small ring every ~0.2 s behind a swimmer moving at the surface
    if(c.swim&&!c.dv&&c.speed>1){wakeT-=dt;if(wakeT<=0){wakeT=.2;ring(c.x-Math.sin(c.heading)*.6,c.z-Math.cos(c.heading)*.6,.8+Math.min(.8,c.speed*.07),.75,.5,0)}}
    // rain ripples on the sea around the player
    if(c.rain>.08&&c.under<.1){const n=c.rain*dt*11,k=Math.floor(n)+(Math.random()<n%1?1:0);for(let j=0;j<k;j++){const a=Math.random()*6.283,r=3+Math.random()*16,x=c.x+Math.cos(a)*r,z=c.z+Math.sin(a)*r;if(c.over(x,z))ring(x,z,.55+Math.random()*.3,.55,.55,0)}}
    // rain splashes on the ground / sand around the player (tiny rings at terrain height), so rain visibly LANDS
    if(c.rain>.08&&c.under<.1&&c.hAt){const n=c.rain*dt*70,k=Math.floor(n)+(Math.random()<n%1?1:0);for(let j=0;j<k;j++){const a=Math.random()*6.283,r=1+Math.sqrt(Math.random())*10,x=c.x+Math.cos(a)*r,z=c.z+Math.sin(a)*r,h=c.hAt(x,z);if(h>-.15&&h<c.y+4)splatAt(x,h,z,.32+Math.random()*.25,.34,.7*(.7+.3*Math.random()))}}
    // rings
    for(let i=0;i<NR;i++){R.age[i]+=dt;const a=R.age[i],k=a/R.life[i];
      if(a<0||k>=1){_s.set(0,0,0);_p.set(0,-999,0)}else{const e=1-(1-k)*(1-k),r=R.max[i]*e;_p.set(R.x[i],R.y[i]+.04,R.z[i]);_s.set(r,1,r);_c.setScalar(R.amp[i]*Math.pow(1-k,1.5)*dayK)}
      _m.compose(_p,_q.identity(),_s);rings.setMatrixAt(i,_m);rings.setColorAt(i,a<0||k>=1?_c.setScalar(0):_c)}
    rings.instanceMatrix.needsUpdate=true;rings.instanceColor.needsUpdate=true;
    // ground splats
    for(let i=0;i<NG;i++){G.age[i]+=dt;const a=G.age[i],k=a/G.life[i];
      if(k>=1){_s.set(0,0,0);_p.set(0,-999,0);_c.setScalar(0)}else{const r=G.max[i]*(1-(1-k)*(1-k));_p.set(G.x[i],G.y[i]+.05,G.z[i]);_s.set(r,1,r);_c.setScalar(G.amp[i]*(1-k)*dayK)}
      _m.compose(_p,_q.identity(),_s);splat.setMatrixAt(i,_m);splat.setColorAt(i,_c)}
    splat.instanceMatrix.needsUpdate=true;splat.instanceColor.needsUpdate=true;
    // spray droplets
    {const a=spray.geometry.attributes.position.array;let any=false;for(let i=0;i<NS;i++){if(SP.life[i]<=0)continue;SP.life[i]-=dt;SP.vy[i]-=16*dt;a[i*3]+=SP.vx[i]*dt;a[i*3+1]+=SP.vy[i]*dt;a[i*3+2]+=SP.vz[i]*dt;any=true;if(SP.life[i]<=0||a[i*3+1]<SEA){SP.life[i]=0;a[i*3+1]=-999}}
      if(any)spray.geometry.attributes.position.needsUpdate=true;spray.material.color.setScalar(.45+.55*dayK)}
    // quality scaling: smoothed frame time -> emission density (1 normal, down to .25 on a struggling phone)
    dEma+=(dt-dEma)*.05;dens=dEma>.045?.25:dEma>.032?.5:dEma>.024?.75:1;
    // foam patches: sit on the water surface (same wave function), grow and fade
    {let any=false;for(let i=0;i<NF;i++){F.age[i]+=dt;const a=F.age[i],kk=a/F.life[i];
      if(kk>=1||a<0){if(F.amp[i]!==0){_s.set(0,0,0);_p.set(0,-999,0);_m.compose(_p,_q.identity(),_s);foam.setMatrixAt(i,_m);foam.setColorAt(i,_c.setScalar(0));F.amp[i]=0;any=true}continue}
      const r=F.sz[i]*(1+F.grow[i]*(1-(1-kk)*(1-kk)));_p.set(F.x[i],seaY(F.x[i],F.z[i])+.07,F.z[i]);_s.set(r,1,r);_q.setFromAxisAngle(_up,F.rot[i]);_m.compose(_p,_q,_s);foam.setMatrixAt(i,_m);foam.setColorAt(i,_c.setScalar(F.amp[i]*(1-kk)*(1-kk)*dayK));any=true}
      if(any){foam.instanceMatrix.needsUpdate=true;foam.instanceColor.needsUpdate=true}foam.visible=any}
    {const a=wspray.geometry.attributes.position.array;let any=false;for(let i=0;i<NW;i++){if(W.life[i]<=0)continue;W.life[i]-=dt;W.vy[i]-=14*dt;a[i*3]+=W.vx[i]*dt;a[i*3+1]+=W.vy[i]*dt;a[i*3+2]+=W.vz[i]*dt;if(W.life[i]<=0)a[i*3+1]=-999;any=true}
      if(any)wspray.geometry.attributes.position.needsUpdate=true;wspray.visible=any;wspray.material.color.setScalar(.45+.55*dayK)}
    // bubbles: ambient ones around the camera while submerged, plus exhaled ones while diving
    {const a=bub.geometry.attributes.position.array;let active=0;
      for(let i=0;i<NB;i++){if(!BU.on[i])continue;BU.ph[i]+=dt*2.2;a[i*3]+=Math.sin(BU.ph[i])*dt*.12;a[i*3+1]+=BU.vy[i]*dt;a[i*3+2]+=Math.cos(BU.ph[i]*.9)*dt*.12;
        if(a[i*3+1]>SEA-.08||Math.hypot(a[i*3]-c.camX,a[i*3+2]-c.camZ)>11){BU.on[i]=0;a[i*3+1]=-999}else active++}
      if(c.under>.15){let want=Math.round(26*c.under)-active;while(want-->0)bubbles(c.camX+(Math.random()-.5)*12,c.camY-3+Math.random()*3.2,c.camZ+(Math.random()-.5)*12,1)}
      if(c.dv){exhaleT-=dt;if(exhaleT<=0){exhaleT=2.6+Math.random()*2;bubbles(c.x,c.y+1.35,c.z,4+(Math.random()*3|0))}}
      bub.geometry.attributes.position.needsUpdate=true;bub.visible=c.under>.05||active>0}
  }
  return {build,update,splash,bubbles,vessel,hullHit,density:()=>dens};
})();
