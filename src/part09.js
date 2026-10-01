    if(i%6===0)solids.push({x:p.x,z:p.z,r:1});
  }
  const p0=kartPt(0),yaw0=Math.atan2(p0.tx,p0.tz);
  const fin=pieceM.finish.clone(true);fin.position.set(p0.x,H(p0.x,p0.z)+.06,p0.z);fin.rotation.y=yaw0;scene.add(fin);
  const pad=new THREE.Mesh(new THREE.CylinderGeometry(4,4,.3,24),new THREE.MeshStandardMaterial({color:'#ffd24a',emissive:'#ff9d00',emissiveIntensity:.8}));
  pad.position.set(p0.x-p0.tx*8,H(p0.x-p0.tx*8,p0.z-p0.tz*8)+.2,p0.z-p0.tz*8);scene.add(pad);kart.padX=pad.position.x;kart.padZ=pad.position.z;
  kart.boosts=[];
  const boostMat=new THREE.MeshStandardMaterial({color:'#40e0ff',emissive:'#00c8ff',emissiveIntensity:1.2,roughness:.3});
  for(const t of [0.18,0.42,0.68,0.88]){
    const p=kartPt(t),y=H(p.x,p.z)+.12;
    const b=new THREE.Mesh(new THREE.BoxGeometry(5.5,0.18,3.2),boostMat);
    b.position.set(p.x,y,p.z);b.rotation.y=Math.atan2(p.tx,p.tz);scene.add(b);
    kart.boosts.push({m:b,x:p.x,z:p.z,tx:p.tx,tz:p.tz,cd:0});
  }
  kart.obstacles=[];
  const rockMat=new THREE.MeshStandardMaterial({color:'#7a7368',roughness:1,flatShading:true});
  for(const t of [0.12,0.28,0.35,0.55,0.62,0.78,0.92]){
    const p=kartPt(t),side=(t*17%1>0.5?1:-1);
    const ox=p.x+p.tz*side*(4.5+rng()*2.5),oz=p.z-p.tx*side*(4.5+rng()*2.5);
    const y=H(ox,oz);
    const rk=new THREE.Mesh(new THREE.DodecahedronGeometry(1.4+rng()*1.1,0),rockMat);
    rk.position.set(ox,y+1.1,oz);rk.rotation.set(rng(),rng(),rng());rk.castShadow=true;scene.add(rk);
    kart.obstacles.push({m:rk,x:ox,z:oz,r:2.2});
    solids.push({x:ox,z:oz,r:1.8});
  }
  for(const t of [0.48,0.82]){
    const p=kartPt(t),y=H(p.x,p.z)+.6;
    const bar=new THREE.Mesh(new THREE.BoxGeometry(9,.9,.7),new THREE.MeshStandardMaterial({color:'#c45c26',roughness:.7}));
    bar.position.set(p.x,y,p.z);bar.rotation.y=Math.atan2(p.tx,p.tz);bar.castShadow=true;scene.add(bar);
    kart.obstacles.push({m:bar,x:p.x,z:p.z,r:3.5,slow:true});
  }
  const NG=12;
  for(let i=0;i<NG;i++){const t=(i+1)/NG,p=kartPt(t),y=H(p.x,p.z)+3.4;
    const m=new THREE.Mesh(new THREE.TorusGeometry(6.5,.65,8,28),new THREE.MeshBasicMaterial({color:'#7fd0ff',fog:false,transparent:true,opacity:.55}));
    m.position.set(p.x,y,p.z);m.rotation.y=Math.atan2(p.tx,p.tz);m.rotation.x=Math.PI/2;scene.add(m);
    kart.gates.push({m,x:p.x,y,z:p.z});
  }
  if(!kart.el){const d=document.createElement('div');d.style.cssText='position:fixed;z-index:6;top:calc(env(safe-area-inset-top,0px) + 92px);left:0;right:0;text-align:center;font-size:18px;text-shadow:0 2px 8px #000;pointer-events:none;display:none';document.body.appendChild(d);kart.el=d}
  paintKart();
}
function paintKart(){kart.gates.forEach((g,i)=>{const on=kart.on,act=on&&i===kart.i;g.m.visible=!(on&&i<kart.i);
  g.m.material.color.set(act?'#ffd24a':'#7fd0ff');g.m.material.opacity=act?1:on?.55:.5;g.m.scale.setScalar(act?1.2:1)})}
function startKartRace(local){
  if(!kart.gates.length)return;
  kart.on=true;kart.i=0;kart.pi=0;kart.t0=performance.now()+3000;paintKart();
  if(local&&chan)chan.send({type:'broadcast',event:'ks',payload:{}});
}
function kartTick(t){
  if(!kart.on){if(kart.el)kart.el.style.display='none';return}
  const now=performance.now();kart.el.style.display='block';
  if(now<kart.t0){kart.el.style.fontSize='44px';kart.el.textContent=Math.ceil((kart.t0-now)/1000);return}
  kart.el.style.fontSize='18px';
  if(kart.boosts)for(const b of kart.boosts){
    b.cd=Math.max(0,b.cd-0.016);
    if(b.cd<=0&&Math.hypot(S.x-b.x,S.z-b.z)<3.8){
      S.burst=Math.max(S.burst||0,1.6);S.kx+=(b.tx||0)*18;S.kz+=(b.tz||0)*18;
      b.cd=1.8;b.m.material.emissiveIntensity=2.5;
      setTimeout(()=>{if(b.m)b.m.material.emissiveIntensity=1.2},400);
      if(navigator.vibrate)navigator.vibrate(30);
    }
  }
  if(kart.obstacles)for(const o of kart.obstacles){
    const d=Math.hypot(S.x-o.x,S.z-o.z);
    if(d<o.r){
      if(o.slow){S.kx*=0.4;S.kz*=0.4;S.burst=0}
      else{const nx=(S.x-o.x)/d,nz=(S.z-o.z)/d;S.kx+=nx*9;S.kz+=nz*9}
    }
  }
  const g=kart.gates[kart.i];
  if(Math.hypot(S.x-g.x,S.z-g.z)<8){kart.i++;chime();
    if(chan)chan.send({type:'broadcast',event:'kp',payload:{i:kart.i}});
    if(kart.i>=kart.gates.length){const ms=now-kart.t0;let best=+localStorage.getItem('w4kart')||1e12;const nb=ms<best;try{if(nb)localStorage.setItem('w4kart',ms)}catch(e){}
