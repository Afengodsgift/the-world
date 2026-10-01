loadChar().then(()=>new Promise((res,rej)=>new THREE.GLTFLoader().parse(charBuf.slice(0),AURL,res,rej))).then(r=>{
    const m=r.scene,bones={};m.scale.setScalar(.5);
    m.traverse(o=>{if(o.isSkinnedMesh){o.skeleton.bones.forEach(b=>bones[b.name]=b);o.frustumCulled=false;o.material=new THREE.MeshStandardMaterial({map:skinT[skin%skinT.length],roughness:.85,metalness:0})}});
    const mx=new THREE.AnimationMixer(m),act={};for(const n in clips)act[n]=mx.clipAction(clips[n]);
    act.jump.setLoop(THREE.LoopOnce,1);act.jump.clampWhenFinished=true;
    const u=g.userData;u.rig.visible=false;m.traverse(c=>{if(c.isMesh){c.castShadow=true}});g.add(m);Object.assign(u,{mixer:mx,act,model:m,bones,cur:null,ph:0,swing:0});
    if(PAN_ENABLED&&bones.RightHand)loadPan().then(()=>new Promise((res,rej)=>new THREE.GLTFLoader().parse(panBuf.slice(0),AURL,res,rej))).then(pr=>{
      const piv=new THREE.Group(),pn=pr.scene;pn.traverse(c=>{if(c.isMesh)c.castShadow=true});
      // tuned so pan sits naturally in right hand when equipped
      pn.position.set(0.02, -0.08, 0.04);
      piv.add(pn);
      piv.scale.setScalar(0.028);
      piv.rotation.set(-0.4, 0.1, -Math.PI/2.3);
      bones.RightHand.add(piv);
      u.pan = piv;
      piv.visible = false; // start unequipped
    }).catch(()=>{});
  }).catch(()=>{});
}
loadAssets();loadChar().catch(()=>{});

function SKYH(dx,dz){const d=Math.hypot(dx,dz);const dome=Math.max(0,1-(d/SKY.R)**2);let h=SKY.base+dome*20+Math.sin(dx*.06)*Math.cos(dz*.05)*1.3;
  if(d>SKY.R){const t=Math.min(1,(d-SKY.R)/45);h=SKY.base-t*t*95}
  return h}
function H(x,z){
  const d=Math.hypot(x,z);
  let h=Math.max(-3,(1-(d/(85*K))**2)*3.5-.6)+Math.sin(x*.11/K)*Math.cos(z*.13/K)*.8;
  h+=40*Math.exp(-(x*x+(z+55*K)**2)/4050);
  const t=1-sstep(30,55,Math.hypot(x-TOWN.x,z-TOWN.z));
  h=h*(1-t)+1.6*t;
  for(const I of ISL){const dx=x-I.x,dz=z-I.z,dd=Math.hypot(dx,dz);if(dd>I.R*1.6)continue;
    const v=Math.max(-3,(1-(dd/I.R)**2)*4-.6)+Math.sin(x*.09)*Math.cos(z*.11)*.7+I.pk*Math.exp(-dd*dd/(2*(I.R*.35)**2));
    if(v>h)h=v}
  return h;
}
function terrain(cx,cz,size,seg){
  const geo=new THREE.PlaneGeometry(size,size,seg,seg);geo.rotateX(-Math.PI/2);
  const pos=geo.attributes.position,cols=new Float32Array(pos.count*3),c=new THREE.Color();
  for(let i=0;i<pos.count;i++){const x=pos.getX(i)+cx,z=pos.getZ(i)+cz,h=H(x,z);pos.setY(i,h);terrainColor(h,x,z,c);cols.set([c.r,c.g,c.b],i*3)}
  geo.setAttribute('color',new THREE.BufferAttribute(cols,3));geo.computeVertexNormals();
  const m=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}));m.position.set(cx,0,cz);m.receiveShadow=true;scene.add(m);
}
const _cg1=new THREE.Color('#4d7a32'),_cg2=new THREE.Color('#86a34a'),_cdry=new THREE.Color('#a19a5a'),_crock=new THREE.Color('#7b786f'),_csand=new THREE.Color('#dccba0'),_csand2=new THREE.Color('#bfa97f'),_csnow=new THREE.Color('#eef3fa'),_ct=new THREE.Color();
function terrainColor(h,x,z,c){
  const n=(Math.sin(x*.045)*Math.cos(z*.038)+Math.sin(x*.13+z*.09)*.5+Math.sin(z*.21-x*.17)*.25)*.28+.5,q=Math.max(0,Math.min(1,n));
  const sl=Math.hypot(H(x+2,z)-H(x-2,z),H(x,z+2)-H(x,z-2))/4;
  c.copy(_cg1).lerp(_cg2,q);if(n<.12)c.lerp(_cdry,.5);
  c.lerp(_crock,Math.max(sstep(.5,.85,sl),sstep(11,17,h)));
  c.lerp(_csnow,sstep(27,31,h));
  _ct.copy(_csand).lerp(_csand2,h<.1?.85:.2+q*.25);c.lerp(_ct,1-sstep(.3,.95,h));
}
function scatter(name,th,pl){
  const m=AM[name];if(!m||!pl.length)return null;
  m.updateMatrixWorld(true);
  const bx=new THREE.Box3().setFromObject(m),k=th/(bx.max.y-bx.min.y),V=new THREE.Vector3(),Q=new THREE.Quaternion(),Sc=new THREE.Vector3(),P=new THREE.Matrix4(),M=new THREE.Matrix4(),Y=new THREE.Vector3(0,1,0);
  m.traverse(o=>{if(!o.isMesh)return;const im=new THREE.InstancedMesh(o.geometry,o.material,pl.length);
    pl.forEach((p,i)=>{V.set(p.x,p.y-bx.min.y*k*p.s,p.z);Q.setFromAxisAngle(Y,p.ry);Sc.setScalar(k*p.s);P.compose(V,Q,Sc);M.multiplyMatrices(P,o.matrixWorld);im.setMatrixAt(i,M)});
    im.castShadow=true;im.receiveShadow=true;const tc=new THREE.Color();pl.forEach((p,i)=>im.setColorAt(i,tc.setScalar(.78+((p.x*12.9898+p.z*78.233)%1+1)%1*.4)));
    im.frustumCulled=false;scene.add(im)});
  return {w:Math.max(bx.max.x-bx.min.x,bx.max.z-bx.min.z)*k};
}
function place(par,n,x,y,z,ry,sx,sy,sz){
  const m=AM[n];if(!m)return null;const o=m.clone();o.position.set(x,y,z);o.rotation.y=ry;
  o.scale.set(sx,sy===undefined?sx:sy,sz===undefined?sx:sz);o.traverse(c=>{if(c.isMesh){c.castShadow=true;c.receiveShadow=true}});par.add(o);return o;
}
function house(hx,hz,ry,w,d){
  const g=new THREE.Group(),S=2.6;
  for(let i=0;i<w;i++)for(let j=0;j<d;j++){
    const cx=(i-(w-1)/2)*S,cz=(j-(d-1)/2)*S,sides=[];
    if(i===w-1)sides.push([1,0]);if(i===0)sides.push([-1,0]);if(j===d-1)sides.push([0,1]);if(j===0)sides.push([0,-1]);
    for(const [dx,dz] of sides){
      const n=(dz===1&&i===(w>>1))?'wall-wood-door':((i+j+dx+dz)&1?'wall-wood-window-small':'wall-wood');
      place(g,n,cx,0,cz,Math.atan2(-dz,dx),S);
    }
  }
  for(let i=0;i<w;i++){const cx=(i-(w-1)/2)*S,end=i===0||i===w-1;
    place(g,end?'roof-gable-end':'roof-gable',cx,S,0,i===w-1?Math.PI:0,S,S,S*d)}
  g.position.set(hx,H(hx,hz)+.05,hz);g.rotation.y=ry;scene.add(g);solids.push({x:hx,z:hz,r:S*Math.max(w,d)*.5*1.15});
}
