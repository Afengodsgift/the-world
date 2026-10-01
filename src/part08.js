function load(){try{const v=JSON.parse(localStorage.getItem('w4:'+roomCode)||'{}');disc=new Set(v.d||[]);for(const i of v.o||[])if(orbs[i]){orbs[i].on=false;orbs[i].m.visible=false;got++}}catch(e){}}
function banner(t,l){const b=$('banner');b.innerHTML='<small>'+(l||'NEW LOCATION DISCOVERED')+'</small><br>'+t;b.style.opacity=1;clearTimeout(banner.t);banner.t=setTimeout(()=>b.style.opacity=0,3200)}
function take(i,local){const o=orbs[i];if(!o||!o.on)return;o.on=false;o.m.visible=false;got++;save();updateHud();if(local&&chan)chan.send({type:'broadcast',event:'c',payload:{i}})}
function chime(){try{const a=new(window.AudioContext||webkitAudioContext)(),o=a.createOscillator(),g=a.createGain();o.frequency.value=660;o.connect(g);g.connect(a.destination);g.gain.setValueAtTime(.2,a.currentTime);g.gain.exponentialRampToValueAtTime(.001,a.currentTime+1.4);o.start();o.stop(a.currentTime+1.4)}catch(e){}}
function doUse(){Interaction.use()}
Interaction.register('dig','Dig!',
  ()=>hunt.on&&Math.hypot(S.x-hunt.x,S.z-hunt.z)<6&&Math.abs(S.y-hunt.y)<20,
  ()=>dig(true));
Interaction.register('hunt','Start Treasure Hunt',
  ()=>Math.hypot(S.x-BOARD.x,S.z-BOARD.z)<5,
  ()=>startHunt(true));
Interaction.register('race','Start Sky Race',
  ()=>Math.hypot(S.x-WP[0][0],S.z-WP[0][1])<7,
  ()=>startRace(true));
Interaction.register('pil','Use',
  ()=>Math.hypot(S.x-TOWN.x,S.z-TOWN.z)<8,
  ()=>{pulse=1.5;chime();if(chan)chan.send({type:'broadcast',event:'u',payload:{}})});
Interaction.register('kart','Start Ground Race',
  ()=>kart.padX!==undefined&&Math.hypot(S.x-kart.padX,S.z-kart.padZ)<7,
  ()=>startKartRace(true));
function explore(dt,t){
  for(const L of LOCS)if(!disc.has(L.n)&&Math.hypot(S.x-L.x,S.z-L.z)<L.r&&(!L.y||S.y>L.y)){disc.add(L.n);banner(L.n);save();updateHud()}
  orbs.forEach((o,i)=>{if(!o.on)return;o.m.rotation.y+=dt*2;o.m.position.y=o.y+Math.sin(t/400+i)*.15;
    if(Math.hypot(S.x-o.x,S.z-o.z)<1.6&&Math.abs(S.y+1-o.y)<2.2)take(i,true)});
  Interaction.update();
  raceTick(t);huntTick(dt,t);partnerTrack();seaTick(dt,t);kartTick(t);
  if(!race.on&&!hunt.on&&mk)mk.style.display='none';
  if(pulse>0){pulse=Math.max(0,pulse-dt);pil.material.emissive.setRGB(pulse*.6,pulse*.45,pulse*.1)}
}
function kartPt(t){
  const per=2*(KT.hw-KT.rc)*2+2*(KT.hh-KT.rc)*2+2*Math.PI*KT.rc,d=((t%1)+1)%1*per;
  const segs=[
    {len:2*(KT.hw-KT.rc),f:u=>[-(KT.hw-KT.rc)+u*2*(KT.hw-KT.rc), -KT.hh],tf:()=>[1,0]},
    {len:.5*Math.PI*KT.rc,f:u=>{const a=-Math.PI/2+u*Math.PI/2;return [(KT.hw-KT.rc)+Math.cos(a)*KT.rc,-(KT.hh-KT.rc)+Math.sin(a)*KT.rc]},tf:u=>{const a=-Math.PI/2+u*Math.PI/2;return [-Math.sin(a),Math.cos(a)]}},
    {len:2*(KT.hh-KT.rc),f:u=>[KT.hw, -(KT.hh-KT.rc)+u*2*(KT.hh-KT.rc)],tf:()=>[0,1]},
    {len:.5*Math.PI*KT.rc,f:u=>{const a=0+u*Math.PI/2;return [(KT.hw-KT.rc)+Math.cos(a)*KT.rc,(KT.hh-KT.rc)+Math.sin(a)*KT.rc]},tf:u=>{const a=u*Math.PI/2;return [-Math.sin(a),Math.cos(a)]}},
    {len:2*(KT.hw-KT.rc),f:u=>[(KT.hw-KT.rc)-u*2*(KT.hw-KT.rc), KT.hh],tf:()=>[-1,0]},
    {len:.5*Math.PI*KT.rc,f:u=>{const a=Math.PI/2+u*Math.PI/2;return [-(KT.hw-KT.rc)+Math.cos(a)*KT.rc,(KT.hh-KT.rc)+Math.sin(a)*KT.rc]},tf:u=>{const a=Math.PI/2+u*Math.PI/2;return [-Math.sin(a),Math.cos(a)]}},
    {len:2*(KT.hh-KT.rc),f:u=>[-KT.hw, (KT.hh-KT.rc)-u*2*(KT.hh-KT.rc)],tf:()=>[0,-1]},
    {len:.5*Math.PI*KT.rc,f:u=>{const a=Math.PI+u*Math.PI/2;return [-(KT.hw-KT.rc)+Math.cos(a)*KT.rc,-(KT.hh-KT.rc)+Math.sin(a)*KT.rc]},tf:u=>{const a=Math.PI+u*Math.PI/2;return [-Math.sin(a),Math.cos(a)]}},
  ];
  let acc=0;for(const sg of segs){if(d<=acc+sg.len){const u=(d-acc)/sg.len,[lx,lz]=sg.f(u),[tx,tz]=sg.tf(u);return {x:KT.x+lx,z:KT.z+lz,tx,tz}}acc+=sg.len}
  const last=segs[segs.length-1],[lx,lz]=last.f(1),[tx,tz]=last.tf(1);return {x:KT.x+lx,z:KT.z+lz,tx,tz};
}
const kart={on:false,i:0,pi:0,t0:0,gates:[],el:null,perim:0,boosts:[],obstacles:[]};
function buildKartTrack(){
  const per=2*(KT.hw-KT.rc)*2+2*(KT.hh-KT.rc)*2+2*Math.PI*KT.rc;kart.perim=per;
  if(!AM_KART.straight||!AM_KART.finish)return;
  const n=Math.round(per/3),pieceM=AM_KART;
  for(let i=0;i<n;i++){const p=kartPt(i/n),yaw=Math.atan2(p.tx,p.tz),y=H(p.x,p.z)+.05;
    const m=pieceM.straight.clone(true);m.position.set(p.x,y,p.z);m.rotation.y=yaw;m.scale.z=per/n/3;scene.add(m);
