  if(!o){if(pmk)pmk.style.display='none';return}
  const p=o.group.position,d=Math.hypot(S.x-p.x,S.z-p.z);
  markToEl(pmk,p.x,p.y+2.4,p.z,(o.group.userData.nm||'Partner')+' · '+(d<50?Math.round(d):Math.round(d/10)*10)+'m');
}
function buildHunt(){
  const g=new THREE.Group(),wood=new THREE.MeshStandardMaterial({color:'#6b4a2f'}),pap=new THREE.MeshStandardMaterial({color:'#f3e2b3',emissive:'#5a4a20'});
  const p1=new THREE.Mesh(new THREE.BoxGeometry(.25,3,.25),wood);p1.position.set(-1.3,1.5,0);const p2=p1.clone();p2.position.x=1.3;
  const bd=new THREE.Mesh(new THREE.BoxGeometry(3.4,1.8,.15),pap);bd.position.y=2.6;g.add(p1,p2,bd);
  g.position.set(BOARD.x,H(BOARD.x,BOARD.z),BOARD.z);scene.add(g);solids.push({x:BOARD.x,z:BOARD.z,r:1.4});
  const c=new THREE.Group(),base=new THREE.Mesh(new THREE.BoxGeometry(1.6,.9,1),new THREE.MeshStandardMaterial({color:'#7a4a1f'}));base.position.y=.45;
  const lid=new THREE.Group();lid.position.set(0,.9,-.5);const lm=new THREE.Mesh(new THREE.BoxGeometry(1.6,.35,1),new THREE.MeshStandardMaterial({color:'#f2c14e',emissive:'#7a5a00'}));lm.position.set(0,.17,.5);lid.add(lm);
  c.add(base,lid);c.userData.lid=lid;c.scale.setScalar(1.6);c.visible=false;scene.add(c);hunt.chest=c;
  hunt.beam=new THREE.Mesh(new THREE.CylinderGeometry(.7,.7,90,10,1,true),new THREE.MeshBasicMaterial({color:'#ffd24a',transparent:true,opacity:.45,fog:false,depthWrite:false,side:THREE.DoubleSide}));hunt.beam.visible=false;scene.add(hunt.beam);
  pmk=document.getElementById('pmk');
  if(!mk){mk=document.createElement('div');mk.style.cssText='position:fixed;z-index:5;transform:translate(-50%,-50%);color:#ffd24a;text-align:center;font-size:28px;line-height:1;text-shadow:0 0 8px #000,0 2px 6px #000;pointer-events:none;display:none';mk.innerHTML='<div>◆</div><small style="font-size:13px"></small>';document.body.appendChild(mk)}
}
function pickTarget(n){
  const r=mulberry(hashSeed(roomCode+':hunt:'+n)),lands=[{x:0,z:0,R:200}].concat(ISL.map(I=>({x:I.x,z:I.z,R:I.R*.8})));
  for(let i=0;i<400;i++){const L=lands[r()*lands.length|0],a=r()*6.283,d=Math.sqrt(r())*L.R,x=L.x+Math.cos(a)*d,z=L.z+Math.sin(a)*d,h=H(x,z);
    if(h>1&&h<14&&Math.hypot(x-TOWN.x,z-TOWN.z)>60&&Math.hypot(x-WP[0][0],z-WP[0][1])>25)return {x,z,y:h}}
  return {x:-110,z:40,y:H(-110,40)};
}
function startHunt(local,n){
  if(!hunt.chest)return;
  hunt.n=n!==undefined?n:hunt.n+1;Object.assign(hunt,pickTarget(hunt.n),{on:true,open:0});
  hunt.chest.visible=false;hunt.chest.userData.lid.rotation.x=0;hunt.beam.position.set(hunt.x,hunt.y+45,hunt.z);hunt.beam.visible=false;
  banner('Something is buried out there. Follow the marker and dig it up!','TREASURE HUNT');
  if(local&&chan)chan.send({type:'broadcast',event:'hs',payload:{n:hunt.n}});
}
function dig(local){
  if(!hunt.on)return;hunt.on=false;hunt.open=2.5;hunt.chest.visible=true;hunt.chest.position.set(hunt.x,hunt.y-.9,hunt.z);hunt.beam.visible=false;chime();
  treas++;try{localStorage.setItem('w4t',treas)}catch(e){}updateHud();
  banner(local?'You found the treasure!':'Your partner found the treasure!','TREASURE FOUND');
  if(local&&chan)chan.send({type:'broadcast',event:'hf',payload:{}});
}
function huntTick(dt,t){
  if(hunt.on){const d=Math.hypot(S.x-hunt.x,S.z-hunt.z);hunt.beam.visible=d<160;
    if(!race.on)markTo(hunt.x,hunt.y+2,hunt.z,'Treasure · '+(d<50?Math.round(d):Math.round(d/10)*10)+' m')}
  if(hunt.open>0){hunt.open=Math.max(0,hunt.open-dt);const k=1-hunt.open/2.5;
    hunt.chest.position.y=hunt.y-.9+Math.min(1,k*2)*1.3;hunt.chest.userData.lid.rotation.x=-Math.min(1,Math.max(0,k*2-.6))*1.8;hunt.chest.rotation.y+=dt*.6}
}
let last=performance.now(),camY=0,fpsA=.016,fpsN=0;
function tick(t){
  const dt=Math.min(.05,(t-last)/1000);last=t;
  let ix=stickV.x,iy=stickV.y;
  if(keys.KeyA||keys.ArrowLeft)ix-=1;if(keys.KeyD||keys.ArrowRight)ix+=1;
  if(keys.KeyW||keys.ArrowUp)iy-=1;if(keys.KeyS||keys.ArrowDown)iy+=1;
  const len=Math.hypot(ix,iy);if(len>1){ix/=len;iy/=len}
  const sprint=keys.ShiftLeft||len>.9;
  const speed=S.flying?(bst()?70:24)*Math.min(1,len):(H(S.x,S.z)<-.5?(sprint?16:9):(sprint?12:6))*Math.min(1,len);
  const sy=Math.sin(S.yaw),cy=Math.cos(S.yaw);
  const dx=cy*ix+sy*iy,dz=-sy*ix+cy*iy;
  if(len>.05){S.x+=dx*speed*dt;S.z+=dz*speed*dt;S.rot=lerpAngle(S.rot,Math.atan2(dx,dz),1-Math.exp(-14*dt))}
  S.x+=S.kx*dt;S.z+=S.kz*dt;const kd=Math.exp(-4*dt);S.kx*=kd;S.kz*=kd;
