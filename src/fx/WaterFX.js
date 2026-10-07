// WaterFX: the water's visual feedback, all pooled (no per-frame allocation) and cheap:
//   ripple rings (1 InstancedMesh, additive, fades by colour): entry/exit splashes, swim wake, rain ripples on the sea
//   spray droplets (1 Points): burst when you hit the water
//   bubbles (1 Points): drifting ambient bubbles around the camera when submerged + the ones you exhale while diving
// 3 draw calls total. Tuning knobs: counts at the top, lifetimes/radii in splash()/wake()/rain().
const WaterFX=(()=>{
  const SEA=-.3,NR=48,NS=64,NB=44;
  let rings=null,spray=null,bub=null,floorM=null,rr=0,sr=0,br=0,wakeT=0,exhaleT=2,ready=false,dayK=1;
  const R={x:new Float32Array(NR),z:new Float32Array(NR),age:new Float32Array(NR).fill(9),life:new Float32Array(NR).fill(1),max:new Float32Array(NR),amp:new Float32Array(NR)};
  const SP={vx:new Float32Array(NS),vy:new Float32Array(NS),vz:new Float32Array(NS),life:new Float32Array(NS)};
  const BU={vy:new Float32Array(NB),ph:new Float32Array(NB),on:new Uint8Array(NB)};
  const _m=new THREE.Matrix4(),_q=new THREE.Quaternion(),_p=new THREE.Vector3(),_s=new THREE.Vector3(),_c=new THREE.Color();
  function dotTex(){const c=document.createElement('canvas');c.width=c.height=32;const g=c.getContext('2d'),gr=g.createRadialGradient(16,16,1,16,16,15);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.55,'rgba(255,255,255,.85)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,32,32);return new THREE.CanvasTexture(c)}
  function build(){
    if(ready)return;ready=true;
    const rg=new THREE.RingGeometry(.84,1,28);rg.rotateX(-Math.PI/2);
    rings=new THREE.InstancedMesh(rg,new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}),NR);
    rings.frustumCulled=false;rings.renderOrder=3;_s.set(0,0,0);_m.compose(_p.set(0,-999,0),_q.identity(),_s);for(let i=0;i<NR;i++){rings.setMatrixAt(i,_m);rings.setColorAt(i,_c.setScalar(0))}
    scene.add(rings);
    // ocean floor: the seabed mesh only exists around the islands, so its dark deep-blue edge used to show as a hard 'wave' shape against plain sea.
    // One big disk in the same deep blue under the whole sea makes that edge vanish and gives open-water dives a floor (matches the -12 m clamp in H).
    floorM=new THREE.Mesh(new THREE.CircleGeometry(6000,48),new THREE.MeshLambertMaterial({color:'#17607f'}));floorM.rotation.x=-Math.PI/2;floorM.position.y=-12.06;floorM.renderOrder=-2;scene.add(floorM);
    const tex=dotTex();
    const sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(NS*3).fill(-999),3));
    spray=new THREE.Points(sg,new THREE.PointsMaterial({map:tex,size:.34,sizeAttenuation:true,transparent:true,opacity:.9,depthWrite:false,color:'#ffffff'}));spray.frustumCulled=false;spray.renderOrder=3;scene.add(spray);
    const bg=new THREE.BufferGeometry();bg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(NB*3).fill(-999),3));
    bub=new THREE.Points(bg,new THREE.PointsMaterial({map:tex,size:.16,sizeAttenuation:true,transparent:true,opacity:.55,depthWrite:false,color:'#d8fbff'}));bub.frustumCulled=false;bub.renderOrder=3;scene.add(bub);
  }
  function ring(x,z,max,life,amp,delay){const i=rr++%NR;R.x[i]=x;R.z[i]=z;R.max[i]=max;R.life[i]=life;R.amp[i]=amp;R.age[i]=-(delay||0)}
  // entry / exit splash: 3 staggered rings + a burst of droplets. strength ~0.3 (gentle) .. 1.4 (big fall)
  function splash(x,z,strength){
    if(!ready)return;const k=Math.max(.25,Math.min(1.5,strength));
    ring(x,z,1.5+k*1.6,.95,.9,0);ring(x,z,1+k*1.1,.8,.7,.1);ring(x,z,.7+k*.7,.65,.55,.22);
    const a=spray.geometry.attributes.position.array,n=Math.round(8+k*16);
    for(let j=0;j<n;j++){const i=sr++%NS,ang=Math.random()*6.283,sp=(.8+Math.random()*1.6)*(.6+k*.5);
      a[i*3]=x;a[i*3+1]=SEA+.05;a[i*3+2]=z;SP.vx[i]=Math.cos(ang)*sp;SP.vz[i]=Math.sin(ang)*sp;SP.vy[i]=(3+Math.random()*4)*(.55+k*.45);SP.life[i]=.9}
  }
  function bubbles(x,y,z,n){if(!ready)return;for(let j=0;j<n;j++){const i=br++%NB,a=bub.geometry.attributes.position.array;a[i*3]=x+(Math.random()-.5)*.5;a[i*3+1]=y+Math.random()*.3;a[i*3+2]=z+(Math.random()-.5)*.5;BU.vy[i]=.6+Math.random()*.7;BU.ph[i]=Math.random()*6.28;BU.on[i]=1}}
  // c: {x,y,z,heading(rad, 0 = +z),speed,swim(surface swimming),dv(diving),under(0..1),camX,camY,camZ,dayF,rain,over(fn:(x,z)=>bool over open sea)}
  function update(dt,c){
    if(!ready)return;dayK=.35+.65*(c.dayF===undefined?1:c.dayF);
    floorM.visible=c.y<250;                                          // not needed (and not wanted) from high up / space
    // swim wake: a small ring every ~0.2 s behind a swimmer moving at the surface
    if(c.swim&&!c.dv&&c.speed>1){wakeT-=dt;if(wakeT<=0){wakeT=.2;ring(c.x-Math.sin(c.heading)*.6,c.z-Math.cos(c.heading)*.6,.8+Math.min(.8,c.speed*.07),.75,.5,0)}}
    // rain ripples on the sea around the player
    if(c.rain>.08&&c.under<.1){const n=c.rain*dt*11,k=Math.floor(n)+(Math.random()<n%1?1:0);for(let j=0;j<k;j++){const a=Math.random()*6.283,r=3+Math.random()*16,x=c.x+Math.cos(a)*r,z=c.z+Math.sin(a)*r;if(c.over(x,z))ring(x,z,.45+Math.random()*.25,.5,.4,0)}}
    // rings
    for(let i=0;i<NR;i++){R.age[i]+=dt;const a=R.age[i],k=a/R.life[i];
      if(a<0||k>=1){_s.set(0,0,0);_p.set(0,-999,0)}else{const e=1-(1-k)*(1-k),r=R.max[i]*e;_p.set(R.x[i],SEA+.04,R.z[i]);_s.set(r,1,r);_c.setScalar(R.amp[i]*Math.pow(1-k,1.5)*dayK)}
      _m.compose(_p,_q.identity(),_s);rings.setMatrixAt(i,_m);rings.setColorAt(i,a<0||k>=1?_c.setScalar(0):_c)}
    rings.instanceMatrix.needsUpdate=true;rings.instanceColor.needsUpdate=true;
    // spray droplets
    {const a=spray.geometry.attributes.position.array;let any=false;for(let i=0;i<NS;i++){if(SP.life[i]<=0)continue;SP.life[i]-=dt;SP.vy[i]-=16*dt;a[i*3]+=SP.vx[i]*dt;a[i*3+1]+=SP.vy[i]*dt;a[i*3+2]+=SP.vz[i]*dt;any=true;if(SP.life[i]<=0||a[i*3+1]<SEA){SP.life[i]=0;a[i*3+1]=-999}}
      if(any)spray.geometry.attributes.position.needsUpdate=true;spray.material.color.setScalar(.45+.55*dayK)}
    // bubbles: ambient ones around the camera while submerged, plus exhaled ones while diving
    {const a=bub.geometry.attributes.position.array;let active=0;
      for(let i=0;i<NB;i++){if(!BU.on[i])continue;BU.ph[i]+=dt*2.2;a[i*3]+=Math.sin(BU.ph[i])*dt*.12;a[i*3+1]+=BU.vy[i]*dt;a[i*3+2]+=Math.cos(BU.ph[i]*.9)*dt*.12;
        if(a[i*3+1]>SEA-.08||Math.hypot(a[i*3]-c.camX,a[i*3+2]-c.camZ)>11){BU.on[i]=0;a[i*3+1]=-999}else active++}
      if(c.under>.15){let want=Math.round(26*c.under)-active;while(want-->0)bubbles(c.camX+(Math.random()-.5)*12,c.camY-3+Math.random()*3.2,c.camZ+(Math.random()-.5)*12,1)}
      if(c.dv){exhaleT-=dt;if(exhaleT<=0){exhaleT=2.6+Math.random()*2;bubbles(c.x,c.y+1.35,c.z,4+(Math.random()*3|0))}}
      bub.geometry.attributes.position.needsUpdate=true;bub.visible=c.under>.05||active>0}
  }
  return {build,update,splash,bubbles};
})();
