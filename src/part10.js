      banner(fmt(ms)+(nb?' · new best!':' · best '+fmt(best)),'RACE COMPLETE');kart.on=false;paintKart();if(chan)chan.send({type:'broadcast',event:'kf',payload:{ms}});return}
    paintKart()}
  const a=kart.gates[kart.i];
  kart.el.textContent='Gate '+(kart.i+1)+'/'+kart.gates.length+'  ·  '+Math.round(Math.hypot(S.x-a.x,S.z-a.z))+' m  ·  '+fmt(now-kart.t0)+(kart.pi?'  ·  Partner: gate '+(kart.pi+1):'');
  a.m.scale.setScalar(1.2+Math.sin(t/200)*.08);
}
const race={on:false,i:0,pi:0,t0:0,rings:[],el:null};
let bvis=false;const bst=()=>S.flying&&(S.boost||S.burst>0);
function buildRace(){
  const pts=[];
  for(let k=0;k<WP.length-1;k++){const [ax,az]=WP[k],[bx,bz]=WP[k+1],n=Math.max(1,Math.round(Math.hypot(bx-ax,bz-az)/230));
    for(let j=k?1:0;j<=n;j++){const x=ax+(bx-ax)*j/n,z=az+(bz-az)*j/n;pts.push([x,Math.max(H(x,z)+34,40),z])}}
  race.rings=pts.map((p,i)=>{const m=new THREE.Mesh(new THREE.TorusGeometry(14,1.4,10,48),new THREE.MeshBasicMaterial({color:'#7fd0ff',fog:false,transparent:true,opacity:.45}));
    m.position.set(p[0],p[1],p[2]);const q=pts[Math.min(i+1,pts.length-1)],r=pts[Math.max(i-1,0)];
    m.lookAt(i<pts.length-1?q[0]:p[0]+(p[0]-r[0]),i<pts.length-1?q[1]:p[1],i<pts.length-1?q[2]:p[2]+(p[2]-r[2]));scene.add(m);return {m,x:p[0],y:p[1],z:p[2]}});
  const pad=new THREE.Mesh(new THREE.CylinderGeometry(4,4,.3,24),new THREE.MeshStandardMaterial({color:'#ffd24a',emissive:'#ff9d00',emissiveIntensity:.8}));
  pad.position.set(WP[0][0],H(WP[0][0],WP[0][1])+.2,WP[0][1]);scene.add(pad);
  if(!race.el){const d=document.createElement('div');d.style.cssText='position:fixed;z-index:6;top:calc(env(safe-area-inset-top,0px) + 92px);left:0;right:0;text-align:center;font-size:18px;text-shadow:0 2px 8px #000;pointer-events:none;display:none';document.body.appendChild(d);race.el=d}
  race.beam=new THREE.Mesh(new THREE.CylinderGeometry(2.5,2.5,500,12,1,true),new THREE.MeshBasicMaterial({color:'#ffd24a',transparent:true,opacity:.3,fog:false,depthWrite:false,side:THREE.DoubleSide}));race.beam.visible=false;scene.add(race.beam);
  paint();
}
function paint(){race.rings.forEach((r,i)=>{const on=race.on,act=on&&i===race.i;r.m.visible=!(on&&i<race.i);
  r.m.material.color.set(act?'#ffd24a':'#7fd0ff');r.m.material.opacity=act?1:on?.5:.45;r.m.scale.setScalar(act?1.15:1)});
  if(race.beam){const a=race.rings[race.i];race.beam.visible=race.on&&!!a;if(a)race.beam.position.set(a.x,a.y,a.z)}}
function startRace(local){
  if(!race.rings.length)return;
  race.on=true;race.i=0;race.pi=0;race.t0=performance.now()+3000;paint();
  if(local&&chan)chan.send({type:'broadcast',event:'rs',payload:{}});
}
function raceTick(t){
  if(!race.on){if(race.el)race.el.style.display='none';return}
  const now=performance.now();race.el.style.display='block';
  if(now<race.t0){race.el.style.fontSize='44px';race.el.textContent=Math.ceil((race.t0-now)/1000);return}
  race.el.style.fontSize='18px';
  const R=race.rings[race.i];
  if(Math.hypot(S.x-R.x,S.y+1-R.y,S.z-R.z)<13){race.i++;chime();S.burst=1.4;
    if(chan)chan.send({type:'broadcast',event:'rp',payload:{i:race.i}});
    if(race.i>=race.rings.length){const ms=now-race.t0;let best=+localStorage.getItem('w4best')||1e12;const nb=ms<best;try{if(nb)localStorage.setItem('w4best',ms)}catch(e){}
      banner(fmt(ms)+(nb?' · new best!':' · best '+fmt(best)),'RACE COMPLETE');race.on=false;paint();if(chan)chan.send({type:'broadcast',event:'rf',payload:{ms}});return}
    paint()}
  const a=race.rings[race.i];
  race.el.textContent='Ring '+(race.i+1)+'/'+race.rings.length+'  ·  '+Math.round(Math.hypot(S.x-a.x,S.y-a.y,S.z-a.z))+' m  ·  '+fmt(now-race.t0)+(race.pi?'  ·  Partner: ring '+(race.pi+1):'');
  a.m.scale.setScalar(1.15+Math.sin(t/200)*.08);markTo(a.x,a.y,a.z,'Ring '+(race.i+1));
}
let mk=null,pmk=null,treas=0;try{treas=+localStorage.getItem('w4t')||0}catch(e){}
const hunt={on:false,n:0,x:0,y:0,z:0,open:0,chest:null,beam:null};
const _mv=new THREE.Vector3();
function markToEl(el,x,y,z,label){
  if(!el)return;_mv.set(x,y,z).project(camera);let px=_mv.x,py=_mv.y;if(_mv.z>1){px=-px;py=-py}
  const m=Math.max(Math.abs(px)/.85,Math.abs(py)/.72,1);px/=m;py/=m;
  el.style.display='block';el.style.left=(px*.5+.5)*100+'%';el.style.top=(-py*.5+.5)*100+'%';el.lastChild.textContent=label;
}
function markTo(x,y,z,label){markToEl(mk,x,y,z,label)}
function partnerTrack(){
  const o=others.size?others.values().next().value:null;
